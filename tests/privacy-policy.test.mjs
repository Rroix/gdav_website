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
  assert.match(policy, /notify included staff about personal, assigned, and team tasks/);
});

test("privacy policy explains punishment appeal evidence and communication", () => {
  assert.match(policy, /Punishment Appeals/);
  assert.match(policy, /active server ban/i);
  assert.match(policy, /timeout or one of GD Avenue's configured restriction roles/i);
  assert.match(policy, /audit-log/i);
  assert.match(policy, /Sapphire/i);
  assert.match(policy, /applicant-reported/i);
  assert.match(policy, /cannot by themselves authorize an automatic moderation action/i);
  assert.match(policy, /private portal message/i);
});

test("privacy policy covers public health samples and curated Discord avatars", () => {
  assert.match(policy, /recent component-health samples/);
  assert.match(policy, /small, configured list of public team profiles/);
  assert.match(policy, /checked-in profile image remains the fallback/);
});

test("privacy policy covers model evidence and durable Discord subscriptions", () => {
  assert.match(policy, /outreach episodes/);
  assert.match(policy, /immutable prediction snapshots/);
  assert.match(policy, /network eras/);
  assert.match(policy, /aggregate Bayesian estimates/);
  assert.match(policy, /priority-band changes are optional and disabled by default/);
  assert.match(policy, /does not use browser push notifications or email/);
});

test("authenticated entry points link to the privacy policy", () => {
  assert.match(staff, /href="\/privacy\.html"/);
  assert.match(application, /href="\/privacy\.html"/);
});
