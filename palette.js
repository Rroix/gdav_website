(function () {
  "use strict";

  var editor = document.getElementById("palette-editor");
  if (!editor) return;

  var swatches = Array.from(editor.querySelectorAll(".palette-swatch"));
  var mode = document.getElementById("palette-mode");
  var status = document.getElementById("palette-status");
  var storageKey = "gd-avenue-palette-lab-v1";
  var defaults = ["#0B1020", "#24335E", "#04D9D9", "#FF4FA3", "#FFE45E"];

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeHex(value) {
    var text = String(value || "").trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(text)) text = text.split("").map(function (item) { return item + item; }).join("");
    return /^[0-9a-f]{6}$/i.test(text) ? "#" + text.toUpperCase() : "";
  }

  function hexToRgb(hex) {
    var clean = normalizeHex(hex).slice(1);
    return [0, 2, 4].map(function (index) { return parseInt(clean.slice(index, index + 2), 16); });
  }

  function rgbToHex(rgb) {
    return "#" + rgb.map(function (value) { return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0"); }).join("").toUpperCase();
  }

  function hslToRgb(hue, saturation, lightness) {
    var h = ((hue % 360) + 360) % 360 / 360;
    var s = clamp(saturation, 0, 100) / 100;
    var l = clamp(lightness, 0, 100) / 100;
    if (!s) return [l * 255, l * 255, l * 255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    function channel(t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
  }

  function randomBetween(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function paletteFor(direction) {
    var hue = randomBetween(0, 360);
    var secondaryHue = hue + 34;
    var accentHue = hue + 180;
    if (direction === "triadic") {
      secondaryHue = hue + 120;
      accentHue = hue + 240;
    } else if (direction === "analogous") {
      secondaryHue = hue + 28;
      accentHue = hue - 32;
    } else if (direction === "monochrome") {
      secondaryHue = hue;
      accentHue = hue;
    } else if (direction === "complementary") {
      secondaryHue = hue + 14;
      accentHue = hue + 180;
    } else {
      secondaryHue = hue + randomBetween(22, 58);
      accentHue = hue + randomBetween(150, 210);
    }
    return [
      rgbToHex(hslToRgb(hue, randomBetween(28, 52), randomBetween(7, 13))),
      rgbToHex(hslToRgb(secondaryHue, randomBetween(34, 60), randomBetween(22, 34))),
      rgbToHex(hslToRgb(hue, randomBetween(65, 88), randomBetween(49, 62))),
      rgbToHex(hslToRgb(accentHue, randomBetween(70, 92), randomBetween(55, 68))),
      rgbToHex(hslToRgb(accentHue + 48, randomBetween(78, 98), randomBetween(66, 78)))
    ];
  }

  function luminance(hex) {
    var values = hexToRgb(hex).map(function (value) {
      var channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  }

  function contrast(first, second) {
    var high = Math.max(luminance(first), luminance(second));
    var low = Math.min(luminance(first), luminance(second));
    return (high + 0.05) / (low + 0.05);
  }

  function colors() {
    return swatches.map(function (swatch) { return normalizeHex(swatch.querySelector(".palette-hex").value) || "#000000"; });
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ colors: colors(), mode: mode.value }));
    } catch (_) {
      // The tool remains fully usable when storage is blocked.
    }
  }

  function announce(message) {
    status.textContent = message;
  }

  function paint() {
    var current = colors();
    var preview = document.getElementById("palette-preview");
    ["background", "structure", "primary", "accent", "gameplay"].forEach(function (role, index) {
      preview.style.setProperty("--palette-" + role, current[index]);
      swatches[index].style.setProperty("--swatch-color", current[index]);
    });
    [["gameplay", 4], ["primary", 2], ["structure", 1]].forEach(function (entry) {
      var ratio = contrast(current[entry[1]], current[0]);
      var row = document.querySelector('[data-contrast="' + entry[0] + '"]');
      var passes = ratio >= (entry[0] === "structure" ? 2.2 : 4.5);
      row.classList.toggle("is-pass", passes);
      row.classList.toggle("is-warning", !passes);
      row.querySelector("strong").textContent = ratio.toFixed(2) + ":1 " + (passes ? "Clear" : "Needs work");
    });
    save();
  }

  function setColor(index, value) {
    var normalized = normalizeHex(value);
    if (!normalized) return false;
    var swatch = swatches[index];
    swatch.querySelector('input[type="color"]').value = normalized.toLowerCase();
    swatch.querySelector(".palette-hex").value = normalized;
    paint();
    return true;
  }

  function isLocked(index) {
    return swatches[index].querySelector(".palette-lock").getAttribute("aria-pressed") === "true";
  }

  function generate() {
    var next = paletteFor(mode.value);
    next.forEach(function (value, index) { if (!isLocked(index)) setColor(index, value); });
    paint();
    announce("Generated a " + mode.options[mode.selectedIndex].text.toLowerCase() + " palette.");
  }

  function repairContrast() {
    var current = colors();
    var backgroundIsDark = luminance(current[0]) < 0.35;
    [2, 4].forEach(function (index) {
      if (isLocked(index) || contrast(current[index], current[0]) >= 4.5) return;
      var rgb = hexToRgb(current[index]);
      var target = backgroundIsDark ? 255 : 0;
      for (var step = 1; step <= 12; step += 1) {
        var weight = step / 12;
        var candidate = rgbToHex(rgb.map(function (value) { return value + (target - value) * weight; }));
        if (contrast(candidate, current[0]) >= 4.5) {
          current[index] = candidate;
          setColor(index, candidate);
          break;
        }
      }
    });
    if (!isLocked(1) && contrast(current[1], current[0]) < 2.2) {
      setColor(1, backgroundIsDark ? "#6479A8" : "#35415E");
    }
    paint();
    announce("Adjusted unlocked colors");
  }

  swatches.forEach(function (swatch, index) {
    var picker = swatch.querySelector('input[type="color"]');
    var input = swatch.querySelector(".palette-hex");
    var lock = swatch.querySelector(".palette-lock");
    picker.addEventListener("input", function () { setColor(index, picker.value); });
    input.addEventListener("change", function () {
      if (!setColor(index, input.value)) {
        input.value = colors()[index];
        announce("Use a six-digit hexadecimal color such as #04D9D9.");
      }
    });
    lock.addEventListener("click", function () {
      var locked = lock.getAttribute("aria-pressed") !== "true";
      lock.setAttribute("aria-pressed", String(locked));
      lock.textContent = locked ? "Locked" : "Lock";
      swatch.classList.toggle("is-locked", locked);
      announce(swatch.dataset.role + (locked ? " locked." : " unlocked."));
    });
  });

  document.getElementById("palette-generate").addEventListener("click", generate);
  document.getElementById("palette-fix").addEventListener("click", repairContrast);
  document.getElementById("palette-copy").addEventListener("click", async function () {
    var text = swatches.map(function (swatch, index) { return swatch.dataset.role + ": " + colors()[index]; }).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      announce("Palette copied to clipboard!");
    } catch (_) {
      announce("Clipboard access was blocked. Select the hexadecimal fields to copy the colors manually.");
    }
  });
  document.getElementById("palette-reset").addEventListener("click", function () {
    swatches.forEach(function (swatch, index) {
      var lock = swatch.querySelector(".palette-lock");
      lock.setAttribute("aria-pressed", "false");
      lock.textContent = "Lock";
      swatch.classList.remove("is-locked");
      setColor(index, defaults[index]);
    });
    mode.value = "balanced";
    paint();
    announce("Palette reset");
  });
  mode.addEventListener("change", save);

  try {
    var saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && Array.isArray(saved.colors) && saved.colors.length === 5) {
      saved.colors.forEach(function (value, index) { setColor(index, value); });
      if (Array.from(mode.options).some(function (option) { return option.value === saved.mode; })) mode.value = saved.mode;
    }
  } catch (_) {
    // Ignore malformed or unavailable local storage.
  }
  paint();
}());
