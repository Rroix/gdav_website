"use strict";
const $ = (s) => document.querySelector(s);
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
const cookieValue = (name) => document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";
let apiFeatures = new Set();
let initialization = null;
const supports = (feature) => apiFeatures.has(feature);

function forwardLegacyOAuthCallback() {
  const params = new URLSearchParams(location.search);
  if (!params.has("code") && !params.has("state")) return false;
  const code = params.get("code");
  const oauthState = params.get("state");
  history.replaceState(null, "", `${location.pathname}${location.hash}`);
  if (!code || !oauthState) {
    $("#apply-content").hidden = true;
    $("#apply-auth").hidden = false;
    $("#apply-auth-message").textContent = "This Discord sign-in attempt is incomplete. Please start again.";
    return true;
  }
  const replayKey = `av-oauth-forward:${oauthState}`;
  if (sessionStorage.getItem(replayKey)) {
    $("#apply-content").hidden = true;
    $("#apply-auth").hidden = false;
    $("#apply-auth-message").textContent = "That sign-in callback was already used. Clear the old sign-in and continue again.";
    return true;
  }
  sessionStorage.setItem(replayKey, String(Date.now()));
  const callback = new URL("/api/auth/callback", location.origin);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", oauthState);
  location.replace(`${callback.pathname}${callback.search}`);
  return true;
}

