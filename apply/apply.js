"use strict";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
const cookieValue = (name) => document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const activeStatuses = new Set(["draft", "submitted", "triage", "under_review", "awaiting_information", "second_review", "interview", "hold", "accepted_pending_role"]);
const withdrawableStatuses = new Set(["draft", "submitted", "under_review", "hold"]);
let apiFeatures = new Set();
let initialization = null;
let applicationOptions = null;
let ownApplications = [];
let showChooser = false;
let currentFormData = null;
let currentDraftAnswers = {};
let autosaveTimer = null;
let saveQueue = Promise.resolve();
let saveRevision = 0;
const supports = (feature) => apiFeatures.has(feature);

function applicationResetControl(label) {
  const available = supports("application_data_reset");
  return `<button class="button danger" type="button" data-reset-application ${available ? "" : 'disabled aria-disabled="true" title="Deploy the matching Avenue Guard API to enable this control"'}>${esc(label)}</button>`;
}

function applicationCompatibilityNotice() {
  return supports("application_data_reset")
    ? ""
    : '<p class="warning-text">Application deletion is preserved but temporarily disabled because the deployed Avenue Guard API is older than this page.</p>';
}

function forwardLegacyOAuthCallback() {
  const params = new URLSearchParams(location.search);
  if (!params.has("code") && !params.has("state")) return false;
  const code = params.get("code");
  const oauthState = params.get("state");
  params.delete("code");
  params.delete("state");
  const cleanQuery = params.toString();
  history.replaceState(null, "", `${location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${location.hash}`);
  if (!code || !oauthState) {
    $("#apply-content").hidden = true;
    $("#apply-auth").hidden = false;
    $("#apply-auth-message").textContent = "This Discord sign-in attempt is incomplete. Please start again.";
    return true;
  }
  const replayKey = "av-apply-oauth-forward";
  if (sessionStorage.getItem(replayKey) === oauthState) return false;
  sessionStorage.setItem(replayKey, oauthState);
  const callback = new URL("/api/auth/callback", location.origin);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", oauthState);
  location.replace(callback.href);
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
  const mapped = ["accepted", "accepted_pending_role", "rejected", "withdrawn", "decided", "ineligible", "duplicate", "expired_no_action"].includes(status)
    ? "decision"
    : ["triage", "awaiting_information", "second_review", "hold"].includes(status) ? "under_review" : status;
  const active = Math.max(0, stages.indexOf(mapped));
  const labels = { draft: "Draft", submitted: "Submitted", under_review: "Review", interview: "Interview", decision: "Decision" };
  return `<ol class="application-stages">${stages.map((item,index) => `<li class="${index <= active ? "complete" : ""}"><span>${index + 1}</span>${labels[item]}</li>`).join("")}</ol>`;
}

function detectedTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }
  catch { return ""; }
}

