import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("index.html");
const rules = read("rules.html");
const palette = read("palette.html");
const paletteScript = read("palette.js");
const feedback = read("feedback.html");
const feedbackScript = read("feedback.js");
const previewServer = read("tests/staff-preview-server.mjs");
const site = read("site.js");
const styles = read("community.css");
const levelDirectoryStyles = read("levels/public-levels.css");

const publicPages = [
  "index.html",
  "rules.html",
  "about.html",
  "bot.html",
  "generator.html",
  "palette.html",
  "feedback.html",
  "privacy.html",
  "level.html",
  "levels/index.html",
  "apply/index.html",
  "methodology/queue/index.html",
];

const artworkHashes = {
  "gd-avenue-logo.png": "879dfd0e4f217e8325e59e67c5aca51aaf0b294af78582b3f86f680c3650e448",
  "welcome-clouds.png": "b50080e243639738e4b32f3f06141f8ffc58e228ab1dab7689f70314e2000545",
  "information-art.png": "6066595abc0cea35ee0e0531a4d25da0b801ec5e10364c23d2ef9e8548f913e8",
  "safety-team-art.png": "e390777373878475d207987366759df31f9b97155b21b1d378fcc59e92e73b54",
  "moderation-art.png": "b85ef3b4af6d262955938f99798f0d8bcbec81836684ae2aade5382d22e9f968",
  "gd-avenue-banner.png": "2633c98c6f8936ff3e1e2277affa045634e14ca6b2de72aeb352fba5ad9c36a5",
  "community-legacy-mark.png": "2e3c80a67e5246e7f3991ce3bf0e75f7b19de3d33b68c82228cbe96aaaf26306",
  "night-flight-art.png": "389cdae51c6564cd80e8750bb159466e200cc331a229f21749b7b308d2208950",
  "neon-flight-art.png": "fbc1d52713588362d71433d124610616a78fa79b350258285d7dee529e28f0e1",
};

test("the root route is a community home and the complete guide remains dedicated", () => {
  assert.match(home, /<h1>Geometry Dash Avenue<\/h1>/);
  assert.match(home, /data-art-carousel/);
  assert.doesNotMatch(home, /Create\. Improve\. Connect\./);
  assert.doesNotMatch(home, /home-avenue-lines/);
  assert.match(home, /href="\/rules\.html"/);
  assert.doesNotMatch(home, /id="rules"/);
  assert.match(rules, /id="rules"/);
  assert.match(rules, /Community Guide \| GD Avenue/);
});

test("the homepage appeal artwork removes its source canvas at the circular boundary", () => {
  assert.match(home, /class="home-resource__artwork--appeal"[^>]+safety-team-art\.png/);
  assert.match(styles, /\.home-resource__artwork--appeal\s*\{[^}]*clip-path:\s*circle\(46% at 50% 51%\)/s);
});

test("every public workflow uses the shared community shell", () => {
  for (const path of publicPages) {
    const html = read(path);
    assert.match(html, /class="site-header" data-site-header/, `${path} needs the shared header`);
    assert.match(html, /community\.css/, `${path} needs the community stylesheet`);
    assert.match(html, /site\.js/, `${path} needs shared navigation behavior`);
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, `${path} should expose one h1`);
  }
});

