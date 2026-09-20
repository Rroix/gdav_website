(function () {
  "use strict";

  var API_URL = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? location.origin
    : "https://avenue-guard.onrender.com") + "/api/team";
  var images = Array.from(document.querySelectorAll("[data-team-user-id]"));
  if (!images.length) return;

  fetch(API_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  }).then(function (response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }).then(function (payload) {
    var members = new Map(
      (Array.isArray(payload.members) ? payload.members : []).map(function (member) {
        return [String(member.id || ""), member];
      })
    );
    images.forEach(function (image) {
      var member = members.get(String(image.dataset.teamUserId || ""));
      var avatarUrl = String(member && member.avatar_url || "");
      if (/^https:\/\//i.test(avatarUrl)) image.src = avatarUrl;
    });
  }).catch(function () {
    // The checked-in image remains a stable fallback while Avenue Guard restarts.
  });
}());
