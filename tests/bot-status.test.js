const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const core = require("../bot-core.js");
const botScript = readFileSync(path.join(__dirname, "..", "bot.js"), "utf8");
const botMarkup = readFileSync(path.join(__dirname, "..", "bot.html"), "utf8");
const aboutMarkup = readFileSync(path.join(__dirname, "..", "about.html"), "utf8");
const aboutScript = readFileSync(path.join(__dirname, "..", "about.js"), "utf8");
const aesthetics = readFileSync(path.join(__dirname, "..", "docs", "WEB_AESTHETICS.md"), "utf8");

test("status timestamps use concise relative wording", () => {
  assert.equal(core.relativeTime(1_000, 1_005), "just now");
  assert.equal(core.relativeTime(1_000, 1_240), "4 minutes ago");
  assert.equal(core.relativeTime(1_000, 15_400), "4 hours ago");
  assert.equal(core.relativeTime(1_000, 173_800), "2 days ago");
  assert.equal(core.relativeTime(null, 2_000), "Unknown");
});

test("health history sorts, bounds, and preserves unknown latency", () => {
  const samples = Array.from({ length: 300 }, (_value, index) => ({
    sample_ts: 300 - index,
    healthy: index % 2 === 0,
    gateway_latency_ms: index === 0 ? null : String(index),
    database_latency_ms: "invalid",
  }));
  const normalized = core.normalizeHistory(samples);
  assert.equal(normalized.length, 288);
  assert.equal(normalized[0].sample_ts, 13);
  assert.equal(normalized.at(-1).sample_ts, 300);
  assert.equal(normalized.at(-1).gateway_latency_ms, null);
  assert.equal(normalized[0].database_latency_ms, null);
});

test("public status page exposes system availability and accessible graphs", () => {
  assert.match(botMarkup, /id="systemList"/);
  assert.match(botMarkup, /id="availabilityChart"[^>]+role="img"/);
  assert.match(botMarkup, /id="latencyChart"[^>]+role="img"/);
  assert.match(botScript, /Core\.relativeTime/);
  assert.match(botScript, /Core\.normalizeHistory/);
  assert.match(botScript, /renderSystems/);
  assert.match(botScript, /renderAvailabilityChart/);
  assert.match(botScript, /renderLatencyChart/);
});

test("About Us keeps static fallbacks and refreshes curated Discord avatars", () => {
  assert.match(aboutMarkup, /data-team-user-id=/);
  assert.match(aboutMarkup, /data-avatar-url="https:\/\/cdn\.discordapp\.com\/avatars\//);
  assert.match(aboutMarkup, /src="\/assets\/send-types\/pps_rate\.png"/);
  assert.match(aboutScript, /avenue-guard\.onrender\.com/);
  assert.match(aboutScript, /location\.origin/);
  assert.match(aboutScript, /function applyAvatar/);
  assert.match(aboutScript, /image\.onerror/);
  assert.match(aboutScript, /image\.src = fallbackUrl/);
  assert.match(aboutScript, /checked-in image remains a stable fallback/);
});

test("web aesthetics guide records both design systems and every product surface", () => {
  assert.match(aesthetics, /Public-Site Tokens/);
  assert.match(aesthetics, /Staff And Application Tokens/);
  assert.match(aesthetics, /Rules \(`index\.html`\)/);
  assert.match(aesthetics, /Avenue Guard Status \(`bot\.html`\)/);
  assert.match(aesthetics, /Applications \(`apply\/index\.html`\)/);
  assert.match(aesthetics, /Staff Portal \(`staff\/index\.html`\)/);
  assert.match(aesthetics, /Accessibility Contract/);
  assert.match(aesthetics, /Visual QA Checklist/);
});