function questionHtml(question, answers) {
  const suggested = question.key === "timezone" ? detectedTimezone() : "";
  const value = String(answers[question.key] || suggested || "");
  const required = question.required ? " required" : "";
  const prompt = question.review_prompt;
  const embeddedVideo = prompt && supports("application_review_embeds") && prompt.youtube_embed_url
    ? `<div class="review-video"><iframe src="${esc(prompt.youtube_embed_url)}" title="Showcase for ${esc(prompt.name)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allowfullscreen></iframe></div>`
    : "";
  const help = prompt
    ? `<section class="review-showcase" aria-label="Level showcase"><div class="review-showcase-head"><div><strong>${esc(prompt.name)}</strong><span>Level ID ${esc(prompt.level_id)}</span></div><a href="${esc(prompt.youtube_url)}" target="_blank" rel="noopener noreferrer">Open on YouTube</a></div>${embeddedVideo}<p>${embeddedVideo ? "Watch the showcase, then write your review below." : "Open the showcase on YouTube, then write your review below."}</p></section>`
    : question.help_url
      ? `<p class="field-help">Detected as <strong>${esc(value || "unknown")}</strong>. <a href="${esc(question.help_url)}" target="_blank" rel="noopener noreferrer">Check your timezone</a></p>`
      : "";
  const guidance = question.guidance ? `<p class="field-guidance">${esc(question.guidance)}</p>` : "";
  const length = Number(question.recommended_words) > 0 ? `<small class="answer-guidance">Suggested length: about ${Number(question.recommended_words)} words</small>` : "";
  const condition = question.show_for ? ` data-show-key="${esc(Object.keys(question.show_for)[0])}" data-show-values="${esc(JSON.stringify(Object.values(question.show_for)[0] || []))}"` : "";
  if (question.type === "single_choice") {
    return `<fieldset class="choice-question" data-question-key="${esc(question.key)}"${condition}><legend>${esc(question.label)}${question.required ? " *" : ""}</legend>${guidance}${question.options.map((option, index) => `<label class="choice-option"><input type="radio" name="${esc(question.key)}" value="${esc(option)}" ${value === option ? "checked" : ""}${required && index === 0 ? " required" : ""}><span>${esc(option)}</span></label>`).join("")}${help}${length}</fieldset>`;
  }
  const fieldId = `question-${question.key}`;
  if (question.type === "short_text") return `<div class="form-question" data-question-key="${esc(question.key)}"${condition}><label for="${esc(fieldId)}">${esc(question.label)}${question.required ? " *" : ""}</label>${guidance}<input id="${esc(fieldId)}" name="${esc(question.key)}" value="${esc(value)}" maxlength="4000"${required}>${help}${length}</div>`;
  return `<div class="form-question" data-question-key="${esc(question.key)}"${condition}><label for="${esc(fieldId)}">${esc(question.label)}${question.required ? " *" : ""}</label>${guidance}${help}<textarea id="${esc(fieldId)}" name="${esc(question.key)}" maxlength="4000"${required}>${esc(value)}</textarea>${length}</div>`;
}

function updateConditionalQuestions() {
  const form = $("#application-form");
  if (!form) return;
  const answers = collectAnswers(form);
  form.querySelectorAll("[data-show-key]").forEach((field) => {
    let values = [];
    try { values = JSON.parse(field.dataset.showValues || "[]"); } catch { values = []; }
    const visible = values.includes(answers[field.dataset.showKey]);
    field.hidden = !visible;
    field.querySelectorAll("input, textarea, select").forEach((control) => { control.disabled = !visible; });
  });
}

function formSections(formData, answers) {
  const grouped = new Map();
  for (const question of formData.questions || []) {
    const section = question.section || "Application";
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section).push(question);
  }
  const preferred = formData.form?.sections || [];
  const names = [...preferred.filter((name) => grouped.has(name)), ...[...grouped.keys()].filter((name) => !preferred.includes(name))];
  return names.map((name, index) => `<section class="application-form-section" aria-labelledby="application-section-${index}"><header><span>${index + 1}</span><div><h2 id="application-section-${index}">${esc(name)}</h2><p>${grouped.get(name).length} question${grouped.get(name).length === 1 ? "" : "s"}</p></div></header>${grouped.get(name).map((question) => questionHtml(question, answers)).join("")}</section>`).join("");
}

