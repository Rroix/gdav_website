(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AvenueStatusCore = api;
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function relativeTime(timestamp, nowSeconds) {
    var checked = Number(timestamp);
    var now = Number(nowSeconds || Date.now() / 1000);
    if (!Number.isFinite(checked) || checked <= 0 || !Number.isFinite(now)) return "Unknown";
    var elapsed = Math.max(0, Math.floor(now - checked));
    if (elapsed < 10) return "just now";
    if (elapsed < 60) return elapsed + " seconds ago";
    var minutes = Math.floor(elapsed / 60);
    if (minutes < 60) return minutes + (minutes === 1 ? " minute ago" : " minutes ago");
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
    var days = Math.floor(hours / 24);
    if (days < 30) return days + (days === 1 ? " day ago" : " days ago");
    var months = Math.floor(days / 30);
    if (months < 12) return months + (months === 1 ? " month ago" : " months ago");
    var years = Math.floor(days / 365);
    return years + (years === 1 ? " year ago" : " years ago");
  }

  function normalizeHistory(samples) {
    if (!Array.isArray(samples)) return [];
    function optionalNumber(value) {
      if (value === null || value === undefined || value === "") return null;
      var number = Number(value);
      return Number.isFinite(number) && number >= 0 ? number : null;
    }
    return samples.map(function (sample) {
      return {
        sample_ts: Number(sample.sample_ts),
        healthy: sample.healthy === true,
        gateway_latency_ms: optionalNumber(sample.gateway_latency_ms),
        database_latency_ms: optionalNumber(sample.database_latency_ms)
      };
    }).filter(function (sample) {
      return Number.isFinite(sample.sample_ts) && sample.sample_ts > 0;
    }).sort(function (left, right) {
      return left.sample_ts - right.sample_ts;
    }).slice(-288);
  }

  return { relativeTime: relativeTime, normalizeHistory: normalizeHistory };
}));
