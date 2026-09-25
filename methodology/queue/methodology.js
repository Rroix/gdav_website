"use strict";
const API = location.hostname === "127.0.0.1" && location.port === "4174" ? location.origin : "https://avenue-guard.onrender.com";
const sections = [...document.querySelectorAll(".methodology-article > section")];
const toc = document.querySelector("#tocList");
sections.forEach((section) => {
  const link = document.createElement("a");
  const item = document.createElement("li");
  link.href = `#${section.id}`;
  link.textContent = section.querySelector("h2")?.textContent || section.id;
  item.append(link); toc.append(item);
  const heading = section.querySelector("h2");
  if (heading) {
    const permalink = document.createElement("a");
    permalink.className = "section-permalink";
    permalink.href = `#${section.id}`;
    permalink.setAttribute("aria-label", `Open link to ${heading.textContent}`);
    permalink.textContent = "#";
    heading.append(permalink);
  }
});

const tierX = { rate: 0, feature: 1.25, epic: 2.5, legendary: 3.75, mythic: 5 };
const form = document.querySelector("#ppsCalculator");
const output = document.querySelector("#calcOutput");
const tidy = (value) => Number(value.toFixed(2)).toString();
function calculate() {
  const tier = document.querySelector("#calcTier").value;
  const cp = Math.max(0, Number(document.querySelector("#calcCp").value || 0));
  const waiting = Math.max(0, Number(document.querySelector("#calcWaiting").value || 0));
  const f = (1.8 ** tierX[tier]) - 1;
  const g = Math.max(0, Math.log(0.25 / (0.06 * cp + 0.01)));
  const h = 1.5 * (Math.min(waiting, 4) ** 1.5);
  output.textContent = `F ${tidy(f)} + G ${tidy(g)} + H ${tidy(h)} = P ${tidy(f + g + h)}`;
}
form.addEventListener("input", calculate);
calculate();

const live = document.querySelector("#modelLive");
fetch(`${API}/api/methodology/queue/status`, { headers: { Accept: "application/json" } })
  .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
  .then((data) => {
    const models = Array.isArray(data.models) ? data.models : [];
    const state = data.probabilities_published ? "active" : (models.some((model) => ["degraded", "paused"].includes(model.status)) ? "degraded" : "collecting");
    live.dataset.state = state;
    const update = Number(data.updated_at || 0);
    const ageHours = update ? Math.max(0, Math.round((Date.now() / 1000 - update) / 3600)) : null;
    const updated = ageHours === null ? "unknown" : new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-ageHours, "hour");
    const modelLine = models.length ? models.map((model) => `${model.model_key.replace("_model_v1", "")}: ${model.status}`).join(" · ") : "models: collecting";
    live.textContent = `Current system · PPS v1 · ${modelLine} · era: ${data.network_era || "initializing"} · checked ${updated}. ${data.probabilities_published ? "Public probability estimates are active." : "Public probability estimates are not shown right now."}`;
  })
  .catch(() => { live.textContent = "Live model status is temporarily unavailable. Queue ordering continues normally."; });
