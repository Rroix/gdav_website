"use strict";
const API = location.hostname === "127.0.0.1" && location.port === "4174"
  ? location.origin
  : "https://avenue-guard.onrender.com";
const input = document.querySelector("#level-search");
const results = document.querySelector("#level-results");
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
const label = (value) => String(value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const tierArt = (tier) => {
  const safe = ["rate", "feature", "epic", "legendary", "mythic"].includes(String(tier).toLowerCase()) ? String(tier).toLowerCase() : "rate";
  return `<img class="public-tier-art" src="/assets/send-types/pps_${safe}.png" alt="" width="28" height="28">`;
};
let controller;

async function search() {
  controller?.abort(); controller = new AbortController();
  const requestController = controller;
  const timeout = setTimeout(() => requestController.abort(), 8000);
  const query = input.value.trim();
  results.innerHTML = '<div class="loading-state"><span class="spinner"></span>Searching recommendations</div>';
  try {
    const response = await fetch(`${API}/api/levels?q=${encodeURIComponent(query)}`, { signal:requestController.signal });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (/^\d{7,9}$/.test(query) && data.levels.length === 1 && data.levels[0].level_id === query) {
      location.href = `/level/${query}`; return;
    }
    results.innerHTML = data.levels.length ? data.levels.map((item) => `<a class="public-level-row" href="/level/${esc(item.level_id)}"><span class="public-level-identity"><strong>${esc(item.level_name)}</strong><small>${esc(item.uploader_name || "Unknown creator")} · <code>${esc(item.level_id)}</code></small></span><span class="public-tier ${esc(item.recommendation_type)}">${tierArt(item.recommendation_type)}<span>${esc(label(item.recommendation_type))}</span></span><span class="public-level-state"><small>Status</small>${esc(label(item.public_outcome_state === "rated" ? "rated" : item.public_outreach_state))}</span><span class="priority-band"><small>Priority</small>${item.public_priority_status === "pending" || item.priority_complete === false ? "Priority pending" : item.public_priority_band ? esc(label(item.public_priority_band)) : "Status available"}</span><span class="public-row-arrow" aria-hidden="true">→</span></a>`).join("") : '<div class="empty-state"><strong>No public recommendation found</strong><span>Only levels recommended by GD Avenue appear here.</span></div>';
  } catch (error) {
    if (requestController === controller) results.innerHTML = '<div class="error-state"><strong>Search is temporarily unavailable</strong><span>Please try again shortly.</span></div>';
  } finally {
    clearTimeout(timeout);
  }
}
let timer;
input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 280); });
search();