test("public media references resolve and remain adaptable", () => {
  for (const path of publicPages) {
    const html = read(path);
    const documentUrl = new URL(`../${path}`, import.meta.url);
    assert.match(html, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1(?:\.0)?"\s*\/?>/i, `${path} needs a responsive viewport`);

    for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
      assert.match(tag, /\salt=(?:"[^"]*"|'[^']*')/i, `${path} image needs alt text: ${tag}`);
      const source = tag.match(/\ssrc=(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find(Boolean);
      if (!source || /^(?:https?:|data:|\/\/)/i.test(source)) continue;

      const cleanSource = source.split(/[?#]/, 1)[0];
      const assetUrl = cleanSource.startsWith("/")
        ? new URL(`../${cleanSource.slice(1)}`, import.meta.url)
        : new URL(cleanSource, documentUrl);
      assert.equal(existsSync(assetUrl), true, `${path} references missing media ${source}`);
    }
  }

  assert.match(styles, /\.community-hero__slide img\s*\{[^}]*object-fit:\s*cover/s);
  assert.match(styles, /@media \(max-width:\s*740px\)/);
  assert.match(styles, /@media \(max-width:\s*460px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("artwork carousel rotates in order and resets after direct controls", () => {
  assert.equal((home.match(/data-carousel-slide/g) || []).length, 4);
  assert.equal((home.match(/data-carousel-dot=/g) || []).length, 4);
  assert.doesNotMatch(home, /data-carousel-previous/);
  assert.doesNotMatch(home, /data-carousel-next/);
  assert.doesNotMatch(home, /data-carousel-pause/);
  assert.doesNotMatch(site, /setInterval|manuallyPaused/);
  assert.match(site, /rotationDelay = 6500/);
  assert.match(site, /showSlide\(activeIndex \+ 1, false\)/);
  assert.match(site, /window\.setTimeout/);
  assert.match(site, /prefers-reduced-motion: reduce/);
  assert.match(site, /document\.hidden/);
  assert.match(site, /visibilitychange/);
  assert.doesNotMatch(site, /rotationStopped|stopRotation/);
  assert.match(site, /dot\.addEventListener\("click"[\s\S]*?showSlide\([\s\S]*?scheduleRotation\(\)/);
  assert.match(site, /dot\.addEventListener\("keydown"[\s\S]*?showSlide\([\s\S]*?scheduleRotation\(\)/);
  assert.match(site, /ArrowLeft/);
  assert.match(site, /ArrowRight/);
  assert.match(site, /Home/);
  assert.match(site, /End/);
  assert.match(site, /aria-current/);
  assert.match(site, /dot\.tabIndex = active \? 0 : -1/);
  assert.match(styles, /\.community-hero__slides[^}]+pointer-events: none/s);
  assert.match(styles, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*?opacity 900ms ease-in-out/);
  assert.match(styles, /\.community-hero__slide\s*\{[^}]*visibility:\s*hidden/s);
  assert.match(styles, /\.community-hero__slide\.is-active\s*\{[^}]*visibility:\s*visible/s);
});

test("homepage gives each primary resource one focal destination", () => {
  const main = home.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] || "";
  for (const href of [
    "https://discord.gg/matVTsj",
    "/levels/",
    "/generator.html",
    "/palette.html",
    "/feedback.html",
    "/rules.html",
    "/bot.html",
    "/apply/",
    "/about.html",
  ]) {
    assert.equal((main.match(new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g")) || []).length, 1, href);
  }
  assert.equal((main.match(/information-art\.png/g) || []).length, 1);
  assert.doesNotMatch(main, /home-art-feature__shade/);
  assert.match(main, /Palette Lab[\s\S]*NO AI/);
  assert.match(main, /Idea Generator[\s\S]*NO AI/);
  assert.match(main, /Ask a GD Avenue judge to review your level/);
});

test("text-bearing artwork and live copy occupy separate layout bands", () => {
  assert.match(home, /community-hero__stage[\s\S]*<\/div>\s*<div class="community-hero__content">/);
  assert.match(styles, /\.community-hero\s*\{[^}]*grid-template-rows:/s);
  assert.match(styles, /\.community-hero__content\s*\{[^}]*background:/s);
  assert.doesNotMatch(styles, /\.community-hero__content\s*\{[^}]*position:\s*absolute/s);
  assert.match(styles, /\.page-hero-community\s*\{[^}]*grid-template-rows:/s);
  assert.match(styles, /\.page-hero-community\s*>\s*img\s*\{[^}]*grid-row:\s*1/s);
  assert.match(styles, /\.page-hero-community__copy\s*\{[^}]*grid-row:\s*2/s);
  assert.match(styles, /\.page-hero-community__shade\s*\{[^}]*display:\s*none/s);
  assert.match(levelDirectoryStyles, /\.levels-community-hero\s*\{[^}]*grid-template-rows:/s);
  assert.match(levelDirectoryStyles, /\.levels-community-hero\s*>\s*div:last-child\s*\{[^}]*grid-row:\s*2/s);
});

test("Palette Lab generates, locks, repairs, copies, and persists five color roles", () => {
  assert.equal((palette.match(/class="palette-swatch"/g) || []).length, 5);
  assert.match(palette, /Generate palette/);
  assert.match(palette, /Fix contrast/);
  assert.match(palette, /Copy colors/);
  assert.match(palette, /class="no-ai-label">NO AI/);
  assert.match(styles, /\.palette-intro h1\s*\{[^}]*text-align:\s*left/s);
  assert.match(styles, /\.palette-toolbar \.no-ai-label\s*\{[^}]*min-height:\s*34px[^}]*font-size:\s*0\.8rem/s);
  assert.match(paletteScript, /function paletteFor/);
  assert.match(paletteScript, /function repairContrast/);
  assert.match(paletteScript, /aria-pressed/);
  assert.match(paletteScript, /localStorage\.setItem/);
  assert.match(paletteScript, /navigator\.clipboard\.writeText/);
});

test("level feedback is Discord-authenticated and posts a focused private request", () => {
  assert.match(feedback, /\/api\/auth\/login\?return=feedback/);
  assert.match(feedback, /class="feedback-intro__copy"/);
  assert.match(feedback, /Geometry Dash level ID/);
  assert.match(feedback, /Feedback focus/);
  assert.match(feedback, /Project stage/);
  assert.match(feedback, /Send to the judge gallery/);
  assert.match(feedback, /After a judge sends feedback, a 48-hour cooldown begins/);
  assert.match(feedbackScript, /\/api\/feedback\/session/);
  assert.match(feedbackScript, /\/api\/feedback\/requests/);
  assert.match(feedbackScript, /X-CSRF-Token/);
  assert.match(feedbackScript, /Idempotency-Key/);
  assert.match(feedbackScript, /form\.reset\(\)/);
  assert.match(feedbackScript, /feedback_active_limit/);
  assert.match(feedbackScript, /applyEligibility/);
  assert.match(feedbackScript, /active_request/);
  assert.match(styles, /\.feedback-eligibility\[data-state="cooldown"\]/);
  assert.match(styles, /\.feedback-intro__inner\s*\{[^}]*grid-template-areas:\s*"art copy"/s);
  assert.match(styles, /\.feedback-intro h1\s*\{[^}]*text-align:\s*left/s);
  assert.match(previewServer, /"\/api\/feedback\/session"/);
  assert.match(previewServer, /url\.pathname === "\/api\/feedback\/requests"/);
});

test("idea generator uses GD-specific pools and preloads personalized artwork", () => {
  const generator = read("generator.html");
  assert.match(generator, /spider teleports mapped to the snare/);
  assert.match(generator, /gamemode transitions hidden inside moving structures/);
  assert.match(generator, /Main setpiece:/);
  assert.match(generator, /class="no-ai-label">NO AI/);
  assert.equal((generator.match(/class="panel-title-row"/g) || []).length, 2);
  assert.match(generator, /rel="preconnect" href="https:\/\/i\.ibb\.co"/);
  assert.match(generator, /function preloadSource/);
  assert.match(generator, /function preloadPool/);
  assert.match(generator, /Promise\.all\(\[preloadSource\(pair\.left\.src\), preloadSource\(pair\.right\.src\)\]\)/);
  assert.match(generator, /cache: "force-cache"/);
});

test("rules introduction aligns its supporting copy with the section heading", () => {
  assert.match(rules, /<p class="community-kicker community-kicker--dark">Extended rules<\/p><h2>Clear boundaries/);
  assert.match(rules, /class="rules-introduction__copy">Open any section/);
  assert.match(styles, /\.rules-introduction\s*\{[^}]*grid-template-areas:[^}]*"heading copy"/s);
  assert.match(styles, /\.rules-introduction__copy\s*\{[^}]*grid-area:\s*copy/s);
});

test("responsive navigation is explicit and insulated from legacy global headers", () => {
  assert.match(styles, /@media \(max-width: 1120px\)/);
  assert.match(styles, /\.site-header\.menu-open \.site-nav/);
  assert.match(styles, /\.community-site header:not\(\.site-header\)/);
  assert.match(styles, /\.site-header::after[^}]+content: none/s);
  assert.match(site, /event\.key === "Escape"/);
  assert.match(site, /window\.innerWidth > 1120/);
  assert.match(site, /!header\.contains\(event\.target\)/);
  assert.doesNotMatch(styles, /font-size:\s*clamp\([^;]*(?:vw|vmin|vmax)/);
});

test("the supplied GD Avenue artwork remains byte-for-byte unchanged", () => {
  for (const [name, expected] of Object.entries(artworkHashes)) {
    const bytes = readFileSync(new URL(`../assets/community/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, name);
  }
});

test("the public level directory no longer imports the private staff visual system", () => {
  const levels = read("levels/index.html");
  assert.doesNotMatch(levels, /staff\/staff\.css/);
  assert.match(levels, /community\.css/);
  assert.match(levels, /GD Avenue recommendations/);
});
