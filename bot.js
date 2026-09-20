(function () {
  "use strict";

  var API_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? location.origin
    : "https://avenue-guard.onrender.com";
  var DEFAULT_BOT_AVATAR = "https://cdn.discordapp.com/avatars/1454985687177887866/d268221fd7a7a5529897730d18edd5a0.webp?size=2048";
  var REFRESH_INTERVAL_MS = 30000;
  var REQUEST_TIMEOUT_MS = 12000;
  var Core = window.AvenueStatusCore;

  var elements = {
    avatar: document.getElementById("botAvatar"),
    refresh: document.getElementById("refreshStatus"),
    statusDot: document.getElementById("statusDot"),
    statusLabel: document.getElementById("statusLabel"),
    statusNotice: document.getElementById("statusNotice"),
    version: document.getElementById("versionBadge"),
    uptime: document.getElementById("uptimeValue"),
    uptimePercent: document.getElementById("uptimePercent"),
    uptimeDetail: document.getElementById("uptimeDetail"),
    latency: document.getElementById("latencyValue"),
    members: document.getElementById("memberValue"),
    checked: document.getElementById("checkedValue"),
    systemList: document.getElementById("systemList"),
    historyWindow: document.getElementById("historyWindow"),
    availabilityChart: document.getElementById("availabilityChart"),
    availabilitySummary: document.getElementById("availabilitySummary"),
    latencyChart: document.getElementById("latencyChart"),
    latencySummary: document.getElementById("latencySummary"),
    releaseCount: document.getElementById("releaseCount"),
    releaseList: document.getElementById("releaseList")
  };

  var lastStatus = null;
  var lastCheckedTs = 0;
  var refreshTimer = null;
  var resizeTimer = null;

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") return "--";
    var number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat("en-US").format(number) : "--";
  }

  function formatDuration(totalSeconds) {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds === "") return "--";
    var parsedSeconds = Number(totalSeconds);
    if (!Number.isFinite(parsedSeconds)) return "--";
    var seconds = Math.max(0, Math.floor(parsedSeconds));
    var days = Math.floor(seconds / 86400);
    var hours = Math.floor((seconds % 86400) / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return days + "d " + hours + "h";
    if (hours > 0) return hours + "h " + minutes + "m";
    if (minutes > 0) return minutes + "m";
    return seconds + "s";
  }

  function serviceUptimeSeconds(data) {
    var canonical = Number(data.service_uptime_seconds);
    if (Number.isFinite(canonical) && canonical >= 0) return canonical;

    var legacy = Number(data.process_uptime_seconds);
    if (Number.isFinite(legacy) && legacy >= 0) return legacy;
    return null;
  }

  function serviceStartedTimestamp(data) {
    var canonical = Number(data.service_started_ts);
    if (Number.isFinite(canonical) && canonical > 0) return canonical;

    var legacy = Number(data.process_started_ts);
    if (Number.isFinite(legacy) && legacy > 0) return legacy;
    return null;
  }

  function formatPercentage(value) {
    if (value === null || value === undefined || value === "") return "--%";
    var percentage = Number(value);
    if (!Number.isFinite(percentage)) return "--%";
    return Math.max(0, Math.min(100, percentage)).toFixed(2) + "%";
  }

  function formatDate(timestamp, includeTime) {
    var seconds = Number(timestamp);
    if (!Number.isFinite(seconds) || seconds <= 0) return "Unknown";
    var options = includeTime
      ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "short", day: "numeric" };
    return new Intl.DateTimeFormat("en-US", options).format(new Date(seconds * 1000));
  }

  function updateCheckedTime() {
    elements.checked.textContent = Core.relativeTime(lastCheckedTs, Date.now() / 1000);
    elements.checked.title = lastCheckedTs ? formatDate(lastCheckedTs, true) : "";
  }

  function renderSystems(systems) {
    var items = Array.isArray(systems) ? systems : [];
    elements.systemList.replaceChildren();
    if (!items.length) {
      items = [{ name: "Avenue Guard", status: "unknown", detail: "No component data is available" }];
    }
    items.forEach(function (system) {
      var status = ["operational", "degraded", "unavailable", "unknown"].includes(system.status)
        ? system.status
        : "unknown";
      var row = document.createElement("div");
      row.className = "system-row surface";
      var dot = document.createElement("span");
      dot.className = "system-status system-status--" + status;
      dot.setAttribute("aria-hidden", "true");
      var copy = document.createElement("span");
      appendTextElement(copy, "strong", "", String(system.name || "System"));
      appendTextElement(copy, "small", "", String(system.detail || status));
      var badge = appendTextElement(row, "span", "system-badge system-badge--" + status, status);
      row.prepend(dot, copy);
      badge.setAttribute("aria-label", String(system.name || "System") + ": " + status);
      elements.systemList.appendChild(row);
    });
  }

  function canvasContext(canvas) {
    var width = Math.max(280, Math.floor(canvas.getBoundingClientRect().width || 640));
    var height = 190;
    var ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);
    return { context: context, width: width, height: height };
  }

  function emptyChart(canvas, message) {
    var drawing = canvasContext(canvas);
    drawing.context.fillStyle = "#9ba3ad";
    drawing.context.font = "13px system-ui, sans-serif";
    drawing.context.fillText(message, 14, drawing.height / 2);
  }

  function renderAvailabilityChart(history) {
    if (!history.length) {
      emptyChart(elements.availabilityChart, "No historical samples yet");
      elements.availabilitySummary.textContent = "Historical checks will appear after Avenue Guard records them.";
      return;
    }
    var drawing = canvasContext(elements.availabilityChart);
    var context = drawing.context;
    var plotWidth = drawing.width - 28;
    var slotWidth = plotWidth / history.length;
    var barWidth = Math.max(0.75, slotWidth * 0.72);
    var healthy = 0;
    history.forEach(function (sample, index) {
      if (sample.healthy) healthy += 1;
      context.fillStyle = sample.healthy ? "#52d273" : "#f16b74";
      var height = sample.healthy ? 104 : 56;
      var x = 14 + index * slotWidth + Math.max(0, (slotWidth - barWidth) / 2);
      context.fillRect(x, drawing.height - 32 - height, barWidth, height);
    });
    context.fillStyle = "#65707c";
    context.fillRect(14, drawing.height - 31, drawing.width - 28, 1);
    var percentage = Math.round(healthy / history.length * 100);
    elements.availabilitySummary.textContent = healthy + " of " + history.length + " persisted checks were healthy (" + percentage + "%).";
    elements.availabilityChart.setAttribute("aria-label", "Recent availability: " + percentage + "% of persisted checks healthy");
  }

  function renderLatencyChart(history) {
    var points = history.filter(function (sample) {
      return Number.isFinite(sample.gateway_latency_ms) && sample.gateway_latency_ms >= 0;
    });
    if (!points.length) {
      emptyChart(elements.latencyChart, "No latency samples yet");
      elements.latencySummary.textContent = "Gateway latency will appear after Avenue Guard records it.";
      return;
    }
    var drawing = canvasContext(elements.latencyChart);
    var context = drawing.context;
    var maxValue = Math.max(100, Math.ceil(Math.max.apply(null, points.map(function (item) { return item.gateway_latency_ms; })) / 50) * 50);
    var left = 16;
    var top = 18;
    var plotWidth = drawing.width - 32;
    var plotHeight = drawing.height - 50;
    context.strokeStyle = "#34404a";
    context.lineWidth = 1;
    [0, 0.5, 1].forEach(function (ratio) {
      var y = top + plotHeight * ratio;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(left + plotWidth, y);
      context.stroke();
    });
    context.strokeStyle = "#58d5ba";
    context.lineWidth = 2;
    context.beginPath();
    points.forEach(function (point, index) {
      var x = left + (points.length === 1 ? plotWidth / 2 : index / (points.length - 1) * plotWidth);
      var y = top + plotHeight - Math.min(point.gateway_latency_ms, maxValue) / maxValue * plotHeight;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    var average = Math.round(points.reduce(function (total, point) { return total + point.gateway_latency_ms; }, 0) / points.length);
    var latest = Math.round(points[points.length - 1].gateway_latency_ms);
    elements.latencySummary.textContent = average + " ms average; latest sample " + latest + " ms.";
    elements.latencyChart.setAttribute("aria-label", "Discord latency averaged " + average + " milliseconds; latest " + latest + " milliseconds");
  }

  function renderHealthHistory(samples) {
    var history = Core.normalizeHistory(samples);
    renderAvailabilityChart(history);
    renderLatencyChart(history);
    if (!history.length) {
      elements.historyWindow.textContent = "No samples yet";
      return;
    }
    var seconds = Math.max(0, history[history.length - 1].sample_ts - history[0].sample_ts);
    var hours = Math.max(1, Math.round(seconds / 3600));
    elements.historyWindow.textContent = history.length + " samples · " + hours + "h window";
  }

  function setStatusAppearance(state, online) {
    elements.statusDot.className = "status-dot";
    if (online) {
      elements.statusDot.classList.add("status-dot--online");
      return;
    }
    if (
      state === "starting"
      || state === "database_check"
      || state === "discord_login"
      || state === "reconnecting"
      || state === "waiting_rate_limit"
    ) {
      elements.statusDot.classList.add("status-dot--warning");
      return;
    }
    elements.statusDot.classList.add("status-dot--offline");
  }

  function renderStatus(data) {
    lastStatus = data;
    var online = data.online === true;
    var state = String(data.state || "unknown");
    setStatusAppearance(state, online);

    elements.statusLabel.textContent = String(data.status || (online ? "Operational" : "Unavailable"));
    var version = String(data.version || "Version unavailable");
    elements.version.textContent = /^\d+\.\d+\.\d+/.test(version)
      ? "v" + version
      : version;
    var serviceUptime = serviceUptimeSeconds(data);
    var serviceStarted = serviceStartedTimestamp(data);
    elements.uptime.textContent = formatDuration(serviceUptime);
    elements.uptimePercent.textContent = formatPercentage(data.uptime_percentage);
    elements.uptimeDetail.textContent = serviceStarted
      ? "Service running since " + formatDate(serviceStarted, true)
      : "Current Avenue Guard service process";
    elements.latency.textContent = data.latency_ms !== null
      && data.latency_ms !== undefined
      && Number.isFinite(Number(data.latency_ms))
      ? Math.round(Number(data.latency_ms)) + " ms"
      : "--";
    elements.members.textContent = formatNumber(data.member_count);
    lastCheckedTs = Number(data.updated_ts) || Date.now() / 1000;
    updateCheckedTime();
    renderSystems(data.systems);
    renderHealthHistory(data.health_history);
    elements.statusNotice.textContent = "";

    var avatarUrl = String(data.avatar_url || "");
    if (/^https:\/\//i.test(avatarUrl)) {
      elements.avatar.dataset.fallbackStage = "0";
      elements.avatar.src = avatarUrl;
    }
  }

  function renderUnavailable(message) {
    setStatusAppearance("offline", false);
    elements.statusLabel.textContent = lastStatus
      ? "Status temporarily unavailable"
      : "Unable to reach Avenue Guard";
    elements.statusNotice.textContent = message;
    lastCheckedTs = Date.now() / 1000;
    updateCheckedTime();
  }

  function appendTextElement(parent, tag, className, text) {
    var element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function renderReleases(payload) {
    var releases = Array.isArray(payload.releases) ? payload.releases : [];
    elements.releaseList.replaceChildren();
    elements.releaseCount.textContent = releases.length === 1
      ? "1 update"
      : releases.length + " updates";

    if (!releases.length) {
      var empty = document.createElement("article");
      empty.className = "release-card surface release-card--empty";
      appendTextElement(empty, "h3", "release-card__title", "No updates yet");
      appendTextElement(
        empty,
        "p",
        "release-card__summary",
        "The first published version will appear here."
      );
      elements.releaseList.appendChild(empty);
      return;
    }

    releases.forEach(function (release, index) {
      var card = document.createElement("article");
      card.className = "release-card surface";
      if (index === 0) card.classList.add("release-card--latest");

      var header = document.createElement("div");
      header.className = "release-card__header";
      var titleWrap = document.createElement("div");
      appendTextElement(titleWrap, "p", "release-card__version", "v" + String(release.version || "Unknown"));
      appendTextElement(titleWrap, "h3", "release-card__title", String(release.title || "Avenue Guard update"));
      header.appendChild(titleWrap);
      appendTextElement(header, "time", "release-card__date", formatDate(release.published_ts, false));
      card.appendChild(header);

      if (String(release.summary || "").trim()) {
        appendTextElement(card, "p", "release-card__summary", String(release.summary));
      }

      var changes = Array.isArray(release.changes) ? release.changes : [];
      if (changes.length) {
        var list = document.createElement("ul");
        list.className = "release-card__changes";
        changes.forEach(function (change) {
          appendTextElement(list, "li", "", String(change));
        });
        card.appendChild(list);
      }

      elements.releaseList.appendChild(card);
    });
  }

  function renderReleaseError() {
    elements.releaseCount.textContent = "Unavailable";
    elements.releaseList.replaceChildren();
    var card = document.createElement("article");
    card.className = "release-card surface release-card--empty";
    appendTextElement(card, "h3", "release-card__title", "Update history could not be loaded");
    appendTextElement(
      card,
      "p",
      "release-card__summary",
      "The live service may be restarting. This page will retry automatically."
    );
    elements.releaseList.appendChild(card);
  }

  function fetchJson(path) {
    var controller = new AbortController();
    var timeout = window.setTimeout(function () {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    return fetch(API_BASE + path, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    }).finally(function () {
      window.clearTimeout(timeout);
    });
  }

  function refresh() {
    elements.refresh.disabled = true;
    elements.refresh.textContent = "Refreshing";

    return Promise.allSettled([
      fetchJson("/api/bot"),
      fetchJson("/api/releases")
    ]).then(function (results) {
      if (results[0].status === "fulfilled") {
        renderStatus(results[0].value);
      } else {
        renderUnavailable("Live data could not be refreshed. Retrying automatically.");
      }

      if (results[1].status === "fulfilled") {
        renderReleases(results[1].value);
      } else {
        renderReleaseError();
      }
    }).finally(function () {
      elements.refresh.disabled = false;
      elements.refresh.textContent = "Refresh";
    });
  }

  function scheduleRefresh() {
    if (refreshTimer !== null) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(function () {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_INTERVAL_MS);
  }

  elements.refresh.addEventListener("click", refresh);
  elements.avatar.addEventListener("error", function () {
    var fallbackStage = Number(elements.avatar.dataset.fallbackStage || 0);
    if (elements.avatar.src !== DEFAULT_BOT_AVATAR && fallbackStage < 1) {
      elements.avatar.dataset.fallbackStage = "1";
      elements.avatar.src = DEFAULT_BOT_AVATAR;
    } else if (fallbackStage < 2) {
      elements.avatar.dataset.fallbackStage = "2";
      elements.avatar.src = "favicon.ico";
    }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refresh();
  });
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      if (lastStatus) renderHealthHistory(lastStatus.health_history);
    }, 120);
  });

  refresh();
  scheduleRefresh();
  window.setInterval(updateCheckedTime, 15000);
}());
