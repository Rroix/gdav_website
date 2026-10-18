(function () {
  "use strict";

  var loading = document.getElementById("feedback-loading");
  if (!loading) return;
  var auth = document.getElementById("feedback-auth");
  var workspace = document.getElementById("feedback-workspace");
  var form = document.getElementById("feedback-form");
  var formStatus = document.getElementById("feedback-form-status");
  var submit = document.getElementById("feedback-submit");
  var list = document.getElementById("feedback-request-list");
  var context = document.getElementById("feedback-context");
  var statusLabels = {
    queued: "Waiting for a judge",
    claimed: "Being reviewed",
    completed: "Feedback sent",
    cancelled: "Closed"
  };
  var focusLabels = {
    overall: "Overall direction",
    gameplay: "Gameplay and readability",
    decoration: "Decoration and visuals",
    optimization: "Optimization",
    effects: "Effects and transitions",
    rate_readiness: "Rate readiness"
  };

  function cookieValue(name) {
    var prefix = name + "=";
    var found = document.cookie.split(";").map(function (item) { return item.trim(); }).find(function (item) { return item.indexOf(prefix) === 0; });
    return found ? found.slice(prefix.length) : "";
  }

  function operationKey() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "feedback-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  }

  async function api(path, options) {
    options = options || {};
    var mutation = options.method && options.method !== "GET";
    var headers = { "Accept": "application/json", "Cache-Control": "no-store" };
    if (options.body) headers["Content-Type"] = "application/json";
    if (mutation) {
      headers["X-CSRF-Token"] = decodeURIComponent(cookieValue("av_staff_csrf"));
      headers["Idempotency-Key"] = operationKey();
    }
    var response = await fetch(path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
      cache: "no-store"
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(data.error && data.error.message || "The request could not be completed.");
      error.status = response.status;
      error.code = data.error && data.error.code || "request_failed";
      throw error;
    }
    return data;
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
    });
  }

  function relativeTime(timestamp) {
    var seconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(timestamp || 0));
    if (seconds < 60) return "just now";
    if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
    if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
    return Math.floor(seconds / 86400) + "d ago";
  }

  function renderRequests(items) {
    if (!Array.isArray(items) || !items.length) {
      list.innerHTML = '<p class="feedback-empty">No feedback requests yet.</p>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      var name = item.level_name || "Level " + item.level_id;
      var state = statusLabels[item.status] || "Status unavailable";
      var delivery = item.delivery_status === "dead" ? '<span class="feedback-delivery-error">Discord delivery needs staff attention</span>' : "";
      return '<article class="feedback-request">'
        + '<div><strong>' + esc(name) + '</strong><span>Level ' + esc(item.level_id) + '</span></div>'
        + '<p>' + esc(focusLabels[item.feedback_focus] || item.feedback_focus) + '</p>'
        + '<div class="feedback-request__state"><span data-state="' + esc(item.status) + '">' + esc(state) + '</span><time datetime="' + new Date(Number(item.created_ts || 0) * 1000).toISOString() + '">' + esc(relativeTime(item.created_ts)) + '</time></div>'
        + delivery
        + '</article>';
    }).join("");
  }

  async function loadRequests() {
    var data = await api("/api/feedback/requests");
    renderRequests(data.items || []);
  }

  function showAuth(error) {
    loading.hidden = true;
    workspace.hidden = true;
    auth.hidden = false;
    var errorBox = document.getElementById("feedback-auth-error");
    if (error) {
      errorBox.textContent = error;
      errorBox.hidden = false;
    }
  }

  async function initialize() {
    var search = new URLSearchParams(location.search);
    var authError = search.get("auth_error");
    try {
      var session = await api("/api/feedback/session");
      loading.hidden = true;
      auth.hidden = true;
      workspace.hidden = false;
      document.getElementById("feedback-user").textContent = session.user.display_name || "Discord member";
      var avatar = document.getElementById("feedback-avatar");
      if (/^https:\/\//.test(session.user.avatar_url || "")) avatar.src = session.user.avatar_url;
      await loadRequests();
    } catch (error) {
      showAuth(authError || (error.status === 401 ? "" : error.message));
    }
  }

  context.addEventListener("input", function () {
    document.getElementById("feedback-context-count").textContent = String(context.value.length);
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    formStatus.textContent = "Validating the level and preparing the judge request...";
    try {
      await api("/api/feedback/requests", {
        method: "POST",
        body: {
          level_id: document.getElementById("feedback-level-id").value,
          feedback_focus: document.getElementById("feedback-focus").value,
          project_stage: document.getElementById("feedback-stage").value,
          context: context.value,
          showcase_url: document.getElementById("feedback-showcase").value
        }
      });
      form.reset();
      document.getElementById("feedback-context-count").textContent = "0";
      formStatus.textContent = "Your request is queued for the judge gallery.";
      await loadRequests();
    } catch (error) {
      formStatus.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById("feedback-logout").addEventListener("click", async function () {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": decodeURIComponent(cookieValue("av_staff_csrf")) },
      credentials: "same-origin"
    });
    location.replace("/feedback.html");
  });

  initialize();
}());
