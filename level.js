(function () {
  "use strict";

  var API_BASE = "https://avenue-guard.onrender.com";
  var THUMB_BASE = "https://levelthumbs.prevter.me/thumbnail/";
  var REQUEST_TIMEOUT_MS = 12000;
  var TIER_ICONS = {
    rate: "/assets/send-types/pps_rate.png",
    feature: "/assets/send-types/pps_feature.png",
    epic: "/assets/send-types/pps_epic.png",
    legendary: "/assets/send-types/pps_legendary.png",
    mythic: "/assets/send-types/pps_mythic.png"
  };

  var elements = {
    hero: document.getElementById("levelHero"),
    thumbnailPanel: document.getElementById("thumbnailPanel"),
    thumbnail: document.getElementById("levelThumbnail"),
    tier: document.getElementById("tierBadge"),
    tierIcon: document.getElementById("tierIcon"),
    recommendation: document.getElementById("recommendationLabel"),
    name: document.getElementById("levelName"),
    id: document.getElementById("levelId"),
    date: document.getElementById("recommendedDate"),
    status: document.getElementById("queueStatus"),
    position: document.getElementById("queuePosition"),
    notice: document.getElementById("levelNotice"),
    retry: document.getElementById("levelRetry")
  };

  function levelIdFromLocation() {
    var match = window.location.pathname.match(/\/level\/(\d{7,9})\/?$/);
    if (match) return match[1];
    var queryId = new URLSearchParams(window.location.search).get("id") || "";
    return /^\d{7,9}$/.test(queryId) ? queryId : "";
  }

  function formatDate(timestamp) {
    var seconds = Number(timestamp);
    if (!Number.isFinite(seconds) || seconds <= 0) return "Unknown";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(seconds * 1000));
  }

  function queuePosition(data) {
    var position = Number(data.queue_position);
    var total = Number(data.active_queue_total);
    if (Number.isInteger(position) && position > 0) {
      return Number.isInteger(total) && total >= position
        ? "#" + position + " of " + total
        : "#" + position;
    }
    return "Not in the active queue";
  }

  function render(data) {
    var tier = String(data.recommendation_type || "rate").toLowerCase();
    var label = String(data.recommendation_label || tier || "Rate");
    var levelName = String(data.level_name || "Unknown level");
    var levelId = String(data.level_id || "");

    elements.hero.dataset.tier = tier;
    elements.tierIcon.src = TIER_ICONS[tier] || TIER_ICONS.rate;
    elements.tierIcon.alt = label + " recommendation icon";
    elements.recommendation.textContent = label;
    elements.name.textContent = levelName;
    elements.id.textContent = levelId;
    elements.date.textContent = formatDate(data.recommended_ts);
    elements.status.textContent = String(data.queue_status || "Queued for outreach");
    elements.position.textContent = queuePosition(data);
    elements.notice.textContent = "";
    elements.retry.hidden = true;
    document.title = levelName + " | GD Avenue";

    elements.thumbnail.onload = function () {
      elements.thumbnailPanel.classList.add("level-thumbnail--available");
    };
    elements.thumbnail.onerror = function () {
      elements.thumbnailPanel.classList.remove("level-thumbnail--available");
      elements.thumbnail.removeAttribute("src");
    };
    elements.thumbnail.alt = "Geometry Dash thumbnail for " + levelName;
    elements.thumbnail.src = THUMB_BASE + encodeURIComponent(levelId) + "/high";
  }

  function renderError(message, levelId) {
    elements.thumbnailPanel.classList.remove("level-thumbnail--available");
    elements.recommendation.textContent = "Unavailable";
    elements.name.textContent = "Level information unavailable";
    elements.id.textContent = levelId || "Invalid ID";
    elements.date.textContent = "--";
    elements.status.textContent = "--";
    elements.position.textContent = "--";
    elements.notice.textContent = message;
    elements.retry.hidden = !levelId;
    document.title = "Level unavailable | GD Avenue";
  }

  function load() {
    var levelId = levelIdFromLocation();
    if (!levelId) {
      renderError("This URL does not contain a valid Geometry Dash level ID.", "");
      return Promise.resolve();
    }

    elements.id.textContent = levelId;
    elements.notice.textContent = "Loading recommendation details";
    elements.retry.hidden = true;
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    return fetch(API_BASE + "/api/level/" + encodeURIComponent(levelId), {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    }).then(function (response) {
      if (response.status === 404) throw new Error("not-found");
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    }).then(render).catch(function (error) {
      renderError(
        error && error.message === "not-found"
          ? "No GD Avenue recommendation was found for this level."
          : "The live level record could not be loaded. Please try again shortly.",
        levelId
      );
    }).finally(function () {
      window.clearTimeout(timeout);
    });
  }

  elements.retry.addEventListener("click", load);
  load();
}());
