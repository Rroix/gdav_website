"use strict";

const state = {
  user: null,
  module: localStorage.getItem("av-staff-module") || "overview",
  section: localStorage.getItem("av-staff-section") || "overview",
  overview: null,
  request: 0,
  queueQuery: "",
  returnFocus: null,
};

const modules = {
  overview: { label: "Overview", description: "Your work, attention items, and team pulse.", sections: ["overview"] },
  work: { label: "Work", description: "Claims, outreach, tasks, and private working notes.", sections: ["my-work", "queue", "outreach", "tasks", "notes"] },
  team: { label: "Team", description: "Shared progress, statistics, review quality, applications, and staff access.", sections: ["team-overview", "statistics", "review-qa", "applications", "staff"] },
  admin: { label: "Admin", description: "Operations, PPS controls, audit records, and safe configuration.", sections: ["operations", "pps", "audit", "configuration"] },
};

const sectionNames = {
  overview: "Overview", "my-work": "My Work", queue: "Queue", outreach: "Outreach", tasks: "Tasks", notes: "Notes",
  "team-overview": "Overview", statistics: "Statistics", "review-qa": "Review QA", applications: "Applications", staff: "Staff",
  operations: "Operations", pps: "PPS", audit: "Audit", configuration: "Configuration",
};

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const can = (capability) => state.user?.capabilities?.includes(capability);
const fmtTime = (ts) => ts ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(Number(ts) * 1000)) : "Not recorded";
const ago = (ts) => {
  if (!ts) return "Unknown time";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(ts));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};
const titleCase = (value) => String(value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
const percent = (done, total) => total ? Math.round((Number(done) / Number(total)) * 100) : 0;
const cookieValue = (name) => document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";

async function api(path, options = {}) {
  const mutation = options.method && options.method !== "GET";
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.method && options.method !== "GET" ? { "Idempotency-Key": crypto.randomUUID() } : {}),
      ...(mutation ? { "X-CSRF-Token": decodeURIComponent(cookieValue("av_staff_csrf")) } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "The portal could not complete that request");
    error.status = response.status;
    error.code = data.error;
    throw error;
  }
  return data;
}

function showNotice(message, error = false) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.classList.toggle("error", error);
  notice.hidden = false;
  window.setTimeout(() => { notice.hidden = true; }, 5000);
}

function empty(message, detail = "") {
  return `<div class="empty-state"><strong>${esc(message)}</strong>${detail ? `<span>${esc(detail)}</span>` : ""}</div>`;
}

function loading() {
  $("#content").innerHTML = '<div class="loading-state"><span class="spinner" aria-hidden="true"></span>Loading workspace</div>';
}

function errorState(error) {
  $("#content").innerHTML = `<div class="error-state"><strong>That view could not be loaded</strong><span>${esc(error.message || "Please try again")}</span><button class="button secondary" data-action="refresh">Retry</button></div>`;
}

function progress(label, done, total) {
  if (!Number(total)) {
    return `<div class="metric-line"><span>${esc(label)}</span><strong>0 / 0</strong></div><small class="muted">No assigned work yet.</small>`;
  }
  const value = percent(done, total);
  return `<div class="metric-line"><span>${esc(label)}</span><strong>${Number(done) || 0} / ${Number(total) || 0}</strong></div><progress aria-label="${esc(label)}" max="${Math.max(1, Number(total) || 1)}" value="${Number(done) || 0}">${value}%</progress><small class="muted">${value}% complete</small>`;
}

function pill(value, extra = "") {
  const safe = String(value || "unknown").toLowerCase();
  return `<span class="pill ${esc(safe)} ${esc(extra)}">${esc(titleCase(value))}</span>`;
}

function setShell() {
  const allowedModules = ["overview", "work", "team", ...(state.user.role === "owner" ? ["admin"] : [])];
  if (!allowedModules.includes(state.module)) state.module = "overview";
  if (!modules[state.module].sections.includes(state.section)) state.section = modules[state.module].sections[0];
  $("#primary-nav").innerHTML = allowedModules.map((key) => `<button class="nav-button ${state.module === key ? "active" : ""}" data-module="${key}" type="button">${modules[key].label}<span class="nav-count" data-count="${key}" hidden></span></button>`).join("");
  $("#section-nav").innerHTML = modules[state.module].sections.filter(sectionAllowed).map((key) => `<button class="section-tab ${state.section === key ? "active" : ""}" data-section="${key}" type="button">${sectionNames[key]}</button>`).join("");
  $("#section-nav").hidden = modules[state.module].sections.filter(sectionAllowed).length < 2;
  $("#page-title").textContent = state.module === "overview" ? "Overview" : `${modules[state.module].label} / ${sectionNames[state.section]}`;
  $("#page-description").textContent = modules[state.module].description;
  $("#module-eyebrow").textContent = `${titleCase(state.user.role)} workspace`;
}

function sectionAllowed(section) {
  if (section === "review-qa") return can("review.qa");
  if (section === "applications") return can("applications.review_judge");
  if (section === "staff") return can("staff.manage");
  return true;
}

async function navigate(module, section) {
  state.module = module;
  state.section = section || modules[module].sections.find(sectionAllowed) || modules[module].sections[0];
  localStorage.setItem("av-staff-module", state.module);
  localStorage.setItem("av-staff-section", state.section);
  history.replaceState(null, "", `#${state.module}/${state.section}`);
  $("#sidebar").classList.remove("open");
  $("#menu-button").setAttribute("aria-expanded", "false");
  $("#search-results").hidden = true;
  setShell();
  await render();
}

async function render() {
  loading();
  const request = ++state.request;
  try {
    const renderer = renderers[state.section];
    if (!renderer) throw new Error("This view is unavailable");
    const html = state.section === "queue" ? await renderer(state.queueQuery) : await renderer();
    if (request === state.request) $("#content").innerHTML = html;
  } catch (error) {
    if (error.status === 401) return showAuth(error.message);
    if (request === state.request) errorState(error);
  }
}

