(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LevelPageCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PRIORITY_LABELS = {
    top_priority: "Top priority",
    high_priority: "High priority",
    standard_priority: "Standard priority",
    lower_priority: "Lower priority"
  };
  var OUTREACH_LABELS = {
    queued_for_outreach: "Queued for outreach",
    outreach_in_progress: "In progress",
    reached_moderator: "Reached a moderator",
    outreach_complete: "Outreach complete",
    withdrawn: "Withdrawn",
    level_unavailable: "Level unavailable",
    unknown: "Unknown"
  };
  var OUTCOME_LABELS = {
    awaiting_outcome: "Awaiting outcome",
    rated: "Rated",
    not_observed_rated_within_window: "Not observed rated within outcome window",
    unknown: "Unknown"
  };

  function timestampSeconds(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
  }

  function relativeTime(value, nowMs, locale) {
    var timestamp = timestampSeconds(value);
    if (!timestamp) return "Unknown";
    var now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    var difference = timestamp - Math.floor(now / 1000);
    var absolute = Math.abs(difference);
    var unit = "minute";
    var divisor = 60;

    if (absolute < 60) {
      return new Intl.RelativeTimeFormat(locale || "en", { numeric: "auto" }).format(0, "minute");
    }
    if (absolute < 3600) {
      unit = "minute";
      divisor = 60;
    } else if (absolute < 86400) {
      unit = "hour";
      divisor = 3600;
    } else if (absolute < 2629800) {
      unit = "day";
      divisor = 86400;
    } else if (absolute < 31557600) {
      unit = "month";
      divisor = 2629800;
    } else {
      unit = "year";
      divisor = 31557600;
    }
    var amount = Math.round(difference / divisor);
    if (Object.is(amount, -0)) amount = 0;
    return new Intl.RelativeTimeFormat(locale || "en", { numeric: "auto" }).format(amount, unit);
  }

  function exactDate(value, locale) {
    var timestamp = timestampSeconds(value);
    if (!timestamp) return null;
    var date = new Date(timestamp * 1000);
    return {
      iso: date.toISOString(),
      label: new Intl.DateTimeFormat(locale || "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
      }).format(date)
    };
  }

  function publicPriorityBand(position, total) {
    var rank = Number(position);
    var size = Number(total);
    if (!Number.isInteger(rank) || !Number.isInteger(size) || rank < 1 || size < 1 || rank > size) return null;
    if (rank === 1) return "top_priority";
    var percentile = rank / size;
    if (percentile <= 0.10) return "top_priority";
    if (percentile <= 0.30) return "high_priority";
    if (percentile <= 0.70) return "standard_priority";
    return "lower_priority";
  }

  function normalizePayload(raw) {
    var data = raw && typeof raw === "object" ? raw : {};
    var queueState = String(data.public_queue_state || "").toLowerCase();
    var outreachState = String(data.public_outreach_state || "").toLowerCase();
    var outcomeState = String(data.public_outcome_state || "").toLowerCase();
    var priorityBand = data.public_priority_band || null;
    var priorityComplete = data.priority_complete !== false && data.public_priority_status !== "pending";

    // Transitional support for schema 1. Exact rank is never rendered.
    if (!queueState) {
      var oldStatus = String(data.queue_status || "").toLowerCase();
      if (oldStatus === "rated") queueState = "rated";
      else if (oldStatus.indexOf("submitted") >= 0) queueState = "awaiting_outcome";
      else if (oldStatus.indexOf("unavailable") >= 0) queueState = "invalid";
      else if (data.queue_position != null) queueState = "queued";
      else queueState = "unknown";
    }
    if (priorityComplete && !priorityBand && (queueState === "queued" || queueState === "in_cycle")) {
      priorityBand = publicPriorityBand(data.queue_position, data.active_queue_total);
    }
    if (!priorityComplete) priorityBand = null;
    if (!outreachState) {
      outreachState = {
        queued: "queued_for_outreach",
        in_cycle: "outreach_in_progress",
        awaiting_outcome: "reached_moderator",
        rated: "outreach_complete",
        withdrawn: "withdrawn",
        invalid: "level_unavailable"
      }[queueState] || "unknown";
    }
    if (!outcomeState) {
      outcomeState = queueState === "rated"
        ? "rated"
        : queueState === "awaiting_outcome"
          ? "awaiting_outcome"
          : "unknown";
    }
    if (queueState !== "queued" && queueState !== "in_cycle") priorityBand = null;

    function probabilityPart(prefix) {
      var point = data.probability[prefix + "probability_percent"];
      var interval = data.probability[prefix + "credible_interval_90_percent"];
      if (!Number.isFinite(Number(point)) || !Array.isArray(interval) || interval.length < 2) return null;
      return {
        probabilityPercent: Math.max(0, Math.min(100, Math.round(Number(point)))),
        interval90: interval.slice(0, 2).map(function (value) {
          return Math.max(0, Math.min(100, Math.round(Number(value))));
        }),
        evidenceStrength: String(data.probability[prefix + "evidence_strength"] || data.probability.evidence_strength || "limited")
      };
    }
    var probability = data.probability && data.probability.status === "active" ? {
      access: probabilityPart("access_"),
      rating: probabilityPart("rating_"),
      overall: probabilityPart("")
    } : null;
    if (probability && !probability.access && !probability.rating && !probability.overall) probability = null;

    return {
      schemaVersion: Number(data.schema_version || 1),
      levelId: String(data.level_id || ""),
      levelName: String(data.level_name || "Unknown level"),
      uploaderName: String(data.uploader_name || ""),
      recommendationType: String(data.recommendation_type || "rate").toLowerCase(),
      recommendedAt: timestampSeconds(data.recommended_at || data.recommended_ts),
      queueState: queueState || "unknown",
      priorityBand: priorityBand,
      priorityComplete: priorityComplete,
      outreachState: outreachState || "unknown",
      outcomeState: outcomeState || "unknown",
      submittedToModAt: timestampSeconds(data.submitted_to_mod_at),
      ratedObservedAt: timestampSeconds(data.rated_observed_at),
      lastUpdatedAt: timestampSeconds(data.last_updated_at || data.updated_ts),
      probability: probability
    };
  }

  function presentation(model) {
    var recommended = {
      label: "Recommended",
      value: model.recommendedAt,
      kind: "time"
    };
    var priority = model.priorityComplete ? (PRIORITY_LABELS[model.priorityBand] || "Status available") : "Calculating";
    var outreach = OUTREACH_LABELS[model.outreachState] || "Unknown";
    var outcome = OUTCOME_LABELS[model.outcomeState] || "Unknown";
    var fields;

    if (model.queueState === "rated") {
      fields = [recommended, { label: "Outcome", value: "Rated" }];
    } else if (model.queueState === "withdrawn") {
      fields = [recommended, { label: "Status", value: "Withdrawn" }];
    } else if (model.queueState === "invalid") {
      fields = [recommended, { label: "Status", value: "Level unavailable" }];
    } else if (model.queueState === "awaiting_outcome") {
      fields = [
        recommended,
        { label: "Outreach", value: outreach },
        { label: "Outcome", value: outcome }
      ];
    } else if (model.queueState === "queued" || model.queueState === "in_cycle") {
      fields = [
        recommended,
        { label: "Outreach", value: outreach },
        { label: "Priority", value: priority }
      ];
    } else {
      fields = [recommended, { label: "Status", value: "Unknown" }];
    }

    return {
      fields: fields,
      timeline: timeline(model)
    };
  }

  function timeline(model) {
    var recommended = {
      label: "Recommended",
      state: "complete",
      timestamp: model.recommendedAt
    };
    if (model.queueState === "withdrawn" || model.queueState === "invalid") {
      return [
        recommended,
        {
          label: model.queueState === "withdrawn" ? "Withdrawn" : "Level unavailable",
          state: "current",
          timestamp: model.lastUpdatedAt
        }
      ];
    }
    if (model.queueState === "unknown") {
      return [recommended, { label: "Status unknown", state: "current", timestamp: null }];
    }

    var queuedState = model.queueState === "queued" || model.queueState === "in_cycle" ? "current" : "complete";
    var reachedState = model.queueState === "awaiting_outcome" && model.submittedToModAt
      ? "current"
      : model.queueState === "rated" && model.submittedToModAt
        ? "complete"
        : "future";
    var ratedState = model.queueState === "rated" ? "complete" : "future";
    var ratedLabel = "Rated";
    if (model.outcomeState === "not_observed_rated_within_window") {
      reachedState = "complete";
      ratedState = "current";
      ratedLabel = "Not observed rated";
    }
    var stages = [
      recommended,
      {
        label: model.queueState === "in_cycle" ? "Outreach in progress" : "Queued for outreach",
        state: queuedState,
        timestamp: null
      },
    ];
    if (model.submittedToModAt || model.queueState !== "rated") {
      stages.push({ label: "Reached moderator", state: reachedState, timestamp: model.submittedToModAt });
    }
    stages.push({ label: ratedLabel, state: ratedState, timestamp: model.ratedObservedAt });
    return stages;
  }

  function copyText(text, navigatorObject, documentObject) {
    var navigatorValue = navigatorObject || {};
    if (navigatorValue.clipboard && typeof navigatorValue.clipboard.writeText === "function") {
      return navigatorValue.clipboard.writeText(String(text));
    }
    return new Promise(function (resolve, reject) {
      try {
        var textarea = documentObject.createElement("textarea");
        textarea.value = String(text);
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        documentObject.body.appendChild(textarea);
        textarea.select();
        var copied = documentObject.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("copy-failed");
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  return {
    OUTCOME_LABELS: OUTCOME_LABELS,
    OUTREACH_LABELS: OUTREACH_LABELS,
    PRIORITY_LABELS: PRIORITY_LABELS,
    copyText: copyText,
    exactDate: exactDate,
    normalizePayload: normalizePayload,
    presentation: presentation,
    publicPriorityBand: publicPriorityBand,
    relativeTime: relativeTime,
    timeline: timeline,
    timestampSeconds: timestampSeconds
  };
}));
