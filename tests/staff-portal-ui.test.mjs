import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../staff/staff.js", import.meta.url), "utf8");
const markup = readFileSync(new URL("../staff/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../staff/staff.css", import.meta.url), "utf8");
const application = readFileSync(new URL("../apply/apply.js", import.meta.url), "utf8");
const publicStyles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const publicLevelStyles = readFileSync(new URL("../levels/public-levels.css", import.meta.url), "utf8");
const publicLevels = readFileSync(new URL("../levels/levels.js", import.meta.url), "utf8");
const aesthetics = readFileSync(new URL("../docs/WEB_AESTHETICS.md", import.meta.url), "utf8");

test("staff UI keeps Discord snowflakes as strings", () => {
  assert.doesNotMatch(script, /Number\(body\.(?:assignee|reviewer|requester|user)_id\)/);
  assert.doesNotMatch(script, /parseInt\([^\n]*(?:assignee|reviewer|requester|user)_id/);
  assert.match(script, /discordId: true/);
  assert.match(script, /const exactId = \(value\) => String/);
  assert.doesNotMatch(script, /Number\([^\n]*(?:actor|reviewed|claimed|applicant|staff|user)_id/);
});

test("Admin visibility and hierarchy are capability based", () => {
  assert.match(script, /can\("admin\.access"\)/);
  assert.match(script, /head_reviewer: "Head Reviewer"/);
  assert.match(script, /developer\.access/);
  assert.doesNotMatch(script, /state\.user\.role === "owner"/);
});

test("profile, drawer, and modal controls are explicit and accessible", () => {
  assert.match(markup, /id="profile-button"[^>]+aria-haspopup="menu"/);
  assert.match(markup, /id="dialog-close"[^>]+type="button"/);
  assert.match(markup, /id="dialog-cancel"[^>]+type="button"/);
  assert.match(markup, /role="dialog"[^>]+aria-modal="true"/);
  assert.match(markup, /aria-labelledby="dialog-title"/);
  assert.match(markup, /id="detail-drawer"[^>]+role="dialog"[^>]+aria-modal="true"/);
  assert.match(script, /dialog\.addEventListener\("cancel", onCancel\)/);
  assert.match(script, /state\.returnFocus/);
  assert.match(script, /event\.key !== "Tab"/);
  assert.match(styles, /body\.modal-open/);
  assert.match(styles, /\.checkbox-row/);
  assert.match(script, /profileDialog\(false\)/);
  assert.match(script, /profileDialog\(true\)/);
  assert.match(script, /profile-nickname-form/);
  assert.match(script, /if \(nav\) \{[^]*profile-menu[^]*aria-expanded[^]*navigate\(module, section\)/);
  assert.match(script, /body\.classList\.add\("drawer-open"\)/);
  assert.match(script, /event\.key === "Escape"[^]*detail-drawer/);
});

test("portal hierarchy matches the four-module workspace contract", () => {
  assert.match(script, /overview: \{ label: "Overview"/);
  assert.match(script, /work: \{ label: "Work"[^]*sections: \["my-work", "queue", "outreach", "tasks", "notes"\]/);
  assert.match(script, /team: \{ label: "Team"[^]*sections: \["team-overview", "statistics", "review-qa", "applications", "staff"\]/);
  assert.match(script, /admin: \{ label: "Admin"[^]*sections: \["operations", "requests", "pps", "community", "admin-staff", "audit", "system"\]/);
  assert.doesNotMatch(script, /sections: \[[^\]]*"configuration"/);
});

test("operational records use inspectors and compact queue columns", () => {
  assert.match(script, /function openApplication/);
  assert.match(script, /function openStaffInspector/);
  assert.match(script, /function openQAInspector/);
  assert.match(script, /<th>Rank<\/th><th>Level<\/th><th>Tier<\/th><th>Creator<\/th><th>\$\{conceptLabel\("CP"/);
  assert.match(script, /conceptLabel\("W", conceptHelp\.waiting\)/);
  assert.match(script, /conceptLabel\("Claim", conceptHelp\.claim\)/);
  assert.match(script, /data-copy=/);
});

test("search provides keyboard jump navigation and loading uses skeletons", () => {
  assert.match(markup, /aria-keyshortcuts="Control\+K Meta\+K"/);
  assert.match(script, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(script, /const jumpTargets/);
  assert.match(script, /skeleton-view/);
  assert.doesNotMatch(script, /function loading\(\)[^]*spinner[^]*\}/);
});

test("workspace tokens and responsive drawer cover desktop through mobile", () => {
  assert.match(styles, /--surface-1:/);
  assert.match(styles, /--content-max: 1320px/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 680px\)/);
  assert.match(styles, /@media \(max-width: 430px\)/);
  assert.match(styles, /\.detail-drawer \{ width: 100%/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("scheduled openings can be edited without recreating them", () => {
  assert.match(script, /data-edit-opening/);
  assert.match(script, /requestAdminDialog\("edit_scheduled", opening\)/);
});

test("incident details are constrained instead of rendered in operation cards", () => {
  assert.match(script, /data-incident/);
  assert.match(styles, /\.trace-block[^}]+max-height:/s);
  assert.match(styles, /\.trace-block[^}]+overflow: auto/s);
});

test("Dev controls expose read-only role preview and reversible hidden levels", () => {
  assert.match(markup, /id="view-mode-select"/);
  assert.match(script, /"X-Staff-View-Role": state\.viewRole/);
  assert.match(script, /Read-only Dev preview/);
  assert.match(script, /\["hidden", supports\("hidden_queue_entries"\) \? "Hidden" : "Hidden \(API update required\)"/);
  assert.match(script, /data-queue-action="hide"/);
  assert.match(script, /data-queue-action="restore"/);
  assert.match(script, /supports\("hidden_queue_entries"\)/);
});

test("team and application workflows expose the requested operational controls", () => {
  assert.match(script, /data-action="add-staff"/);
  assert.match(script, /Add staff is preserved but temporarily disabled/);
  assert.match(script, /\["remove","Remove from team"\]/);
  assert.match(script, /Proceed to interview/);
  assert.match(script, /Do another interview/);
  assert.match(script, /Accept without interview/);
  assert.match(script, /Accept user/);
  assert.match(script, /DM applicant/);
  assert.match(script, /application_staff_dm/);
  assert.match(script, /item\.available_actions/);
  assert.match(script, /const hasInterview = Boolean\(item\.interview_ticket_channel_id\);/);
  assert.match(script, /Open Discord thread/);
  assert.match(script, /Open interview ticket/);
  assert.match(script, /supports\("staff_manual_management"\)/);
});

test("task creation uses the authoritative staff directory and explains internal concepts", () => {
  assert.match(script, /api\("\/api\/staff\/assignees"\)/);
  assert.match(script, /supports\("staff_assignee_directory"\)/);
  assert.match(script, /supports\("task_recipient_dm"\)/);
  assert.match(script, /type: "staff"/);
  assert.match(script, /<datalist/);
  assert.match(script, /Search the staff team/);
  assert.match(script, /taskType\.value === "assigned"/);
  assert.match(script, /Personal tasks belong to you/);
  assert.match(script, /DM every included staff member/);
  assert.match(script, /\["level","Level queue entry"\]/);
  assert.doesNotMatch(script, /label: "Assignee Discord ID"/);
  assert.match(script, /const helpTip =/);
  assert.match(script, /class="help-tip"/);
  assert.match(script, /<button class="help-tip" type="button"/);
  assert.doesNotMatch(script, /class="help-tip"[^>]+title=/);
  assert.match(script, /portal-help-tooltip/);
  assert.match(script, /removeAttribute\("aria-describedby"\)/);
  assert.doesNotMatch(script, /activeHelpTrigger === help\) hideHelpTooltip/);
  assert.match(script, /conceptHelp\.linkedEntity/);
  assert.match(script, /conceptHelp\.outbox/);
  assert.match(script, /conceptHelp\.priority/);
  assert.doesNotMatch(styles, /\.help-tip::after/);
  assert.match(styles, /\.portal-help-tooltip/);
});

test("public applications render server-defined typed questions and review prompts", () => {
  assert.match(application, /question\.type === "single_choice"/);
  assert.match(application, /question\.type === "short_text"/);
  assert.match(application, /question\.review_prompt/);
  assert.match(application, /prompt\.youtube_url/);
  assert.match(application, /prompt\.youtube_embed_url/);
  assert.match(application, /supports\("application_review_embeds"\)/);
  assert.match(application, /<iframe/);
  assert.doesNotMatch(application, /Assigned level/i);
  assert.match(application, /\/api\/apply\/form/);
  assert.match(application, /application_data_reset/);
  assert.match(application, /Application deletion is preserved but temporarily disabled/);
  assert.match(application, /method: "DELETE"/);
  assert.match(application, /credentials: "same-origin"/);
  assert.match(application, /sessionStorage\.getItem\(replayKey\)/);
  assert.match(application, /sessionStorage\.removeItem\("av-apply-oauth-forward"\)/);
});

test("staff applications expose typed choices, cooldowns, timezone defaults, and final-state safety", () => {
  assert.match(application, /Which application do you want to fill out\?/);
  assert.match(application, /Reviewer application/);
  assert.match(application, /Mod application/);
  assert.match(application, /Punishment appeal/);
  assert.match(application, /Each application type has its own five-day cooldown/i);
  assert.match(application, /cooldownForType/);
  assert.match(application, /application\.application_type === item\.application_type/);
  assert.match(application, /Return to draft/);
  assert.match(application, /applicationTypesNav/);
  assert.match(application, /aria-label="Application navigation"/);
  assert.match(application, /Return to application types/);
  assert.match(application, /const selectedType = new URLSearchParams\(location\.search\)\.get\("type"\)/);
  assert.doesNotMatch(application, /if \(active\?\.status === "draft"\) return loadForm/);
  assert.match(application, /closest\("button\[data-application-type\]"\)/);
  assert.doesNotMatch(application, /closest\("\[data-application-type\]"\)/);
  assert.match(application, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(application, /withdrawableStatuses\.has\(application\.status\)/);
  assert.doesNotMatch(application, /police/i);
  assert.match(styles, /\.pill\.accepted, \.pill\.accepted_pending_role/);
  assert.match(styles, /\.form-grid textarea:focus-visible/);
  assert.match(styles, /box-shadow: inset 0 0 0 1px var\(--accent\)/);
  assert.match(script, /application_open_by_type/);
  assert.match(script, /config-app-mod/);
  assert.match(script, /supports\("application_type_availability"\)/);
  assert.match(script, /Deploy Avenue Guard API v6/);
  assert.doesNotMatch(application, /Application #/);
  assert.doesNotMatch(script, /Application #/);
});

test("punishment appeals keep evidence, messaging, review, and unban controls explicit", () => {
  assert.match(application, /item\.application_type === "appeal"/);
  assert.match(application, /Your punishment appeal/);
  assert.match(application, /Message the appeals team/);
  assert.match(application, /No Discord reason available/);
  assert.match(application, /Review appeal/);
  assert.match(application, /Review application/);
  assert.match(script, /Discord punishment evidence/);
  assert.match(script, /Reason source/);
  assert.match(script, /Reason conflict/);
  assert.match(script, /independent assessments/i);
  assert.match(script, /execute_unban/);
  assert.match(script, /Punishment appeals open/);
  assert.match(script, /notify_dm/);
});

test("application review workspace filters by type, status, and claim state", () => {
  assert.match(script, /applicationFilters: \{ type: "all", status: "active", claim: "all" \}/);
  assert.match(script, /application-status-filter/);
  assert.match(script, /application-claim-filter/);
  assert.match(script, /\["unclaimed","Not claimed"\]/);
  assert.match(script, /\["interview","Interview"\]/);
  assert.match(script, /\["hold","Held"\]/);
});

test("application v2 forms autosave by section and require a final immutable review", () => {
  assert.match(application, /function formSections/);
  assert.match(application, /Estimated time:/);
  assert.match(application, /No automated personality or AI detection/);
  assert.match(application, /function scheduleAutosave/);
  assert.match(application, /window\.setTimeout\(\(\) => save\(false, currentDraftAnswers\), 800\)/);
  assert.match(application, /Saving\.\.\./);
  assert.match(application, /Could not save:/);
  assert.match(application, /function submissionReviewHtml/);
  assert.match(application, /immutable review snapshot/);
  assert.match(application, /data-confirm-submit/);
  assert.match(application, /I confirm these answers are accurate/);
  assert.match(application, /Back to edit/);
  assert.match(application, /question\.recommended_words/);
  assert.match(styles, /\.application-form-section/);
  assert.match(styles, /\.application-save-row/);
  assert.match(styles, /\.submission-review/);
});

test("staff application review uses evidence rubrics, calibration, interviews, and probation", () => {
  assert.match(script, /Add my assessment/);
  assert.match(script, /Update my assessment/);
  assert.match(script, /Score every dimension from 1 to 5/);
  assert.match(script, /evidence_\$\{dimension\.key\}/);
  assert.match(script, /Resolve calibration/);
  assert.match(script, /Questions to clarify \(one per line\)/);
  assert.match(script, /Record interview outcome/);
  assert.match(script, /data-interview-outcome/);
  assert.match(script, /I confirm the interview is complete/);
  assert.match(script, /Private staff rationale/);
  assert.match(script, /Optional respectful message to applicant/);
  assert.match(script, /Probation checkpoint/);
  assert.match(script, /data-probation-action/);
  assert.match(script, /Application process/);
  assert.match(script, /not an applicant or staff leaderboard/);
  assert.match(styles, /\.rubric-dimension/);
  assert.match(styles, /\.application-process-grid/);
  assert.match(styles, /\.rubric-dimension/);
});

test("OAuth compatibility bridges are one-shot and clean callback parameters", () => {
  assert.match(script, /params\.delete\("code"\)/);
  assert.match(script, /params\.delete\("state"\)/);
  assert.match(script, /sessionStorage\.getItem\(replayKey\) === oauthState/);
  assert.match(script, /sessionStorage\.removeItem\("av-staff-oauth-forward"\)/);
  assert.match(application, /params\.delete\("code"\)/);
  assert.match(application, /params\.delete\("state"\)/);
  assert.match(application, /sessionStorage\.getItem\(replayKey\) === oauthState/);
});

test("visual identity uses restrained geometric primitives and stable motion tokens", () => {
  assert.match(styles, /--t-fast: 140ms/);
  assert.match(styles, /--t-med: 210ms/);
  assert.match(styles, /\.nav-button\[data-module="overview"\]::before[^}]+rotate\(45deg\)/s);
  assert.match(styles, /\.page-heading::after/);
  assert.match(styles, /\.pipeline-node[^}]+rotate\(45deg\)/s);
  assert.match(styles, /\.timeline li::before[^}]+rotate\(45deg\)/s);
  assert.match(styles, /\.section-nav\[hidden\] \{ display: none; \}/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.doesNotMatch(styles, /font-size:\s*clamp\([^;]*(?:vw|vmin|vmax)/);
});

test("workspace hierarchy keeps queue, people, and diagnostics scannable", () => {
  assert.match(script, /function rolePill/);
  assert.match(script, /function tierArtwork/);
  assert.match(script, /function pipeline/);
  assert.match(script, /This week/);
  assert.match(script, /Work is ordered by what needs a next action/);
  assert.match(script, /Ready for action/);
  assert.match(script, /data-queue-quick/);
  assert.match(script, /class="level-inspector-hero"/);
  assert.match(script, /<strong>Runtime<\/strong>/);
  assert.match(script, /<strong>Identity integrity<\/strong>/);
  assert.match(styles, /\.role-badge/);
  assert.match(styles, /\.detail-drawer[^}]+width: min\(500px, 100%\)/s);
  assert.match(styles, /\.empty-state[^}]+min-height: 164px/s);
  assert.doesNotMatch(styles, /\.data-table th[^}]+position:\s*sticky/s);
});

test("public polish keeps editorial pages separate from the dense level directory", () => {
  assert.match(publicStyles, /\.about-hero\.surface,\s*\.privacy-hero\.surface[^}]+background: transparent/s);
  assert.match(publicStyles, /\.privacy-section\.surface[^}]+border-radius: 0/s);
  assert.match(publicStyles, /\.bot-metrics[^}]+border-top: 1px solid var\(--line-strong\)/s);
  assert.match(publicStyles, /nav[^}]+overflow-x: auto/s);
  assert.match(publicStyles, /nav a[^}]+flex: 0 0 auto/s);
  assert.match(publicLevelStyles, /\.public-level-row[^}]+min-height: 78px/s);
  assert.match(publicLevelStyles, /\.public-tier\.mythic/);
  assert.match(publicLevels, /assets\/send-types\/pps_\$\{safe\}\.png/);
  assert.match(aesthetics, /## Geometric Signature/);
  assert.match(aesthetics, /### Shared Component Families/);
  assert.match(aesthetics, /Reviewer, Head Reviewer, Admin, Owner, and Dev/);
});