async function renderOverview() {
  const data = await api("/api/staff/overview");
  state.overview = data;
  const tasks = data.progress.tasks_total;
  const attention = Number(data.summary.stale_claims) + Number(data.summary.tasks_due) + Number(data.summary.followups_due);
  $("#top-attention").textContent = attention ? `${attention} item${attention === 1 ? "" : "s"} need attention` : "No urgent items";
  return `
    <div class="summary-band">
      <div><p class="eyebrow">Welcome back</p><h2>${esc(data.user.display_name)}</h2><small>${esc(titleCase(data.user.role))}</small></div>
      <div><small>Active claims</small><strong>${data.summary.active_claims}</strong></div>
      <div><small>Due soon</small><strong>${data.summary.tasks_due}</strong></div>
      <div><small>Open applications</small><strong>${can("applications.review_judge") ? data.pending_applications : "-"}</strong></div>
    </div>
    <div class="workspace-grid">
      <div>
        <section class="panel"><div class="panel-head"><h2>My progress</h2><small class="muted">Last 31 days</small></div>
          <div class="detail-grid">
            <div class="detail-stat"><small>Reviews completed</small><strong>${data.progress.reviews_month}</strong></div>
            <div class="detail-stat"><small>Outreach attempts</small><strong>${data.progress.outreach_attempts}</strong></div>
            <div class="detail-stat"><small>Confirmed submissions</small><strong>${data.progress.confirmed_submissions}</strong></div>
            <div class="detail-stat"><small>Active days</small><strong>${data.progress.active_days}</strong></div>
          </div>
          ${progress("Assigned work", data.progress.tasks_done, tasks)}
          ${data.progress.milestones?.length ? `<div class="milestones" aria-label="Contribution milestones">${data.progress.milestones.map((item) => `<span class="pill">${esc(item.label)}</span>`).join("")}</div>` : ""}
        </section>
        <section class="panel"><div class="panel-head"><h2>Recent activity</h2></div>${data.recent_activity.length ? `<div class="stack">${data.recent_activity.map((event) => `<div class="list-row"><div><strong>${esc(titleCase(event.event))}</strong><small>${esc(event.entity_id || event.workflow_type)}</small></div><small>${ago(event.created_ts)}</small></div>`).join("")}</div>` : empty("No recent activity")}</section>
      </div>
      <div>
        <section class="panel"><div class="panel-head"><h2>My attention</h2></div>
          <div class="stack">
            <div class="list-row"><div><strong>${data.summary.stale_claims} stale claims</strong><small>Claims beyond the configured threshold</small></div><button class="button small secondary" data-nav="work/queue" data-filter="stale">Open</button></div>
            <div class="list-row"><div><strong>${data.summary.followups_due} follow-ups due</strong><small>Outcome windows due within one day</small></div><button class="button small secondary" data-nav="work/outreach">Open</button></div>
            <div class="list-row"><div><strong>${data.summary.tasks_due} tasks due soon</strong><small>Due within the next day</small></div><button class="button small secondary" data-nav="work/tasks">Open</button></div>
          </div>
        </section>
        <section class="panel"><div class="panel-head"><h2>Team pulse</h2></div>${Object.entries(data.pipeline).map(([key, value]) => `<div class="metric-line"><span>${esc(titleCase(key))}</span><strong>${value}</strong></div>`).join("") || '<span class="muted">No queue activity yet.</span>'}</section>
      </div>
    </div>`;
}

async function renderMyWork() {
  const [queue, tasks, overview] = await Promise.all([
    api("/api/staff/queue?filter=mine&limit=12"),
    api("/api/staff/tasks"),
    api("/api/staff/overview"),
  ]);
  const openTasks = tasks.items.filter((item) => !["done", "cancelled"].includes(item.status));
  return `<div class="workspace-grid"><div>
    <section class="panel"><div class="panel-head"><h2>Active claims</h2><button class="button small secondary" data-nav="work/queue">Full queue</button></div>${queue.items.length ? queue.items.map(workRow).join("") : empty("You're all caught up", "You do not have any active queue claims.")}</section>
    <section class="panel"><div class="panel-head"><h2>Assigned tasks</h2><button class="button small secondary" data-nav="work/tasks">Manage</button></div>${openTasks.length ? openTasks.slice(0, 8).map(taskRow).join("") : empty("No open tasks")}</section>
  </div><div>
    <section class="panel"><h2>Current month</h2><div class="metric-line"><span>Reviews</span><strong>${overview.progress.reviews_month}</strong></div><div class="metric-line"><span>Outreach attempts</span><strong>${overview.progress.outreach_attempts}</strong></div><div class="metric-line"><span>Confirmed submissions</span><strong>${overview.progress.confirmed_submissions}</strong></div></section>
    <section class="panel"><h2>Next action</h2><p class="muted">Open your oldest claim, record the next outreach attempt, or clear an assigned task.</p></section>
  </div></div>`;
}

function workRow(item) {
  return `<div class="list-row"><div><strong>${esc(item.level_name)}</strong><small>${esc(item.level_id)} · ${esc(titleCase(item.tier))} · claimed ${ago(item.claim?.claimed_ts)}</small></div><button class="button small primary" data-open-queue="${item.id}">Open</button></div>`;
}

async function renderQueue(query = "") {
  const params = new URLSearchParams(query || { limit: "50" });
  if (!params.has("limit")) params.set("limit", "50");
  const data = await api(`/api/staff/queue?${params}`);
  return `<div class="toolbar">
    <input id="queue-search" type="search" placeholder="Level ID, name, or creator" value="${esc(params.get("q") || "")}">
    <select id="queue-filter" aria-label="Queue filter"><option value="all">All queue</option>${[["unclaimed","Unclaimed"],["mine","Mine"],["claimed","Claimed"],["top_priority","Top priority"],["cp_zero","CP 0"],["cp_unknown","CP unknown"],["waiting_3","W >= 3"],["outreach","In outreach"],["awaiting","Awaiting outcome"],["stale","Stale claims"]].map(([value,label]) => `<option value="${value}" ${params.get("filter") === value ? "selected" : ""}>${label}</option>`).join("")}</select>
    <select id="queue-tier" aria-label="Recommendation tier"><option value="">All tiers</option>${["rate","feature","epic","legendary","mythic"].map((value) => `<option value="${value}" ${params.get("tier") === value ? "selected" : ""}>${titleCase(value)}</option>`).join("")}</select>
    <button class="button secondary" data-action="queue-apply">Apply</button>
  </div>
  ${data.items.length ? `<table class="data-table"><thead><tr><th>Rank</th><th>Level</th><th>Tier</th><th>CP</th><th>W</th><th>PPS</th><th>State</th><th>Claim</th></tr></thead><tbody>${data.items.map(queueRow).join("")}</tbody></table><p class="muted">Showing ${data.items.length} of ${data.total} entries</p>` : empty("No levels match this view", "Try another filter or search term.")}`;
}