function formHtml(formData, answerOverride = null) {
  const draft = formData.application || {};
  const form = formData.form || { application_type: draft.application_type || "judge", label: "Reviewer application", description: "" };
  const answers = answerOverride || draft.answers || {};
  currentFormData = formData;
  currentDraftAnswers = { ...answers };
  $("#apply-title").textContent = form.label;
  $("#apply-intro").textContent = form.description || "Save a draft, review your answers, then submit when you are ready.";
  const isAppeal = form.application_type === "appeal";
  const punishment = formData.punishment;
  const punishmentTitle = punishment?.lookup_status === "found" ? "Active server ban" : punishment?.lookup_status === "not_banned" ? "No active server ban found" : "Ban status could not be verified";
  const punishmentCard = isAppeal && punishment ? `<section class="punishment-summary ${punishment.lookup_status !== "found" ? "warning" : ""}"><div class="panel-head"><div><p class="eyebrow">Discord record</p><h2>${punishmentTitle}</h2></div><span class="pill ${punishment.active ? "hold" : "withdrawn"}">${esc(punishment.lookup_status.replaceAll("_", " "))}</span></div><dl><div><dt>Original reason</dt><dd>${esc(punishment.reason || "No reason is present in Discord's ban record")}</dd></div><div><dt>Reason source</dt><dd>${esc((punishment.reason_source || "unknown").replaceAll("_", " "))}</dd></div><div><dt>Issued</dt><dd>${punishment.issued_ts ? new Date(Number(punishment.issued_ts) * 1000).toLocaleString() : "Date unavailable (Discord audit entries expire)"}</dd></div></dl>${punishment.reason_conflict ? '<p class="warning-text">Discord currently exposes conflicting reason fields. Staff will see both sources during review.</p>' : ""}</section>` : "";
  const eligible = !isAppeal || formData.eligibility?.eligible;
  const eligibility = !eligible ? `<div class="review-warning" role="alert"><strong>This appeal cannot be submitted yet.</strong><p>${formData.eligibility?.cooldown_until_ts ? `A previous appeal is on cooldown until ${new Date(Number(formData.eligibility.cooldown_until_ts) * 1000).toLocaleString()}.` : "Avenue Guard could not verify an active GD Avenue ban for this Discord account. Try again later if Discord was temporarily unavailable."}</p></div>` : "";
  return `${applicationTypesNav()}${punishmentCard}${eligibility}<div class="application-form-meta"><span>Estimated time: ${Number(form.estimated_minutes) || 10} minutes</span><span>Drafts are private</span><span>No automated personality or AI detection</span></div>${stage("draft")}<form id="application-form" class="form-grid" data-application-type="${esc(form.application_type)}" novalidate>${formSections(formData, answers)}${!isAppeal ? applicationCompatibilityNotice() : ""}<div class="application-save-row"><p id="apply-status" class="save-status" role="status" aria-live="polite">${eligible ? "Saved" : "Verification required"}</p><div class="dialog-actions">${!isAppeal ? applicationResetControl("Delete application data") : ""}<button class="button secondary" type="button" data-save="draft" ${eligible ? "" : "disabled"}>Save now</button><button class="button primary" type="submit" ${eligible ? "" : "disabled"}>${isAppeal ? "Review appeal" : "Review application"}</button></div></div></form>`;
}

function collectAnswers(form = $("#application-form")) {
  return form ? Object.fromEntries(new FormData(form)) : { ...currentDraftAnswers };
}

function submissionReviewHtml(answers) {
  const questions = currentFormData?.questions || [];
  const missing = questions.filter((question) => question.required && !String(answers[question.key] || "").trim());
  const sections = new Map();
  for (const question of questions) {
    const section = question.section || "Application";
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(question);
  }
  const noun = currentFormData?.form?.application_type === "appeal" ? "appeal" : "application";
  return `${applicationTypesNav()}${stage("draft")}<section class="submission-review"><div class="panel-head"><div><p class="eyebrow">Final check</p><h2>Review your ${noun}</h2><p class="muted">Your submitted answers become an immutable review snapshot. For appeals, the punishment evidence snapshot is preserved with them. Internal staff notes remain private.</p></div></div>${missing.length ? `<div class="review-warning" role="alert"><strong>${missing.length} required answer${missing.length === 1 ? " is" : "s are"} missing</strong><ul>${missing.map((question) => `<li>${esc(question.label)}</li>`).join("")}</ul></div>` : '<p class="review-ready">All required answers are complete.</p>'}${[...sections.entries()].map(([section, items]) => `<section class="review-section"><h3>${esc(section)}</h3>${items.filter((question) => !question.show_for || (question.show_for[Object.keys(question.show_for)[0]] || []).includes(answers[Object.keys(question.show_for)[0]])).map((question) => `<div class="review-answer"><small>${esc(question.label)}</small><p>${esc(answers[question.key] || "No answer provided")}</p></div>`).join("")}</section>`).join("")}<label class="checkbox-row submission-confirm"><input id="submission-confirmation" type="checkbox" ${missing.length ? "disabled" : ""}><span>I confirm these answers are accurate and ready for staff review.</span></label><div class="dialog-actions"><button class="button secondary" type="button" data-back-to-form>Back to edit</button><button class="button primary" type="button" data-confirm-submit ${missing.length ? "disabled" : ""}>Confirm and submit</button></div><p id="apply-status" class="save-status" role="status" aria-live="polite"></p></section>`;
}

