"use strict";
const $ = (s) => document.querySelector(s);
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
const cookieValue = (name) => document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";

async function api(path, options = {}) {
  const mutation = options.method && options.method !== "GET";
  const response = await fetch(path, { method: options.method || "GET", headers: { "Content-Type":"application/json", ...(mutation ? { "Idempotency-Key": crypto.randomUUID(), "X-CSRF-Token": decodeURIComponent(cookieValue("av_staff_csrf")) } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || "The application could not be loaded"), { status: response.status });
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

function formHtml(draft = {}) {
  const answers = draft.answers || {};
  return `${stage("draft")}<form id="judge-form" class="form-grid">
    <label>Why do you want to become a GD Avenue Judge?<textarea name="motivation" required maxlength="4000">${esc(answers.motivation || "")}</textarea></label>
    <label>What reviewing or Geometry Dash experience do you have?<textarea name="experience" required maxlength="4000">${esc(answers.experience || "")}</textarea></label>
    <label>What availability can you realistically commit?<textarea name="availability" required maxlength="4000">${esc(answers.availability || "")}</textarea></label>
    <label>How would you handle disagreement about a recommendation tier?<textarea name="judgement" maxlength="4000">${esc(answers.judgement || "")}</textarea></label>
    <div class="dialog-actions"><button class="button secondary" type="button" data-save="draft">Save draft</button><button class="button primary" type="submit">Submit application</button></div>
    <p id="apply-status" role="status"></p>
  </form>`;
}

async function initialize() {
  try {
    await api("/api/apply/session");
    const data = await api("/api/apply/mine");
    const active = data.items.find((item) => ["submitted","under_review","interview","hold","accepted_pending_role"].includes(item.status));
    const draft = data.items.find((item) => item.status === "draft");
    const visibleApplication = active || data.items.find((item) => item.status !== "draft");
    if (visibleApplication) {
      $("#apply-content").innerHTML = `${stage(visibleApplication.status)}<section class="panel"><div class="panel-head"><h2>Application #${visibleApplication.id}</h2><span class="pill">${esc(visibleApplication.status.replaceAll("_"," "))}</span></div><p>Your application is saved and its current stage is shown above.</p>${visibleApplication.decision_reason ? `<p class="muted">Decision note: ${esc(visibleApplication.decision_reason)}</p>` : ""}${!["accepted","rejected","withdrawn"].includes(visibleApplication.status) ? `<button class="button secondary" data-withdraw="${visibleApplication.id}">Withdraw application</button>` : ""}</section>`;
    } else {
      $("#apply-content").innerHTML = formHtml(draft);
    }
  } catch (error) {
    if ([401, 403].includes(error.status)) { $("#apply-content").hidden = true; $("#apply-auth").hidden = false; $("#apply-auth-message").textContent = error.message; }
    else if (error.status === 404) { $("#apply-content").hidden = true; $("#apply-auth").hidden = false; $("#apply-auth-message").textContent = "The secure application service is unavailable in this preview."; }
    else $("#apply-content").innerHTML = `<div class="error-state"><strong>Application unavailable</strong><span>${esc(error.message)}</span></div>`;
  }
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
});
$("#apply-logout").addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": decodeURIComponent(cookieValue("av_staff_csrf")) }, credentials: "same-origin" });
  } finally {
    location.href = "/apply";
  }
});
initialize();
