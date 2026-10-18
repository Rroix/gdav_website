(function () {
  "use strict";

  var API_URL = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? location.origin
    : "https://avenue-guard.onrender.com") + "/api/team";
  var grid = document.querySelector(".team-grid");
  var status = document.querySelector("#team-profile-status");
  var template = document.querySelector("#team-card-template");
  if (!grid) return;

  function cards() {
    return Array.from(grid.querySelectorAll(".profile-card[data-team-user-id]"));
  }

  function applyAvatar(image, avatarUrl) {
    if (!image || !/^https:\/\//i.test(avatarUrl)) return;
    var fallbackUrl = image.dataset.fallbackSrc || image.src;
    image.dataset.fallbackSrc = fallbackUrl;
    image.onerror = function () {
      image.onerror = null;
      image.classList.add("using-fallback");
      image.src = fallbackUrl;
    };
    image.classList.remove("using-fallback");
    image.src = avatarUrl;
  }

  function cardFor(member) {
    var userId = String(member.id || "");
    var existing = cards().find(function (card) {
      return String(card.dataset.teamUserId || "") === userId;
    });
    if (existing || !template) return existing;
    var fragment = template.content.cloneNode(true);
    var card = fragment.querySelector(".profile-card");
    card.dataset.teamUserId = userId;
    card.dataset.dynamic = "true";
    grid.appendChild(fragment);
    return card;
  }

  function applyMember(member) {
    var card = cardFor(member);
    if (!card) return false;
    var image = card.querySelector(".profile-avatar");
    var name = card.querySelector(".profile-name");
    var role = card.querySelector(".profile-role");
    var quote = card.querySelector(".profile-desc");
    var displayName = String(member.display_name || "").trim();
    var avatarUrl = String(member.avatar_url || image && image.dataset.avatarUrl || "");
    var roleLabel = String(member.role_label || "").trim();
    var quoteText = String(member.quote || "").trim();

    if (displayName && name) name.textContent = displayName;
    if (image) {
      image.alt = "Profile picture of " + (displayName || name && name.textContent || "GD Avenue staff member");
      applyAvatar(image, avatarUrl);
    }
    if (card.dataset.dynamic === "true") {
      if (role) role.textContent = roleLabel || "GD Avenue staff";
      if (quote) {
        quote.textContent = quoteText;
        quote.hidden = !quoteText;
      }
    } else if (quoteText && quote) {
      quote.textContent = quoteText;
      quote.hidden = false;
    }
    card.hidden = false;
    return true;
  }

  cards().forEach(function (card) {
    card.hidden = true;
    var image = card.querySelector(".profile-avatar");
    if (image) image.dataset.fallbackSrc = image.src;
  });

  fetch(API_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  }).then(function (response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }).then(function (payload) {
    var members = Array.isArray(payload.members) ? payload.members : [];
    cards().forEach(function (card) { card.hidden = true; });
    var shown = members.reduce(function (count, member) {
      return count + (applyMember(member) ? 1 : 0);
    }, 0);
    if (status) {
      status.hidden = shown > 0;
      status.textContent = shown ? "" : "No team profiles are published right now.";
    }
  }).catch(function () {
    // Public profile preferences fail closed so an opted-out card cannot reappear.
    cards().forEach(function (card) { card.hidden = true; });
    if (status) {
      status.hidden = false;
      status.textContent = "Team profiles are temporarily unavailable.";
    }
  });
}());