function applicationTypesNav() {
  return '<nav class="application-view-nav" aria-label="Application navigation"><button class="button secondary application-menu-button" type="button" data-application-chooser><span aria-hidden="true">&larr;</span> Return to application types</button></nav>';
}

function statusHtml(application) {
  const label = application.application_label || `${String(application.application_type || "staff").replaceAll("_", " ")} application`;
  $("#apply-title").textContent = label;
  $("#apply-intro").textContent = "Your application status and next step are shown below.";
  const canWithdraw = withdrawableStatuses.has(application.status);
  if (application.application_type === "appeal") return appealStatusHtml(application);
  return `${applicationTypesNav()}${stage(application.status)}<section class="panel"><div class="panel-head"><h2>Your application</h2><span class="pill ${esc(application.status)}">${esc(application.status.replaceAll("_", " "))}</span></div><p>Your application is saved and its current stage is shown above.</p>${application.applicant_message ? `<p class="muted">${esc(application.applicant_message)}</p>` : ""}${applicationCompatibilityNotice()}<div class="dialog-actions">${canWithdraw ? `<button class="button secondary" data-withdraw="${application.id}">Withdraw application</button>` : ""}${applicationResetControl("Delete my application data")}</div></section>`;
}

function appealStatusHtml(application) {
  const messages = application.messages || [];
  const canWithdraw = ["draft", "submitted", "triage", "under_review", "awaiting_information", "second_review"].includes(application.status);
  const unban = application.unban_status ? `<p class="muted">Discord unban delivery: <strong>${esc(application.unban_status)}</strong></p>` : "";
  const punishmentState = application.punishment?.active === true
    ? "Active ban"
    : application.punishment?.active === false
      ? "Ban no longer active"
      : "Ban verification unavailable";
  return `${applicationTypesNav()}${stage(application.status)}<section class="panel appeal-status"><div class="panel-head"><div><p class="eyebrow">Private case</p><h2>Your punishment appeal</h2></div><span class="pill ${esc(application.status)}">${esc(application.status.replaceAll("_", " "))}</span></div>${application.punishment ? `<p><strong>${punishmentState}:</strong> ${esc(application.punishment.reason || "No Discord reason available")}</p>` : ""}${application.applicant_message ? `<div class="appeal-decision"><strong>Decision</strong><p>${esc(application.applicant_message)}</p></div>` : ""}${unban}<section class="appeal-chat"><h3>Messages</h3><div class="appeal-message-list">${messages.length ? messages.map((message) => `<article class="appeal-message ${esc(message.author_type)}"><strong>${esc(message.author)}</strong><p>${esc(message.body)}</p><small>${new Date(Number(message.created_ts) * 1000).toLocaleString()}</small></article>`).join("") : '<p class="muted">No messages yet. Staff replies will appear here even if Discord DMs are unavailable.</p>'}</div>${application.status !== "withdrawn" ? `<form id="appeal-message-form" data-appeal-id="${application.id}"><label for="appeal-message">Message the appeals team</label><textarea id="appeal-message" maxlength="1800" required></textarea><button class="button secondary" type="submit">Send message</button><p id="appeal-message-status" class="save-status" role="status"></p></form>` : ""}</section><div class="dialog-actions">${canWithdraw ? `<button class="button secondary" data-withdraw-appeal="${application.id}">Withdraw appeal</button>` : ""}</div></section>`;
}

