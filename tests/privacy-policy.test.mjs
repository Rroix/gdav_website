import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const policy = readFileSync(new URL("../privacy.html", import.meta.url), "utf8");
const staff = readFileSync(new URL("../staff/index.html", import.meta.url), "utf8");
const application = readFileSync(new URL("../apply/index.html", import.meta.url), "utf8");

test("privacy policy describes the deployed identity and persistence architecture", () => {
  assert.match(policy, /Discord OAuth with the <code>identify<\/code> scope/);
  assert.match(policy, /HttpOnly/);
  assert.match(policy, /CSRF/);
  assert.match(policy, /Turso\/libSQL/);
  assert.match(policy, /Netlify/);
  assert.match(policy, /Render/);
  assert.doesNotMatch(policy, /does not have accounts/);
  assert.doesNotMatch(policy, /does not run its own user database/);
});

test("privacy policy separates public recommendation data from private operations", () => {
  assert.match(policy, /\/level\/\[level-id\]/);
  assert.match(policy, /does not publish the requester ID/);
  assert.match(policy, /exact priority score or rank/);
  assert.match(policy, /Human reviewers choose the review result/);
});

test("privacy policy covers applications, hidden records, task DMs, and Dev preview", () => {
  assert.match(policy, /age brackets/);
  assert.match(policy, /selected level-review prompts/);
  assert.match(policy, /private Discord interview ticket/);
  assert.match(policy, /Hiding a level removes it from normal and public workflows/);
  assert.match(policy, /preview mode is read-only/);
  assert.match(policy, /notify staff about assigned tasks/);
});

test("authenticated entry points link to the privacy policy", () => {
  assert.match(staff, /href="\/privacy\.html"/);
  assert.match(application, /href="\/privacy\.html"/);
});
