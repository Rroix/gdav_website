(function () {
  var QuizEngine = {};
  window.QuizEngine = QuizEngine;

  QuizEngine.Tags = [
    "tech", "industrial", "fantasy", "nature", "abstract", "retro", "modern",
    "brightness", "contrast", "glow", "warmth",
    "density", "clean", "depth",
    "energy", "symmetry",
    "accent_cyan", "accent_purple", "accent_red", "accent_orange", "accent_green",
    "accent_pink", "accent_yellow", "accent_black", "accent_white", "accent_blue", "accent_rainbow"
  ];

  QuizEngine.Themes = ["tech", "industrial", "fantasy", "nature", "abstract", "retro", "modern"];
  QuizEngine.Accents = [
    "accent_cyan", "accent_purple", "accent_red", "accent_orange", "accent_green",
    "accent_pink", "accent_yellow", "accent_black", "accent_white", "accent_blue", "accent_rainbow"
  ];

  QuizEngine.get = function (obj, key, fallback) {
    return obj && obj[key] !== undefined ? obj[key] : fallback;
  };

  QuizEngine.feature = function (img, tag) {
    return Number(QuizEngine.get(img.features, tag, 0)) || 0;
  };

  QuizEngine.makeEmptyScores = function () {
    var scores = {};
    for (var i = 0; i < QuizEngine.Tags.length; i++) {
      scores[QuizEngine.Tags[i]] = 0;
    }
    return scores;
  };

  QuizEngine.incShown = function (state, imgId) {
    state.shownCounts[imgId] = QuizEngine.get(state.shownCounts, imgId, 0) + 1;
  };

  QuizEngine.validateImages = function (images) {
    if (!Array.isArray(images)) return { ok: false, error: "images must be an array" };
    if (images.length < 2) return { ok: false, error: "At least 2 images are required" };

    var ids = {};
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      if (!img || typeof img !== "object") return { ok: false, error: "Each image must be an object" };
      if (!img.id || typeof img.id !== "string") return { ok: false, error: "Each image needs a string id" };
      if (ids[img.id]) return { ok: false, error: "Duplicated image id: " + img.id };
      ids[img.id] = true;

      if (!img.src || typeof img.src !== "string") return { ok: false, error: "Image " + img.id + " needs a src string" };
      if (!img.features || typeof img.features !== "object") return { ok: false, error: "Image " + img.id + " needs a features object" };
    }

    return { ok: true };
  };

  QuizEngine.start = function (images, config) {
    var check = QuizEngine.validateImages(images);
    if (!check.ok) return { ok: false, error: check.error };

    config = config || {};
    var maxRounds = QuizEngine.get(config, "maxRounds", 8);
    var loserPenalty = QuizEngine.get(config, "loserPenalty", 0.3);

    var state = {
      round: 0,
      maxRounds: maxRounds,
      loserPenalty: loserPenalty,
      scores: QuizEngine.makeEmptyScores(),
      shownCounts: {},
      usedPairs: [],
      currentPair: null
    };

    var pair = QuizEngine.pickPair(images, state);
    if (!pair) return { ok: false, error: "Could not pick an initial pair" };

    state.currentPair = { leftId: pair.left.id, rightId: pair.right.id };
    return { ok: true, state: state, pair: pair };
  };

  QuizEngine.pairKey = function (aId, bId) {
    return aId < bId ? aId + "|" + bId : bId + "|" + aId;
  };

  QuizEngine.getShown = function (state, imgId) {
    return QuizEngine.get(state.shownCounts, imgId, 0);
  };

  QuizEngine.pairDistance = function (a, b) {
    var d = 0;
    for (var i = 0; i < QuizEngine.Tags.length; i++) {
      var tag = QuizEngine.Tags[i];
      d += Math.abs(QuizEngine.feature(a, tag) - QuizEngine.feature(b, tag));
    }
    return d;
  };

  QuizEngine.pickPair = function (images, state) {
    var tries = Math.min(220, images.length * 10);
    var best = null;
    var bestScore = -Infinity;
    var used = {};

    for (var u = 0; u < state.usedPairs.length; u++) used[state.usedPairs[u]] = true;

    for (var t = 0; t < tries; t++) {
      var left = images[Math.floor(Math.random() * images.length)];
      var right = images[Math.floor(Math.random() * images.length)];
      if (!left || !right || left.id === right.id) continue;

      var key = QuizEngine.pairKey(left.id, right.id);
      if (used[key]) continue;

      var diff = QuizEngine.pairDistance(left, right);
      var novelty = -(QuizEngine.getShown(state, left.id) + QuizEngine.getShown(state, right.id));
      var score = diff + novelty * 0.8;

      if (score > bestScore) {
        bestScore = score;
        best = { left: left, right: right, key: key };
      }
    }

    if (!best) {
      for (var i = 0; i < images.length; i++) {
        for (var j = i + 1; j < images.length; j++) {
          var fallbackKey = QuizEngine.pairKey(images[i].id, images[j].id);
          if (!used[fallbackKey]) {
            best = { left: images[i], right: images[j], key: fallbackKey };
            break;
          }
        }
        if (best) break;
      }
    }

    if (!best) return null;

    state.usedPairs.push(best.key);
    QuizEngine.incShown(state, best.left.id);
    QuizEngine.incShown(state, best.right.id);

    return { left: best.left, right: best.right };
  };

  QuizEngine.applyChoice = function (state, winner, loser) {
    var penalty = state.loserPenalty;

    for (var i = 0; i < QuizEngine.Tags.length; i++) {
      var tag = QuizEngine.Tags[i];
      state.scores[tag] += QuizEngine.feature(winner, tag);
      state.scores[tag] -= QuizEngine.feature(loser, tag) * penalty;
    }
  };

  QuizEngine.validateChoice = function (state, chosenId) {
    if (!state || !state.currentPair) return { ok: false, error: "No current pair" };
    if (typeof chosenId !== "string") return { ok: false, error: "The chosen id must be a string" };

    var a = state.currentPair.leftId;
    var b = state.currentPair.rightId;
    if (chosenId !== a && chosenId !== b) return { ok: false, error: "The chosen id is not in the current pair" };

    return { ok: true };
  };

  QuizEngine.choose = function (images, state, chosenId) {
    var check = QuizEngine.validateChoice(state, chosenId);
    if (!check.ok) return { ok: false, error: check.error };

    var left = null;
    var right = null;
    for (var i = 0; i < images.length; i++) {
      if (images[i].id === state.currentPair.leftId) left = images[i];
      if (images[i].id === state.currentPair.rightId) right = images[i];
    }

    if (!left || !right) return { ok: false, error: "Pair images not found in the pool" };

    var winner = chosenId === left.id ? left : right;
    var loser = chosenId === left.id ? right : left;

    QuizEngine.applyChoice(state, winner, loser);
    state.round += 1;

    if (state.round >= state.maxRounds) {
      return { ok: true, done: true, state: state, result: QuizEngine.summarize(state) };
    }

    var pair = QuizEngine.pickPair(images, state);
    if (!pair) return { ok: false, error: "Could not pick a new pair" };

    state.currentPair = { leftId: pair.left.id, rightId: pair.right.id };
    return { ok: true, done: false, state: state, pair: pair };
  };

  QuizEngine.topTags = function (scores, tags, n) {
    var arr = [];
    for (var i = 0; i < tags.length; i++) {
      var tag = tags[i];
      arr.push({ tag: tag, val: QuizEngine.get(scores, tag, 0) });
    }
    arr.sort(function (a, b) { return b.val - a.val; });
    return arr.slice(0, n);
  };

  QuizEngine.describe = function (scores) {
    function label(v, lowLabel, midLabel, highLabel, lowCut, highCut) {
      if (v <= lowCut) return lowLabel;
      if (v >= highCut) return highLabel;
      return midLabel;
    }

    return {
      vibe: label(scores.brightness, "dark", "balanced", "bright", -2, 2),
      contrast: label(scores.contrast, "low contrast", "medium contrast", "high contrast", -2, 2),
      glow: scores.glow >= 2 ? "glow heavy" : "low glow",
      temp: label(scores.warmth, "cool", "neutral", "warm", -2, 2),
      detail: label(scores.density, "minimalistic", "medium detailed", "maximalistic", -2, 2),
      polish: label(scores.clean, "chaotic", "mixed", "clean", -2, 2),
      depth: scores.depth >= 2 ? "layered depth" : "simple depth",
      energy: label(scores.energy, "calm", "steady", "intense", -2, 2),
      symmetry: scores.symmetry >= 2 ? "symmetrical" : "freeform"
    };
  };

  QuizEngine.summarize = function (state) {
    var scores = state.scores;
    var themes = QuizEngine.topTags(scores, QuizEngine.Themes, 2);
    var accents = QuizEngine.topTags(scores, QuizEngine.Accents, 2);
    var d = QuizEngine.describe(scores);

    var styleText = themes[0].tag + (themes[1] && themes[1].val > 0.5 ? " + " + themes[1].tag : "");
    var accentText = accents
      .map(function (x) { return x.tag.replace("accent_", ""); })
      .join(" + ");

    var brief = [];
    brief.push("Style: " + styleText);
    brief.push("Mood: " + d.vibe + ", " + d.energy + ", " + d.contrast + ", " + d.glow);
    brief.push("Build: " + d.detail + ", " + d.polish + ", " + d.depth + ", " + d.symmetry);
    brief.push("Palette: " + d.temp + " base with " + accentText + " accents");

    return {
      style: styleText,
      accents: accentText,
      descriptors: d,
      topThemes: themes,
      topAccents: accents,
      briefText: brief.join("\n")
    };
  };
})();