function applicationTypeOpen(options, item) {
  if (item.application_type === "appeal") return item.open !== false;
  if (!options.applications_open) return false;
  if (typeof item.open === "boolean") return item.open;
  return options.application_open_by_type?.[item.application_type] !== false;
}

function cooldownForType(options, applicationType) {
  return options.cooldowns?.[applicationType]
    || options.items.find((item) => item.application_type === applicationType)?.cooldown
    || options.cooldown
    || { active: false, days: 5 };
}

function cooldownText(cooldown) {
  if (!cooldown?.active || !cooldown.until_ts) return "Start application";
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(Number(cooldown.until_ts) * 1000));
  return `Available ${when}`;
}

function chooserHtml(options, applications) {
  $("#apply-title").textContent = "Applications and appeals";
  $("#apply-intro").textContent = "Choose a staff application or ask GD Avenue to review an active server ban.";
  const choices = options.items.map((item) => {
    const active = applications.find((application) => application.application_type === item.application_type && activeStatuses.has(application.status));
    const cooldown = cooldownForType(options, item.application_type);
    const isOpen = applicationTypeOpen(options, item);
    const disabled = !item.enabled || (!active && (!isOpen || Boolean(cooldown.active)));
    const note = item.membership_required ? "Server membership required" : !item.enabled ? "Unavailable" : active?.status === "draft" ? "Return to draft" : active ? "View application" : !isOpen ? "Applications closed" : cooldownText(cooldown);
    const action = active && active.status !== "draft"
      ? `data-view-application="${esc(active.id)}"`
      : `data-application-type="${esc(item.application_type)}"`;
    return `<button class="application-choice" type="button" ${action} ${disabled ? "disabled" : ""}><span><strong>${esc(item.label)}</strong><small>${esc(item.description)}</small></span><span class="application-choice-action">${esc(note)}</span></button>`;
  }).join("");
  const history = applications.filter((item) => item.status !== "draft").slice(0, 5);
  return `<section class="application-chooser"><h2>Which application do you want to fill out?</h2><p class="muted">Each application type has its own five-day cooldown. Punishment appeals follow a separate, case-specific review and cooldown policy.</p><div class="application-choice-list">${choices}</div>${history.length ? `<div class="application-history"><h3>Previous applications and appeals</h3>${history.map((item) => `<button type="button" class="application-history-row" data-view-application="${item.id}"><span>${esc(item.application_label || item.application_type)}</span><span class="pill ${esc(item.status)}">${esc(item.status.replaceAll("_", " "))}</span></button>`).join("")}</div>` : ""}</section>`;
}

async function loadOptions() {
  if (supports("multi_type_applications")) return api("/api/apply/options");
  return { items: [{ application_type: "judge", label: "Reviewer application", description: "Apply to join the GD Avenue review team.", enabled: true, open: true }, { application_type: "mod", label: "Mod application", description: "Deploy the matching Avenue Guard API to enable this application.", enabled: false, open: false }, { application_type: "appeal", label: "Punishment appeal", description: "Deploy the matching Avenue Guard API to enable verified punishment appeals.", enabled: false, open: false }], applications_open: true, application_open_by_type: { judge: true, mod: false }, cooldown: { active: false, days: 5 }, cooldowns: {}, active_applications: [], active_application: null };
}

