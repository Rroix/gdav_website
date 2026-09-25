import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../methodology/queue/index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../methodology/queue/methodology.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../methodology/queue/methodology.css", import.meta.url), "utf8");
const directory = readFileSync(new URL("../levels/index.html", import.meta.url), "utf8");
const detail = readFileSync(new URL("../level.html", import.meta.url), "utf8");

test("methodology route is a semantic, indexable 30-section public article", () => {
  const ids = [...html.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 30);
  assert.equal(new Set(ids).size, 30);
  assert.match(html, /<link rel="canonical" href="https:\/\/gdavenue\.netlify\.app\/methodology\/queue\/">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /class="skip-link" href="#methodologyArticle"/);
  assert.match(html, /<aside class="methodology-toc" aria-label="On this page">/);
  assert.match(html, /<article class="methodology-article"/);
});

test("methodology math, calculator, anchors, and live status are accessible", () => {
  assert.ok((html.match(/<math display="block" aria-label=/g) || []).length >= 7);
  assert.match(html, /id="ppsCalculator"/);
  assert.match(script, /P \$\{tidy\(f \+ g \+ h\)\}/);
  assert.match(script, /section-permalink/);
  assert.match(script, /\/api\/methodology\/queue\/status/);
  assert.match(styles, /position: sticky/);
  assert.match(styles, /grid-template-columns: 245px minmax\(0, 820px\)/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.doesNotMatch(styles, /font-size:\s*clamp\([^;]*(?:vw|vmin|vmax)/);
});

test("public methodology contains no private operational projection fields", () => {
  assert.doesNotMatch(html, /private_target_key|private_target_label|actor_id|subscriber Discord ID:\s*\d/i);
  assert.doesNotMatch(script, /private_target_key|private_target_label|raw alpha|staff actor/i);
  assert.match(html, /Target labels and normalized comparison keys stay private/);
});

test("level directory and detail use the canonical methodology link text", () => {
  assert.match(directory, /href="\/methodology\/queue\/">How we order the queue</);
  assert.match(detail, /href="\/methodology\/queue\/">How we order the queue</);
});
