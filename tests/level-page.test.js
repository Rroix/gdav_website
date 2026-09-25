"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const Core = require("../level-core.js");
const ROOT = path.resolve(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "level.html"), "utf8");
const SCRIPT = fs.readFileSync(path.join(ROOT, "level.js"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

test("public priority bands cover required queue sizes and boundaries", () => {
  const cases = [
    [1, 1, "top_priority"],
    [1, 2, "top_priority"],
    [2, 2, "lower_priority"],
    [1, 3, "top_priority"],
    [2, 3, "standard_priority"],
    [3, 3, "lower_priority"],
    [1, 5, "top_priority"],
    [2, 5, "standard_priority"],
    [4, 5, "lower_priority"],
    [5, 5, "lower_priority"],
    [1, 10, "top_priority"],
    [3, 10, "high_priority"],
    [7, 10, "standard_priority"],
    [8, 10, "lower_priority"],
    [10, 100, "top_priority"],
    [30, 100, "high_priority"],
    [70, 100, "standard_priority"],
    [71, 100, "lower_priority"]
  ];
  cases.forEach(([position, total, expected]) => {
    assert.equal(Core.publicPriorityBand(position, total), expected);
  });
  [
    [null, 1], [1, null], [0, 10], [11, 10], [1, 0]
  ].forEach(([position, total]) => {
    assert.equal(Core.publicPriorityBand(position, total), null);
  });
});

test("relative time handles minutes, hours, yesterday, days, months, and years", () => {
  const now = Date.UTC(2026, 8, 18, 12, 0, 0);
  const seconds = now / 1000;
  assert.equal(Core.relativeTime(seconds - 5 * 60, now, "en"), "5 minutes ago");
  assert.equal(Core.relativeTime(seconds - 3 * 3600, now, "en"), "3 hours ago");
  assert.equal(Core.relativeTime(seconds - 86400, now, "en"), "yesterday");
  assert.equal(Core.relativeTime(seconds - 4 * 86400, now, "en"), "4 days ago");
  assert.equal(Core.relativeTime(seconds - 2 * 2629800, now, "en"), "2 months ago");
  assert.equal(Core.relativeTime(seconds - 31557600, now, "en"), "last year");
  assert.match(Core.exactDate(seconds).iso, /^2026-09-18T12:00:00\.000Z$/);
});

test("active queue presentation uses a band and never formats an exact rank", () => {
  const model = Core.normalizePayload({
    schema_version: 2,
    level_id: "101935961",
    level_name: "Synergy",
    recommendation_type: "mythic",
    recommended_at: 100,
    public_queue_state: "queued",
    public_priority_band: "high_priority",
    public_outreach_state: "queued_for_outreach",
    public_outcome_state: "unknown"
  });
  const view = Core.presentation(model);
  assert.deepEqual(view.fields.map((field) => field.label), ["Recommended", "Outreach", "Priority"]);
  assert.equal(view.fields[2].value, "High priority");
  assert.equal(JSON.stringify(view).includes("#"), false);
  assert.equal(view.timeline[1].state, "current");
});

test("in-cycle, submitted, rated, withdrawn, invalid, and unknown states stay semantic", () => {
  const states = {
    in_cycle: ["Outreach", "In progress"],
    awaiting_outcome: ["Outcome", "Awaiting outcome"],
    rated: ["Outcome", "Rated"],
    withdrawn: ["Status", "Withdrawn"],
    invalid: ["Status", "Level unavailable"],
    unknown: ["Status", "Unknown"]
  };
  Object.entries(states).forEach(([queueState, expected]) => {
    const model = Core.normalizePayload({
      level_id: "101935961",
      recommendation_type: "mythic",
      public_queue_state: queueState,
      public_priority_band: queueState === "in_cycle" ? "top_priority" : null,
      public_outreach_state: {
        in_cycle: "outreach_in_progress",
        awaiting_outcome: "reached_moderator",
        rated: "outreach_complete",
        withdrawn: "withdrawn",
        invalid: "level_unavailable"
      }[queueState] || "unknown",
      public_outcome_state: {
        awaiting_outcome: "awaiting_outcome",
        rated: "rated"
      }[queueState] || "unknown"
    });
    const fields = Core.presentation(model).fields;
    const field = fields.find((item) => item.label === expected[0]);
    assert.ok(field, queueState + " should expose " + expected[0]);
    assert.equal(field.value, expected[1]);
    if (queueState === "rated") {
      assert.equal(fields.some((item) => item.label === "Outreach"), false);
      assert.equal(fields.some((item) => String(item.value).includes("active queue")), false);
    }
  });
});

test("timeline marks only evidence-backed stages and supports terminal states", () => {
  const submitted = Core.normalizePayload({
    public_queue_state: "awaiting_outcome",
    public_outreach_state: "reached_moderator",
    public_outcome_state: "awaiting_outcome",
    submitted_to_mod_at: 200
  });
  assert.deepEqual(Core.timeline(submitted).map((stage) => stage.state), ["complete", "complete", "current", "future"]);

  const rated = Core.normalizePayload({
    public_queue_state: "rated",
    public_outreach_state: "outreach_complete",
    public_outcome_state: "rated",
    submitted_to_mod_at: 200,
    rated_observed_at: 300
  });
  assert.deepEqual(Core.timeline(rated).map((stage) => stage.state), ["complete", "complete", "complete", "complete"]);

  const ratedWithoutSubmissionEvidence = Core.normalizePayload({
    public_queue_state: "rated",
    public_outreach_state: "unknown",
    public_outcome_state: "rated",
    rated_observed_at: 300
  });
  assert.deepEqual(
    Core.timeline(ratedWithoutSubmissionEvidence).map((stage) => stage.label),
    ["Recommended", "Queued for outreach", "Rated"]
  );

  ["withdrawn", "invalid"].forEach((state) => {
    const terminal = Core.normalizePayload({ public_queue_state: state });
    assert.equal(Core.timeline(terminal).length, 2);
    assert.equal(Core.timeline(terminal)[1].state, "current");
  });
});

test("public estimates expose only active available components", () => {
  const accessOnly = Core.normalizePayload({
    level_id: "101935961",
    probability: {
      status: "active",
      access_probability_percent: 63.4,
      access_credible_interval_90_percent: [48.2, 76.1],
      access_evidence_strength: "moderate"
    }
  });
  assert.equal(accessOnly.probability.access.probabilityPercent, 63);
  assert.deepEqual(accessOnly.probability.access.interval90, [48, 76]);
  assert.equal(accessOnly.probability.rating, null);
  assert.equal(accessOnly.probability.overall, null);

  const provisional = Core.normalizePayload({
    probability: {
      status: "provisional",
      access_probability_percent: 63,
      access_credible_interval_90_percent: [48, 76]
    }
  });
  assert.equal(provisional.probability, null);
});

test("copy helper writes only the supplied numeric level ID", async () => {
  let copied = "";
  await Core.copyText("101935961", {
    clipboard: { writeText: async (value) => { copied = value; } }
  });
  assert.equal(copied, "101935961");
});

test("page structure keeps the ID as the control and Share after progress", () => {
  assert.match(HTML, /<button class="level-id-copy"[^>]*id="levelIdCopy"/);
  assert.doesNotMatch(HTML, />Copy Level ID</);
  assert.ok(HTML.indexOf('id="levelTimeline"') < HTML.indexOf('id="levelShare"'));
  assert.doesNotMatch(HTML, /What this means/i);
  assert.match(SCRIPT, /navigator\.share/);
  assert.match(SCRIPT, /aria-label", "Copy level ID /);
  assert.match(HTML, />How we order the queue</);
  assert.match(HTML, /id="probabilityAccess" hidden/);
  assert.match(HTML, /id="probabilityRating" hidden/);
  assert.match(HTML, /id="probabilityOverall" hidden/);
});

test("tier focus accents, responsive timeline, and thumbnail fallback are present", () => {
  ["rate", "feature", "epic", "legendary", "mythic"].forEach((tier) => {
    assert.ok(CSS.includes('.level-hero[data-tier="' + tier + '"]'));
  });
  assert.match(CSS, /\.level-id-copy:focus-visible/);
  assert.match(CSS, /@media \(max-width: 620px\)[\s\S]*grid-template-columns: 1fr/);
  assert.match(CSS, /prefers-reduced-motion/);
  assert.match(SCRIPT, /level-thumbnail--available/);
  assert.match(SCRIPT, /removeAttribute\("src"\)/);
});