async function loadForm(applicationType) {
  const path = supports("multi_type_applications") ? `/api/apply/form/${encodeURIComponent(applicationType)}` : "/api/apply/form";
  const formData = await api(path);
  if (applicationOptions && formData.application) {
    const active = { id: formData.application.id, application_type: formData.application.application_type, status: formData.application.status };
    applicationOptions.active_applications = (applicationOptions.active_applications || []).filter((item) => item.application_type !== active.application_type);
    applicationOptions.active_applications.push(active);
    applicationOptions.active_application = active;
  }
  if (formData.application && !ownApplications.some((item) => String(item.id) === String(formData.application.id))) ownApplications.unshift(formData.application);
  $("#apply-content").innerHTML = formHtml(formData);
  updateConditionalQuestions();
}

function cleanAuthError() {
  const params = new URLSearchParams(location.search);
  const authError = params.get("auth_error");
  if (authError) {
    params.delete("auth_error");
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`);
  }
  return authError;
}

async function initializeInner() {
  const authError = cleanAuthError();
  try {
    const session = await api("/api/apply/session");
    sessionStorage.removeItem("av-apply-oauth-forward");
    apiFeatures = new Set(session.api?.features || []);
    const [mine, options] = await Promise.all([api("/api/apply/mine"), loadOptions()]);
    ownApplications = mine.items || [];
    applicationOptions = options;
    const selectedType = new URLSearchParams(location.search).get("type");
    if (selectedType && options.items.some((item) => item.application_type === selectedType && item.enabled)) {
      const selectedActive = ownApplications.find((item) => item.application_type === selectedType && activeStatuses.has(item.status));
      if (selectedActive?.status === "draft") return loadForm(selectedType);
      if (selectedActive) { $("#apply-content").innerHTML = statusHtml(selectedActive); return; }
      const selectedOption = options.items.find((item) => item.application_type === selectedType);
      if (applicationTypeOpen(options, selectedOption) && !cooldownForType(options, selectedType).active) return loadForm(selectedType);
    }
    $("#apply-content").innerHTML = chooserHtml(options, ownApplications);
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

async function save(submit, answerOverride = null) {
  const form = $("#application-form");
  const answers = answerOverride || collectAnswers(form);
  if (!currentFormData || !Object.keys(answers).length && !(currentFormData.questions || []).length) return false;
  currentDraftAnswers = { ...answers };
  const status = $("#apply-status");
  status.textContent = submit ? "Submitting..." : "Saving...";
  const revision = ++saveRevision;
  const applicationType = currentFormData.form?.application_type || currentFormData.application?.application_type || "judge";
  const operation = async () => {
    try {
      await api(submit ? "/api/apply/submit" : "/api/apply/save", { method: "POST", body: { application_type: applicationType, answers } });
      const liveStatus = $("#apply-status");
      if (liveStatus && (submit || revision === saveRevision)) liveStatus.textContent = submit ? "Application submitted." : "Saved";
      if (submit) {
        showChooser = false;
        const params = new URLSearchParams({ type: applicationType });
        history.replaceState(null, "", `${location.pathname}?${params}`);
        await initialize();
      }
      return true;
    } catch (error) {
      const liveStatus = $("#apply-status");
      if (liveStatus) liveStatus.textContent = `Could not save: ${error.message}`;
      return false;
    }
  };
  saveQueue = saveQueue.catch(() => false).then(operation);
  return saveQueue;
}

function scheduleAutosave() {
  const form = $("#application-form");
  if (!form) return;
  currentDraftAnswers = collectAnswers(form);
  const status = $("#apply-status");
  if (status) status.textContent = "Saving...";
  window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => save(false, currentDraftAnswers), 800);
}

async function showSubmissionReview() {
  const answers = collectAnswers();
  currentDraftAnswers = { ...answers };
  window.clearTimeout(autosaveTimer);
  const saved = await save(false, answers);
  if (!saved) return;
  $("#apply-content").innerHTML = submissionReviewHtml(answers);
}

document.addEventListener("input", (event) => { if (event.target.closest("#application-form")) scheduleAutosave(); });
document.addEventListener("change", (event) => { if (event.target.closest("#application-form")) { updateConditionalQuestions(); scheduleAutosave(); } });
document.addEventListener("submit", async (event) => {
  if (event.target.id === "application-form") { event.preventDefault(); showSubmissionReview(); }
  if (event.target.id === "appeal-message-form") {
    event.preventDefault();
    const status = $("#appeal-message-status");
    try {
      await api(`/api/apply/appeals/${event.target.dataset.appealId}/messages`, { method: "POST", body: { body: $("#appeal-message").value } });
      status.textContent = "Message sent.";
      await initialize();
    } catch (error) { status.textContent = error.message; }
  }
});
document.addEventListener("click", async (event) => {
  if (event.target.closest("[data-save='draft']")) save(false);
  if (event.target.closest("[data-back-to-form]")) {
    $("#apply-content").innerHTML = formHtml(currentFormData, currentDraftAnswers);
    updateConditionalQuestions();
  }
  if (event.target.closest("[data-confirm-submit]")) {
    const confirmation = $("#submission-confirmation");
    const status = $("#apply-status");
    if (!confirmation?.checked) {
      if (status) status.textContent = "Confirm that your answers are ready before submitting.";
      return;
    }
    await save(true, currentDraftAnswers);
  }
  const typeButton = event.target.closest("button[data-application-type]");
  if (typeButton && !typeButton.disabled) {
    showChooser = false;
    const params = new URLSearchParams();
    params.set("type", typeButton.dataset.applicationType);
    history.replaceState(null, "", `${location.pathname}?${params}`);
    await loadForm(typeButton.dataset.applicationType);
  }
  if (event.target.closest("[data-application-chooser]")) {
    if ($("#application-form")) await save(false);
    showChooser = true;
    history.replaceState(null, "", location.pathname);
    $("#apply-content").innerHTML = chooserHtml(applicationOptions, ownApplications);
  }
  const historyButton = event.target.closest("[data-view-application]");
  if (historyButton) {
    const application = ownApplications.find((item) => String(item.id) === historyButton.dataset.viewApplication);
    if (application) { showChooser = false; $("#apply-content").innerHTML = statusHtml(application); }
  }
  const withdraw = event.target.closest("[data-withdraw]");
  if (withdraw && confirm("Withdraw this application?")) { await api(`/api/apply/${withdraw.dataset.withdraw}/withdraw`, { method: "POST", body: {} }); showChooser = false; await initialize(); }
  const appealWithdraw = event.target.closest("[data-withdraw-appeal]");
  if (appealWithdraw && confirm("Withdraw this appeal?")) { await api(`/api/apply/appeals/${appealWithdraw.dataset.withdrawAppeal}/withdraw`, { method: "POST", body: {} }); showChooser = false; await initialize(); }
  if (event.target.closest("[data-reset-application]")) {
    const confirmation = prompt("Enter DELETE to permanently remove your application data. A recent submission will keep a 24-hour cooldown for that application type.");
    if (confirmation !== "DELETE") return;
    try { await api("/api/apply/mine", { method: "DELETE", body: { confirmation } }); showChooser = true; await initialize(); }
    catch (error) { const status = $("#apply-status"); if (status) status.textContent = error.message; else alert(error.message); }
  }
  if (event.target.closest("#apply-clear-auth")) {
    await fetch("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": decodeURIComponent(cookieValue("av_staff_csrf")) }, credentials: "same-origin" });
    sessionStorage.clear();
    location.replace("/apply/");
  }
});

$("#apply-logout").addEventListener("click", async () => {
  try { await fetch("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": decodeURIComponent(cookieValue("av_staff_csrf")) }, credentials: "same-origin" }); }
  finally { sessionStorage.clear(); location.replace("/apply/"); }
});

if (!forwardLegacyOAuthCallback()) initialize();
