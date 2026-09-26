import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const { TOOLTIP_ID, computePosition, createController } = require("../staff/help-tooltip.js");
const markup = readFileSync(new URL("../staff/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../staff/staff.css", import.meta.url), "utf8");
const staff = readFileSync(new URL("../staff/staff.js", import.meta.url), "utf8");

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.attributes = new Map();
    this.style = {};
    this.hidden = false;
    this.open = false;
    this.isConnected = false;
    this.rect = { left: 100, top: 100, right: 118, bottom: 118, width: 18, height: 18 };
  }
  appendChild(child) {
    if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    this.children.push(child);
    child.parentElement = this;
    child.setConnected(this.isConnected);
    return child;
  }
  setConnected(value) { this.isConnected = value; this.children.forEach((child) => child.setConnected(value)); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
  matches(selector) { return selector === ":popover-open" ? Boolean(this.popoverOpen) : false; }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector === ".help-tip" && node.classList.contains("help-tip")) return node;
      if (selector === ".detail-drawer.open" && node.classList.contains("detail-drawer") && node.classList.contains("open")) return node;
    }
    return null;
  }
  getBoundingClientRect() { return this.rect; }
}

function harness() {
  const listeners = new Map();
  const windowListeners = new Map();
  const animationFrames = [];
  const timers = [];
  const html = new FakeElement("html");
  const body = new FakeElement("body");
  html.setConnected(true);
  html.appendChild(body);
  html.clientWidth = 800;
  html.clientHeight = 600;
  const document = {
    body,
    documentElement: html,
    activeElement: null,
    createElement: (tag) => {
      const element = new FakeElement(tag);
      if (tag === "div") element.rect = { left: 0, top: 0, right: 240, bottom: 60, width: 240, height: 60 };
      return element;
    },
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
  };
  const window = {
    innerWidth: 800,
    innerHeight: 600,
    visualViewport: null,
    addEventListener: (type, handler) => {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(handler);
    },
    requestAnimationFrame: (callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    },
    cancelAnimationFrame() {},
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
  };
  const help = (parent, text = "Helpful context") => {
    const trigger = new FakeElement("button");
    trigger.classList.add("help-tip");
    trigger.dataset.help = text;
    trigger.setAttribute("aria-label", "Explain field");
    parent.appendChild(trigger);
    return trigger;
  };
  return { animationFrames, body, document, help, listeners, timers, window, windowListeners };
}

test("tooltip placement prefers above and clamps every viewport edge", () => {
  const viewport = { left: 0, top: 0, width: 375, height: 667 };
  assert.deepEqual(computePosition({ left: 180, right: 198, top: 300, bottom: 318, width: 18, height: 18 }, { width: 280, height: 70 }, viewport), { left: 49, top: 222, placement: "top" });
  const topEdge = computePosition({ left: 2, right: 20, top: 2, bottom: 20, width: 18, height: 18 }, { width: 300, height: 90 }, viewport);
  assert.equal(topEdge.placement, "bottom");
  assert.equal(topEdge.left, 10);
  assert.ok(topEdge.top >= 10);
  const bottomEdge = computePosition({ left: 350, right: 368, top: 645, bottom: 663, width: 18, height: 18 }, { width: 300, height: 90 }, viewport);
  assert.equal(bottomEdge.placement, "top");
  assert.equal(bottomEdge.left, 65);
  assert.ok(bottomEdge.top + 90 <= 657);

  const shortViewport = { left: 0, top: 0, width: 400, height: 160 };
  const right = computePosition({ left: 120, right: 138, top: 71, bottom: 89, width: 18, height: 18 }, { width: 100, height: 120 }, shortViewport);
  assert.equal(right.placement, "right");
  assert.ok(right.left >= 10 && right.left + 100 <= 390);
  const left = computePosition({ left: 360, right: 378, top: 71, bottom: 89, width: 18, height: 18 }, { width: 100, height: 120 }, shortViewport);
  assert.equal(left.placement, "left");
  assert.ok(left.left >= 10 && left.left + 100 <= 390);
});

test("normal-page help uses the global host and owns ARIA only while open", () => {
  const env = harness();
  const controller = createController(env.document, env.window);
  const trigger = env.help(env.body);
  assert.equal(trigger.getAttribute("aria-describedby"), null);
  controller.open(trigger, "focus");
  const context = controller.activeContext();
  assert.equal(context.host.parentElement, env.body);
  assert.equal(context.host.children[0].getAttribute("role"), "tooltip");
  assert.equal(trigger.getAttribute("aria-describedby"), TOOLTIP_ID);
  controller.close();
  assert.equal(trigger.getAttribute("aria-describedby"), null);
  assert.equal(context.host.children[0].hidden, true);
});

test("native and nested dialogs receive the one shared tooltip in their top-layer context", () => {
  const env = harness();
  const drawer = new FakeElement("aside");
  drawer.classList.add("detail-drawer", "open");
  drawer.setAttribute("aria-hidden", "false");
  env.body.appendChild(drawer);
  const dialog = new FakeElement("dialog");
  dialog.open = true;
  drawer.appendChild(dialog);
  const shell = new FakeElement("div");
  shell.classList.add("dialog-shell");
  dialog.appendChild(shell);
  const declaredHost = new FakeElement("div");
  declaredHost.classList.add("overlay-tooltip-host");
  shell.appendChild(declaredHost);
  const trigger = env.help(shell);
  const controller = createController(env.document, env.window);
  controller.open(trigger, "click");
  assert.equal(controller.activeContext().owner, dialog);
  assert.equal(controller.activeContext().host, declaredHost);
  assert.equal(dialog.contains(controller.activeContext().host), true);
  assert.equal(env.body.children.filter((child) => child.classList.contains("overlay-tooltip-host")).length, 0);
});

