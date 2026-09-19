import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../staff/staff.js", import.meta.url), "utf8");
const markup = readFileSync(new URL("../staff/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../staff/staff.css", import.meta.url), "utf8");

test("staff UI keeps Discord snowflakes as strings", () => {
  assert.doesNotMatch(script, /Number\(body\.(?:assignee|reviewer|requester|user)_id\)/);
  assert.doesNotMatch(script, /parseInt\([^\n]*(?:assignee|reviewer|requester|user)_id/);
  assert.match(script, /discordId: true/);
});

test("Admin visibility and hierarchy are capability based", () => {
  assert.match(script, /can\("admin\.access"\)/);
  assert.match(script, /head_reviewer: "Head Reviewer"/);
  assert.match(script, /developer\.access/);
  assert.doesNotMatch(script, /state\.user\.role === "owner"/);
});

test("profile menu and modal controls are explicit and accessible", () => {
  assert.match(markup, /id="profile-button"[^>]+aria-haspopup="menu"/);
  assert.match(markup, /id="dialog-close"[^>]+type="button"/);
  assert.match(markup, /id="dialog-cancel"[^>]+type="button"/);
  assert.match(markup, /role="dialog"[^>]+aria-modal="true"/);
  assert.match(markup, /aria-labelledby="dialog-title"/);
  assert.match(script, /dialog\.addEventListener\("cancel", onCancel\)/);
  assert.match(script, /state\.returnFocus/);
  assert.match(script, /event\.key !== "Tab"/);
  assert.match(styles, /body\.modal-open/);
  assert.match(styles, /\.checkbox-row/);
  assert.match(script, /profileDialog\(false\)/);
  assert.match(script, /profileDialog\(true\)/);
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
