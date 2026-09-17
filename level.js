(function () {
  "use strict";

  var API_BASE = "https://avenue-guard.onrender.com";
  var THUMB_BASE = "https://levelthumbs.prevter.me/thumbnail/";
  var REQUEST_TIMEOUT_MS = 12000;
  var FEEDBACK_MS = 2200;
  var Core = window.LevelPageCore;
  var currentModel = null;
  var relativeTimer = null;
  var feedbackTimers = {};
  var TIER_LABELS = {
    rate: "Rate",
    feature: "Feature",
    epic: "Epic",
    legendary: "Legendary",
    mythic: "Mythic"
  };
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
    tierIcon: document.getElementById("tierIcon"),
    recommendation: document.getElementById("recommendationLabel"),
    name: document.getElementById("levelName"),
    creator: document.getElementById("levelCreator"),
    id: document.getElementById("levelId"),
    idCopy: document.getElementById("levelIdCopy"),
    copyFeedback: document.getElementById("levelCopyFeedback"),
    statusPanel: document.getElementById("levelStatusPanel"),
    timeline: document.getElementById("levelTimeline"),
    updated: document.getElementById("levelUpdated"),
    share: document.getElementById("levelShare"),
    shareFeedback: document.getElementById("levelShareFeedback"),
    notice: document.getElementById("levelNotice"),
    retry: document.getElementById("levelRetry")
  };

  function levelIdFromLocation() {
    var match = window.location.pathname.match(/\/level\/(\d{7,9})\/?$/);
    if (match) return match[1];
    var queryId = new URLSearchParams(window.location.search).get("id") || "";
    return /^\d{7,9}$/.test(queryId) ? queryId : "";
  }

  function clearChildren(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function buildTime(timestamp, className) {
    var exact = Core.exactDate(timestamp);
    if (!exact) {
      var fallback = document.createElement("span");
      fallback.className = className || "";
      fallback.textContent = "Unknown";
      return fallback;
    }
    var time = document.createElement("time");
    time.className = className || "";
    time.dateTime = exact.iso;
    time.title = exact.label;
    time.dataset.timestamp = String(timestamp);
    time.setAttribute("aria-label", Core.relativeTime(timestamp) + ", " + exact.label);
    time.textContent = Core.relativeTime(timestamp);
    return time;
  }

  function updateRelativeTimes() {
    document.querySelectorAll("time[data-timestamp]").forEach(function (time) {
      var timestamp = Number(time.dataset.timestamp);
      var exact = Core.exactDate(timestamp);
      if (!exact) return;
      var relative = Core.relativeTime(timestamp);
      time.textContent = relative;
      time.setAttribute("aria-label", relative + ", " + exact.label);
    });
  }

  function renderStatus(model) {
    var view = Core.presentation(model);
    clearChildren(elements.statusPanel);
    elements.statusPanel.dataset.count = String(view.fields.length);
    view.fields.forEach(function (field) {
      var item = document.createElement("div");
      var label = document.createElement("span");
      var value = document.createElement("strong");
      item.className = "level-status-item";
      label.textContent = field.label;
      if (field.kind === "time") value.appendChild(buildTime(field.value));
      else value.textContent = field.value;
      item.appendChild(label);
      item.appendChild(value);
      elements.statusPanel.appendChild(item);
    });
  }

  function renderTimeline(model) {
    var stages = Core.presentation(model).timeline;
    clearChildren(elements.timeline);
    elements.timeline.dataset.stages = String(stages.length);
    stages.forEach(function (stage) {
      var item = document.createElement("li");
      var node = document.createElement("span");
      var copy = document.createElement("div");
      var label = document.createElement("strong");
      item.className = "level-timeline__stage level-timeline__stage--" + stage.state;
      node.className = "level-timeline__node";
      node.setAttribute("aria-hidden", "true");
      copy.className = "level-timeline__copy";
      label.textContent = stage.label;
      copy.appendChild(label);
      if (stage.timestamp) copy.appendChild(buildTime(stage.timestamp, "level-timeline__time"));
      item.appendChild(node);
      item.appendChild(copy);
      elements.timeline.appendChild(item);
    });
  }

  function renderThumbnail(model) {
    elements.thumbnailPanel.classList.remove("level-thumbnail--available");
    elements.thumbnail.onload = function () {
      elements.thumbnailPanel.classList.add("level-thumbnail--available");
    };
    elements.thumbnail.onerror = function () {
      elements.thumbnailPanel.classList.remove("level-thumbnail--available");
      elements.thumbnail.removeAttribute("src");
    };
    elements.thumbnail.alt = "";
    elements.thumbnail.src = THUMB_BASE + encodeURIComponent(model.levelId) + "/high";
  }

  function render(data) {
    var model = Core.normalizePayload(data);
    var tier = TIER_LABELS[model.recommendationType] ? model.recommendationType : "rate";
    var label = TIER_LABELS[tier];
    currentModel = model;

    elements.hero.dataset.tier = tier;
    elements.tierIcon.src = TIER_ICONS[tier];
    elements.tierIcon.alt = label + " recommendation artwork";
    elements.recommendation.textContent = label;
    elements.name.textContent = model.levelName;
    elements.creator.textContent = model.uploaderName ? "by " + model.uploaderName : "";
    elements.creator.hidden = !model.uploaderName;
    elements.id.textContent = model.levelId;
    elements.idCopy.setAttribute("aria-label", "Copy level ID " + model.levelId);
    elements.idCopy.disabled = !/^\d{7,9}$/.test(model.levelId);
    elements.updated.textContent = "";
    if (model.lastUpdatedAt) {
      elements.updated.appendChild(document.createTextNode("Last updated "));
      elements.updated.appendChild(buildTime(model.lastUpdatedAt));
    }
    elements.notice.textContent = "";
    elements.retry.hidden = true;
    elements.share.disabled = false;
    renderStatus(model);
    renderTimeline(model);
    renderThumbnail(model);
    document.title = model.levelName + " | GD Avenue";

    if (relativeTimer) window.clearInterval(relativeTimer);
    relativeTimer = window.setInterval(updateRelativeTimes, 60000);
  }

  function renderError(message, levelId) {
    currentModel = null;
    elements.thumbnailPanel.classList.remove("level-thumbnail--available");
    elements.recommendation.textContent = "Unavailable";
    elements.name.textContent = "Level information unavailable";
    elements.creator.hidden = true;
    elements.id.textContent = levelId || "Invalid ID";
    elements.idCopy.setAttribute("aria-label", levelId ? "Copy level ID " + levelId : "Invalid level ID");
    elements.idCopy.disabled = !levelId;
    clearChildren(elements.statusPanel);
    var statusItem = document.createElement("div");
    statusItem.className = "level-status-item";
    statusItem.innerHTML = "<span>Status</span><strong>Unknown</strong>";
    elements.statusPanel.dataset.count = "1";
    elements.statusPanel.appendChild(statusItem);
    clearChildren(elements.timeline);
    var timelineItem = document.createElement("li");
    timelineItem.className = "level-timeline__stage level-timeline__stage--current";
    timelineItem.innerHTML = '<span class="level-timeline__node" aria-hidden="true"></span><div class="level-timeline__copy"><strong>Status unavailable</strong></div>';
    elements.timeline.appendChild(timelineItem);
    elements.updated.textContent = "";
    elements.share.disabled = true;
    elements.notice.textContent = message;
    elements.retry.hidden = !levelId;
    document.title = "Level unavailable | GD Avenue";
  }

  function feedback(element, message, key) {
    window.clearTimeout(feedbackTimers[key]);
    element.textContent = message;
    feedbackTimers[key] = window.setTimeout(function () {
      element.textContent = "";
    }, FEEDBACK_MS);
  }

  function copyLevelId() {
    if (!currentModel || !/^\d{7,9}$/.test(currentModel.levelId)) return;
    Core.copyText(currentModel.levelId, navigator, document).then(function () {
      feedback(elements.copyFeedback, "Copied", "level");
    }).catch(function () {
      feedback(elements.copyFeedback, "Copy failed", "level");
    });
  }

  function shareRecommendation() {
    if (!currentModel) return;
    var shareData = {
      title: currentModel.levelName + " | GD Avenue",
      text: currentModel.levelName + " was recommended for " + TIER_LABELS[currentModel.recommendationType] + ".",
      url: window.location.href
    };
    if (typeof navigator.share === "function") {
      navigator.share(shareData).catch(function (error) {
        if (error && error.name === "AbortError") return;
        Core.copyText(window.location.href, navigator, document).then(function () {
          feedback(elements.shareFeedback, "Link copied", "share");
        });
      });
      return;
    }
    Core.copyText(window.location.href, navigator, document).then(function () {
      feedback(elements.shareFeedback, "Link copied", "share");
    }).catch(function () {
      feedback(elements.shareFeedback, "Copy failed", "share");
    });
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

  elements.idCopy.addEventListener("click", copyLevelId);
  elements.share.addEventListener("click", shareRecommendation);
  elements.retry.addEventListener("click", load);
  load();
}());
