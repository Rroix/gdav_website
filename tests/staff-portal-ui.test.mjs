import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../staff/staff.js", import.meta.url), "utf8");
const markup = readFileSync(new URL("../staff/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../staff/staff.css", import.meta.url), "utf8");
const application = readFileSync(new URL("../apply/apply.js", import.meta.url), "utf8");

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
  assert.match(script, /<th>Rank<\/th><th>Level<\/th><th>Tier<\/th><th>Creator<\/th><th>CP<\/th><th>W<\/th><th>Priority<\/th><th>State<\/th><th>Claim<\/th>/);
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
  assert.match(script, /\["hidden","Hidden"\]/);
  assert.match(script, /data-queue-action="hide"/);
  assert.match(script, /data-queue-action="restore"/);
  assert.match(script, /supports\("hidden_queue_entries"\)/);
});

test("team and application workflows expose the requested operational controls", () => {
  assert.match(script, /data-action="add-staff"/);
  assert.match(script, /\["remove","Remove from team"\]/);
  assert.match(script, /Proceed to interview/);
  assert.match(script, /Accept without interview/);
  assert.match(script, /Open Discord thread/);
  assert.match(script, /Open interview ticket/);
  assert.match(script, /supports\("staff_manual_management"\)/);
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
  assert.match(application, /method: "DELETE"/);
  assert.match(application, /credentials: "same-origin"/);
  assert.match(application, /sessionStorage\.getItem\(replayKey\)/);
});