function queueRow(item) {
  const claim = item.claim ? `${item.claim.user_id}${item.claim.stale ? " · stale" : ""}` : "Unclaimed";
  return `<tr data-open-queue="${item.id}" role="button" tabindex="0" aria-label="Open ${esc(item.level_name)}"><td data-label="Rank">${item.rank ? `#${item.rank}` : "-"}</td><td class="level-cell"><strong>${esc(item.level_name)}</strong><small>${esc(item.level_id)} · ${esc(item.creator)}</small></td><td data-label="Tier">${pill(item.tier)}</td><td data-label="CP">${item.cp === null || item.cp === undefined ? "Unknown" : item.cp}</td><td data-label="W">${item.waiting_cycles}</td><td data-label="PPS">${item.components.complete ? Number(item.components.p).toFixed(2) : "Incomplete"}</td><td data-label="State">${pill(item.state)}</td><td data-label="Claim">${esc(claim)}</td></tr>`;
}

async function openQueue(id) {
  const drawer = $("#detail-drawer");
  state.returnFocus = document.activeElement;
  $("#drawer-content").innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading level</div>';
  drawer.inert = false;
  drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); $("#drawer-scrim").hidden = false;
  try {
    const data = await api(`/api/staff/queue/${id}`);
    const item = data.queue;
    $("#detail-title").textContent = item.level_name;
    $("#drawer-content").innerHTML = `
      <p class="muted">${esc(item.level_id)} · ${esc(item.creator)}</p>
      <div class="detail-grid"><div class="detail-stat"><small>Tier</small><strong>${esc(titleCase(item.tier))}</strong></div><div class="detail-stat"><small>State</small><strong>${esc(titleCase(item.state))}</strong></div><div class="detail-stat"><small>Creator Points</small><strong>${item.cp ?? "Unknown"}</strong></div><div class="detail-stat"><small>Exact rank</small><strong>${item.rank ? `#${item.rank}` : "Unavailable"}</strong></div></div>
      <section class="panel"><h3>Priority point system</h3><div class="detail-grid"><div class="detail-stat"><small>F</small><strong>${item.components.f ?? "-"}</strong></div><div class="detail-stat"><small>G</small><strong>${item.components.g ?? "-"}</strong></div><div class="detail-stat"><small>H</small><strong>${item.components.h ?? "-"}</strong></div><div class="detail-stat"><small>P</small><strong>${item.components.complete ? Number(item.components.p).toFixed(2) : "Incomplete"}</strong></div></div></section>
      <section class="panel"><div class="panel-head"><h3>Actions</h3></div><div class="toolbar">
        ${!item.claim && can("queue.claim") ? `<button class="button primary" data-queue-action="claim" data-id="${id}">Claim</button>` : ""}
        ${item.claim && (item.claim.user_id === state.user.id || can("queue.reassign")) ? `<button class="button secondary" data-queue-action="release" data-id="${id}">Release</button>` : ""}
        ${item.claim && can("queue.reassign") ? `<button class="button secondary" data-queue-action="reassign" data-id="${id}">Reassign</button>` : ""}
        ${can("outreach.record") ? `<button class="button secondary" data-queue-action="outreach" data-id="${id}">Record outreach</button>` : ""}
        ${can("queue.manage_state") ? `<button class="button secondary" data-queue-action="state" data-id="${id}">Change state</button><button class="button secondary" data-queue-action="requeue" data-id="${id}">New episode</button>` : ""}
        ${can("review.adjust_tier") ? `<button class="button secondary" data-queue-action="tier" data-id="${id}">Adjust tier</button>` : ""}
      </div></section>
      <section class="panel"><h3>Outreach</h3>${data.outreach.length ? data.outreach.map((event) => `<div class="list-row"><div><strong>${esc(titleCase(event.status))}</strong><small>${esc(event.route_type)} · ${esc(event.private_target_label || "No target")}</small></div><small>${ago(event.event_ts)}</small></div>`).join("") : '<p class="muted">No outreach recorded.</p>'}</section>
      <section class="panel"><h3>History</h3><ol class="timeline">${data.history.map((event) => `<li><strong>${esc(titleCase(event.event))}</strong><br><small class="muted">${fmtTime(event.created_ts)}</small></li>`).join("") || '<li>No history recorded.</li>'}</ol></section>
      <section class="panel"><h3>Notes</h3>${data.notes.length ? data.notes.map((note) => `<div class="list-row"><div><strong>${esc(titleCase(note.scope))}</strong><small>${esc(note.body)}</small></div><small>${ago(note.updated_ts)}</small></div>`).join("") : '<p class="muted">No visible notes.</p>'}</section>`;
  } catch (error) {
    $("#drawer-content").innerHTML = empty("Level detail unavailable", error.message);
  }
}

async function renderOutreach() {
  const data = await api("/api/staff/outreach");
  return `<div class="summary-band"><div><p class="eyebrow">Outreach pipeline</p><h2>Private operational record</h2><small>Targets and routes never appear publicly.</small></div>${["active","awaiting_outcome","completed"].map((key) => `<div><small>${esc(titleCase(key))}</small><strong>${data.pipeline[key] || 0}</strong></div>`).join("")}</div>
    <div class="panel-head"><h2>Recent outreach</h2><button class="button primary" data-action="new-outreach">Record outreach</button></div>
    ${data.items.length ? `<table class="data-table"><thead><tr><th>Level</th><th>Event</th><th>Route</th><th>Target</th><th>When</th></tr></thead><tbody>${data.items.map((item) => `<tr data-open-queue="${item.queue_id}" role="button" tabindex="0" aria-label="Open ${esc(item.current_level_name || item.level_id)}"><td class="level-cell"><strong>${esc(item.current_level_name || item.level_id)}</strong><small>${esc(item.level_id)}</small></td><td data-label="Event">${pill(item.status)}</td><td data-label="Route">${esc(titleCase(item.route_type))}</td><td data-label="Target">${esc(item.private_target_label || "-")}</td><td data-label="When">${ago(item.event_ts)}</td></tr>`).join("")}</tbody></table>` : empty("No outreach has been recorded")}`;
}

async function renderTasks() {
  const scope = can("tasks.manage_team") ? "team" : "mine";
  const data = await api(`/api/staff/tasks?scope=${scope}`);
  return `<div class="panel-head"><div><h2>Tasks</h2><p class="muted">Personal, assigned, team, and generated attention work.</p></div><button class="button primary" data-action="new-task">New task</button></div>
    <section class="panel">${progress("Task progress", data.progress.done, data.progress.total)}</section>
    <div class="stack">${data.items.length ? data.items.map(taskRow).join("") : empty("No open tasks")}</div>`;
}

function taskRow(task) {
  return `<div class="list-row"><div><strong>${esc(task.title)} ${task.system_key ? '<span class="pill">System</span>' : ""}</strong><small>${esc(titleCase(task.status))} · ${esc(titleCase(task.priority))}${task.due_ts ? ` · due ${fmtTime(task.due_ts)}` : ""}</small></div>${task.status !== "done" ? `<button class="button small secondary" data-complete-task="${task.id}">Complete</button>` : '<span class="pill">Done</span>'}</div>`;
}

async function renderNotes() {
  const data = await api("/api/staff/notes");
  return `<div class="panel-head"><div><h2>Notes</h2><p class="muted">Lightweight internal context, visible only within its selected scope.</p></div><button class="button primary" data-action="new-note">New note</button></div>${data.items.length ? `<div class="stack">${data.items.map((note) => `<article class="panel"><div class="panel-head"><h3>${esc(titleCase(note.scope))}</h3><small class="muted">${ago(note.updated_ts)}</small></div><p>${esc(note.body)}</p>${note.entity_type ? `<small class="muted">Linked to ${esc(note.entity_type)} ${esc(note.entity_id)}</small>` : ""}</article>`).join("")}</div>` : empty("No notes in this scope")}`;
}

async function renderTeamOverview() {
  const team = await api("/api/staff/team");
  return `<div class="summary-band"><div><p class="eyebrow">Team operations</p><h2>Shared workload</h2><small>Progress uses real workflow denominators.</small></div><div><small>Active claims</small><strong>${team.claims.active}</strong></div><div><small>Stale claims</small><strong>${team.claims.stale}</strong></div><div><small>Queued</small><strong>${team.queue.queued || 0}</strong></div></div>
    <div class="workspace-grid"><section class="panel">${progress("Current request wave", team.review_progress.done, team.review_progress.total)}<div class="detail-grid"><div class="detail-stat"><small>Outreach attempts this week</small><strong>${team.outreach_week.attempts}</strong></div><div class="detail-stat"><small>Confirmed submissions this week</small><strong>${team.outreach_week.submissions}</strong></div><div class="detail-stat"><small>Pending applications</small><strong>${team.pending_applications}</strong></div></div></section><section class="panel"><h2>Current claim workload</h2>${team.workload.length ? team.workload.map((item) => `<div class="metric-line"><span>Staff ${esc(item.user_id)}</span><strong>${item.active_claims}</strong></div>`).join("") : '<p class="muted">No active claims.</p>'}</section></div>`;
}

async function renderStatistics() {
  const data = await api("/api/staff/statistics");
  return `<div class="summary-band"><div><p class="eyebrow">${data.scope === "team" ? "Team activity" : "Your activity"}</p><h2>Operational totals</h2><small>No composite score or competitive ranking.</small></div><div><small>Active weeks</small><strong>${data.active_weeks}</strong></div><div><small>Tasks completed</small><strong>${data.tasks_completed}</strong></div><div><small>Stale claims</small><strong>${data.stale_claims}</strong></div></div><div class="workspace-grid"><section class="panel"><div class="panel-head"><h2>${data.scope === "team" ? "Reviewer activity" : "My review activity"}</h2><small class="muted">Counts and median turnaround</small></div>${data.reviewers.map((item) => `<div class="list-row"><div><strong>${item.reviewed_by ? `Reviewer ${esc(item.reviewed_by)}` : "Unassigned"}</strong><small>Median turnaround: ${item.median_turnaround ? `${Math.round(item.median_turnaround / 3600)}h` : "Unavailable"}</small></div><strong>${item.reviews} reviews</strong></div>`).join("") || empty("No review statistics yet")}</section><section class="panel"><h2>Outreach</h2><div class="detail-grid"><div class="detail-stat"><small>Attempts</small><strong>${data.outreach.attempts}</strong></div><div class="detail-stat"><small>Confirmed submissions</small><strong>${data.outreach.submissions}</strong></div><div class="detail-stat"><small>Follow-ups</small><strong>${data.outreach.followups}</strong></div></div>${data.outreach.routes.map((route) => `<div class="metric-line"><span>${esc(titleCase(route.route_type))}</span><strong>${route.submissions || 0} / ${route.attempts}</strong></div>`).join("")}</section><section class="panel"><h2>Review decisions</h2>${Object.entries(data.results).map(([result,count]) => `<div class="metric-line"><span>${esc(titleCase(result))}</span><strong>${count}</strong></div>`).join("") || '<p class="muted">No reviewed levels yet.</p>'}<h3>Recommendation tiers</h3>${Object.entries(data.tiers).map(([tier,count]) => `<div class="metric-line"><span>${pill(tier)}</span><strong>${count}</strong></div>`).join("")}</section><section class="panel"><h2>Queue diagnostics</h2><div class="metric-line"><span>Waiting cycles</span><strong>${Object.entries(data.waiting_distribution).map(([key,value]) => `W${key}: ${value}`).join(" · ") || "None"}</strong></div><div class="metric-line"><span>Creator Points</span><strong>${Object.entries(data.cp_distribution).map(([key,value]) => `${key}: ${value}`).join(" · ") || "None"}</strong></div>${Object.entries(data.queue).map(([state,count]) => `<div class="metric-line"><span>${esc(titleCase(state))}</span><strong>${count}</strong></div>`).join("")}</section></div>`;
}

async function renderQA() {
  const data = await api("/api/staff/qa");
  return `<div class="panel-head"><div><h2>Review QA</h2><p class="muted">Operational consistency checks, never a reviewer quality score.</p></div></div>${data.items.length ? `<table class="data-table"><thead><tr><th>Level</th><th>Review</th><th>Tier</th><th>QA state</th><th>Action</th></tr></thead><tbody>${data.items.map((item) => `<tr><td class="level-cell"><strong>${esc(item.level_id)}</strong><small>Reviewer ${esc(item.reviewed_by || "unknown")}</small></td><td data-label="Review">${esc(titleCase(item.result))}</td><td data-label="Tier">${item.send_type ? pill(item.send_type) : "-"}</td><td data-label="QA state">${pill(item.qa_status || "unreviewed")}</td><td data-label="Action"><button class="button small secondary" data-qa="${item.request_message_id}">Review</button></td></tr>`).join("")}</tbody></table>` : empty("No reviews are waiting for QA")}`;
}

async function renderApplications() {
  const data = await api("/api/staff/applications");
  return `<div class="panel-head"><div><h2>Judge applications</h2><p class="muted">Answers, internal context, and durable decision history.</p></div></div>${data.items.length ? data.items.map((item) => `<article class="panel application-review"><div class="application-main"><div class="panel-head"><div><h3>Application #${item.id}</h3><small class="muted">Applicant ${esc(item.applicant_id)} · ${fmtTime(item.submitted_ts)}</small></div>${pill(item.status)}</div><div class="detail-grid">${Object.entries(item.answers || {}).map(([key,value]) => `<div class="detail-stat"><small>${esc(titleCase(key))}</small><strong>${esc(value)}</strong></div>`).join("")}</div></div><aside class="application-side"><h4>Internal timeline</h4>${item.timeline?.length ? `<ol class="timeline">${item.timeline.map((event) => `<li><strong>${esc(titleCase(event.event))}</strong><br><small class="muted">${fmtTime(event.created_ts)}</small></li>`).join("")}</ol>` : '<p class="muted">No staff activity yet.</p>'}<h4>Internal notes</h4>${item.internal_notes?.map((note) => `<p>${esc(note.body)}<br><small class="muted">${ago(note.created_ts)}</small></p>`).join("") || '<p class="muted">No internal notes.</p>'}<button class="button small secondary" data-app-note="${item.id}">Add note</button></aside>${!["accepted","rejected","withdrawn"].includes(item.status) ? `<div class="toolbar application-actions"><button class="button small secondary" data-app-action="claim" data-id="${item.id}">Claim</button><button class="button small secondary" data-app-action="interview" data-id="${item.id}">Interview</button><button class="button small secondary" data-app-action="hold" data-id="${item.id}">Hold</button><button class="button small primary" data-app-action="accept" data-id="${item.id}">Accept</button><button class="button small danger" data-app-action="reject" data-id="${item.id}">Reject</button></div>` : ""}</article>`).join("") : empty("No applications are waiting for review")}`;
}

async function renderStaff() {
  const data = await api("/api/staff/staff");
  return `<div class="panel-head"><div><h2>Staff access</h2><p class="muted">Discord roles remain authoritative; every change is confirmed and audited.</p></div></div>${data.items.length ? `<div class="stack">${data.items.map((member) => `<article class="list-row"><div class="identity-row">${member.avatar_url ? `<img src="${esc(member.avatar_url)}" alt="" width="36" height="36">` : ""}<div><strong>${esc(member.display_name)} ${pill(member.active ? "active" : "inactive")}</strong><small>${esc(titleCase(member.role))} · ${member.reviews} reviews · ${member.workload} active claims${member.last_activity_ts ? ` · active ${ago(member.last_activity_ts)}` : ""}${member.role_delivery_status === "pending" ? ` · ${esc(titleCase(member.desired_role))} change pending` : ""}</small></div></div><button class="button small secondary" data-staff-action="${member.id}">Manage</button></article>`).join("")}</div>` : empty("No configured staff roles found")}`;
}

async function renderOperations() {
  const data = await api("/api/staff/operations");
  const health = (ready) => pill(ready ? "healthy" : "degraded", ready ? "" : "warning");
  return `<div class="summary-band"><div><p class="eyebrow">Live operations</p><h2>${esc(data.service.state || "Unknown")}</h2><small>${esc(data.service.detail || "No service detail")}</small></div><div><small>Bot readiness</small><strong>${health(data.runtime.ready)}</strong></div><div><small>Database</small><strong>${health(data.database.connected)}</strong></div><div><small>Open incidents</small><strong>${data.incidents.length}</strong></div></div>
    <div class="workspace-grid"><section class="panel"><h2>Subsystems</h2><div class="metric-line"><span>Event loop</span>${health(data.runtime.responsive)}</div><div class="metric-line"><span>Outbox pending</span><strong>${data.outbox.pending || 0}</strong></div><div class="metric-line"><span>Request wave</span><strong>${esc(titleCase(data.request_wave.state || "unknown"))}</strong></div><details><summary>Database detail</summary><pre>${esc(JSON.stringify(data.database, null, 2))}</pre></details></section><section class="panel"><h2>Recent incidents</h2>${data.incidents.map((item) => `<div class="list-row"><div><strong>${esc(item.last_message)}</strong><small>${esc(item.fingerprint)}</small></div><small>${item.occurrence_count} · ${ago(item.last_seen_ts)}</small></div>`).join("") || '<p class="muted">No open incidents.</p>'}</section></div>`;
}

async function renderPPS() {
  const data = await api("/api/staff/pps");
  const dashboard = data.dashboard || {};
  return `<div class="panel-head"><div><h2>Priority Point System</h2><p class="muted">Existing PPS business logic and cycle state.</p></div><button class="button primary" data-action="pps-cycle">Manage cycle</button></div><div class="detail-grid"><div class="detail-stat"><small>Model version</small><strong>${esc(data.model_version)}</strong></div><div class="detail-stat"><small>Outcome window</small><strong>${Math.round(data.outcome_window_seconds / 86400)} days</strong></div></div><section class="panel"><h3>Dashboard snapshot</h3><pre>${esc(JSON.stringify(dashboard, null, 2))}</pre></section>`;
}

async function renderAudit() {
  const data = await api("/api/staff/audit");
  return `<div class="toolbar"><input id="audit-actor" placeholder="Actor ID"><input id="audit-action" placeholder="Action"><input id="audit-entity" placeholder="Entity"><button class="button secondary" data-action="audit-apply">Filter</button></div>${data.items.length ? `<table class="data-table"><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Actor</th></tr></thead><tbody>${data.items.map((item) => `<tr><td data-label="When">${fmtTime(item.created_ts)}</td><td data-label="Action">${esc(titleCase(item.event))}</td><td data-label="Entity">${esc(item.entity_id)}</td><td data-label="Actor">${esc(item.actor_id || "System")}</td></tr>`).join("")}</tbody></table>` : empty("No audit events match")}`;
}

async function renderConfiguration() {
  const data = await api("/api/staff/configuration");
  return `<section class="panel"><div class="panel-head"><div><h2>Safe configuration</h2><p class="muted">Secrets and arbitrary database access are intentionally unavailable.</p></div></div><div class="form-grid"><label>Stale claim threshold in hours<input id="config-stale" type="number" min="1" max="720" value="${data.configuration.claim_stale_hours}"></label><label><input id="config-apps" type="checkbox" ${data.configuration.applications_open ? "checked" : ""}> Applications open</label><button class="button primary" data-action="config-save">Save configuration</button></div></section>`;
}

const renderers = {
  overview: renderOverview, "my-work": renderMyWork, queue: renderQueue, outreach: renderOutreach,
  tasks: renderTasks, notes: renderNotes, "team-overview": renderTeamOverview, statistics: renderStatistics,
  "review-qa": renderQA, applications: renderApplications, staff: renderStaff, operations: renderOperations, pps: renderPPS,
  audit: renderAudit, configuration: renderConfiguration,
};

function closeDrawer() {
  const drawer = $("#detail-drawer");
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  drawer.inert = true;
  $("#drawer-scrim").hidden = true;
  if (state.returnFocus instanceof HTMLElement) state.returnFocus.focus();
  state.returnFocus = null;
}

async function actionDialog({ title, description, fields = [], confirm = "Confirm", danger = false, run }) {
  const dialog = $("#action-dialog");
  $("#dialog-title").textContent = title;
  $("#dialog-description").textContent = description || "";
  $("#dialog-error").hidden = true;
  $("#dialog-submit").textContent = confirm;
  $("#dialog-submit").className = `button ${danger ? "danger" : "primary"}`;
  $("#dialog-fields").innerHTML = fields.map((field) => {
    if (field.type === "checkbox") return `<label><input name="${esc(field.name)}" type="checkbox" ${field.checked ? "checked" : ""}> ${esc(field.label)}</label>`;
    if (field.type === "select") return `<label>${esc(field.label)}<select name="${esc(field.name)}" ${field.required ? "required" : ""}>${field.options.map(([value,label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("")}</select></label>`;
    const element = field.type === "textarea" ? "textarea" : "input";
    if (element === "textarea") return `<label>${esc(field.label)}<textarea name="${esc(field.name)}" ${field.required ? "required" : ""}>${esc(field.value || "")}</textarea></label>`;
    return `<label>${esc(field.label)}<input name="${esc(field.name)}" type="${esc(field.type || "text")}" value="${esc(field.value || "")}" ${field.required ? "required" : ""} ${field.min !== undefined ? `min="${field.min}"` : ""}></label>`;
  }).join("");
  dialog.showModal();
  const form = $("#action-form");
  const onSubmit = async (event) => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") { cleanup(); dialog.close(); return; }
    const data = Object.fromEntries(new FormData(form));
    for (const field of fields.filter((item) => item.type === "checkbox")) data[field.name] = Boolean(form.elements[field.name].checked);
    $("#dialog-submit").disabled = true;
    try { await run(data); cleanup(); dialog.close(); showNotice("Action completed"); await render(); }
    catch (error) { $("#dialog-error").textContent = error.message; $("#dialog-error").hidden = false; }
    finally { $("#dialog-submit").disabled = false; }
  };
  const cleanup = () => form.removeEventListener("submit", onSubmit);
  form.addEventListener("submit", onSubmit);
}

async function queueAction(action, id) {
  if (action === "claim") return api(`/api/staff/queue/${id}/claim`, { method: "POST", body: {} }).then(() => openQueue(id));
  if (action === "release") return actionDialog({ title: "Release claim", description: "The level will become available to other staff.", fields: [{ name: "reason", label: "Reason (required for another staff member)", type: "textarea" }], confirm: "Release", run: (body) => api(`/api/staff/queue/${id}/release`, { method: "POST", body }) });
  if (action === "reassign") return actionDialog({ title: "Reassign claim", description: "Responsibility moves to the selected staff member and the change is audited.", fields: [{ name: "assignee_id", label: "New assignee Discord ID", type: "number", required: true, min: 1 }, { name: "reason", label: "Reason", type: "textarea", required: true }], confirm: "Reassign", run: (body) => api(`/api/staff/queue/${id}/reassign`, { method: "POST", body: { ...body, assignee_id: Number(body.assignee_id) } }) });
  if (action === "outreach") return outreachDialog(id);
  if (action === "state") return actionDialog({ title: "Change queue state", description: "This transition is durable and audited.", fields: [{ name: "state", label: "New state", type: "select", options: (can("pps.override") ? ["queued","paused","withdrawn","invalid","in_cycle","awaiting_outcome","rated"] : ["queued","paused","withdrawn"]).map((value) => [value,titleCase(value)]) }, { name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this queue state change", type: "checkbox" }], run: (body) => api(`/api/staff/queue/${id}/state`, { method: "POST", body }) });
  if (action === "requeue") return actionDialog({ title: "Start a new outreach episode", description: "Previous outreach history remains intact and W resets to zero.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this new outreach episode", type: "checkbox" }], confirm: "Start episode", run: (body) => api(`/api/staff/queue/${id}/requeue`, { method: "POST", body }) });
  if (action === "tier") return actionDialog({ title: "Adjust recommendation tier", description: "The original recommendation remains in QA history and PPS is recalculated.", fields: [{ name: "tier", label: "New tier", type: "select", options: ["rate","feature","epic","legendary","mythic"].map((value) => [value,titleCase(value)]) }, { name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this tier adjustment", type: "checkbox" }], run: (body) => api(`/api/staff/queue/${id}/tier`, { method: "POST", body }) });
}

function outreachDialog(queueId = "") {
  return actionDialog({ title: "Record outreach", description: "Targets and notes are private. Confirmed submission means the level actually reached a GD moderator.", fields: [
    { name: "queue_id", label: "Queue ID", type: "number", value: queueId, min: 1, required: true },
    { name: "route", label: "Route", type: "select", options: ["direct","network","stream","event","other"].map((v) => [v,titleCase(v)]) },
    { name: "event", label: "Event", type: "select", options: ["planned","attempted","failed","submitted_to_mod","follow_up"].map((v) => [v,titleCase(v)]) },
    { name: "target", label: "Private target", type: "text" },
    { name: "notes", label: "Private notes", type: "textarea" },
    { name: "confirmed", label: "I confirm that a submitted_to_mod event reached a moderator", type: "checkbox" },
  ], run: (body) => api("/api/staff/outreach", { method: "POST", body: { ...body, queue_id: Number(body.queue_id), timestamp: Math.floor(Date.now() / 1000) } }) });
}

function showAuth(message = "Use Discord to verify your current server role and continue.") {
  $("#app").hidden = true;
  $("#auth-gate").hidden = false;
  $("#auth-message").textContent = message;
}

function forwardLegacyOAuthCallback() {
  const params = new URLSearchParams(location.search);
  if (!params.has("code") && !params.has("state")) return false;
  const code = params.get("code");
  const oauthState = params.get("state");
  history.replaceState(null, "", `${location.pathname}${location.hash}`);
  if (!code || !oauthState) {
    showAuth("This Discord sign-in attempt is incomplete. Please start again.");
    return true;
  }
  const callback = new URL("/api/auth/callback", location.origin);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", oauthState);
  location.replace(`${callback.pathname}${callback.search}`);
  return true;
}

async function initialize() {
  try {
    const data = await api("/api/staff/session");
    state.user = data.user;
    if (!state.user.staff_access) return showAuth("Your Discord account does not currently have staff portal access.");
    const hash = location.hash.match(/^#(overview|work|team|admin)\/([a-z-]+)$/);
    if (hash) { state.module = hash[1]; state.section = hash[2]; }
    $("#user-name").textContent = state.user.display_name;
    $("#user-role").textContent = titleCase(state.user.role);
    $("#user-avatar").src = state.user.avatar_url || "https://cdn.discordapp.com/avatars/1454985687177887866/d268221fd7a7a5529897730d18edd5a0.webp?size=128";
    $("#app").hidden = false; $("#auth-gate").hidden = true;
    setShell(); await render();
  } catch (error) {
    const params = new URLSearchParams(location.search);
    const authError = params.get("auth_error");
    if (authError) history.replaceState(null, "", `${location.pathname}${location.hash}`);
    if (authError || [401, 403].includes(error.status)) showAuth(authError || error.message);
    else showAuth("The secure portal service is temporarily unavailable. Please try again shortly.");
  }
}

document.addEventListener("click", async (event) => {
  const moduleButton = event.target.closest("[data-module]");
  if (moduleButton) return navigate(moduleButton.dataset.module);
  const sectionButton = event.target.closest("[data-section]");
  if (sectionButton) {
    if (sectionButton.dataset.section === "queue") state.queueQuery = "";
    return navigate(state.module, sectionButton.dataset.section);
  }
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    const [module, section] = nav.dataset.nav.split("/");
    state.queueQuery = section === "queue" && nav.dataset.filter
      ? new URLSearchParams({ filter: nav.dataset.filter, limit: "50" }).toString()
      : "";
    return navigate(module, section);
  }
  const searchResult = event.target.closest("[data-search-type]");
  if (searchResult) {
    const destinations = { task: ["work", "tasks"], application: ["team", "applications"], staff: ["team", "staff"] };
    const destination = destinations[searchResult.dataset.searchType];
    if (destination) return navigate(destination[0], destination[1]);
  }
  const open = event.target.closest("[data-open-queue]");
  if (open) return openQueue(open.dataset.openQueue);
  const queueButton = event.target.closest("[data-queue-action]");
  if (queueButton) return queueAction(queueButton.dataset.queueAction, queueButton.dataset.id);
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "refresh") return render();
  if (action === "queue-apply") {
    const query = new URLSearchParams({ q: $("#queue-search").value, filter: $("#queue-filter").value, tier: $("#queue-tier").value, limit: "50" });
    state.queueQuery = query.toString();
    loading(); try { $("#content").innerHTML = await renderQueue(state.queueQuery); } catch (error) { errorState(error); } return;
  }
  if (action === "new-outreach") return outreachDialog();
  if (action === "new-task") return actionDialog({ title: "Create task", fields: [{ name: "title", label: "Title", required: true }, { name: "description", label: "Description", type: "textarea" }, { name: "priority", label: "Priority", type: "select", options: ["low","normal","high","urgent"].map((v) => [v,titleCase(v)]) }, { name: "task_type", label: "Type", type: "select", options: [["personal","Personal"],...(can("tasks.assign") ? [["assigned","Assigned"],["team","Team"]] : [])] }, ...(can("tasks.assign") ? [{ name: "assignee_id", label: "Assignee Discord ID", type: "number" }] : []), { name: "due_at", label: "Due date", type: "datetime-local" }, { name: "linked_entity_type", label: "Linked entity type" }, { name: "linked_entity_id", label: "Linked entity ID" }], run: (body) => api("/api/staff/tasks", { method: "POST", body: { ...body, due_ts: body.due_at ? Math.floor(new Date(body.due_at).getTime() / 1000) : null } }) });
  if (action === "new-note") return actionDialog({ title: "Create note", fields: [{ name: "scope", label: "Visibility", type: "select", options: [["private","Private"],["reviewer_team","Reviewer team"],["entity","Entity participants"],...(can("notes.head") ? [["head_judges","Head Judges"]] : []),...(can("notes.owner") ? [["owners","Owners"]] : [])] }, { name: "body", label: "Note", type: "textarea", required: true }, { name: "entity_type", label: "Linked entity type" }, { name: "entity_id", label: "Linked entity ID" }], run: (body) => api("/api/staff/notes", { method: "POST", body }) });
  if (action === "config-save") return api("/api/staff/configuration", { method: "PATCH", body: { claim_stale_hours: Number($("#config-stale").value), applications_open: $("#config-apps").checked } }).then(() => { showNotice("Configuration saved"); render(); }).catch((error) => showNotice(error.message, true));
  if (action === "audit-apply") {
    const query = new URLSearchParams({ actor: $("#audit-actor").value, action: $("#audit-action").value, entity: $("#audit-entity").value });
    loading(); try { const data = await api(`/api/staff/audit?${query}`); $("#content").innerHTML = `<p class="muted">${data.items.length} matching events. Clear filters with Refresh.</p>` + data.items.map((item) => `<div class="list-row"><div><strong>${esc(titleCase(item.event))}</strong><small>${esc(item.entity_id)}</small></div><small>${fmtTime(item.created_ts)}</small></div>`).join(""); } catch (error) { errorState(error); } return;
  }
  if (action === "pps-cycle") return actionDialog({ title: "Manage PPS", description: "This uses the same PPS service and durable state machine as /pps.", fields: [{ name: "action", label: "Action", type: "select", options: [["start_cycle","Start cycle"],["complete_cycle","Complete cycle"],["cancel_cycle","Cancel cycle"],["override_cp","Override Creator Points"]] }, { name: "cycle_id", label: "Cycle ID for complete/cancel", type: "number" }, { name: "queue_id", label: "Queue ID for CP override", type: "number" }, { name: "creator_points", label: "Creator Points for override", type: "number" }, { name: "reason", label: "Notes / reason", type: "textarea" }, { name: "confirmed", label: "I confirm this PPS action", type: "checkbox" }], run: (body) => api("/api/staff/pps", { method: "POST", body }) });
  const complete = event.target.closest("[data-complete-task]");
  if (complete) return api(`/api/staff/tasks/${complete.dataset.completeTask}`, { method: "PATCH", body: { status: "done" } }).then(render).catch((error) => showNotice(error.message, true));
  const qa = event.target.closest("[data-qa]");
  if (qa) return actionDialog({ title: "Review QA action", description: "Tier adjustments require a reason and confirmation. They remain auditable and preserve the original tier.", fields: [{ name: "action", label: "Outcome", type: "select", options: [["ok","Reviewed OK"],["discussion","Needs discussion"],["rereview","Re-review requested"],["adjust","Adjust recommendation tier"]] }, { name: "tier", label: "Tier (used only for adjustment)", type: "select", options: ["rate","feature","epic","legendary","mythic"].map((value) => [value,titleCase(value)]) }, { name: "reason", label: "Reason", type: "textarea" }, { name: "confirmed", label: "I confirm this tier adjustment when selected", type: "checkbox" }], run: (body) => api(`/api/staff/qa/${qa.dataset.qa}`, { method: "POST", body }) });
  const app = event.target.closest("[data-app-action]");
  if (app) return actionDialog({ title: `${titleCase(app.dataset.appAction)} application`, description: "The decision and any resulting Discord role change are durable.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: ["hold","accept","reject"].includes(app.dataset.appAction) }, ...(["accept","reject"].includes(app.dataset.appAction) ? [{ name: "confirmed", label: "I confirm this final application decision", type: "checkbox" }] : [])], danger: app.dataset.appAction === "reject", run: (body) => api(`/api/staff/applications/${app.dataset.id}/action`, { method: "POST", body: { ...body, action: app.dataset.appAction } }) });
  const appNote = event.target.closest("[data-app-note]");
  if (appNote) return actionDialog({ title: "Add internal application note", description: "Applicants cannot see internal notes.", fields: [{ name: "body", label: "Note", type: "textarea", required: true }], confirm: "Add note", run: (body) => api(`/api/staff/applications/${appNote.dataset.appNote}/note`, { method: "POST", body }) });
  const staff = event.target.closest("[data-staff-action]");
  if (staff) return actionDialog({ title: "Manage staff access", description: "Discord roles are changed through the durable outbox.", fields: [{ name: "action", label: "Action", type: "select", options: [["promote","Promote to Head Judge"],["demote","Demote to Judge"],["deactivate","Deactivate"],["restore","Restore Judge"]] }, { name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this staff access change", type: "checkbox" }], run: (body) => body.confirmed ? api(`/api/staff/staff/${staff.dataset.staffAction}/action`, { method: "POST", body }) : Promise.reject(new Error("Confirm the staff access change")) });
});

document.addEventListener("keydown", (event) => {
  const row = event.target.closest?.("[data-open-queue]");
  if (!row || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  openQueue(row.dataset.openQueue);
});

$("#refresh-button").addEventListener("click", render);
$("#drawer-close").addEventListener("click", closeDrawer);
$("#drawer-scrim").addEventListener("click", closeDrawer);
$("#menu-button").addEventListener("click", () => { const sidebar = $("#sidebar"); const open = sidebar.classList.toggle("open"); $("#menu-button").setAttribute("aria-expanded", String(open)); });
$("#logout-button").addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": decodeURIComponent(cookieValue("av_staff_csrf")) }, credentials: "same-origin" });
  } finally {
    location.href = "/staff";
  }
});
let searchTimer;
$("#global-search").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  const term = event.target.value.trim();
  if (term.length < 2) { $("#search-results").hidden = true; return; }
  searchTimer = setTimeout(async () => {
    try {
      const data = await api(`/api/staff/search?q=${encodeURIComponent(term)}`);
      const box = $("#search-results");
      box.innerHTML = data.items.length ? data.items.map((item) => `<button class="search-result" type="button" ${item.type === "level" ? `data-open-queue="${item.id}"` : `data-search-type="${esc(item.type)}" data-search-id="${esc(item.id)}"`}><strong>${esc(item.current_level_name || item.title || item.display_name || `Application #${item.id}`)}</strong><br><small>${esc(titleCase(item.role || item.type))}</small></button>`).join("") : '<div class="search-result">No matching staff records</div>';
      box.hidden = false;
    } catch { $("#search-results").hidden = true; }
  }, 280);
});

if (!forwardLegacyOAuthCallback()) initialize();