async function api(path, options = {}) {
  const mutation = options.method && options.method !== "GET";
  const response = await fetch(path, { method: options.method || "GET", headers: { "Content-Type":"application/json", "Cache-Control":"no-store", ...(mutation ? { "Idempotency-Key": crypto.randomUUID(), "X-CSRF-Token": decodeURIComponent(cookieValue("av_staff_csrf")) } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined, credentials: "same-origin", cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const contract = data.error && typeof data.error === "object" ? data.error : {};
    throw Object.assign(new Error(contract.message || data.message || "The application could not be loaded"), { status: response.status, code: contract.code || data.error || "application_error" });
  }
  return data;
}

function stage(status) {
  const stages = ["draft", "submitted", "under_review", "interview", "decision"];
  const mapped = ["accepted", "accepted_pending_role", "rejected", "withdrawn"].includes(status)
    ? "decision"
    : status === "hold" ? "under_review" : status;
  const active = Math.max(0, stages.indexOf(mapped));
  const labels = { draft: "Draft", submitted: "Submitted", under_review: "Review", interview: "Interview", decision: "Decision" };
  return `<ol class="application-stages">${stages.map((item,index) => `<li class="${index <= active ? "complete" : ""}"><span>${index + 1}</span>${labels[item]}</li>`).join("")}</ol>`;
}

function questionHtml(question, answers) {
  const value = String(answers[question.key] || "");
  const required = question.required ? " required" : "";
  const prompt = question.review_prompt;
  const embeddedVideo = prompt && supports("application_review_embeds") && prompt.youtube_embed_url
    ? `<div class="review-video"><iframe src="${esc(prompt.youtube_embed_url)}" title="Showcase for ${esc(prompt.name)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allowfullscreen></iframe></div>`
    : "";
  const help = prompt
    ? `<section class="review-showcase" aria-label="Level showcase">
        <div class="review-showcase-head"><div><strong>${esc(prompt.name)}</strong><span>Level ID ${esc(prompt.level_id)}</span></div><a href="${esc(prompt.youtube_url)}" target="_blank" rel="noopener noreferrer">Open on YouTube</a></div>
        ${embeddedVideo}<p>${embeddedVideo ? "Watch the showcase, then write your review below." : "Open the showcase on YouTube, then write your review below."}</p>
      </section>`
    : question.help_url
      ? `<p class="field-help"><a href="${esc(question.help_url)}" target="_blank" rel="noopener noreferrer">Find your timezone</a></p>`
      : "";
  if (question.type === "single_choice") {
    return `<fieldset class="choice-question"><legend>${esc(question.label)}${question.required ? " *" : ""}</legend>${question.options.map((option, index) => `<label class="choice-option"><input type="radio" name="${esc(question.key)}" value="${esc(option)}" ${value === option ? "checked" : ""}${required && index === 0 ? " required" : ""}><span>${esc(option)}</span></label>`).join("")}${help}</fieldset>`;
  }
  if (question.type === "short_text") {
    const fieldId = `question-${question.key}`;
    return `<div class="form-question"><label for="${esc(fieldId)}">${esc(question.label)}${question.required ? " *" : ""}</label><input id="${esc(fieldId)}" name="${esc(question.key)}" value="${esc(value)}" maxlength="4000"${required}>${help}</div>`;
  }
  const fieldId = `question-${question.key}`;
  return `<div class="form-question"><label for="${esc(fieldId)}">${esc(question.label)}${question.required ? " *" : ""}</label>${help}<textarea id="${esc(fieldId)}" name="${esc(question.key)}" maxlength="4000"${required}>${esc(value)}</textarea></div>`;
}

function formHtml(formData) {
  const draft = formData.application || {};
  const answers = draft.answers || {};
  return `${stage("draft")}<form id="judge-form" class="form-grid">
    ${formData.questions.map((question) => questionHtml(question, answers)).join("")}
    <div class="dialog-actions">${supports("application_data_reset") ? '<button class="button danger" type="button" data-reset-application>Delete application data</button>' : ""}<button class="button secondary" type="button" data-save="draft">Save draft</button><button class="button primary" type="submit">Submit application</button></div>
    <p id="apply-status" role="status"></p>
  </form>`;
}

async function initializeInner() {
  const params = new URLSearchParams(location.search);
  const authError = params.get("auth_error");
  if (authError) history.replaceState(null, "", `${location.pathname}${location.hash}`);
  try {
    const session = await api("/api/apply/session");
    apiFeatures = new Set(session.api?.features || []);
    const data = await api("/api/apply/mine");
    const active = data.items.find((item) => ["submitted","under_review","interview","hold","accepted_pending_role"].includes(item.status));
    const visibleApplication = active || data.items.find((item) => item.status !== "draft");
    if (visibleApplication) {
      $("#apply-content").innerHTML = `${stage(visibleApplication.status)}<section class="panel"><div class="panel-head"><h2>Application #${visibleApplication.id}</h2><span class="pill">${esc(visibleApplication.status.replaceAll("_"," "))}</span></div><p>Your application is saved and its current stage is shown above.</p>${visibleApplication.decision_reason ? `<p class="muted">Decision note: ${esc(visibleApplication.decision_reason)}</p>` : ""}<div class="dialog-actions">${!["accepted","rejected","withdrawn"].includes(visibleApplication.status) ? `<button class="button secondary" data-withdraw="${visibleApplication.id}">Withdraw application</button>` : ""}${supports("application_data_reset") ? '<button class="button danger" data-reset-application>Delete my application data</button>' : ""}</div></section>`;
    } else {
      const formData = await api("/api/apply/form");
      $("#apply-content").innerHTML = formHtml(formData);
    }
  } catch (error) {
    if (authError || [401, 403].includes(error.status)) { $("#apply-content").hidden = true; $("#apply-auth").hidden = false; $("#apply-auth-message").textContent = authError || error.message; }
    else if (error.status === 404) { $("#apply-content").hidden = true; $("#apply-auth").hidden = false; $("#apply-auth-message").textContent = "The secure application service is unavailable in this preview."; }
    else $("#apply-content").innerHTML = `<div class="error-state"><strong>Application unavailable</strong><span>${esc(error.message)}</span></div>`;
  }
}

function initialize() {
  if (!initialization) initialization = initializeInner().finally(() => { initialization = null; });
  return initialization;
}

async function save(submit) {
  const form = $("#judge-form");
  if (submit && !form.reportValidity()) return;
  const answers = Object.fromEntries(new FormData(form));
  const status = $("#apply-status");
  status.textContent = submit ? "Submitting..." : "Saving...";
  try {
    await api(submit ? "/api/apply/submit" : "/api/apply/save", { method: "POST", body: { application_type: "judge", answers } });
    status.textContent = submit ? "Application submitted." : "Draft saved.";
    if (submit) await initialize();
  } catch (error) { status.textContent = error.message; }
}

document.addEventListener("submit", (event) => { if (event.target.id === "judge-form") { event.preventDefault(); save(true); } });
document.addEventListener("click", async (event) => {
  if (event.target.closest("[data-save='draft']")) save(false);
  const withdraw = event.target.closest("[data-withdraw]");
  if (withdraw && confirm("Withdraw this application?")) { await api(`/api/apply/${withdraw.dataset.withdraw}/withdraw`, { method: "POST", body: {} }); initialize(); }
  if (event.target.closest("[data-reset-application]")) {
    const confirmation = prompt("Enter DELETE to permanently remove your application data and start again.");
    if (confirmation !== "DELETE") return;
    try {
      await api("/api/apply/mine", { method: "DELETE", body: { confirmation } });
      await initialize();
    } catch (error) {
      const status = $("#apply-status");
      if (status) status.textContent = error.message;
      else alert(error.message);
    }
  }
  if (event.target.closest("#apply-clear-auth")) {
    await fetch("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": decodeURIComponent(cookieValue("av_staff_csrf")) }, credentials: "same-origin" });
    sessionStorage.clear();
    location.replace("/apply/");
  }
});
$("#apply-logout").addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": decodeURIComponent(cookieValue("av_staff_csrf")) }, credentials: "same-origin" });
  } finally {
    sessionStorage.clear();
    location.replace("/apply/");
  }
});
if (!forwardLegacyOAuthCallback()) initialize();
