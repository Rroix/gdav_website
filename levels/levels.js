"use strict";
const API = location.hostname === "127.0.0.1" && location.port === "4174"
  ? location.origin
  : "https://avenue-guard.onrender.com";
const input = document.querySelector("#level-search");
const results = document.querySelector("#level-results");
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
const label = (value) => String(value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
    results.innerHTML = data.levels.length ? data.levels.map((item) => `<a class="public-level-row" href="/level/${esc(item.level_id)}"><div><strong>${esc(item.level_name)}</strong><small>by ${esc(item.uploader_name || "Unknown creator")} · ${esc(item.level_id)}</small></div><span class="pill ${esc(item.recommendation_type)}">${esc(label(item.recommendation_type))}</span><span>${esc(label(item.public_outcome_state === "rated" ? "rated" : item.public_outreach_state))}</span><span class="priority-band">${item.public_priority_band ? esc(label(item.public_priority_band)) : "Status available"}</span></a>`).join("") : '<div class="empty-state"><strong>No public recommendation found</strong><span>Only levels recommended by GD Avenue appear here.</span></div>';
  } catch (error) {
    if (requestController === controller) results.innerHTML = '<div class="error-state"><strong>Search is temporarily unavailable</strong><span>Please try again shortly.</span></div>';
  } finally {
    clearTimeout(timeout);
  }
}
let timer;
input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 280); });
search();
