(function attachStaffHelpTooltip(globalObject, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (globalObject) globalObject.StaffHelpTooltip = api;
})(typeof window === "undefined" ? null : window, function staffHelpTooltipFactory() {
  "use strict";

  const TOOLTIP_ID = "portal-help-tooltip";
  const HOST_CLASS = "overlay-tooltip-host";
  const GUTTER = 10;
  const GAP = 8;

  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

  function computePosition(trigger, tooltip, viewport, gutter = GUTTER, gap = GAP) {
    const bounds = {
      left: Number(viewport.left || 0),
      top: Number(viewport.top || 0),
      width: Number(viewport.width || 0),
      height: Number(viewport.height || 0),
    };
    bounds.right = bounds.left + bounds.width;
    bounds.bottom = bounds.top + bounds.height;
    const spaces = {
      top: trigger.top - bounds.top,
      bottom: bounds.bottom - trigger.bottom,
      left: trigger.left - bounds.left,
      right: bounds.right - trigger.right,
    };
    const required = {
      top: tooltip.height + gap,
      bottom: tooltip.height + gap,
      left: tooltip.width + gap,
      right: tooltip.width + gap,
    };
    let placement = "top";
    if (spaces.top >= required.top) placement = "top";
    else if (spaces.bottom >= required.bottom) placement = "bottom";
    else if (spaces.right >= required.right) placement = "right";
    else if (spaces.left >= required.left) placement = "left";
    else placement = Object.keys(spaces).reduce((best, side) => spaces[side] > spaces[best] ? side : best, "top");

    let left;
    let top;
    if (placement === "top" || placement === "bottom") {
      left = trigger.left + trigger.width / 2 - tooltip.width / 2;
      top = placement === "top" ? trigger.top - tooltip.height - gap : trigger.bottom + gap;
    } else {
      left = placement === "left" ? trigger.left - tooltip.width - gap : trigger.right + gap;
      top = trigger.top + trigger.height / 2 - tooltip.height / 2;
    }
    return {
      left: Math.round(clamp(left, bounds.left + gutter, bounds.right - tooltip.width - gutter)),
      top: Math.round(clamp(top, bounds.top + gutter, bounds.bottom - tooltip.height - gutter)),
      placement,
    };
  }

  function createController(doc, win) {
    if (!doc || !win) throw new Error("A document and window are required for contextual help");
    let active = null;
    let tooltip = null;
    let frame = 0;
    let installed = false;
    let consumedEscape = null;

    const closestHelp = (target) => target?.closest?.(".help-tip") || null;
    const isOpenPopover = (node) => {
      if (!node?.hasAttribute?.("popover")) return false;
      try { return node.matches(":popover-open"); }
      catch { return !node.hidden; }
    };
    const activeTopLayer = (trigger) => {
      for (let node = trigger; node && node !== doc.documentElement; node = node.parentElement) {
        if (node.tagName === "DIALOG" && node.open) return node;
        if (isOpenPopover(node)) return node;
      }
      return null;
    };
    const interactionOwner = (trigger) => activeTopLayer(trigger) || trigger.closest?.(".detail-drawer.open") || doc.body;
    const hostRoot = (trigger) => activeTopLayer(trigger) || doc.body;
    const directHost = (root) => Array.from(root?.children || []).find((child) => child.classList?.contains(HOST_CLASS));
    const declaredHost = (root) => {
      const direct = directHost(root);
      if (direct) return direct;
      const shell = Array.from(root?.children || []).find((child) => child.classList?.contains("dialog-shell"));
      return directHost(shell);
    };
    const ensureHost = (root) => {
      let host = declaredHost(root);
      if (!host) {
        host = doc.createElement("div");
        host.className = HOST_CLASS;
        host.dataset.overlayContext = root === doc.body ? "document" : root.tagName?.toLowerCase() || "overlay";
        root.appendChild(host);
      }
      return host;
    };
    const ensureTooltip = (trigger) => {
      if (!tooltip) {
        tooltip = doc.createElement("div");
        tooltip.id = TOOLTIP_ID;
        tooltip.className = "portal-help-tooltip";
        tooltip.setAttribute("role", "tooltip");
        tooltip.hidden = true;
      }
      const host = ensureHost(hostRoot(trigger));
      if (tooltip.parentElement !== host) host.appendChild(tooltip);
      return tooltip;
    };
    const viewport = () => {
      const visual = win.visualViewport;
      return visual
        ? { left: visual.offsetLeft, top: visual.offsetTop, width: visual.width, height: visual.height }
        : { left: 0, top: 0, width: doc.documentElement.clientWidth || win.innerWidth, height: doc.documentElement.clientHeight || win.innerHeight };
    };
    const ownerIsOpen = (owner) => {
      if (!owner?.isConnected) return false;
      if (owner === doc.body) return true;
      if (owner.tagName === "DIALOG") return owner.open;
      if (owner.hasAttribute?.("popover")) return isOpenPopover(owner);
      if (owner.classList?.contains("detail-drawer")) return owner.classList.contains("open") && owner.getAttribute("aria-hidden") !== "true";
      return true;
    };
    const triggerIsVisible = (rect, bounds) => (
      rect.bottom >= bounds.top && rect.top <= bounds.top + bounds.height
      && rect.right >= bounds.left && rect.left <= bounds.left + bounds.width
    );

    function close() {
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      if (active?.trigger) {
        active.trigger.setAttribute("aria-expanded", "false");
        if (active.trigger.getAttribute("aria-describedby") === TOOLTIP_ID) active.trigger.removeAttribute("aria-describedby");
      }
      active = null;
      if (tooltip) {
        tooltip.hidden = true;
        tooltip.textContent = "";
        delete tooltip.dataset.placement;
      }
    }

    function positionNow() {
      frame = 0;
      if (!active?.trigger?.isConnected || !ownerIsOpen(active.owner)) return close();
      const tip = ensureTooltip(active.trigger);
      const triggerRect = active.trigger.getBoundingClientRect();
      const bounds = viewport();
      if (!triggerIsVisible(triggerRect, bounds)) return close();
      const tooltipRect = tip.getBoundingClientRect();
      const position = computePosition(triggerRect, tooltipRect, bounds);
      tip.style.left = `${position.left}px`;
      tip.style.top = `${position.top}px`;
      tip.dataset.placement = position.placement;
    }

    function schedulePosition() {
      if (!active || frame) return;
      frame = win.requestAnimationFrame(positionNow);
    }

    function open(trigger, mode) {
      if (!trigger?.isConnected) return false;
      const text = String(trigger.dataset.help || "").trim();
      if (!text) return false;
      if (active?.trigger !== trigger) close();
      if (active?.trigger === trigger && active.mode === "click" && mode !== "click") return true;
      active = { trigger, mode, owner: interactionOwner(trigger) };
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("aria-describedby", TOOLTIP_ID);
      const tip = ensureTooltip(trigger);
      tip.textContent = text;
      tip.hidden = false;
      positionNow();
      return true;
    }

    function toggle(trigger) {
      if (active?.trigger === trigger && active.mode === "click") {
        close();
        return false;
      }
      return open(trigger, "click");
    }

    function closeWithin(parent) {
      if (active && (active.owner === parent || parent?.contains?.(active.trigger))) close();
    }

    function consumeParentCancel(parent) {
      if (!consumedEscape || consumedEscape.owner !== parent || Date.now() - consumedEscape.time > 120) return false;
      consumedEscape = null;
      return true;
    }

    const onClick = (event) => {
      const trigger = closestHelp(event.target);
      if (trigger) {
        event.preventDefault();
        toggle(trigger);
      } else if (active?.mode === "click") close();
    };
    const onPointerOver = (event) => {
      const trigger = closestHelp(event.target);
      if (trigger) open(trigger, "hover");
    };
    const onPointerOut = (event) => {
      const trigger = closestHelp(event.target);
      if (trigger && active?.trigger === trigger && active.mode === "hover" && !trigger.contains(event.relatedTarget) && doc.activeElement !== trigger) close();
    };
    const onFocusIn = (event) => {
      const trigger = closestHelp(event.target);
      if (trigger) open(trigger, "focus");
    };
    const onFocusOut = (event) => {
      const trigger = closestHelp(event.target);
      if (trigger && active?.trigger === trigger && active.mode === "focus" && !trigger.contains(event.relatedTarget)) close();
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || !active) return;
      const escapeToken = { owner: active.owner, time: Date.now() };
      consumedEscape = escapeToken;
      win.setTimeout?.(() => {
        if (consumedEscape === escapeToken) consumedEscape = null;
      }, 0);
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    const onParentClose = (event) => closeWithin(event.target);
    const onToggle = (event) => {
      if (event.newState === "closed") closeWithin(event.target);
    };

    function install() {
      if (installed) return;
      installed = true;
      doc.addEventListener("click", onClick);
      doc.addEventListener("pointerover", onPointerOver);
      doc.addEventListener("pointerout", onPointerOut);
      doc.addEventListener("focusin", onFocusIn);
      doc.addEventListener("focusout", onFocusOut);
      doc.addEventListener("keydown", onKeyDown, true);
      doc.addEventListener("close", onParentClose, true);
      doc.addEventListener("toggle", onToggle, true);
      win.addEventListener("scroll", schedulePosition, true);
      win.addEventListener("resize", schedulePosition);
      win.addEventListener("orientationchange", schedulePosition);
      win.visualViewport?.addEventListener("resize", schedulePosition);
      win.visualViewport?.addEventListener("scroll", schedulePosition);
    }

    return {
      close,
      closeWithin,
      consumeParentCancel,
      install,
      isOpen: () => Boolean(active),
      isOpenWithin: (parent) => Boolean(active && (active.owner === parent || parent?.contains?.(active.trigger))),
      open,
      positionNow,
      schedulePosition,
      toggle,
      activeContext: () => active ? { mode: active.mode, owner: active.owner, trigger: active.trigger, host: tooltip?.parentElement || null } : null,
    };
  }

  return { TOOLTIP_ID, computePosition, createController };
});