test("drawers use the unclipped global portal and closing the owner removes help", () => {
  const env = harness();
  const drawer = new FakeElement("aside");
  drawer.classList.add("detail-drawer", "open");
  drawer.setAttribute("aria-hidden", "false");
  env.body.appendChild(drawer);
  const trigger = env.help(drawer);
  const controller = createController(env.document, env.window);
  controller.open(trigger, "hover");
  assert.equal(controller.activeContext().owner, drawer);
  assert.equal(controller.activeContext().host.parentElement, env.body);
  controller.closeWithin(drawer);
  assert.equal(controller.isOpen(), false);
  assert.equal(trigger.getAttribute("aria-describedby"), null);
});

test("click is sticky, tap toggles, and opening another help closes the first", () => {
  const env = harness();
  const first = env.help(env.body, "First");
  const second = env.help(env.body, "Second");
  const controller = createController(env.document, env.window);
  controller.toggle(first);
  controller.open(first, "hover");
  assert.equal(controller.activeContext().mode, "click");
  controller.toggle(second);
  assert.equal(first.getAttribute("aria-describedby"), null);
  assert.equal(second.getAttribute("aria-describedby"), TOOLTIP_ID);
  controller.toggle(second);
  assert.equal(controller.isOpen(), false);
});

test("focus, outside click, Escape, parent close, and resize follow one controller lifecycle", () => {
  const env = harness();
  const dialog = new FakeElement("dialog");
  dialog.open = true;
  env.body.appendChild(dialog);
  const trigger = env.help(dialog);
  const controller = createController(env.document, env.window);
  controller.install();

  env.listeners.get("focusin")[0]({ target: trigger });
  assert.equal(controller.activeContext().mode, "focus");
  env.listeners.get("focusout")[0]({ target: trigger, relatedTarget: null });
  assert.equal(controller.isOpen(), false);

  let clickPrevented = false;
  env.listeners.get("click")[0]({ target: trigger, preventDefault: () => { clickPrevented = true; } });
  assert.equal(clickPrevented, true);
  assert.equal(controller.activeContext().mode, "click");
  env.listeners.get("pointerout")[0]({ target: trigger, relatedTarget: null });
  env.listeners.get("focusout")[0]({ target: trigger, relatedTarget: null });
  assert.equal(controller.isOpen(), true);
  env.listeners.get("click")[0]({ target: env.body, preventDefault() {} });
  assert.equal(controller.isOpen(), false);

  controller.toggle(trigger);
  let escapePrevented = false;
  let escapeStopped = false;
  env.listeners.get("keydown")[0]({
    key: "Escape",
    preventDefault: () => { escapePrevented = true; },
    stopImmediatePropagation: () => { escapeStopped = true; },
  });
  assert.equal(controller.isOpen(), false);
  assert.equal(escapePrevented, true);
  assert.equal(escapeStopped, true);
  assert.equal(controller.consumeParentCancel(dialog), true);

  controller.toggle(trigger);
  env.windowListeners.get("resize")[0]();
  assert.equal(env.animationFrames.length, 1);
  env.animationFrames.shift()();
  env.listeners.get("close")[0]({ target: dialog });
  assert.equal(controller.isOpen(), false);
  assert.equal(trigger.getAttribute("aria-describedby"), null);
});

test("Staff markup and CSS preserve modal scrolling while hosting help above the top layer", () => {
  assert.match(markup, /class="dialog-shell"/);
  assert.match(markup, /class="form-grid dialog-scroll-region"/);
  assert.match(markup, /class="overlay-tooltip-host" data-overlay-context="dialog"/);
  assert.match(markup, /help-tooltip\.js[^]*staff\.js/);
  assert.match(styles, /--z-tooltip:\s*100/);
  assert.match(styles, /dialog[^}]+overflow:\s*visible/);
  assert.match(styles, /\.dialog-scroll-region[^}]+overflow-y:\s*auto/);
  assert.match(styles, /\.overlay-tooltip-host[^}]+pointer-events:\s*none/);
  assert.doesNotMatch(styles, /z-index:\s*(?:999|1000|9999|999999)/);
});

test("route, parent-close, scroll, resize, and first-Escape integrations use the shared controller", () => {
  assert.match(staff, /helpTooltips\.close\(\);[^]*state\.module = module/);
  assert.match(staff, /helpTooltips\.closeWithin\(drawer\)/);
  assert.match(staff, /helpTooltips\.closeWithin\(dialog\)/);
  assert.match(staff, /helpTooltips\.consumeParentCancel\(dialog\)/);
  assert.match(staff, /event\.key === "Escape" && \$\("#action-dialog"\)\.open/);
  const source = readFileSync(new URL("../staff/help-tooltip.js", import.meta.url), "utf8");
  assert.match(source, /addEventListener\("scroll", schedulePosition, true\)/);
  assert.match(source, /visualViewport\?\.addEventListener\("resize", schedulePosition\)/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /doc\.addEventListener\("close", onParentClose, true\)/);
  assert.match(source, /doc\.addEventListener\("toggle", onToggle, true\)/);
});
