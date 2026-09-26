"use strict";

const state = {
  user: null,
  module: localStorage.getItem("av-staff-module") || "overview",
  section: localStorage.getItem("av-staff-section") || "overview",
  overview: null,
  adminRequests: null,
  request: 0,
  queueQuery: "",
  returnFocus: null,
  drawerReturnFocus: null,
  staffItems: [],
  staffAssignees: null,
  applications: [],
  appeals: [],
  applicationFilters: { type: "all", status: "active", claim: "all" },
  qaItems: [],
  tasks: [],
  dialogSubmitting: false,
  viewMode: null,
  viewRole: "",
  apiVersion: 0,
  apiFeatures: new Set(),
};

const modules = {
  overview: { label: "Overview", description: "Your work, attention items, and team pulse.", sections: ["overview"] },
  work: { label: "Work", description: "Claims, outreach, tasks, and private working notes.", sections: ["my-work", "queue", "outreach", "tasks", "notes"] },
  team: { label: "Team", description: "Shared progress, statistics, review quality, applications, and staff access.", sections: ["team-overview", "statistics", "review-qa", "applications", "staff"] },
  admin: { label: "Admin", description: "Manage Avenue Guard operations through capability-gated controls.", sections: ["operations", "requests", "pps", "community", "admin-staff", "audit", "system"] },
};

const moduleIcons = {
  overview: '<svg class="nav-icon" data-lucide="layout-dashboard" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>',
  work: '<svg class="nav-icon" data-lucide="briefcase-business" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><rect width="20" height="14" x="2" y="6" rx="2"/><path d="M22 13a18.15 18.15 0 0 1-20 0"/><path d="M12 12h.01"/></svg>',
  team: '<svg class="nav-icon" data-lucide="users-round" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></svg>',
  admin: '<svg class="nav-icon" data-lucide="shield-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
};

const sectionNames = {
  overview: "Overview", "my-work": "My Work", queue: "Queue", outreach: "Outreach", tasks: "Tasks", notes: "Notes",
  "team-overview": "Overview", statistics: "Statistics", "review-qa": "Review QA", applications: "Applications", staff: "Staff",
  operations: "Operations", requests: "Requests", pps: "PPS", community: "Community", "admin-staff": "Staff", audit: "Audit", system: "System",
};

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const can = (capability) => state.user?.capabilities?.includes(capability);
const supports = (feature) => state.apiFeatures.has(feature);
const fmtTime = (ts) => ts ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(Number(ts) * 1000)) : "Not recorded";
const localDateTimeValue = (ts) => {
  if (!ts) return "";
  const date = new Date(Number(ts) * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const ago = (ts) => {
  if (!ts) return "Unknown time";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(ts));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};
const duration = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  if (!value) return "Not enough data";
  if (value < 3600) return `${Math.round(value / 60)}m`;
  if (value < 86400) return `${Math.round(value / 3600)}h`;
  return `${Math.round(value / 86400)}d`;
};
const formatPps = (value, fallback = "-") => {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0, useGrouping: false }).format(number);
};
const titleCase = (value) => String(value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
const roleLabel = (role) => ({ reviewer: "Reviewer", head_reviewer: "Head Reviewer", admin: "Admin", owner: "Owner", dev: "Dev" })[role] || titleCase(role);
const identityLabel = (identity, fallbackId = "") => {
  const id = String(identity?.id ?? fallbackId ?? "");
  const name = identity?.display_name || identity?.portal_nickname || identity?.discord_display_name || identity?.global_display_name || identity?.username;
  if (name) return name;
  return id ? `Discord user ${id}` : "Unresolved staff identity";
};
const conceptHelp = {
  claim: "A claim marks the staff member currently responsible for a queue item. It does not mean that outreach has happened.",
  confirmedSubmission: "A confirmed submission means staff verified that the level actually reached a Geometry Dash moderator. An attempt alone is not a confirmed submission.",
  correlation: "A correlation ID connects logs and durable workflow events from the same operation without exposing private content.",
  cp: "Creator Points are the creator's current Geometry Dash Creator Points snapshot. Unknown values are never treated as zero.",
  linkedEntity: "An optional connection to another internal portal record. Use it when the task belongs to a specific level queue entry, application, or task; leave it blank for ordinary work.",
  linkedEntityId: "The internal portal record ID, not a Geometry Dash level ID or Discord ID.",
  outbox: "The durable delivery queue Avenue Guard uses for Discord messages and role changes. Pending items retry automatically; dead items need staff review.",
  pps: "The Priority Point System orders eligible recommended levels for outreach. It does not change review decisions or claim that moderator contact has occurred.",
  priority: "The current Priority Point System total. It combines the configured prestige, creator, and waiting components when all required data is available.",
  priorityCreator: "The creator component (G) used by the current Priority Point System model.",
  priorityPending: "Creator Points are required before Avenue can calculate the final PPS priority.",
  creatorResolving: "Avenue is still resolving the uploader's current Creator Points. This level will enter the ranked queue automatically once its priority can be calculated.",
  priorityPrestige: "The recommendation-tier component (F) used by the current Priority Point System model.",
  priorityWaiting: "The waiting component (H), which increases as an eligible level remains in later outreach cycles.",
  roleDelivery: "Whether Avenue Guard has finished the queued Discord role change for this staff profile.",
  schema: "A schema version identifies the database structure expected by each Avenue Guard subsystem.",
  identityIntegrity: "Checks that large Discord IDs were preserved exactly through database migrations and repairs.",
  staleClaim: "A claim older than the configured inactivity threshold. It may need reassignment or release.",
  waiting: "Completed outreach waiting cycles for this level. This is the W input used by the Priority Point System.",
};
const helpTip = (text, label = "this item") => `<button class="help-tip" type="button" aria-label="Explain ${esc(label)}" aria-expanded="false" data-help="${esc(text)}">?</button>`;
const conceptLabel = (label, help) => `<span class="concept-label">${esc(label)}${helpTip(help, label)}</span>`;
const helpTooltips = window.StaffHelpTooltip.createController(document, window);
helpTooltips.install();
const percent = (done, total) => total ? Math.round((Number(done) / Number(total)) * 100) : 0;
const cookieValue = (name) => document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const exactId = (value) => String(value ?? "");
const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

async function api(path, options = {}) {
  const mutation = options.method && options.method !== "GET";
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.method && options.method !== "GET" ? { "Idempotency-Key": crypto.randomUUID() } : {}),
      ...(mutation ? { "X-CSRF-Token": decodeURIComponent(cookieValue("av_staff_csrf")) } : {}),
      ...(state.viewRole ? { "X-Staff-View-Role": state.viewRole } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const contract = data.error && typeof data.error === "object" ? data.error : {};
    const error = new Error(contract.message || data.message || "The portal could not complete that request");
    error.status = response.status;
    error.code = contract.code || data.error || "portal_error";
    error.correlationId = contract.correlation_id || "";
    throw error;
  }
  return data;
}

async function staffAssigneeOptions() {
  if (!supports("staff_assignee_directory")) {
    throw new Error("Deploy the matching Avenue Guard API to load the staff assignee directory.");
  }
  if (Array.isArray(state.staffAssignees)) return state.staffAssignees;
  const data = await api("/api/staff/assignees");
  state.staffAssignees = (data.items || []).map((item) => [
    exactId(item.id),
    `${item.display_name} — ${item.role_label || roleLabel(item.role)}`,
  ]);
  return state.staffAssignees;
}

function showNotice(message, error = false) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.classList.toggle("error", error);
  notice.hidden = false;
  window.setTimeout(() => { notice.hidden = true; }, 5000);
}

function empty(message, detail = "") {
  return `<div class="empty-state"><span class="empty-state-mark" aria-hidden="true"></span><strong>${esc(message)}</strong>${detail ? `<span>${esc(detail)}</span>` : ""}</div>`;
}

function loading() {
  $("#content").innerHTML = '<div class="skeleton-view" aria-label="Loading workspace"><span></span><span></span><span></span><span></span><span></span></div>';
}

function errorState(error) {
  $("#content").innerHTML = `<div class="error-state"><strong>That view could not be loaded</strong><span>${esc(error.message || "Please try again")}</span>${error.correlationId ? `<small>Reference: ${esc(error.correlationId)}</small>` : ""}<button class="button secondary" data-action="refresh">Retry</button></div>`;
}

function progress(label, done, total) {
  if (!Number(total)) {
    return `<div class="progress-component is-empty"><div class="metric-line"><span>${esc(label)}</span><strong>0 / 0</strong></div><small class="muted">No assigned work yet.</small></div>`;
  }
  const value = percent(done, total);
  return `<div class="progress-component"><div class="metric-line"><span>${esc(label)}</span><strong>${Number(done) || 0} / ${Number(total) || 0}</strong></div><progress aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${Math.max(1, Number(total) || 1)}" aria-valuenow="${Number(done) || 0}" max="${Math.max(1, Number(total) || 1)}" value="${Number(done) || 0}">${value}%</progress><small class="muted">${value}% complete</small></div>`;
}

function countMetric(label, value, detail = "") {
  return `<div class="count-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</div>`;
}

function copyButton(value, label = "Copy ID") {
  return `<button class="icon-link" type="button" data-copy="${esc(exactId(value))}">${esc(label)}</button>`;
}

function markSelectedRecord(attribute, value) {
  document.querySelectorAll(".is-selected").forEach((item) => item.classList.remove("is-selected"));
  const target = [...document.querySelectorAll(`[${attribute}]`)].find((item) => String(item.getAttribute(attribute)) === String(value));
  target?.classList.add("is-selected");
}

function pill(value, extra = "") {
  const safe = String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `<span class="pill ${esc(safe)} ${esc(extra)}">${esc(titleCase(value))}</span>`;
}

function rolePill(role, label = "") {
  const safeRole = String(role || "reviewer").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return `<span class="role-badge ${esc(safeRole)}">${esc(label || roleLabel(role))}</span>`;
}

function tierArtwork(tier, size = "small") {
  const safeTier = ["rate", "feature", "epic", "legendary", "mythic"].includes(String(tier).toLowerCase()) ? String(tier).toLowerCase() : "rate";
  return `<img class="tier-art tier-art-${esc(size)}" src="/assets/send-types/pps_${safeTier}.png" alt="" width="${size === "large" ? 64 : 24}" height="${size === "large" ? 64 : 24}">`;
}

function pipeline(stages) {
  return `<div class="pipeline-strip">${stages.map(([label, value, state = ""]) => `<div class="pipeline-stage ${esc(state)}"><span class="pipeline-node" aria-hidden="true"></span><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join("")}</div>`;
}

function setShell() {
  const allowedModules = ["overview", "work", "team", ...(can("admin.access") ? ["admin"] : [])];
  if (!allowedModules.includes(state.module)) state.module = "overview";
  if (!modules[state.module].sections.includes(state.section)) state.section = modules[state.module].sections[0];
  $("#primary-nav").innerHTML = allowedModules.map((key) => `<button class="nav-button ${state.module === key ? "active" : ""}" data-module="${key}" type="button" ${state.module === key ? 'aria-current="page"' : ""}>${moduleIcons[key]}<span class="nav-label">${modules[key].label}</span><span class="nav-count" data-count="${key}" hidden></span></button>`).join("");
  $("#section-nav").innerHTML = modules[state.module].sections.filter(sectionAllowed).map((key) => `<button class="section-tab ${state.section === key ? "active" : ""}" data-section="${key}" type="button">${sectionNames[key]}</button>`).join("");
  $("#section-nav").hidden = modules[state.module].sections.filter(sectionAllowed).length < 2;
  $("#page-title").textContent = sectionNames[state.section] || modules[state.module].label;
  $("#page-description").textContent = modules[state.module].description;
  $("#module-eyebrow").textContent = `${state.user.role_label || roleLabel(state.user.role)} workspace`;
}

function sectionAllowed(section) {
  if (section === "review-qa") return can("review.qa");
  if (section === "applications") return can("applications.review_reviewer") || can("applications.review_judge");
  if (section === "staff") return can("staff.view");
  if (section === "admin-staff") return can("staff.view");
  if (section === "operations") return can("operations.view");
  if (section === "requests") return can("requests.manage");
  if (section === "pps") return can("pps.manage_cycles");
  if (section === "community") return can("admin.access");
  if (section === "audit") return can("audit.view") || can("audit.view_limited");
  if (section === "system") return can("developer.access");
  return true;
}

async function navigate(module, section) {
  helpTooltips.close();
  state.module = module;
  state.section = section || modules[module].sections.find(sectionAllowed) || modules[module].sections[0];
  localStorage.setItem("av-staff-module", state.module);
  localStorage.setItem("av-staff-section", state.section);
  history.replaceState(null, "", `#${state.module}/${state.section}`);
  $("#sidebar").classList.remove("open");
  $("#menu-button").setAttribute("aria-expanded", "false");
  $("#search-results").hidden = true;
  $("#global-search").setAttribute("aria-expanded", "false");
  setShell();
  await render();
}

async function render() {
  helpTooltips.close();
  loading();
  const request = ++state.request;
  try {
    const renderer = renderers[state.section];
    if (!renderer) throw new Error("This view is unavailable");
    const html = state.section === "queue" ? await renderer(state.queueQuery) : await renderer();
    if (request === state.request) {
      $("#content").innerHTML = html;
      $("#refresh-button").textContent = "Updated now";
      window.setTimeout(() => { $("#refresh-button").textContent = "Refresh"; }, 3500);
    }
  } catch (error) {
    if (error.status === 401) return showAuth(error.message);
    if (request === state.request) errorState(error);
  }
}

async function renderOverview() {
  const data = await api("/api/staff/overview");
  state.overview = data;
  const summary = data.summary || {};
  const progressData = data.progress || {};
  const tasks = progressData.tasks_total || 0;
  const creatorAttention = Array.isArray(data.attention_items) ? data.attention_items.filter((item) => item.type === "creator_points") : [];
  const attention = Number(summary.stale_claims || 0) + Number(summary.tasks_due || 0) + Number(summary.followups_due || 0) + creatorAttention.length;
  $("#top-attention").textContent = attention ? `${attention} item${attention === 1 ? "" : "s"} need attention` : "No urgent items";
  const name = data.user.portal_nickname || data.user.display_name;
  const attentionRows = [
    [summary.stale_claims || 0, "Stale claims", "Claims beyond the configured threshold", "work/queue", "stale"],
    [summary.followups_due || 0, "Follow-ups due", "Outcome windows due within one day", "work/outreach", ""],
    [summary.tasks_due || 0, "Tasks due soon", "Due within the next day", "work/tasks", ""],
  ].filter(([count]) => Number(count) > 0);
  const pipelineStages = [
    ["Queued", data.pipeline?.queued || 0, "complete"],
    ["Claimed", summary.active_claims || 0, "complete"],
    ["Outreach", data.pipeline?.in_cycle || data.pipeline?.outreach || 0, "current"],
    ["Awaiting", data.pipeline?.awaiting_outcome || 0, "future"],
    ["Rated", data.pipeline?.rated || 0, "future"],
  ];
  return `
    ${data.warnings?.length ? `<div class="inline-warning"><strong>Some data could not be refreshed</strong><span>Available sections are still shown. Reference: ${esc(data.correlation_id || "unavailable")}</span></div>` : ""}
    <header class="personal-header"><div><div class="identity-kicker">${rolePill(data.user.role, data.user.role_label)}</div><h2>${greeting()}, ${esc(name)}</h2><p>${attention ? `You have ${attention} thing${attention === 1 ? "" : "s"} needing attention.` : "You're all caught up."}</p></div><span class="attention-total">${attention ? `${attention} to review` : "Clear"}</span></header>
    <section class="overview-section" aria-labelledby="week-heading"><div class="section-title"><p class="eyebrow" id="week-heading">This week</p></div><div class="progress-strip" aria-label="Your recent contribution">
      ${countMetric("Reviews", progressData.reviews_month || 0, "last 31 days")}
      ${countMetric("Outreach", progressData.outreach_attempts || 0, "attempts")}
      ${countMetric("Submissions", progressData.confirmed_submissions || 0, "confirmed")}
      <div class="progress-unit">${progress("Assigned tasks", progressData.tasks_done || 0, tasks)}</div>
    </div></section>
    <div class="workspace-grid">
      <section class="section-block"><div class="panel-head"><h2>Needs attention</h2><button class="icon-link" data-nav="work/my-work">Open My Work</button></div>
        <div class="stack">${attentionRows.map(([count, label, detail, nav, filter]) => `<div class="list-row attention-row"><div><strong>${esc(label)}</strong><small>${esc(detail)} · ${count} item${count === 1 ? "" : "s"}</small></div><button class="button small tertiary" data-nav="${nav}" ${filter ? `data-filter="${filter}"` : ""}>Open</button></div>`).join("")}${creatorAttention.map((item) => `<div class="list-row attention-row"><div><strong>Creator Points unresolved</strong><small>${esc(item.level_name)} · ${item.unresolved_minutes}m${item.escalated ? " · escalated" : ""}</small></div><button class="button small secondary" data-queue-action="retry-cp" data-id="${item.queue_id}">Retry</button></div>`).join("")}${!attentionRows.length && !creatorAttention.length ? empty("Nothing needs your attention", "New claims, follow-ups, and due tasks will appear here.") : ""}</div>
      </section>
      <section class="section-block"><div class="panel-head"><h2>Team pulse</h2><button class="icon-link" data-nav="team/team-overview">Team view</button></div>${pipeline(pipelineStages)}</section>
    </div>
    <section class="section-block recent-block"><div class="panel-head"><h2>Recent activity</h2><small class="muted">Latest six events</small></div>${data.recent_activity.length ? `<div class="activity-feed">${data.recent_activity.slice(0, 6).map((event) => `<div class="list-row"><div><strong>${esc(titleCase(event.event))}</strong><small>${esc(event.entity_id || event.workflow_type)}</small></div><time>${ago(event.created_ts)}</time></div>`).join("")}</div>` : empty("No recent activity", "Your completed work will appear here.")}</section>
    ${progressData.milestones?.length ? `<section class="milestone-line"><strong>Milestones</strong><div>${progressData.milestones.map((item) => `<span class="milestone-marker"><span aria-hidden="true">✓</span>${esc(item.label)}</span>`).join("")}</div></section>` : ""}`;
}

async function renderMyWork() {
  const results = await Promise.allSettled([
    api("/api/staff/queue?filter=mine&limit=12"),
    api("/api/staff/tasks"),
    api("/api/staff/overview"),
  ]);
  const queue = results[0].status === "fulfilled" ? results[0].value : { items: [] };
  const tasks = results[1].status === "fulfilled" ? results[1].value : { items: [] };
  const overview = results[2].status === "fulfilled" ? results[2].value : { summary: {}, progress: {} };
  const unavailable = results.filter((result) => result.status === "rejected").length;
  const openTasks = tasks.items.filter((item) => !["done", "cancelled"].includes(item.status));
  state.tasks = tasks.items;
  const followups = Number(overview.summary?.followups_due || 0);
  return `${unavailable ? `<div class="inline-warning"><strong>${unavailable} work source${unavailable === 1 ? " is" : "s are"} temporarily unavailable</strong><span>The rest of your inbox is still available. Retry with Refresh.</span></div>` : ""}<div class="inbox-heading"><p class="eyebrow">Today</p><p>Work is ordered by what needs a next action.</p></div><section class="today-line" aria-label="Today's work summary">
    ${countMetric("Active claims", queue.items.length)}
    ${countMetric("Open tasks", openTasks.length)}
    ${countMetric("Follow-ups due", followups)}
    ${countMetric("Reviews this month", overview.progress.reviews_month || 0)}
  </section><div class="workspace-grid"><div>
    <section class="section-block"><div class="panel-head"><div><h2>Claimed</h2><p class="muted">Continue from your oldest claimed level.</p></div><button class="button small tertiary" data-nav="work/queue">Full queue</button></div>${queue.items.length ? queue.items.map(workRow).join("") : empty("You're all caught up", "You do not have any active queue claims.")}</section>
    <section class="section-block"><div class="panel-head"><h2>Assigned tasks</h2><button class="button small secondary" data-nav="work/tasks">Manage</button></div>${openTasks.length ? openTasks.slice(0, 8).map(taskRow).join("") : empty("No open tasks", "Assigned and system-generated work will appear here.")}</section>
  </div><aside class="work-rail">
    <section class="section-block"><h2>Follow-ups</h2>${followups ? `<p><strong>${followups}</strong> outcome window${followups === 1 ? " is" : "s are"} due soon.</p><button class="button secondary" data-nav="work/outreach">Review follow-ups</button>` : `<p class="muted">No follow-ups need attention.</p>`}</section>
    <section class="section-block"><h2>Monthly contribution</h2><div class="metric-line"><span>Outreach attempts</span><strong>${overview.progress.outreach_attempts || 0}</strong></div><div class="metric-line"><span>Confirmed submissions</span><strong>${overview.progress.confirmed_submissions || 0}</strong></div><div class="metric-line"><span>Active days</span><strong>${overview.progress.active_days || 0}</strong></div></section>
  </aside></div>`;
}

function workRow(item) {
  const next = item.state === "awaiting_outcome" ? "Check outcome" : item.state === "in_outreach" ? "Record outcome" : "Record outreach";
  const claimStatus = item.claim?.claimed_ts ? `Claimed ${ago(item.claim.claimed_ts)}` : "Ready for action";
  return `<div class="list-row work-item"><div><strong>${esc(item.level_name)}</strong><small>${esc(titleCase(item.tier))} · ${esc(claimStatus)}</small><span class="work-next">Next: ${esc(next)}</span></div><button class="button small tertiary" data-open-queue="${item.id}">Open</button></div>`;
}

async function renderQueue(query = "") {
  const params = new URLSearchParams(query || { limit: "50" });
  if (!params.has("limit")) params.set("limit", "50");
  const data = await api(`/api/staff/queue?${params}`);
  const filters = [["unclaimed","Unclaimed"],["mine","Mine"],["claimed","Claimed"],["top_priority","Top priority"],["cp_zero","CP 0"],["cp_unknown","CP unknown"],["waiting_3","W >= 3"],["outreach","In outreach"],["awaiting","Awaiting outcome"],["stale","Stale claims"]];
  if (can("developer.access")) filters.push(["hidden", supports("hidden_queue_entries") ? "Hidden" : "Hidden (API update required)", !supports("hidden_queue_entries")]);
  const activeFilter = params.get("filter") || "all";
  const ranked = data.items.filter((item) => item.components.complete && item.rank !== null && item.rank !== undefined);
  const pending = data.items.filter((item) => !item.components.complete && ["queued", "in_cycle"].includes(item.state));
  const other = data.items.filter((item) => !ranked.includes(item) && !pending.includes(item));
  const rankedCount = Number.isFinite(Number(data.ranked_count)) ? Number(data.ranked_count) : ranked.length;
  const pendingCount = Number.isFinite(Number(data.pending_count)) ? Number(data.pending_count) : pending.length;
  const table = (items) => `<div class="table-wrap"><table class="data-table queue-table"><thead><tr><th>Rank</th><th>Level</th><th>Tier</th><th>Creator</th><th>${conceptLabel("CP", conceptHelp.cp)}</th><th>${conceptLabel("W", conceptHelp.waiting)}</th><th>${conceptLabel("Priority", conceptHelp.priority)}</th><th>State</th><th>${conceptLabel("Claim", conceptHelp.claim)}</th></tr></thead><tbody>${items.map(queueRow).join("")}</tbody></table></div>`;
  return `<div class="queue-tools"><div class="quick-filters" aria-label="Quick queue filters">
    ${[["mine","Mine"],["unclaimed","Unclaimed"],["cp_zero","CP 0"],["waiting_3","Waiting 3+"]].map(([value,label]) => `<button class="filter-chip ${activeFilter === value ? "active" : ""}" type="button" data-queue-quick="${value}" aria-pressed="${activeFilter === value}">${label}</button>`).join("")}
    <label class="filter-field compact-filter"><span>Tier</span><select id="queue-tier" aria-label="Recommendation tier"><option value="">All tiers</option>${["rate","feature","epic","legendary","mythic"].map((value) => `<option value="${value}" ${params.get("tier") === value ? "selected" : ""}>${titleCase(value)}</option>`).join("")}</select></label>
    <label class="filter-field compact-filter"><span>State</span><select id="queue-filter" aria-label="Queue state or filter"><option value="all">All queue</option>${filters.map(([value,label,disabled]) => `<option value="${value}" ${activeFilter === value ? "selected" : ""} ${disabled ? "disabled" : ""}>${label}</option>`).join("")}</select></label>
  </div><div class="toolbar queue-search-row">
    <input id="queue-search" type="search" placeholder="Level ID, name, or creator" value="${esc(params.get("q") || "")}">
    <button class="button secondary" data-action="queue-apply">Apply filters</button>
  </div>
  ${data.items.length ? `<section class="queue-result-section" aria-labelledby="ranked-queue-heading"><div class="queue-section-heading"><div><p class="eyebrow">Ranked queue</p><h2 id="ranked-queue-heading">${rankedCount} ranked</h2></div></div>${ranked.length ? table(ranked) : empty("Ranked queue is waiting for creator data", "Levels appear here automatically after Creator Points are verified.")}</section>
  ${pending.length ? `<section class="queue-result-section pending-priority" aria-labelledby="pending-priority-heading"><div class="queue-section-heading"><div><p class="eyebrow">Pending priority data</p><h2 id="pending-priority-heading">${pendingCount} pending</h2></div><small>Not ranked</small></div>${table(pending)}</section>` : ""}
  ${other.length ? `<section class="queue-result-section" aria-labelledby="other-queue-heading"><div class="queue-section-heading"><div><p class="eyebrow">Other states</p><h2 id="other-queue-heading">History and outcomes</h2></div></div>${table(other)}</section>` : ""}
  <p class="muted table-caption">Showing ${data.items.length} of ${data.total} entries</p>` : empty("No levels match this view", "Try another filter or search term.")}`;
}

function creatorPointsDisplay(item) {
  if (item.cp !== null && item.cp !== undefined) return String(item.cp);
  if (item.creator_points_status === "conflict") return "Verifying…";
  if (item.creator_points_status === "needs_attention") return "Unavailable";
  return "Resolving…";
}

function queueRow(item) {
  const claim = !item.components.complete ? "Waiting for Creator Points" : item.claim ? `${item.claim.user?.display_name || (item.claim.user_id === state.user.id ? "You" : "Claimed")}${item.claim.stale ? " · stale" : ""}` : "Unclaimed";
  const pendingHelp = !item.components.complete ? ` title="${esc(conceptHelp.creatorResolving)}"` : "";
  return `<tr data-open-queue="${item.id}" role="button" tabindex="0" aria-label="Open ${esc(item.level_name)}"><td data-label="Rank"><strong class="rank-value">${item.components.complete && item.rank ? `#${item.rank}` : "—"}</strong></td><td class="level-cell"><strong>${esc(item.level_name)}</strong><small>${esc(item.creator || "Unknown creator")} · <span class="secondary-id">${esc(item.level_id)}</span></small></td><td data-label="Tier"><span class="tier-cell ${esc(item.tier)}">${tierArtwork(item.tier)}<span>${esc(titleCase(item.tier))}</span></span></td><td data-label="Creator">${esc(item.creator || "Unknown")}</td><td data-label="CP"${pendingHelp}>${esc(creatorPointsDisplay(item))}</td><td data-label="W">${item.waiting_cycles}</td><td data-label="Priority"${pendingHelp}><strong class="priority-value">${item.components.complete ? formatPps(item.components.p) : "Pending"}</strong></td><td data-label="State">${pill(item.state)}</td><td data-label="Claim"${pendingHelp}>${esc(claim)}</td></tr>`;
}

async function openQueue(id) {
  openDrawer("Level inspector", "Loading level", '<div class="skeleton-view compact" aria-label="Loading level"><span></span><span></span><span></span></div>');
  try {
    const data = await api(`/api/staff/queue/${id}`);
    const item = data.queue;
    $("#detail-title").textContent = item.level_name;
    $("#drawer-content").innerHTML = `
      <section class="level-inspector-hero" data-tier="${esc(item.tier)}">${tierArtwork(item.tier, "large")}<div><span>${esc(titleCase(item.tier))} recommendation</span><strong>${item.components.complete && item.rank ? `#${item.rank} in queue` : item.components.complete ? "Outside the active ranked queue" : "Waiting for creator data"}</strong></div><div class="priority-total"><small>Priority</small><strong>${item.components.complete ? formatPps(item.components.p) : "Pending"}</strong></div></section>
      <div class="drawer-identity"><div><span>Level ID</span><strong class="secondary-id">${esc(item.level_id)}</strong><small>Created by ${esc(item.creator)}</small></div>${copyButton(item.level_id)}</div>
      <div class="detail-grid"><div class="detail-stat"><small>State</small><strong>${item.components.complete ? esc(titleCase(item.state)) : "Waiting for creator data"}</strong></div><div class="detail-stat"><small>Creator Points</small><strong>${esc(creatorPointsDisplay(item))}</strong></div><div class="detail-stat"><small>${conceptLabel("Waiting", conceptHelp.waiting)}</small><strong>${item.waiting_cycles} cycle${item.waiting_cycles === 1 ? "" : "s"}</strong></div><div class="detail-stat"><small>Tier</small><strong class="tier-text ${esc(item.tier)}">${esc(titleCase(item.tier))}</strong></div></div>
      <details class="drawer-section" open><summary>${conceptLabel("PPS", conceptHelp.priority)}</summary><div class="priority-breakdown"><div><small>${conceptLabel("F", conceptHelp.priorityPrestige)}</small><strong>${formatPps(item.components.f)}</strong><span>Prestige</span></div><div><small>${conceptLabel("G", conceptHelp.priorityCreator)}</small><strong>${item.components.complete ? formatPps(item.components.g) : "Pending"}</strong><span>Creator</span></div><div><small>${conceptLabel("H", conceptHelp.priorityWaiting)}</small><strong>${formatPps(item.components.h)}</strong><span>Waiting</span></div><div class="total"><small>${conceptLabel("P", conceptHelp.priority)}</small><strong>${item.components.complete ? formatPps(item.components.p) : "Pending"}</strong><span>Total</span></div></div>${item.components.complete ? "" : `<p class="muted">${esc(conceptHelp.creatorResolving)}</p>`}</details>
      <section class="drawer-section"><div class="panel-head"><h3>Actions</h3></div><div class="toolbar">
        ${item.state !== "hidden" && !item.claim && can("queue.claim") && item.components.complete ? `<button class="button primary" data-queue-action="claim" data-id="${id}">Claim</button>` : ""}
        ${item.state !== "hidden" && !item.components.complete && can("queue.manage_state") ? `<button class="button secondary" data-queue-action="retry-cp" data-id="${id}">Retry Creator Points</button>` : ""}
        ${item.state !== "hidden" && item.claim && (item.claim.user_id === state.user.id || can("queue.reassign")) ? `<button class="button secondary" data-queue-action="release" data-id="${id}">Release</button>` : ""}
        ${item.state !== "hidden" && item.claim && can("queue.reassign") ? `<button class="button secondary" data-queue-action="reassign" data-id="${id}">Reassign</button>` : ""}
        ${item.state !== "hidden" && can("outreach.record") ? `<button class="button secondary" data-queue-action="outreach" data-id="${id}">Record outreach</button>` : ""}
        ${item.state !== "hidden" && can("queue.manage_state") ? `<button class="button secondary" data-queue-action="state" data-id="${id}">Change state</button><button class="button secondary" data-queue-action="requeue" data-id="${id}">New episode</button>` : ""}
        ${item.state !== "hidden" && can("review.adjust_tier") ? `<button class="button secondary" data-queue-action="tier" data-id="${id}">Adjust tier</button>` : ""}
        ${item.state !== "hidden" && can("review.qa") ? `<button class="button secondary" data-queue-action="rereview" data-id="${id}">Request re-review</button>` : ""}
        ${can("developer.access") && item.state !== "hidden" ? `<button class="button danger" data-queue-action="hide" data-id="${id}" ${supports("hidden_queue_entries") ? "" : 'disabled aria-disabled="true" title="Deploy the matching Avenue Guard API to enable hidden levels"'}>Hide level</button>` : ""}
        ${can("developer.access") && item.state === "hidden" ? `<button class="button primary" data-queue-action="restore" data-id="${id}" ${supports("hidden_queue_entries") ? "" : 'disabled aria-disabled="true" title="Deploy the matching Avenue Guard API to restore hidden levels"'}>Restore level</button>` : ""}
      </div></section>
      ${data.creator_points_diagnostics ? `<details class="drawer-section"><summary>Creator Points diagnostics</summary><div class="detail-grid"><div class="detail-stat"><small>Resolution</small><strong>${esc(titleCase(data.creator_points_diagnostics.job?.state || item.creator_points_status))}</strong></div><div class="detail-stat"><small>Source</small><strong>${esc(item.creator_points_source || "Not accepted yet")}</strong></div><div class="detail-stat"><small>Next retry</small><strong>${data.creator_points_diagnostics.job?.next_attempt_ts ? ago(data.creator_points_diagnostics.job.next_attempt_ts) : "Not scheduled"}</strong></div><div class="detail-stat"><small>Identity</small><strong>${esc(item.uploader_account_id ? `Account ${item.uploader_account_id}` : item.uploader_player_id ? `Player ${item.uploader_player_id}` : item.creator)}</strong></div></div><div class="stack">${data.creator_points_diagnostics.observations.map((obs) => `<div class="list-row"><div><strong>${esc(`${titleCase(obs.provider)} · ${titleCase(obs.method)}`)}</strong><small>${obs.success ? `CP ${obs.creator_points ?? "not supplied"}` : esc(titleCase(obs.error_category || "unavailable"))}${obs.account_id ? ` · account ${esc(obs.account_id)}` : ""}</small></div><time>${ago(obs.observed_at)}</time></div>`).join("") || '<p class="muted">No provider observations yet.</p>'}</div></details>` : ""}
      <details class="drawer-section"><summary>Outreach (${data.outreach.length})</summary>${data.outreach.length ? data.outreach.map((event) => `<div class="list-row"><div><strong>${esc(titleCase(event.status))}</strong><small>${esc(event.route_type)} · ${esc(event.private_target_label || "No target")}</small></div><small>${ago(event.event_ts)}</small></div>`).join("") : '<p class="muted">No outreach recorded.</p>'}</details>
      <details class="drawer-section"><summary>History (${data.history.length})</summary><ol class="timeline">${data.history.map((event) => `<li><strong>${esc(titleCase(event.event))}</strong><br><small class="muted">${fmtTime(event.created_ts)}</small></li>`).join("") || '<li>No history recorded.</li>'}</ol></details>
      <details class="drawer-section"><summary>Notes (${data.notes.length})</summary>${data.notes.length ? data.notes.map((note) => `<div class="list-row"><div><strong>${esc(titleCase(note.scope))}</strong><small>${esc(note.body)}</small></div><small>${ago(note.updated_ts)}</small></div>`).join("") : '<p class="muted">No visible notes.</p>'}</details>`;
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
  state.tasks = data.items;
  const taskNotificationsReady = supports("task_recipient_dm");
  return `<div class="panel-head"><div><h2>Tasks</h2><p class="muted">Personal, assigned, team, and generated attention work.</p></div><button class="button primary" data-action="new-task" ${taskNotificationsReady ? "" : 'disabled aria-disabled="true" title="Deploy the matching Avenue Guard API to create tasks"'}>New task</button></div>
    ${taskNotificationsReady ? "" : '<p class="warning-text">Task creation is temporarily disabled until the portal and Avenue Guard use the same task notification API.</p>'}
    <section class="panel">${progress("Task progress", data.progress.done, data.progress.total)}</section>
    <div class="stack">${data.items.length ? data.items.map(taskRow).join("") : empty("No open tasks")}</div>`;
}

function taskRow(task) {
  return `<div class="list-row row-clickable" data-open-task="${task.id}" role="button" tabindex="0"><div><strong>${esc(task.title)} ${task.system_key ? '<span class="pill">System</span>' : ""}</strong><small>${esc(titleCase(task.status))} · ${esc(titleCase(task.priority))}${task.due_ts ? ` · due ${fmtTime(task.due_ts)}` : ""}</small></div>${task.status !== "done" ? `<button class="button small secondary" data-complete-task="${task.id}">Complete</button>` : '<span class="pill">Done</span>'}</div>`;
}

function openTaskInspector(id) {
  const task = state.tasks.find((item) => String(item.id) === String(id));
  if (!task) return showNotice("That task is no longer in this view", true);
  openDrawer("Task inspector", task.title, `<div class="drawer-meta">${pill(task.status)}${pill(task.priority)}${task.system_key ? '<span class="pill">System generated</span>' : ""}</div>
    ${task.description ? `<section class="drawer-section"><h3>Description</h3><p>${esc(task.description)}</p></section>` : ""}
    <div class="detail-grid"><div class="detail-stat"><small>Due</small><strong>${task.due_ts ? fmtTime(task.due_ts) : "No due date"}</strong></div><div class="detail-stat"><small>${conceptLabel("Linked record", conceptHelp.linkedEntity)}</small><strong>${esc(task.linked_entity_type ? `${titleCase(task.linked_entity_type)} #${task.linked_entity_id || ""}` : "None")}</strong></div></div>
    ${task.status !== "done" ? `<section class="drawer-section"><button class="button primary" data-complete-task="${task.id}">Mark complete</button></section>` : ""}`);
}

async function renderNotes() {
  const data = await api("/api/staff/notes");
  return `<div class="panel-head"><div><h2>Notes</h2><p class="muted">Lightweight internal context, visible only within its selected scope.</p></div><button class="button primary" data-action="new-note">New note</button></div>${data.items.length ? `<div class="stack">${data.items.map((note) => `<article class="panel"><div class="panel-head"><h3>${esc(titleCase(note.scope))}</h3><small class="muted">${ago(note.updated_ts)}</small></div><p>${esc(note.body)}</p>${note.entity_type ? `<small class="muted">Linked to ${esc(note.entity_type)} ${esc(note.entity_id)}</small>` : ""}</article>`).join("")}</div>` : empty("No notes in this scope")}`;
}

async function renderTeamOverview() {
  const team = await api("/api/staff/team");
  return `<section class="progress-strip" aria-label="Team operations summary">${countMetric("Reviews", `${team.review_progress.done} / ${team.review_progress.total}`)}${countMetric("Queue", team.queue.queued || 0)}${countMetric("Outreach", team.outreach_week.attempts)}${countMetric("Applications", team.pending_applications)}</section>
    <div class="workspace-grid"><section class="section-block"><div class="panel-head"><div><h2>Current request wave</h2><p class="muted">Shared review progress with a real denominator.</p></div></div>${progress("Reviews", team.review_progress.done, team.review_progress.total)}<div class="detail-grid"><div class="detail-stat"><small>Active claims</small><strong>${team.claims.active}</strong></div><div class="detail-stat"><small>${conceptLabel("Stale claims", conceptHelp.staleClaim)}</small><strong>${team.claims.stale}</strong></div><div class="detail-stat"><small>Outreach attempts</small><strong>${team.outreach_week.attempts}</strong></div><div class="detail-stat"><small>Confirmed submissions</small><strong>${team.outreach_week.submissions}</strong></div></div></section><section class="section-block"><h2>Current claim workload</h2>${team.workload.length ? team.workload.map((item) => `<div class="list-row human-row"><div><strong>${esc(identityLabel(item.identity, item.user_id))}</strong><small class="secondary-id">${esc(exactId(item.user_id))}</small></div><strong>${item.active_claims} active</strong></div>`).join("") : empty("No active claims", "The team currently has no claimed outreach work.")}</section></div>`;
}

async function renderStatistics() {
  const [data, staff] = await Promise.all([
    api("/api/staff/statistics"),
    can("staff.view") ? api("/api/staff/staff").catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
  ]);
  state.staffItems = staff.items;
  const reviewTotal = Object.values(data.results).reduce((sum, value) => sum + Number(value), 0);
  const queueTotal = Object.values(data.queue).reduce((sum, value) => sum + Number(value), 0);
  const process = data.application_process || {};
  return `<section class="progress-strip" aria-label="Team statistics summary">${countMetric("Reviews", reviewTotal)}${countMetric("Queue", queueTotal)}${countMetric("Outreach", data.outreach.attempts)}${countMetric("Applications", data.pending_applications ?? "-")}</section>
    <div class="workspace-grid"><section class="section-block"><div class="panel-head"><div><h2>${data.scope === "team" ? "Reviewer activity" : "My review activity"}</h2><p class="muted">Review counts and real median turnaround.</p></div></div>${data.reviewers.map((item) => {
      const known = state.staffItems.some((member) => exactId(member.id) === exactId(item.reviewed_by));
      const content = `<div><strong>${esc(item.identity?.display_name || "Unresolved staff identity")}</strong><small class="secondary-id">${esc(exactId(item.reviewed_by || item.identity?.id || "Unknown"))}</small><small>Median turnaround: ${item.median_turnaround ? `${Math.round(item.median_turnaround / 3600)}h` : "Unavailable"}</small></div><strong>${item.reviews} reviews</strong>`;
      return known ? `<button class="list-row row-button human-row" data-open-staff="${esc(exactId(item.reviewed_by))}">${content}</button>` : `<div class="list-row human-row">${content}</div>`;
    }).join("") || empty("No review statistics yet")}</section><section class="section-block"><h2>Queue and outreach</h2><div class="detail-grid"><div class="detail-stat"><small>Attempts</small><strong>${data.outreach.attempts}</strong></div><div class="detail-stat"><small>Confirmed</small><strong>${data.outreach.submissions}</strong></div><div class="detail-stat"><small>Follow-ups</small><strong>${data.outreach.followups}</strong></div><div class="detail-stat"><small>Stale claims</small><strong>${data.stale_claims}</strong></div></div>${data.outreach.routes.map((route) => `<div class="metric-line"><span>${esc(titleCase(route.route_type))}</span><strong>${route.submissions || 0} / ${route.attempts}</strong></div>`).join("")}${Object.entries(data.queue).map(([queueState, count]) => `<div class="metric-line"><span>${esc(titleCase(queueState))}</span><strong>${count}</strong></div>`).join("")}</section></div>
    <section class="section-block"><div class="panel-head"><div><h2>Application process</h2><p class="muted">Private operational health, not an applicant or staff leaderboard.</p></div></div><div class="application-process-grid"><div><span>First review</span><strong>${esc(duration(process.average_first_review_seconds))}</strong><small>average</small></div><div><span>Decision time</span><strong>${esc(duration(process.average_decision_seconds))}</strong><small>average</small></div><div><span>Interviewed</span><strong>${Number(process.interview_rate_percent || 0)}%</strong><small>${Number(process.interviewed || 0)} applications</small></div><div><span>Rubric disagreement</span><strong>${Number(process.rubric_disagreement_percent || 0)}%</strong><small>${Number(process.rubric_disagreements || 0)} of ${Number(process.rubric_comparable || 0)}</small></div></div><div class="statistics-grid"><div><h3>Outcomes by type</h3>${(process.outcomes_by_type || []).map((item) => `<div class="metric-line"><span>${esc(titleCase(item.application_type))} · ${esc(titleCase(item.status))}</span><strong>${item.c}</strong></div>`).join("") || '<p class="muted">No submitted applications yet.</p>'}</div><div><h3>Decision reasons</h3>${Object.entries(process.reason_breakdown || {}).map(([reason,count]) => `<div class="metric-line"><span>${esc(titleCase(reason))}</span><strong>${count}</strong></div>`).join("") || '<p class="muted">No categorized decisions yet.</p>'}<h3>Probation</h3>${Object.entries(process.probation || {}).map(([status,count]) => `<div class="metric-line"><span>${esc(titleCase(status))}</span><strong>${count}</strong></div>`).join("") || '<p class="muted">No probation records yet.</p>'}</div></div></section>
    <div class="statistics-grid"><section class="section-block"><h2>Review decisions</h2>${Object.entries(data.results).map(([result,count]) => `<div class="distribution-row"><span>${esc(titleCase(result))}</span><progress aria-label="${esc(titleCase(result))} decisions" aria-valuemin="0" aria-valuemax="${Math.max(1, reviewTotal)}" aria-valuenow="${count}" max="${Math.max(1, reviewTotal)}" value="${count}"></progress><strong>${count}</strong></div>`).join("") || '<p class="muted">No reviewed levels yet.</p>'}</section><section class="section-block"><h2>Recommendation tiers</h2>${Object.entries(data.tiers).map(([tier,count]) => `<div class="metric-line"><span>${pill(tier)}</span><strong>${count}</strong></div>`).join("") || '<p class="muted">No tier data yet.</p>'}<h3>Distributions</h3><p class="muted">Waiting: ${esc(Object.entries(data.waiting_distribution).map(([key,value]) => `W${key}: ${value}`).join(" | ") || "None")}</p><p class="muted">Creator Points: ${esc(Object.entries(data.cp_distribution).map(([key,value]) => `${key}: ${value}`).join(" | ") || "None")}</p></section></div>`;
}

async function renderQA() {
  const data = await api("/api/staff/qa");
  state.qaItems = data.items;
  return `<div class="panel-head"><div><h2>Review QA</h2><p class="muted">Operational consistency checks, never a reviewer quality score.</p></div></div>${data.items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Level</th><th>Reviewer</th><th>Decision</th><th>Tier</th><th>QA state</th></tr></thead><tbody>${data.items.map((item) => `<tr data-open-qa="${item.request_message_id}" role="button" tabindex="0"><td class="level-cell"><strong>${esc(item.level_id)}</strong><small>Open review detail</small></td><td data-label="Reviewer">${esc(identityLabel(item.reviewer, item.reviewed_by))}</td><td data-label="Decision">${esc(titleCase(item.result))}</td><td data-label="Tier">${item.send_type ? pill(item.send_type) : "-"}</td><td data-label="QA state">${pill(item.qa_status || "unreviewed")}</td></tr>`).join("")}</tbody></table></div>` : empty("No reviews are waiting for QA", "Completed review decisions will appear here when QA is required.")}`;
}

async function renderApplications() {
  const query = new URLSearchParams(state.applicationFilters);
  const appealRequested = state.applicationFilters.type === "appeal";
  const appealStatuses = new Set(["all", "active", "submitted", "triage", "under_review", "awaiting_information", "second_review", "decided", "withdrawn", "ineligible", "duplicate", "expired_no_action"]);
  const staffQuery = new URLSearchParams(state.applicationFilters);
  if (appealRequested) staffQuery.set("type", "all");
  const [data, appealData] = await Promise.all([
    appealRequested ? Promise.resolve({ items: [], application_types: ["judge", "mod"] }) : api(`/api/staff/applications?${staffQuery}`),
    supports("punishment_appeals") && can("appeals.review") && ["all", "appeal"].includes(state.applicationFilters.type) && appealStatuses.has(state.applicationFilters.status)
      ? api(`/api/staff/appeals?status=${encodeURIComponent(state.applicationFilters.status)}&claim=${encodeURIComponent(state.applicationFilters.claim)}`)
      : Promise.resolve({ items: [] }),
  ]);
  state.applications = data.items;
  state.appeals = appealData.items || [];
  const availableTypes = [...(data.application_types || ["judge", "mod"]), ...(can("appeals.review") ? ["appeal"] : [])];
  const typeOptions = [["all", "All types"], ...[...new Set(availableTypes)].map((value) => [value, value === "judge" ? "Reviewer" : value === "appeal" ? "Punishment appeal" : titleCase(value)])];
  const filter = (key, options) => `<label class="filter-field"><span>${esc(titleCase(key))}</span><select id="application-${esc(key)}-filter">${options.map(([value,label]) => `<option value="${esc(value)}" ${state.applicationFilters[key] === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>`;
  const controls = `<div class="toolbar application-filter-bar">${filter("type", typeOptions)}${filter("status", [["active","Active"],["all","All statuses"],["submitted","Submitted"],["triage","Appeal triage"],["under_review","Under review"],["awaiting_information","Awaiting information"],["second_review","Second review"],["interview","Interview"],["hold","Held"],["decided","Appeal decided"],["accepted_pending_role","Accepted, role pending"],["accepted","Accepted"],["rejected","Rejected"],["withdrawn","Withdrawn"]])}${filter("claim", [["all","All claims"],["unclaimed","Not claimed"],["claimed","Claimed"],["mine","Claimed by me"]])}<button class="button secondary" type="button" data-action="application-filter-apply">Apply filters</button></div>`;
  const recruitmentRows = data.items.map((item) => `<button class="record-row" type="button" data-open-application="${item.id}"><span><strong>${esc(identityLabel(item.applicant, item.applicant_id))}</strong><small>${esc(item.application_label || titleCase(item.application_type))} · submitted ${ago(item.submitted_ts)}</small></span><span class="record-tags">${pill(item.status)}${pill(item.claimed_by ? "claimed" : "unclaimed")}</span><span class="row-chevron" aria-hidden="true">View</span></button>`);
  const appealRows = state.appeals.map((item) => `<button class="record-row" type="button" data-open-appeal="${item.id}"><span><strong>${esc(identityLabel(item.appellant, item.appellant_id))}</strong><small>Punishment appeal · submitted ${ago(item.submitted_ts)}</small></span><span class="record-tags">${item.staff_unread_count ? pill(`${item.staff_unread_count} new`) : ""}${pill(item.status)}${pill(item.claimed_by ? "claimed" : "unclaimed")}</span><span class="row-chevron" aria-hidden="true">View</span></button>`);
  const rows = [...appealRows, ...recruitmentRows];
  return `<div class="panel-head"><div><h2>Applications and appeals</h2><p class="muted">Review staff applications and evidence-based punishment appeals. Appeal communication remains available even when Discord DMs fail.</p></div></div>${controls}${rows.length ? `<div class="record-list">${rows.join("")}</div>` : empty("No records match these filters", "Change the status, claim, or type filters to widen the view.")}`;
}

function openAppeal(id) {
  const item = state.appeals.find((entry) => String(entry.id) === String(id));
  if (!item) return showNotice("That appeal is no longer in this view", true);
  if (item.staff_unread_count) {
    api(`/api/staff/appeals/${item.id}/action`, {
      method: "POST",
      body: { action: "mark_read" },
    }).catch(() => {});
    item.staff_unread_count = 0;
  }
  const applicant = identityLabel(item.appellant, item.appellant_id);
  const answerLabels = {
    primary_ground: "Primary ground", chronology: "Chronological account", disputed_detail: "Disputed record",
    reconsideration: "Reconsideration", evidence_links: "Evidence", requested_outcome: "Requested outcome", confirmation: "Confirmation",
  };
  const answers = Object.entries(item.answers || {}).filter(([, value]) => String(value || "").trim()).map(([key, value]) => `<div class="review-answer"><small>${esc(answerLabels[key] || titleCase(key))}</small><p>${esc(value)}</p></div>`).join("");
  const source = item.source_detail || {};
  const reported = source.reported || {};
  const restrictionRole = source.role_name || reported.role_name;
  const timeoutEnd = source.timeout_until_ts || reported.timeout_until_ts;
  const reportedDetails = String(reported.details || "").trim();
  const punishmentLabel = ({ ban: "Ban", timeout: "Timeout or mute", restriction_role: "Restriction role", other: "Other punishment" })[item.punishment_type] || titleCase(item.punishment_type || "punishment");
  const evidenceState = item.lookup_status === "found"
    ? `Active ${punishmentLabel.toLowerCase()}`
    : item.lookup_status === "applicant_reported"
      ? "Applicant reported, not verified"
      : ["not_banned", "unbanned_by_appeal", "removed_by_appeal"].includes(item.lookup_status)
        ? "No longer active"
        : "Verification unavailable";
  const evidence = `<section class="drawer-section"><h3>Punishment evidence</h3><div class="detail-grid"><div class="detail-stat"><small>Current state</small><strong>${esc(evidenceState)}</strong></div><div class="detail-stat"><small>Type</small><strong>${esc(punishmentLabel)}</strong></div><div class="detail-stat"><small>Issued</small><strong>${item.issued_ts ? fmtTime(item.issued_ts) : "Unavailable"}</strong></div><div class="detail-stat"><small>Reason source</small><strong>${esc(titleCase(item.reason_source || "unknown"))}</strong></div><div class="detail-stat"><small>Audit entry</small><strong>${item.audit_log_entry_id ? esc(item.audit_log_entry_id) : "Not found / expired"}</strong></div></div><p><strong>Recorded reason:</strong> ${esc(item.reason || "No reason present")}</p>${restrictionRole ? `<p><strong>Restriction role:</strong> ${esc(restrictionRole)}</p>` : ""}${timeoutEnd ? `<p><strong>Timeout ends:</strong> ${fmtTime(timeoutEnd)}</p>` : ""}${reportedDetails ? `<p><strong>Applicant details:</strong> ${esc(reportedDetails)}</p>` : ""}${item.lookup_status === "applicant_reported" ? '<div class="inline-warning"><strong>Unverified:</strong> these details were entered by the applicant and must be checked in Discord before any action.</div>' : ""}${item.reason_conflict ? `<div class="inline-warning"><strong>Reason conflict:</strong> live Discord ban reason and audit reason differ.</div><p><strong>Live ban:</strong> ${esc(source.live_reason || "None")}</p><p><strong>Audit log:</strong> ${esc(source.audit_reason || "None")}</p>` : ""}${source.sapphire_note ? `<p class="muted">${esc(source.sapphire_note)}</p>` : ""}${item.issued_by_identity ? `<p class="muted">Issuing moderator: ${esc(identityLabel(item.issued_by_identity, item.issued_by_id))}</p>` : ""}</section>`;
  const assessments = (item.assessments || []).map((assessment) => `<article class="list-row"><div><strong>${esc(identityLabel(assessment.reviewer, assessment.reviewer_id))}</strong><small>${esc(titleCase(assessment.recommendation))}${assessment.recused ? " · recused" : ""}</small><p>${esc(assessment.rationale)}</p>${Object.entries(assessment.findings || {}).map(([key,value]) => `<small><strong>${esc(titleCase(key))}:</strong> ${esc(value)}</small>`).join("")}</div></article>`).join("") || '<p class="muted">No independent assessments yet.</p>';
  const messages = (item.messages || []).map((message) => `<article class="appeal-message ${esc(message.author_type)}"><strong>${message.author_type === "applicant" ? esc(applicant) : "Appeals team"}</strong><p>${esc(message.body)}</p><small>${fmtTime(message.created_ts)}${message.dm_outbox_id ? " · DM requested" : ""}</small></article>`).join("") || '<p class="muted">No messages yet.</p>';
  const ready = item.decision_ready || { eligible_assessments: 0, minimum: 2, ready: false };
  const actions = ["decided", "withdrawn", "ineligible", "duplicate", "expired_no_action"].includes(item.status)
    ? `<button class="button secondary small" data-appeal-action="reopen" data-id="${item.id}">Reopen</button><button class="button secondary small" data-appeal-action="message" data-id="${item.id}">Message applicant</button>`
    : `<button class="button secondary small" data-appeal-action="claim" data-id="${item.id}">Claim</button><button class="button secondary small" data-appeal-action="review" data-id="${item.id}">Start review</button><button class="button secondary small" data-appeal-action="assess" data-id="${item.id}">Add assessment</button><button class="button secondary small" data-appeal-action="request_information" data-id="${item.id}">Request information</button><button class="button secondary small" data-appeal-action="message" data-id="${item.id}">Message applicant</button><button class="button secondary small" data-appeal-action="recuse" data-id="${item.id}">Recuse</button>${can("appeals.execute") ? `<button class="button primary small" data-appeal-action="decide" data-id="${item.id}" ${ready.ready ? "" : "disabled"}>Decide appeal</button>` : ""}`;
  openDrawer("Appeal inspector", `${applicant}'s appeal`, `<div class="drawer-meta">${pill(item.status)}${pill(item.claimed_by ? "claimed" : "unclaimed")}<span>${ready.eligible_assessments} of ${ready.minimum} independent assessments</span>${item.unban_status ? `<span>Removal: ${esc(item.unban_status)}</span>` : ""}</div>${evidence}<section class="drawer-section"><h3>Submitted appeal</h3>${answers}</section><section class="drawer-section"><h3>Independent assessments</h3>${assessments}</section><section class="drawer-section"><h3>Private portal messages</h3><div class="appeal-message-list">${messages}</div></section><section class="drawer-section"><h3>Actions</h3><div class="toolbar application-actions">${actions}</div></section>`);
}

async function renderStaff() {
  const data = await api("/api/staff/staff");
  state.staffItems = data.items;
  const manualManagement = supports("staff_manual_management");
  const addStaff = can("developer.access")
    ? `<button class="button primary" data-action="add-staff" ${manualManagement ? "" : 'disabled aria-disabled="true" title="Deploy the matching Avenue Guard API to enable this control"'}>Add staff</button>`
    : "";
  return `<div class="panel-head"><div><h2>Staff access</h2><p class="muted">Discord roles remain authoritative. Portal names are separate and every access change is audited.</p></div>${addStaff}</div>${can("developer.access") && !manualManagement ? '<p class="warning-text">Add staff is preserved but temporarily disabled because the deployed Avenue Guard API is older than this portal. Deploy Avenue Guard to enable it.</p>' : ""}${data.items.length ? `<div class="record-list staff-list">${data.items.map((member) => `<button class="record-row staff-record" type="button" data-open-staff="${esc(exactId(member.id))}"><span class="identity-row">${member.avatar_url ? `<img src="${esc(member.avatar_url)}" alt="" width="40" height="40">` : '<span class="avatar-fallback" aria-hidden="true"></span>'}<span><strong>${esc(member.display_name)}</strong><small>${member.reviews} reviews · ${member.workload} active claims${member.last_activity_ts ? ` · active ${ago(member.last_activity_ts)}` : ""}</small><small class="secondary-id">${esc(exactId(member.id))}</small></span></span>${rolePill(member.role, member.role_label)}<span class="row-chevron" aria-hidden="true">View</span></button>`).join("")}</div>` : empty("No configured staff roles found")}`;
}

function openApplication(id) {
  const item = state.applications.find((entry) => String(entry.id) === String(id));
  if (!item) return showNotice("That application is no longer in this view", true);
  const fallbackActions = {
    submitted: ["claim", "assess", "interview", "hold", "accept", "reject"],
    under_review: ["assess", "interview", "hold", "accept", "reject"],
    hold: ["claim", "assess", "interview", "accept", "reject"],
    interview: ["assess", "interview", "hold", "accept", "reject"],
    accepted_pending_role: ["accept"],
  };
  const actions = Array.isArray(item.available_actions)
    ? item.available_actions
    : [...(fallbackActions[item.status] || []), ...(supports("application_staff_dm") ? ["message"] : [])];
  const hasInterview = Boolean(item.interview_ticket_channel_id);
  const labels = {
    claim: item.status === "hold" ? "Resume review" : "Claim",
    assess: (item.assessments || []).some((assessment) => exactId(assessment.reviewer_id) === exactId(state.user.id)) ? "Update my assessment" : "Add my assessment",
    calibrate: "Resolve calibration",
    interview: hasInterview
      ? "Do another interview"
      : item.status === "interview"
        ? "Retry interview setup"
        : "Proceed to interview",
    hold: item.status === "interview" ? "Pause application" : "Hold",
    accept: item.status === "accepted_pending_role"
      ? "Retry role delivery"
      : hasInterview
        ? "Accept user"
        : "Accept without interview",
    reject: "Reject",
    message: "DM applicant",
  };
  const actionButtons = actions.map((action) => {
    const style = action === "reject" ? "danger" : ["accept", "assess"].includes(action) ? "primary" : "secondary";
    const label = labels[action] || titleCase(action);
    return `<button class="button small ${style}" data-app-action="${esc(action)}" data-app-action-label="${esc(label)}" data-id="${item.id}">${esc(label)}</button>`;
  }).join("");
  const interviewDelivery = ["pending", "processing", "failed"].includes(item.interview_delivery_status)
    ? pill(`interview setup ${item.interview_delivery_status}`, item.interview_delivery_status === "failed" ? "warning" : "")
    : "";
  const applicantName = item.applicant?.display_name || item.applicant?.username || "Applicant";
  const questions = (item.questions || []).length
    ? item.questions
    : Object.keys(item.answers || {}).map((key) => ({ key, label: titleCase(key), section: "Application" }));
  const answerSections = new Map();
  for (const question of questions) {
    const section = question.section || "Application";
    if (!answerSections.has(section)) answerSections.set(section, []);
    answerSections.get(section).push(question);
  }
  const answerHtml = [...answerSections.entries()].map(([section, sectionQuestions]) => `<div class="answer-section"><h4>${esc(section)}</h4>${sectionQuestions.map((question) => `<div><small>${esc(question.label || titleCase(question.key))}</small><p>${esc(item.answers?.[question.key] || "No answer provided")}</p></div>`).join("")}</div>`).join("");
  const rubricDimensions = item.rubric?.dimensions || [];
  const assessmentSummary = item.assessment_summary || { count: 0, minimum: 2 };
  const assessmentsHtml = (item.assessments || []).map((assessment) => `<article class="rubric-assessment"><h4>${esc(identityLabel(assessment.reviewer, assessment.reviewer_id))} · ${esc(titleCase(assessment.recommendation))}</h4>${rubricDimensions.map((dimension) => `<div class="rubric-dimension"><span>${esc(dimension.label)}</span><strong>${esc(assessment.scores?.[dimension.key] ?? "-")}/5</strong><small>${esc(assessment.evidence?.[dimension.key] || "No evidence note")}</small></div>`).join("")}</article>`).join("");
  const calibration = assessmentSummary.calibration_required
    ? '<p class="inline-warning"><strong>Calibration required</strong><span>Independent assessments disagree. Resolve the differences or interview the applicant before a final decision.</span></p>'
    : assessmentSummary.disagreement
      ? '<p class="muted">Scoring differences were resolved through calibration or interview.</p>'
      : "";
  const interviewHtml = (item.interviews || []).map((interview) => `<article class="list-row"><div><strong>Interview record</strong><small>${esc(interview.reason)}</small>${(interview.questions || []).length ? `<ol>${interview.questions.map((question) => `<li>${esc(question)}</li>`).join("")}</ol>` : ""}${interview.notes ? `<p><strong>Outcome notes:</strong> ${esc(interview.notes)}</p>` : ""}${interview.recommendation ? `<small>Current recommendation: ${esc(titleCase(interview.recommendation))}</small>` : ""}${interview.completed_by_identity ? `<small>Completed by ${esc(identityLabel(interview.completed_by_identity, interview.completed_by))} · ${fmtTime(interview.completed_ts)}</small>` : ""}</div><div class="row-actions">${pill(interview.status)}${interview.status === "open" ? `<button class="button secondary small" type="button" data-interview-outcome="${interview.id}" data-application-id="${item.id}">Record outcome</button>` : ""}</div></article>`).join("");
  const probation = item.probation;
  const probationHtml = probation ? `<section class="drawer-section"><h3>Probation checkpoint</h3><div class="detail-grid"><div class="detail-stat"><small>Status</small><strong>${esc(titleCase(probation.status))}</strong></div><div class="detail-stat"><small>Due</small><strong>${fmtTime(probation.due_ts)}</strong></div></div>${probation.status === "active" && can("applications.review_all") ? `<div class="toolbar"><button class="button small primary" data-probation-action="complete" data-id="${item.id}">Complete probation</button><button class="button small secondary" data-probation-action="extend" data-id="${item.id}">Extend</button><button class="button small danger" data-probation-action="end" data-id="${item.id}">End early</button></div>` : ""}</section>` : "";
  openDrawer("Application inspector", `${applicantName}'s application`, `
    <div class="drawer-identity"><div><span>Applicant</span><strong>${esc(identityLabel(item.applicant, item.applicant_id))}</strong><small class="secondary-id">${esc(exactId(item.applicant_id))}</small></div>${copyButton(item.applicant_id, "Copy Discord ID")}</div>
    <div class="drawer-meta">${pill(item.status)}${pill(item.application_type === "judge" ? "reviewer" : item.application_type)}${interviewDelivery}<span>Submitted ${fmtTime(item.submitted_ts)}</span>${item.claimed_by ? `<span>Claimed by ${esc(identityLabel(item.claimed_by_identity, item.claimed_by))}</span>` : ""}${item.review_thread_id ? `<a class="quiet-link" href="https://discord.com/channels/${esc(item.guild_id)}/${esc(item.review_thread_id)}" target="_blank" rel="noopener noreferrer">Open Discord thread</a>` : ""}${item.interview_ticket_channel_id ? `<a class="quiet-link" href="https://discord.com/channels/${esc(item.guild_id)}/${esc(item.interview_ticket_channel_id)}" target="_blank" rel="noopener noreferrer">Open interview ticket</a>` : ""}</div>
    <section class="drawer-section"><h3>Submitted answers</h3><div class="answer-list">${answerHtml || '<p class="muted">No answers were stored.</p>'}</div></section>
    <section class="drawer-section"><div class="panel-head"><div><h3>Independent assessments</h3><p class="muted">${Number(assessmentSummary.count || 0)} of ${Number(assessmentSummary.minimum || 2)} required assessments recorded.</p></div></div>${calibration}<div class="rubric-summary">${assessmentsHtml || '<p class="muted">No rubric assessments yet.</p>'}</div></section>
    ${(item.interviews || []).length ? `<section class="drawer-section"><h3>Interview history</h3>${interviewHtml}</section>` : ""}
    ${probationHtml}
    <details class="drawer-section" open><summary>Internal timeline (${item.timeline?.length || 0})</summary>${item.timeline?.length ? `<ol class="timeline">${item.timeline.map((event) => `<li><strong>${esc(titleCase(event.event))}</strong><br><small class="muted">${esc(identityLabel(event.actor, event.actor_id))} · ${fmtTime(event.created_ts)}</small></li>`).join("")}</ol>` : '<p class="muted">No staff activity yet.</p>'}</details>
    <details class="drawer-section"><summary>Internal notes (${item.internal_notes?.length || 0})</summary>${item.internal_notes?.map((note) => `<p>${esc(note.body)}<br><small class="muted">${esc(identityLabel(note.author, note.author_id))} · ${ago(note.created_ts)}</small></p>`).join("") || '<p class="muted">No internal notes.</p>'}<button class="button small secondary" data-app-note="${item.id}">Add note</button></details>
    ${actionButtons ? `<section class="drawer-section"><h3>Actions</h3><div class="toolbar application-actions">${actionButtons}</div></section>` : ""}`);
}

function openStaffInspector(id) {
  const member = state.staffItems.find((entry) => exactId(entry.id) === exactId(id));
  if (!member) return showNotice("That staff identity is no longer in this view", true);
  openDrawer("Staff inspector", member.display_name, `
    <div class="profile-hero">${member.avatar_url ? `<img src="${esc(member.avatar_url)}" alt="" width="64" height="64">` : '<span class="avatar-fallback large" aria-hidden="true"></span>'}<div>${rolePill(member.role, member.role_label)}${pill(member.active ? "active" : "inactive")}</div></div>
    <div class="drawer-identity"><div><span>Exact Discord ID</span><strong class="secondary-id">${esc(exactId(member.id))}</strong></div>${copyButton(member.id)}</div>
    <section class="drawer-section"><h3>Work and statistics</h3><div class="detail-grid"><div class="detail-stat"><small>Reviews</small><strong>${member.reviews || 0}</strong></div><div class="detail-stat"><small>Active claims</small><strong>${member.workload || 0}</strong></div><div class="detail-stat"><small>Last activity</small><strong>${member.last_activity_ts ? ago(member.last_activity_ts) : "Unknown"}</strong></div><div class="detail-stat"><small>${conceptLabel("Role delivery", conceptHelp.roleDelivery)}</small><strong>${esc(titleCase(member.role_delivery_status || "current"))}</strong></div></div></section>
    <section class="drawer-section"><h3>Profile</h3><p class="muted">The portal nickname does not change the Discord server nickname.</p><button class="button secondary" data-nickname-id="${esc(exactId(member.id))}" data-nickname-value="${esc(member.portal_nickname || "")}">Edit nickname</button></section>
    ${can("staff.manage_standard_roles") ? `<section class="drawer-section"><h3>Management</h3><button class="button secondary" data-staff-action="${esc(exactId(member.id))}" data-staff-role="${esc(member.role)}">Manage staff access</button></section>` : ""}`);
}

function openQAInspector(id) {
  const item = state.qaItems.find((entry) => exactId(entry.request_message_id) === exactId(id));
  if (!item) return showNotice("That QA item is no longer in this view", true);
  openDrawer("Review QA inspector", `Level ${item.level_id}`, `
    <div class="drawer-identity"><div><span>Reviewer</span><strong>${esc(identityLabel(item.reviewer, item.reviewed_by))}</strong><small class="secondary-id">${esc(exactId(item.reviewed_by))}</small></div>${copyButton(item.reviewed_by, "Copy reviewer ID")}</div>
    <div class="detail-grid"><div class="detail-stat"><small>Decision</small><strong>${esc(titleCase(item.result))}</strong></div><div class="detail-stat"><small>Tier</small><strong>${esc(titleCase(item.send_type || "Not set"))}</strong></div><div class="detail-stat"><small>QA state</small><strong>${esc(titleCase(item.qa_status || "unreviewed"))}</strong></div><div class="detail-stat"><small>Review message</small><strong class="secondary-id">${esc(exactId(item.request_message_id))}</strong></div></div>
    <section class="drawer-section"><h3>QA action</h3><button class="button primary" data-qa="${esc(exactId(item.request_message_id))}">Record QA outcome</button></section>`);
}

async function renderOperations() {
  const data = await api("/api/staff/operations");
  const health = (ready) => pill(ready ? "healthy" : "degraded", ready ? "" : "warning");
  const cpProviders = Object.entries(data.creator_points_providers || {});
  const providerLabels = { gdbrowser: "GDBrowser", boomlings: "Boomlings", gdhistory: "GDHistory", gdrateplus: "GDRate+" };
  const methodLabels = { html_level: "HTML level", html_profile: "HTML profile", api_profile: "API fallback", direct_profile: "Direct profile", level: "Level lookup" };
  const rate = (value) => value == null ? "No samples" : `${Math.round(Number(value) * 100)}%`;
  const creatorProvider = ([name, provider]) => {
    const status = provider.status || (provider.circuit_open ? "unavailable" : "degraded");
    const details = [
      `${provider.attempts || 0} attempts`,
      `${rate(provider.success_rate)} success`,
      `${rate(provider.cp_success_rate)} CP`,
      `${rate(provider.identity_success_rate)} identity`,
      provider.median_latency_ms == null ? "latency unknown" : `${formatPps(provider.median_latency_ms)} ms median`,
      `${provider.parse_failures || 0} parse failures`,
      provider.last_success ? `last success ${ago(provider.last_success)}` : "no recent success",
    ];
    const methods = (provider.methods || []).map((method) => `<div class="metric-line provider-method"><span>${esc(methodLabels[method.method] || titleCase(method.method || "provider request"))}</span><strong>${method.attempts || 0} attempts · ${method.cp_successes || 0} CP · ${method.parse_failures || 0} parse failures</strong></div>`).join("");
    return `<div class="provider-diagnostic"><div class="list-row"><div><strong>${esc(providerLabels[name] || titleCase(name))}</strong><small>${esc(details.join(" · "))}</small>${provider.last_error_category ? `<small>Last error: ${esc(titleCase(provider.last_error_category))}${provider.last_error ? ` · ${ago(provider.last_error)}` : ""}</small>` : ""}</div>${pill(status, status === "healthy" ? "" : "warning")}</div>${methods}</div>`;
  };
  return `<div class="summary-band operations-summary"><div><p class="eyebrow">Avenue Guard</p><h2><span class="state-dot ${data.runtime.ready ? "healthy" : "degraded"}" aria-hidden="true"></span>${esc(data.service.state || "Unknown")}</h2><small>${esc(data.service.detail || "No service detail")}</small></div><div><small>Bot readiness</small><strong>${health(data.runtime.ready)}</strong></div><div><small>Database</small><strong>${health(data.database.connected)}</strong></div><div><small>Open incidents</small><strong>${data.incidents.length}</strong></div></div>
    <section class="system-status-line" aria-label="Operations summary">${countMetric("Gateway", data.runtime.responsive ? "Healthy" : "Degraded")}${countMetric("Outbox pending", data.outbox.pending || 0)}${countMetric("Current wave", titleCase(data.request_wave.state || "unknown"))}${countMetric("CP providers", `${cpProviders.filter(([, item]) => item.status === "healthy").length} healthy`)}</section>
    <details class="admin-disclosure"><summary>View diagnostics</summary><div class="operations-grid"><section class="section-block"><h2>Core systems</h2><div class="metric-line"><span>Database worker</span>${health(data.database.connected && data.database.worker_alive !== false)}</div><div class="metric-line"><span>PPS maintenance</span><strong>${esc(titleCase(data.pps_worker || "unknown"))}</strong></div><div class="metric-line"><span>Public level cache</span><strong>${esc(titleCase(data.public_cache?.state || "unknown"))}</strong></div></section><section class="section-block"><h2>Durable outbox</h2>${["pending","processing","dead","delivered"].map((key) => `<div class="metric-line"><span>${esc(titleCase(key))}</span><strong>${data.outbox[key] || 0}</strong></div>`).join("")}</section><section class="section-block"><h2>Creator Points providers</h2>${cpProviders.map(creatorProvider).join("") || '<p class="muted">Creator Points telemetry is not available yet.</p>'}</section><section class="section-block"><h2>Validation providers</h2>${Object.entries(data.providers || {}).map(([name, provider]) => `<div class="list-row"><div><strong>${esc(titleCase(name))}</strong><small>${esc(provider.last_error || "No recent error")}</small></div>${pill(provider.circuit_open ? "degraded" : "healthy", provider.circuit_open ? "warning" : "")}</div>`).join("") || '<p class="muted">Validation telemetry is not available yet.</p>'}</section><section class="section-block"><h2>Background workers</h2>${Object.entries(data.background_workers || {}).map(([name, status]) => `<div class="metric-line"><span>${esc(titleCase(name))}</span><strong>${esc(titleCase(status))}</strong></div>`).join("") || '<p class="muted">No worker telemetry available.</p>'}</section></div></details>
    <section class="section-block incident-panel"><div class="panel-head"><div><h2>Recent incidents</h2><p class="muted">Sanitized summaries; open one only when investigation is needed.</p></div></div>${data.incidents.map((item) => `<article class="incident-row"><div><strong>${esc(item.component)}</strong><span>${esc(item.error_type)}: ${esc(item.summary)}</span><small>${item.occurrence_count} occurrence${item.occurrence_count === 1 ? "" : "s"} · last seen ${ago(item.last_seen_ts)}</small></div>${item.details_available ? `<button class="button small secondary" data-incident="${esc(item.fingerprint)}">View details</button>` : ""}</article>`).join("") || '<p class="muted">No open incidents.</p>'}</section>`;
}

async function renderRequestsAdmin() {
  const data = await api("/api/staff/requests");
  state.adminRequests = data;
  const wave = data.state || {};
  return `<div class="summary-band"><div><p class="eyebrow">Request management</p><h2>${esc(titleCase(wave.state || "closed"))}</h2><small>Wave ${wave.wave_id || 0} | ${esc(titleCase(wave.review_system_version || "legacy"))}</small></div><div><small>Submitted</small><strong>${wave.submitted_count || 0}</strong></div><div><small>Reviewed</small><strong>${data.progress.reviewed} / ${data.progress.total}</strong></div><div><small>Pending review</small><strong>${data.progress.pending}</strong></div></div><section class="panel">${progress("Wave review progress", data.progress.reviewed, data.progress.total)}<div class="toolbar admin-actions"><button class="button primary" data-request-action="open">Open requests</button><button class="button secondary" data-request-action="schedule">Schedule opening</button><button class="button danger" data-request-action="close">Close requests</button><button class="button secondary" data-request-action="refresh_button">Refresh request button</button><button class="button secondary" data-request-action="repair">Run request repair</button></div><div class="detail-grid"><div class="detail-stat"><small>Request limit</small><strong>${wave.request_limit ?? "No limit"}</strong></div><div class="detail-stat"><small>Close time</small><strong>${wave.close_ts ? fmtTime(wave.close_ts) : "No timer"}</strong></div><div class="detail-stat"><small>Request type</small><strong>${esc(titleCase(wave.request_type || "any"))}</strong></div><div class="detail-stat"><small>Button message ID</small><strong class="secondary-id">${esc(wave.request_message_id || "Not created")}</strong></div></div></section><section class="panel"><div class="panel-head"><h2>Scheduled openings</h2><small class="muted">Times use your browser locale</small></div>${data.scheduled.length ? data.scheduled.map((item) => `<div class="list-row"><div><strong>Opening #${item.id} | ${fmtTime(item.open_ts)}</strong><small>${esc(titleCase(item.request_type || "any"))} | ${item.request_limit || "no limit"} requests | ${item.close_minutes || "no timer"}</small></div><div class="toolbar row-actions"><button class="button small secondary" data-edit-opening="${item.id}">Edit</button><button class="button small danger" data-cancel-opening="${item.id}">Cancel</button></div></div>`).join("") : '<p class="muted">No pending openings.</p>'}</section>`;
}

async function renderCommunity() {
  const data = await api("/api/staff/community");
  return `<div class="operations-grid"><section class="panel"><h2>Tracking</h2><p class="muted">Weekly reward state is stored per tracking week.</p><div class="toolbar"><button class="button secondary" data-community-action="enable_weekly_reward">Enable weekly reward</button><button class="button secondary" data-community-action="disable_weekly_reward">Disable weekly reward</button></div></section><section class="panel"><h2>Tickets and support</h2>${Object.entries(data.support.tickets || {}).map(([status,count]) => `<div class="metric-line"><span>${esc(titleCase(status))}</span><strong>${count}</strong></div>`).join("") || '<p class="muted">No tickets are recorded.</p>'}</section><section class="panel"><h2>Forum rules</h2>${data.forum.rules.map((rule) => `<div class="list-row"><div><strong>${esc(rule.required_word || "No required word")}</strong><small>Forum ${esc(rule.forum_channel_id)} | ${esc(titleCase(rule.match_mode))}</small></div></div>`).join("") || '<p class="muted">No required-word rules configured.</p>'}</section><section class="panel"><h2>Server presentation</h2><div class="metric-line"><span>Icon rotation</span><strong>${esc(titleCase(data.server_presentation.icon_rotation_mode))}</strong></div><div class="metric-line"><span>Configured icons</span><strong>${data.server_presentation.icon_count}</strong></div><p class="muted">Icon list changes remain in Discord until the shared configuration writer is exposed to this API.</p></section></div>`;
}

async function renderSystem() {
  const [data, config] = await Promise.all([
    api("/api/staff/system"),
    can("config.manage_safe") ? api("/api/staff/configuration").catch(() => null) : Promise.resolve(null),
  ]);
  const providerEntries = Object.entries(data.providers || {});
  const workerEntries = Object.entries(data.background_workers || {});
  return `<div class="panel-head"><div><h2>System</h2><p class="muted">An engineering console with details disclosed only when you need them.</p></div></div>
    <div class="system-status-line">${countMetric("Runtime", data.runtime.ready ? "Ready" : "Degraded")}${countMetric("Database", data.database.connected ? "Connected" : "Unavailable")}${countMetric("Waiting operations", data.database.waiting_operations || 0)}${countMetric("Dead outbox", data.dead_outbox.length)}</div>
    <div class="system-console">
      <details class="admin-disclosure"><summary><span><strong>Runtime</strong><small>${data.runtime.ready ? "Ready" : "Degraded"} · heartbeat ${data.runtime.heartbeat_age_seconds ?? "unknown"}s ago</small></span></summary><div class="diagnostic-body"><div class="metric-line"><span>Heartbeat age</span><strong>${data.runtime.heartbeat_age_seconds ?? "Unknown"}s</strong></div><div class="metric-line"><span>Event-loop lag</span><strong>${data.runtime.event_loop_lag_ms ?? "Unknown"}ms</strong></div></div></details>
      <details class="admin-disclosure"><summary><span><strong>Database</strong><small>${data.database.connected ? "Connected" : "Unavailable"} · ${data.database.waiting_operations || 0} waiting</small></span></summary><div class="diagnostic-body"><div class="metric-line"><span>Remote primary</span><strong>${data.database.uses_remote ? "Yes" : "No"}</strong></div><div class="metric-line"><span>Waiting operations</span><strong>${data.database.waiting_operations || 0}</strong></div><h3>${conceptLabel("Schema versions", conceptHelp.schema)}</h3>${data.schemas.map((item) => `<div class="metric-line"><span>${esc(item.component)}</span><strong>v${item.schema_version}</strong></div>`).join("") || '<p class="muted">No schema metadata.</p>'}</div></details>
      <details class="admin-disclosure"><summary><span><strong>Outbox</strong><small>${data.dead_outbox.length} dead · durable delivery diagnostics</small></span></summary><div class="diagnostic-body"><h3>${conceptLabel("Dead outbox entries", conceptHelp.outbox)}</h3><strong>${data.dead_outbox.length}</strong><p class="muted">Inspect correlation IDs before replaying side effects.</p></div></details>
      <details class="admin-disclosure"><summary><span><strong>Workers</strong><small>${workerEntries.length || "No"} worker state${workerEntries.length === 1 ? "" : "s"} available</small></span></summary><div class="diagnostic-body">${workerEntries.map(([name, status]) => `<div class="metric-line"><span>${esc(titleCase(name))}</span><strong>${esc(titleCase(status))}</strong></div>`).join("") || '<p class="muted">No worker telemetry is available.</p>'}</div></details>
      <details class="admin-disclosure"><summary><span><strong>Providers</strong><small>${providerEntries.filter(([, provider]) => !provider.circuit_open).length} healthy · ${providerEntries.filter(([, provider]) => provider.circuit_open).length} degraded</small></span></summary><div class="diagnostic-body">${providerEntries.map(([name, provider]) => `<div class="list-row"><div><strong>${esc(titleCase(name))}</strong><small>${esc(provider.last_error || "No recent error")}</small></div>${pill(provider.circuit_open ? "degraded" : "healthy", provider.circuit_open ? "warning" : "")}</div>`).join("") || '<p class="muted">Provider telemetry is not available yet.</p>'}</div></details>
      <details class="admin-disclosure"><summary><span><strong>Requests and PPS</strong><small>${esc(titleCase(data.request_wave?.state || "unknown"))} wave · maintenance ${esc(titleCase(data.background_workers?.["priority.maintenance"] || "unknown"))}</small></span></summary><div class="diagnostic-body"><div class="metric-line"><span>Request wave</span><strong>${esc(titleCase(data.request_wave?.state || "unknown"))}</strong></div><div class="metric-line"><span>PPS maintenance</span><strong>${esc(titleCase(data.background_workers?.["priority.maintenance"] || "unknown"))}</strong></div><div class="metric-line"><span>Public level cache</span><strong>${esc(titleCase(data.public_cache?.state || "unknown"))}</strong></div></div></details>
      <details class="admin-disclosure"><summary><span><strong>Identity integrity</strong><small>Legacy Discord ID repair status</small></span></summary><div class="diagnostic-body">${Object.entries(data.identity_repairs || {}).map(([status, item]) => `<div class="metric-line"><span>${esc(titleCase(status))}</span><strong>${item.records} records · ${item.rows_changed} rows</strong></div>`).join("") || '<p class="muted">No legacy snowflake repairs recorded.</p>'}</div></details>
    </div>
    ${config ? `<details class="admin-disclosure"><summary>Safe configuration</summary><div class="form-grid compact-form"><label>${conceptLabel("Stale claim threshold in hours", conceptHelp.staleClaim)}<input id="config-stale" type="number" min="1" max="720" value="${config.configuration.claim_stale_hours}"></label><label class="checkbox-row"><input id="config-apps" type="checkbox" ${config.configuration.applications_open ? "checked" : ""}><span>${conceptLabel("Application submissions enabled", "Emergency master switch for every application type. Existing drafts and submitted applications remain accessible when this is off.")}</span></label>${supports("application_type_availability") ? `<label class="checkbox-row"><input id="config-app-judge" type="checkbox" ${config.configuration.application_open_by_type?.judge !== false ? "checked" : ""}><span>Reviewer applications open</span></label><label class="checkbox-row"><input id="config-app-mod" type="checkbox" ${config.configuration.application_open_by_type?.mod !== false ? "checked" : ""}><span>Mod applications open</span></label>` : '<p class="inline-warning">Deploy Avenue Guard API v6 to manage each application type independently.</p>'}<button class="button primary" data-action="config-save">Save configuration</button></div></details>` : ""}
    ${config && supports("punishment_appeals") ? `<details class="admin-disclosure"><summary>Punishment appeal availability</summary><div class="form-grid compact-form"><label class="checkbox-row"><input id="config-appeals" type="checkbox" ${config.configuration.appeals_open !== false ? "checked" : ""}><span>${conceptLabel("Punishment appeals open", "Controls new appeal drafts and submissions independently from staff recruitment. Existing appeals and private messages remain accessible.")}</span></label><button class="button primary" data-action="config-save">Save configuration</button></div></details>` : ""}
    <details class="admin-disclosure danger-zone"><summary>Recovery actions</summary><p class="muted">Use only after inspecting the relevant incident or worker state. Every action is audited.</p><div class="toolbar">${data.available_actions.map((action) => `<button class="button secondary" data-system-action="${esc(action)}">${esc(titleCase(action))}</button>`).join("")}</div></details>`;
}

async function renderPPS() {
  const data = await api("/api/staff/pps");
  const dashboard = data.dashboard || {};
  const lab = data.statistics_lab || {};
  const models = lab.models?.models || [];
  const pct = (value) => value == null ? "—" : `${Math.round(Number(value) * 100)}%`;
  const globalModels = models.filter((item) => item.subgroup_key === "global");
  const accessGlobal = globalModels.find((item) => item.model_key === "access_model_v1");
  if (accessGlobal) globalModels.push({
    ...accessGlobal,
    model_key: "capacity_model_v1",
    posterior_mean: null,
    intervals: {},
    capacity_summary: true,
    reason: accessGlobal.status === "active"
      ? "Posterior predictive capacity forecasts are active."
      : "Capacity remains in shadow mode with the access model."
  });
  const subgroupModels = models.filter((item) => item.subgroup_key !== "global");
  const posterior = (item) => `<div class="list-row model-row"><div><strong>${esc(titleCase(item.model_key.replace("_v1", "")))} ${item.subgroup_key === "global" ? "" : `· ${esc(titleCase(item.subgroup_key))}`}</strong><small>${item.capacity_summary ? esc(item.reason) : `${item.observations} eligible observations · ${item.successes} successes · ${esc(titleCase(item.evidence_strength))} evidence`}</small></div><div class="model-result">${pill(item.status, item.status === "active" ? "success" : item.status === "degraded" || item.status === "paused" ? "warning" : "")}${item.capacity_summary ? '<strong>Forecast</strong><small>K80 · K90 · K95</small>' : `<strong>${pct(item.posterior_mean)}</strong><small>90% ${pct(item.intervals?.["90"]?.[0])}–${pct(item.intervals?.["90"]?.[1])}</small>`}</div></div>`;
  return `<div class="panel-head"><div><h2>${conceptLabel("Priority Point System", conceptHelp.pps)}</h2><p class="muted">Deterministic queue operations with a separate, non-ranking Statistics Lab.</p></div><div class="toolbar"><button class="button secondary" data-action="pps-recompute">Refresh models</button><button class="button primary" data-action="pps-cycle">Manage cycle</button></div></div>
    <div class="system-status-line">${countMetric("Queue entries", dashboard.active_queue || 0)}${countMetric("Complete scores", dashboard.scored || 0)}${countMetric("CP pending", dashboard.cp_pending || 0)}${countMetric("Outcome window", `${Math.round(data.outcome_window_seconds / 86400)} days`)}</div>
    <section class="section-block pps-lab"><div class="panel-head"><div><p class="eyebrow">PPS · Statistics Lab</p><h2>Evidence models</h2><p class="muted">Model outputs are observational. They never alter review decisions, queue scores, or outreach actions.</p></div></div>
      <div class="model-grid">${globalModels.map(posterior).join("") || '<p class="muted">The first model snapshot has not been generated yet.</p>'}</div>
      <details class="admin-disclosure" open><summary>Posteriors and subgroup shrinkage</summary><div class="diagnostic-body">${subgroupModels.map(posterior).join("") || '<p class="muted">No eligible route or tier subgroup evidence yet.</p>'}</div></details>
      <details class="admin-disclosure"><summary>Calibration</summary><div class="diagnostic-body">${globalModels.map((item) => `<div class="metric-line"><span>${esc(titleCase(item.model_key.replace("_v1", "")))}</span><strong>${item.calibration?.count || 0} resolved · Brier ${item.calibration?.brier == null ? "—" : Number(item.calibration.brier).toFixed(3)} · ECE ${item.calibration?.ece == null ? "—" : Number(item.calibration.ece).toFixed(3)}</strong></div>${(item.calibration?.bins || []).filter((bin) => bin.count).map((bin) => `<div class="metric-line calibration-bin"><span>${Math.round(bin.lower * 100)}–${Math.round(bin.upper * 100)}% · n=${bin.count}</span><strong>predicted ${pct(bin.mean_prediction)} · observed ${pct(bin.observed_rate)}</strong></div>`).join("")}`).join("") || '<p class="muted">No resolved predictions yet.</p>'}${lab.predictions?.length ? `<p class="muted">${lab.predictions.length} recent immutable prediction snapshots are available for model debugging.</p>` : ""}</div></details>
      <details class="admin-disclosure" open><summary>Capacity simulator</summary><div class="diagnostic-body"><p class="muted">Simulation only. Route subgroups fall back to the pooled model until independently ready.</p><div class="capacity-route-grid">${["direct","network","stream","event","other"].map((route) => `<label class="filter-field"><span>${esc(titleCase(route))}</span><input id="pps-capacity-${route}" type="number" min="0" max="10000" value="${route === "direct" ? 20 : 0}"></label>`).join("")}</div><button class="button secondary" data-action="pps-capacity">Run posterior forecast</button>${lab.capacity_forecasts?.length ? `<div class="metric-line"><span>Latest cycle forecast for ${lab.capacity_forecasts[0].queue_size}</span><strong>Expected ${Number(lab.capacity_forecasts[0].expected_successes).toFixed(2)} · K80 ${lab.capacity_forecasts[0].k80} · K90 ${lab.capacity_forecasts[0].k90} · K95 ${lab.capacity_forecasts[0].k95}${lab.capacity_forecasts[0].actual_submissions == null ? "" : ` · actual ${lab.capacity_forecasts[0].actual_submissions}`}</strong></div>` : '<p class="muted">No outreach cycle forecast has been recorded yet.</p>'}</div></details>
      <details class="admin-disclosure"><summary>Network eras</summary><div class="diagnostic-body"><div class="toolbar">${lab.can_manage_models ? '<button class="button secondary" data-action="pps-new-era">Start new era</button><button class="button secondary" data-action="pps-model-control">Pause or resume publication</button>' : ""}</div>${(lab.network_eras || []).map((era) => `<div class="list-row"><div><strong>${esc(era.name)}</strong><small>${fmtTime(era.started_ts)} · prior ${esc(era.prior_mode)} n=${era.carryover_effective_n}</small></div>${pill(era.status, era.status === "active" ? "success" : "")}</div>`).join("") || '<p class="muted">No era has been initialized.</p>'}</div></details>
      <details class="admin-disclosure"><summary>Exclusions and delivery health</summary><div class="diagnostic-body">${lab.can_manage_models ? '<button class="button secondary" data-action="pps-exclusion">Add audited exclusion</button>' : ""}${(lab.exclusions || []).map((item) => `<div class="list-row"><div><strong>${esc(titleCase(item.reason_code))}</strong><small>${esc(item.entity_type)} ${esc(item.entity_id)} · ${esc(item.model_key)}</small></div><div>${pill(item.active ? "active" : "revoked", item.active ? "warning" : "")}${item.active && lab.can_manage_models ? `<button class="button small secondary" data-revoke-exclusion="${item.id}">Revoke</button>` : ""}</div></div>`).join("") || '<p class="muted">No model exclusions recorded.</p>'}${(lab.notification_health || []).map((item) => `<div class="metric-line"><span>Notification ${esc(titleCase(item.status))}</span><strong>${item.c}</strong></div>`).join("")}</div></details>
    </section>`;
}

async function renderAudit() {
  const data = await api("/api/staff/audit");
  return `<div class="toolbar"><label class="filter-field"><span>${conceptLabel("Actor", "The staff Discord identity that performed the operation.")}</span><input id="audit-actor" placeholder="Discord ID"></label><label class="filter-field"><span>${conceptLabel("Action", "The durable workflow event name recorded by Avenue Guard.")}</span><input id="audit-action" placeholder="Event name"></label><label class="filter-field"><span>${conceptLabel("Entity", "The internal record or workflow identity affected by the event.")}</span><input id="audit-entity" placeholder="Record reference"></label><button class="button secondary" data-action="audit-apply">Filter</button></div>${data.items.length ? `<table class="data-table"><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Actor</th></tr></thead><tbody>${data.items.map((item) => `<tr><td data-label="When">${fmtTime(item.created_ts)}</td><td data-label="Action">${esc(titleCase(item.event))}</td><td data-label="Entity">${esc(item.entity_id)}</td><td data-label="Actor">${esc(item.actor_id ? identityLabel(item.actor, item.actor_id) : "System")}</td></tr>`).join("")}</tbody></table>` : empty("No audit events match")}`;
}

const renderers = {
  overview: renderOverview, "my-work": renderMyWork, queue: renderQueue, outreach: renderOutreach,
  tasks: renderTasks, notes: renderNotes, "team-overview": renderTeamOverview, statistics: renderStatistics,
  "review-qa": renderQA, applications: renderApplications, staff: renderStaff, operations: renderOperations, pps: renderPPS,
  requests: renderRequestsAdmin, community: renderCommunity, "admin-staff": renderStaff, system: renderSystem,
  audit: renderAudit,
};

function openDrawer(eyebrow, title, html) {
  helpTooltips.close();
  const drawer = $("#detail-drawer");
  state.drawerReturnFocus = document.activeElement?.offsetParent !== null ? document.activeElement : $("#profile-button");
  drawer.dataset.inspector = String(eyebrow || "detail").toLowerCase().replace(/\s+inspector$/, "").replace(/[^a-z0-9]+/g, "-");
  $("#detail-eyebrow").textContent = eyebrow;
  $("#detail-title").textContent = title;
  $("#drawer-content").innerHTML = html;
  drawer.inert = false;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  $("#drawer-scrim").hidden = false;
  document.body.classList.add("drawer-open");
  $("#drawer-close").focus();
}

function closeDrawer() {
  const drawer = $("#detail-drawer");
  helpTooltips.closeWithin(drawer);
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  drawer.inert = true;
  $("#drawer-scrim").hidden = true;
  document.body.classList.remove("drawer-open");
  document.querySelectorAll(".is-selected").forEach((item) => item.classList.remove("is-selected"));
  if (state.drawerReturnFocus instanceof HTMLElement) state.drawerReturnFocus.focus();
  state.drawerReturnFocus = null;
}

async function actionDialog({ title, description, fields = [], confirm = "Confirm", danger = false, showCancel = true, onReady, run }) {
  const dialog = $("#action-dialog");
  if (state.dialogCleanup) state.dialogCleanup();
  state.returnFocus = document.activeElement?.offsetParent !== null
    ? document.activeElement
    : $("#profile-button");
  state.dialogSubmitting = false;
  $("#dialog-title").textContent = title;
  $("#dialog-description").textContent = description || "";
  $("#dialog-error").hidden = true;
  $("#dialog-submit").textContent = confirm;
  $("#dialog-submit").className = `button ${danger ? "danger" : "primary"}`;
  $("#dialog-cancel").hidden = !showCancel;
  $("#dialog-fields").innerHTML = fields.map((field) => {
    const required = field.required ? '<span class="required-marker" aria-hidden="true">*</span>' : "";
    const describedBy = `${field.name}-error`;
    const label = `<span class="field-label">${esc(field.label)}${required}${field.help ? helpTip(field.help, field.label) : ""}</span>`;
    if (field.type === "display") return `<div class="profile-detail"><small>${esc(field.label)}</small><strong class="${field.monospace ? "secondary-id" : ""}">${esc(field.value || "Not available")}</strong></div>`;
    if (field.type === "checkbox") return `<div data-field-wrapper="${esc(field.name)}"><label class="checkbox-row"><input name="${esc(field.name)}" type="checkbox" ${field.checked ? "checked" : ""} ${field.disabled ? "disabled" : ""}> <span>${esc(field.label)}${field.help ? helpTip(field.help, field.label) : ""}</span></label><small id="${esc(describedBy)}" class="field-error" data-field-error="${esc(field.name)}" hidden></small></div>`;
    if (field.type === "select") return `<label data-field-wrapper="${esc(field.name)}">${label}<select name="${esc(field.name)}" aria-describedby="${esc(describedBy)}">${field.options.map(([value,optionLabel]) => `<option value="${esc(value)}" ${String(field.value ?? "") === String(value) ? "selected" : ""}>${esc(optionLabel)}</option>`).join("")}</select><small id="${esc(describedBy)}" class="field-error" data-field-error="${esc(field.name)}" hidden></small></label>`;
    if (field.type === "staff") {
      const listId = `${field.name}-staff-options`;
      return `<label data-field-wrapper="${esc(field.name)}">${label}<input name="${esc(field.name)}" type="text" inputmode="numeric" autocomplete="off" list="${esc(listId)}" placeholder="Search the staff team" value="${esc(field.value || "")}" aria-describedby="${esc(describedBy)}"><datalist id="${esc(listId)}">${field.options.map(([value, optionLabel]) => `<option value="${esc(value)}" label="${esc(optionLabel)}"></option>`).join("")}</datalist><small class="field-help">Start typing a staff name, role, or Discord ID, then choose a result.</small><small id="${esc(describedBy)}" class="field-error" data-field-error="${esc(field.name)}" hidden></small></label>`;
    }
    const element = field.type === "textarea" ? "textarea" : "input";
    if (element === "textarea") return `<label data-field-wrapper="${esc(field.name)}">${label}<textarea name="${esc(field.name)}" aria-describedby="${esc(describedBy)}">${esc(field.value || "")}</textarea><small id="${esc(describedBy)}" class="field-error" data-field-error="${esc(field.name)}" hidden></small></label>`;
    return `<label data-field-wrapper="${esc(field.name)}">${label}<input name="${esc(field.name)}" type="${esc(field.type || "text")}" inputmode="${field.discordId ? "numeric" : "text"}" value="${esc(field.value || "")}" ${field.min !== undefined ? `min="${field.min}"` : ""} aria-describedby="${esc(describedBy)}"><small id="${esc(describedBy)}" class="field-error" data-field-error="${esc(field.name)}" hidden></small></label>`;
  }).join("");
  dialog.showModal();
  document.body.classList.add("modal-open");
  const form = $("#action-form");
  const closeDialog = () => {
    if (state.dialogSubmitting) return;
    helpTooltips.closeWithin(dialog);
    dialog.close();
    cleanup();
  };
  const validate = () => {
    let valid = true;
    for (const field of fields) {
      const control = form.elements[field.name];
      const error = $(`[data-field-error="${CSS.escape(field.name)}"]`, form);
      if (!control || !error || control.disabled) continue;
      let message = "";
      if (field.required && field.type === "checkbox" && !control.checked) message = "Confirmation is required.";
      else if (field.required && !String(control.value || "").trim()) message = `${field.label.replace(/\s*\(.+\)$/, "")} is required.`;
      else if (field.discordId && control.value && !/^\d{16,20}$/.test(String(control.value).trim())) message = "Enter the full Discord ID using digits only.";
      error.textContent = message;
      error.hidden = !message;
      control.setAttribute("aria-invalid", String(Boolean(message)));
      if (message) valid = false;
    }
    return valid;
  };
  const onSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    const data = Object.fromEntries(new FormData(form));
    for (const field of fields.filter((item) => item.type === "checkbox")) data[field.name] = Boolean(form.elements[field.name].checked);
    state.dialogSubmitting = true;
    $("#dialog-submit").disabled = true;
    $("#dialog-cancel").disabled = true;
    $("#dialog-close").disabled = true;
    try {
      await run(data);
      state.dialogSubmitting = false;
      helpTooltips.closeWithin(dialog);
      dialog.close();
      cleanup();
      if ($("#detail-drawer").classList.contains("open")) closeDrawer();
      showNotice("Action completed");
      await render();
    }
    catch (error) { $("#dialog-error").textContent = error.message; $("#dialog-error").hidden = false; }
    finally { state.dialogSubmitting = false; $("#dialog-submit").disabled = false; $("#dialog-cancel").disabled = false; $("#dialog-close").disabled = false; }
  };
  const onCancel = (event) => {
    event.preventDefault();
    if (helpTooltips.consumeParentCancel(dialog)) return;
    closeDialog();
  };
  const onClick = (event) => {
    if (!danger && event.target === dialog) closeDialog();
  };
  const onKeydown = (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...form.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]')].filter((node) => node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const readyCleanup = typeof onReady === "function" ? onReady(form) : null;
  const cleanup = () => {
    helpTooltips.closeWithin(dialog);
    form.removeEventListener("submit", onSubmit);
    dialog.removeEventListener("cancel", onCancel);
    dialog.removeEventListener("click", onClick);
    dialog.removeEventListener("keydown", onKeydown);
    $("#dialog-close").removeEventListener("click", closeDialog);
    $("#dialog-cancel").removeEventListener("click", closeDialog);
    document.body.classList.remove("modal-open");
    if (typeof readyCleanup === "function") readyCleanup();
    state.dialogCleanup = null;
    if (state.returnFocus instanceof HTMLElement) state.returnFocus.focus();
    state.returnFocus = null;
  };
  state.dialogCleanup = cleanup;
  form.addEventListener("submit", onSubmit);
  dialog.addEventListener("cancel", onCancel);
  dialog.addEventListener("click", onClick);
  dialog.addEventListener("keydown", onKeydown);
  $("#dialog-close").addEventListener("click", closeDialog);
  $("#dialog-cancel").addEventListener("click", closeDialog);
  const first = form.querySelector("input, select, textarea, button");
  window.setTimeout(() => first?.focus(), 0);
}

async function queueAction(action, id) {
  if (action === "claim") return api(`/api/staff/queue/${id}/claim`, { method: "POST", body: {} }).then(() => { showNotice("Claimed"); return openQueue(id); });
  if (action === "retry-cp") {
    showNotice("Checking GDBrowser, Boomlings, GDHistory and GDRate+…");
    return api(`/api/staff/queue/${id}/retry-cp`, { method: "POST", body: {} }).then((result) => {
      showNotice(result.resolution?.resolved ? `Creator Points resolved: ${result.resolution.creator_points}` : "Could not resolve yet. Automatic retry remains scheduled.");
      return openQueue(id);
    }).catch((error) => showNotice(error.message, true));
  }
  if (action === "release") return actionDialog({ title: "Release claim", description: "The level will become available to other staff.", fields: [{ name: "reason", label: "Reason (required for another staff member)", type: "textarea" }], confirm: "Release", run: (body) => api(`/api/staff/queue/${id}/release`, { method: "POST", body }) });
  if (action === "reassign") {
    try {
      const options = await staffAssigneeOptions();
      return actionDialog({ title: "Reassign claim", description: "Responsibility moves to the selected active staff member and the change is audited.", fields: [{ name: "assignee_id", label: "New assignee", type: "staff", options, discordId: true, required: true, help: "Only active members of the GD Avenue staff team can receive a queue claim." }, { name: "reason", label: "Reason", type: "textarea", required: true }], confirm: "Reassign", run: (body) => api(`/api/staff/queue/${id}/reassign`, { method: "POST", body }) });
    } catch (error) {
      return showNotice(error.message, true);
    }
  }
  if (action === "outreach") return outreachDialog(id);
  if (action === "state") return actionDialog({ title: "Change queue state", description: "This transition is durable and audited.", fields: [{ name: "state", label: "New state", type: "select", options: (can("pps.override") ? ["queued","paused","withdrawn","invalid","in_cycle","awaiting_outcome","rated"] : ["queued","paused","withdrawn"]).map((value) => [value,titleCase(value)]) }, { name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this queue state change", type: "checkbox" }], run: (body) => api(`/api/staff/queue/${id}/state`, { method: "POST", body }) });
  if (action === "requeue") return actionDialog({ title: "Start a new outreach episode", description: "Previous outreach history remains intact and W resets to zero.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this new outreach episode", type: "checkbox" }], confirm: "Start episode", run: (body) => api(`/api/staff/queue/${id}/requeue`, { method: "POST", body }) });
  if (action === "rereview") return actionDialog({ title: "Request material-update re-review", description: "Marks the level for a fresh human review without resetting waiting history or changing its recommendation.", fields: [{ name: "reason", label: "What materially changed?", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this re-review request", type: "checkbox", required: true }], confirm: "Request re-review", run: (body) => api(`/api/staff/queue/${id}/rereview`, { method: "POST", body }) });
  if (action === "tier") return actionDialog({ title: "Adjust recommendation tier", description: "The original recommendation remains in QA history and PPS is recalculated.", fields: [{ name: "tier", label: "New tier", type: "select", options: ["rate","feature","epic","legendary","mythic"].map((value) => [value,titleCase(value)]) }, { name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this tier adjustment", type: "checkbox" }], run: (body) => api(`/api/staff/queue/${id}/tier`, { method: "POST", body }) });
  if (["hide", "restore"].includes(action) && !supports("hidden_queue_entries")) return showNotice("Deploy the matching Avenue Guard API before changing hidden levels", true);
  if (action === "hide") return actionDialog({ title: "Hide level", description: "The level will disappear from public and staff workflows until a Dev restores it. Its audit history remains intact.", danger: true, fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this level should be hidden", type: "checkbox", required: true }], confirm: "Hide level", run: (body) => api(`/api/staff/queue/${id}/hide`, { method: "POST", body }) });
  if (action === "restore") return actionDialog({ title: "Restore hidden level", description: "The level returns to the lifecycle state it had before it was hidden.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this level should be restored", type: "checkbox", required: true }], confirm: "Restore level", run: (body) => api(`/api/staff/queue/${id}/restore`, { method: "POST", body }) });
}

async function newTaskDialog() {
  try {
    const canAssign = can("tasks.assign");
    const assigneeOptions = canAssign ? await staffAssigneeOptions() : [];
    const fields = [
      { name: "title", label: "Title", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "priority", label: "Priority", type: "select", options: ["low","normal","high","urgent"].map((value) => [value,titleCase(value)]) },
      { name: "task_type", label: "Type", type: "select", help: "Personal tasks belong to you, assigned tasks belong to one selected staff member, and team tasks belong to every active staff member.", options: [["personal","Personal"],...(canAssign ? [["assigned","Assigned"],["team","Team"]] : [])] },
      ...(canAssign ? [{ name: "assignee_id", label: "Assignee", type: "staff", options: assigneeOptions, discordId: true, required: true, help: "Search the active GD Avenue staff directory. This is required only for assigned tasks." }] : []),
      { name: "due_at", label: "Due date", type: "datetime-local" },
      { name: "linked_entity_type", label: "Linked record", type: "select", help: conceptHelp.linkedEntity, options: [["","None"],["level","Level queue entry"],["application","Staff application"],["task","Staff task"]] },
      { name: "linked_entity_id", label: "Linked record ID", help: conceptHelp.linkedEntityId },
    ];
    return actionDialog({
      title: "Create task",
      description: "Avenue Guard will DM every included staff member with the title, description, and due date, including you for a personal task.",
      fields,
      onReady: (form) => {
        const taskType = form.elements.task_type;
        const assignee = form.elements.assignee_id;
        const assigneeWrapper = form.querySelector('[data-field-wrapper="assignee_id"]');
        const linkedType = form.elements.linked_entity_type;
        const linkedId = form.elements.linked_entity_id;
        const linkedIdWrapper = form.querySelector('[data-field-wrapper="linked_entity_id"]');
        const sync = () => {
          if (assignee && assigneeWrapper) {
            const assigned = taskType.value === "assigned";
            assigneeWrapper.hidden = !assigned;
            assignee.disabled = !assigned;
            if (!assigned) assignee.value = "";
          }
          if (linkedId && linkedIdWrapper) {
            const linked = Boolean(linkedType.value);
            linkedIdWrapper.hidden = !linked;
            linkedId.disabled = !linked;
            if (!linked) linkedId.value = "";
          }
        };
        taskType.addEventListener("change", sync);
        linkedType.addEventListener("change", sync);
        sync();
        return () => {
          taskType.removeEventListener("change", sync);
          linkedType.removeEventListener("change", sync);
        };
      },
      run: (body) => api("/api/staff/tasks", { method: "POST", body: { ...body, due_ts: body.due_at ? Math.floor(new Date(body.due_at).getTime() / 1000) : null } }),
    });
  } catch (error) {
    return showNotice(error.message, true);
  }
}

function outreachDialog(queueId = "") {
  return actionDialog({ title: "Record outreach", description: "Targets and notes are private. Confirmed submission means the level actually reached a GD moderator.", fields: [
    { name: "queue_id", label: "Queue ID", type: "number", value: queueId, min: 1, required: true, help: "The internal Avenue queue entry for this level." },
    { name: "route", label: "Route", type: "select", help: "How you are trying to reach a Geometry Dash moderator.", options: ["direct","network","stream","event","other"].map((v) => [v,titleCase(v)]) },
    { name: "event", label: "Event", type: "select", help: "What happened during this outreach step. A confirmed submission means the level actually reached a moderator.", options: ["planned","attempted","failed","submitted_to_mod","follow_up"].map((v) => [v,titleCase(v)]) },
    { name: "target", label: "Private target", type: "text", help: "The moderator or contact you are trying to reach. This is never shown publicly." },
    { name: "notes", label: "Private notes", type: "textarea" },
    { name: "confirmed", label: "I confirm that a submitted_to_mod event reached a moderator", type: "checkbox" },
  ], run: (body) => api("/api/staff/outreach", { method: "POST", body: { ...body, queue_id: Number(body.queue_id), timestamp: Math.floor(Date.now() / 1000) } }) });
}

function profileDialog(editNickname = false) {
  const user = state.user;
  const identity = `<div class="profile-hero">${user.avatar_url ? `<img src="${esc(user.avatar_url)}" alt="" width="72" height="72">` : ""}<div>${pill(user.role_label || roleLabel(user.role))}</div></div>
    <div class="profile-detail"><small>Display name</small><strong>${esc(user.display_name)}</strong></div>
    <div class="profile-detail"><small>Discord username</small><strong>${esc(user.username || "Not available")}</strong></div>
    <div class="profile-detail"><small>Exact Discord ID</small><span><strong class="secondary-id">${esc(exactId(user.id))}</strong>${copyButton(user.id)}</span></div>`;
  const nickname = `<form id="profile-nickname-form" class="drawer-section form-grid"><label>Portal nickname<input name="portal_nickname" value="${esc(user.portal_nickname || "")}" maxlength="64"></label><p class="muted">This affects the staff portal only. Your Discord nickname is unchanged.</p><button class="button primary" type="submit">Save nickname</button></form>`;
  openDrawer("Personal profile", editNickname ? "Edit portal nickname" : "My staff profile", `${identity}${editNickname ? nickname : `<section class="drawer-section"><button class="button secondary" data-profile-action="nickname">Edit portal nickname</button></section>`}`);
}

function requestAdminDialog(action, scheduled = null) {
  const common = { name: "confirmed", label: "I confirm this request-system action", type: "checkbox", required: true };
  if (["open", "schedule", "edit_scheduled"].includes(action)) {
    const fields = [
      { name: "request_limit", label: "Request limit (blank for none)", type: "number", min: 1, value: scheduled?.request_limit || "" },
      { name: "close_minutes", label: "Minutes until close (blank for none)", type: "number", min: 1, value: scheduled?.close_minutes || "" },
      { name: "request_type", label: "Request type", type: "select", value: scheduled?.request_type || "any", options: [["any","Any"],["needs_showcase","Needs showcase"],["only_demons","Only demons"],["only_plats","Only platformers"],["only_classic","Only classic"],["only_classic_non_demons","Classic non-demons"],["only_plats_non_demons","Platformer non-demons"],["long_level","Long or XL"]] },
      { name: "open_message", label: "Opening announcement (blank for default)", type: "textarea", value: scheduled?.open_message || "" },
    ];
    if (action !== "open") fields.unshift({ name: "open_at", label: "Opening date and time", type: "datetime-local", value: localDateTimeValue(scheduled?.open_ts), required: true });
    fields.push({ name: "reason", label: "Audit note", type: "textarea" }, common);
    return actionDialog({ title: action === "open" ? "Open requests" : action === "edit_scheduled" ? "Edit scheduled opening" : "Schedule request opening", description: "This uses Avenue Guard's live request-wave service and preserves the current review-system version.", fields, confirm: action === "open" ? "Open requests" : action === "edit_scheduled" ? "Save opening" : "Schedule", run: (body) => api("/api/staff/requests", { method: "POST", body: { ...body, action, opening_id: scheduled?.id, request_type: body.request_type || scheduled?.request_type || "any", open_ts: body.open_at ? Math.floor(new Date(body.open_at).getTime() / 1000) : undefined } }) });
  }
  return actionDialog({ title: titleCase(action), description: "This updates the same durable request state used by Discord commands.", fields: [{ name: "reason", label: "Audit note", type: "textarea" }, common], danger: action === "close", run: (body) => api("/api/staff/requests", { method: "POST", body: { ...body, action } }) });
}

async function showIncident(fingerprint) {
  try {
    const data = await api(`/api/staff/operations/incidents/${encodeURIComponent(fingerprint)}`);
    const item = data.incident;
    return actionDialog({ title: `${item.error_type} incident`, description: `${item.component} | ${item.occurrence_count} occurrence${item.occurrence_count === 1 ? "" : "s"}`, fields: [], confirm: "Close", run: async () => {}, danger: false }).then(() => {
      $("#dialog-fields").innerHTML = `<div class="incident-meta"><span>First seen</span><strong>${fmtTime(item.first_seen_ts)}</strong><span>Last seen</span><strong>${fmtTime(item.last_seen_ts)}</strong><span>${conceptLabel("Correlation ID", conceptHelp.correlation)}</span><code>${esc(item.correlation_id || "Not recorded")}</code></div><pre class="trace-block">${esc(item.trace)}</pre>`;
      $("#dialog-submit").textContent = "Close";
    });
  } catch (error) {
    showNotice(error.message, true);
  }
}

function showAuth(message = "Use Discord to verify your current server role and continue.") {
  $("#app").hidden = true;
  $("#auth-gate").hidden = false;
  $("#auth-message").textContent = message;
}

function applySession(data) {
  state.user = data.user;
  state.apiVersion = Number(data.api?.version || 0);
  state.apiFeatures = new Set(data.api?.features || []);
  state.viewMode = data.view_mode || state.viewMode;
  const control = $("#view-mode-control");
  const select = $("#view-mode-select");
  if (supports("view_role_preview") && state.viewMode?.roles?.length) {
    control.hidden = false;
    select.disabled = false;
    select.innerHTML = `<option value="">Actual Dev access</option>${state.viewMode.roles.filter((item) => item.key !== "dev").map((item) => `<option value="${esc(item.key)}" ${state.viewRole === item.key ? "selected" : ""}>${esc(item.label)}</option>`).join("")}`;
  } else if (can("developer.access")) {
    control.hidden = false;
    select.disabled = true;
    select.innerHTML = '<option>Role preview requires Avenue Guard update</option>';
  } else {
    control.hidden = true;
  }
  const banner = $("#view-mode-banner");
  banner.hidden = !state.viewRole;
  banner.textContent = state.viewRole ? `Read-only Dev preview: ${roleLabel(state.viewRole)}. Return to actual access to make changes.` : "";
  $("#user-name").textContent = state.user.display_name;
  $("#user-role").textContent = state.user.role_label || roleLabel(state.user.role);
  $("#profile-menu-name").textContent = state.user.display_name;
  $("#profile-menu-identity").textContent = `${state.user.role_label || roleLabel(state.user.role)} · ${exactId(state.user.id)}`;
  $("#user-avatar").src = state.user.avatar_url || "https://cdn.discordapp.com/avatars/1454985687177887866/d268221fd7a7a5529897730d18edd5a0.webp?size=128";
}

function forwardLegacyOAuthCallback() {
  const params = new URLSearchParams(location.search);
  if (!params.has("code") && !params.has("state")) return false;
  const code = params.get("code");
  const oauthState = params.get("state");
  params.delete("code");
  params.delete("state");
  const cleanQuery = params.toString();
  history.replaceState(null, "", `${location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${location.hash}`);
  if (!code || !oauthState) {
    showAuth("This Discord sign-in attempt is incomplete. Please start again.");
    return true;
  }
  const replayKey = "av-staff-oauth-forward";
  if (sessionStorage.getItem(replayKey) === oauthState) return false;
  sessionStorage.setItem(replayKey, oauthState);
  const callback = new URL("/api/auth/callback", location.origin);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", oauthState);
  location.replace(callback.href);
  return true;
}

async function initialize() {
  try {
    const data = await api("/api/staff/session");
    sessionStorage.removeItem("av-staff-oauth-forward");
    applySession(data);
    if (!state.user.staff_access) return showAuth("Your Discord account does not currently have staff portal access.");
    const hash = location.hash.match(/^#(overview|work|team|admin)\/([a-z-]+)$/);
    if (hash) { state.module = hash[1]; state.section = hash[2]; }
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
  const profileAction = event.target.closest("[data-profile-action]");
  if (profileAction) {
    $("#profile-menu").hidden = true;
    $("#profile-button").setAttribute("aria-expanded", "false");
    if (profileAction.dataset.profileAction === "view") return profileDialog(false);
    if (profileAction.dataset.profileAction === "nickname") return profileDialog(true);
    if (profileAction.dataset.profileAction === "identity") return profileDialog(false);
  }
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    await navigator.clipboard.writeText(copy.dataset.copy);
    return showNotice("Copied to clipboard");
  }
  const moduleButton = event.target.closest("[data-module]");
  if (moduleButton) return navigate(moduleButton.dataset.module);
  const sectionButton = event.target.closest("[data-section]");
  if (sectionButton) {
    if (sectionButton.dataset.section === "queue") state.queueQuery = "";
    return navigate(state.module, sectionButton.dataset.section);
  }
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    $("#profile-menu").hidden = true;
    $("#profile-button").setAttribute("aria-expanded", "false");
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
  const quickFilter = event.target.closest("[data-queue-quick]");
  if (quickFilter) {
    const current = new URLSearchParams(state.queueQuery || "limit=50");
    current.set("filter", current.get("filter") === quickFilter.dataset.queueQuick ? "all" : quickFilter.dataset.queueQuick);
    if ($("#queue-search")) current.set("q", $("#queue-search").value);
    if ($("#queue-tier")) current.set("tier", $("#queue-tier").value);
    state.queueQuery = current.toString();
    loading(); try { $("#content").innerHTML = await renderQueue(state.queueQuery); } catch (error) { errorState(error); }
    return;
  }
  const open = event.target.closest("[data-open-queue]");
  if (open) { markSelectedRecord("data-open-queue", open.dataset.openQueue); return openQueue(open.dataset.openQueue); }
  const openApplicationButton = event.target.closest("[data-open-application]");
  if (openApplicationButton) { markSelectedRecord("data-open-application", openApplicationButton.dataset.openApplication); return openApplication(openApplicationButton.dataset.openApplication); }
  const openAppealButton = event.target.closest("[data-open-appeal]");
  if (openAppealButton) { markSelectedRecord("data-open-appeal", openAppealButton.dataset.openAppeal); return openAppeal(openAppealButton.dataset.openAppeal); }
  const openStaffButton = event.target.closest("[data-open-staff]");
  if (openStaffButton) { markSelectedRecord("data-open-staff", openStaffButton.dataset.openStaff); return openStaffInspector(openStaffButton.dataset.openStaff); }
  const openQAButton = event.target.closest("[data-open-qa]");
  if (openQAButton) return openQAInspector(openQAButton.dataset.openQa);
  const openTaskButton = event.target.closest("[data-open-task]");
  if (openTaskButton && !event.target.closest("[data-complete-task]")) return openTaskInspector(openTaskButton.dataset.openTask);
  const queueButton = event.target.closest("[data-queue-action]");
  if (queueButton) return queueAction(queueButton.dataset.queueAction, queueButton.dataset.id);
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "refresh") return render();
  if (action === "queue-apply") {
    const query = new URLSearchParams({ q: $("#queue-search").value, filter: $("#queue-filter").value, tier: $("#queue-tier").value, limit: "50" });
    state.queueQuery = query.toString();
    loading(); try { $("#content").innerHTML = await renderQueue(state.queueQuery); } catch (error) { errorState(error); } return;
  }
  if (action === "application-filter-apply") {
    state.applicationFilters = { type: $("#application-type-filter").value, status: $("#application-status-filter").value, claim: $("#application-claim-filter").value };
    loading(); try { $("#content").innerHTML = await renderApplications(); } catch (error) { errorState(error); } return;
  }
  if (action === "new-outreach") return outreachDialog();
  if (action === "new-task") {
    if (!supports("task_recipient_dm")) return showNotice("Deploy the matching Avenue Guard API before creating tasks", true);
    return newTaskDialog();
  }
  if (action === "add-staff") {
    if (!supports("staff_manual_management")) return showNotice("Deploy the matching Avenue Guard API before using manual staff management", true);
    return actionDialog({ title: "Add staff member", description: "The Discord member receives the selected managed role through Avenue Guard's durable delivery queue and immediately gets a portal profile record.", fields: [{ name: "user_id", label: "Discord user ID", discordId: true, required: true }, { name: "role", label: "Staff role", type: "select", options: [["reviewer","Reviewer"],["head_reviewer","Head Reviewer"],["admin","Admin"],["owner","Owner"]] }, { name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this staff access change", type: "checkbox", required: true }], confirm: "Add staff", run: async (body) => { const result = await api("/api/staff/staff", { method: "POST", body }); state.staffAssignees = null; return result; } });
  }
  if (action === "new-note") return actionDialog({ title: "Create note", description: "Linked records are optional and help staff find context without exposing the note publicly.", fields: [{ name: "scope", label: "Visibility", type: "select", help: "Controls which staff groups can read this internal note.", options: [["private","Private"],["reviewer_team","Reviewer team"],["entity","Entity participants"],...(can("notes.head") ? [["head_judges","Head Reviewers"]] : []),...(can("notes.owner") ? [["owners","Owners"]] : [])] }, { name: "body", label: "Note", type: "textarea", required: true }, { name: "entity_type", label: "Linked record type", help: conceptHelp.linkedEntity }, { name: "entity_id", label: "Linked record ID", help: conceptHelp.linkedEntityId }], run: (body) => api("/api/staff/notes", { method: "POST", body }) });
  if (action === "config-save") {
    const body = { claim_stale_hours: Number($("#config-stale").value), applications_open: $("#config-apps").checked };
    if (supports("application_type_availability")) body.application_open_by_type = { judge: $("#config-app-judge").checked, mod: $("#config-app-mod").checked };
    if (supports("punishment_appeals") && $("#config-appeals")) body.appeals_open = $("#config-appeals").checked;
    return api("/api/staff/configuration", { method: "PATCH", body }).then(() => { showNotice("Configuration saved"); render(); }).catch((error) => showNotice(error.message, true));
  }
  if (action === "audit-apply") {
    const query = new URLSearchParams({ actor: $("#audit-actor").value, action: $("#audit-action").value, entity: $("#audit-entity").value });
    loading(); try { const data = await api(`/api/staff/audit?${query}`); $("#content").innerHTML = `<p class="muted">${data.items.length} matching events. Clear filters with Refresh.</p>` + data.items.map((item) => `<div class="list-row"><div><strong>${esc(titleCase(item.event))}</strong><small>${esc(item.entity_id)}</small></div><small>${fmtTime(item.created_ts)}</small></div>`).join(""); } catch (error) { errorState(error); } return;
  }
  if (action === "pps-cycle") return actionDialog({ title: "Manage PPS", description: "This uses the same PPS service and durable state machine as /pps.", fields: [{ name: "action", label: "Action", type: "select", options: [["start_cycle","Start cycle"],["complete_cycle","Complete cycle"],["cancel_cycle","Cancel cycle"],["override_cp","Override Creator Points"]] }, { name: "cycle_id", label: "Cycle ID for complete/cancel", type: "number" }, { name: "queue_id", label: "Queue ID for CP override", type: "number" }, { name: "creator_points", label: "Creator Points for override", type: "number" }, { name: "reason", label: "Notes / reason", type: "textarea" }, { name: "confirmed", label: "I confirm this PPS action", type: "checkbox" }], run: (body) => api("/api/staff/pps", { method: "POST", body }) });
  if (action === "pps-recompute") return api("/api/staff/pps", { method: "POST", body: { action: "recompute_models" } }).then(() => { showNotice("Model snapshots refreshed"); render(); }).catch((error) => showNotice(error.message, true));
  if (action === "pps-capacity") {
    const route_composition = Object.fromEntries(["direct","network","stream","event","other"].map((route) => [route, Number($(`#pps-capacity-${route}`)?.value || 0)]));
    const opportunities = Object.values(route_composition).reduce((sum, value) => sum + value, 0);
    return api("/api/staff/pps", { method: "POST", body: { action: "simulate_capacity", opportunities, route_composition } }).then((result) => { const item = result.result; showNotice(`Expected ${Number(item.expected_successes).toFixed(2)} · K80 ${item.k80} · K90 ${item.k90} · K95 ${item.k95}`); }).catch((error) => showNotice(error.message, true));
  }
  if (action === "pps-new-era") return actionDialog({ title: "Start a network era", description: "Closes the current era and begins a new evidence context with the configured weak carryover prior.", fields: [{ name: "name", label: "Public era label", required: true }, { name: "public_reason", label: "Optional public explanation", type: "textarea" }, { name: "reason", label: "Private operational reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this era boundary", type: "checkbox", required: true }], run: (body) => api("/api/staff/pps", { method: "POST", body: { ...body, action: "start_network_era" } }) });
  if (action === "pps-model-control") return actionDialog({ title: "Model publication control", description: "Pause removes public probabilities after recomputation. Resume still requires every automatic safeguard to pass.", fields: [{ name: "action", label: "Action", type: "select", options: [["pause_model","Pause publication"],["resume_model","Resume automatic publication"]] }, { name: "model_key", label: "Model", type: "select", options: [["access_model_v1","Access model"],["rating_model_v1","Rating model"]] }, { name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this publication control", type: "checkbox", required: true }], run: (body) => api("/api/staff/pps", { method: "POST", body }) });
  if (action === "pps-exclusion") return actionDialog({ title: "Add model exclusion", description: "The source record remains intact. This only removes it from the selected statistical evidence set and is audited.", fields: [{ name: "entity_type", label: "Entity", type: "select", options: [["opportunity","Opportunity"],["episode","Episode"]] }, { name: "entity_id", label: "Entity ID", required: true }, { name: "model_key", label: "Model", type: "select", options: [["all","All models"],["access_model_v1","Access model"],["rating_model_v1","Rating model"]] }, { name: "reason_code", label: "Reason code", required: true }, { name: "reason", label: "Detail", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this exclusion", type: "checkbox", required: true }], run: (body) => api("/api/staff/pps", { method: "POST", body: { ...body, action: "add_exclusion" } }) });
  const revokeExclusion = event.target.closest("[data-revoke-exclusion]");
  if (revokeExclusion) return actionDialog({ title: "Revoke model exclusion", description: "The evidence becomes eligible again on the next model refresh. The exclusion and revocation remain in the audit trail.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this revocation", type: "checkbox", required: true }], run: (body) => api("/api/staff/pps", { method: "POST", body: { ...body, action: "revoke_exclusion", exclusion_id: Number(revokeExclusion.dataset.revokeExclusion) } }) });
  const requestAction = event.target.closest("[data-request-action]");
  if (requestAction) return requestAdminDialog(requestAction.dataset.requestAction);
  const editOpening = event.target.closest("[data-edit-opening]");
  if (editOpening) {
    const opening = state.adminRequests?.scheduled?.find((item) => String(item.id) === editOpening.dataset.editOpening);
    if (!opening) return showNotice("That scheduled opening is no longer available", true);
    return requestAdminDialog("edit_scheduled", opening);
  }
  const cancelOpening = event.target.closest("[data-cancel-opening]");
  if (cancelOpening) return actionDialog({ title: "Cancel scheduled opening", description: `Opening #${cancelOpening.dataset.cancelOpening} will no longer run.`, danger: true, fields: [{ name: "reason", label: "Audit note", type: "textarea" }, { name: "confirmed", label: "I confirm this cancellation", type: "checkbox", required: true }], confirm: "Cancel opening", run: (body) => api("/api/staff/requests", { method: "POST", body: { ...body, action: "cancel_scheduled", opening_id: Number(cancelOpening.dataset.cancelOpening) } }) });
  const communityAction = event.target.closest("[data-community-action]");
  if (communityAction) return actionDialog({ title: titleCase(communityAction.dataset.communityAction), description: "This changes the current tracking week's reward state.", fields: [{ name: "confirmed", label: "I confirm this tracking change", type: "checkbox", required: true }], run: (body) => api("/api/staff/community", { method: "POST", body: { ...body, action: communityAction.dataset.communityAction } }) });
  const systemAction = event.target.closest("[data-system-action]");
  if (systemAction) return actionDialog({ title: titleCase(systemAction.dataset.systemAction), description: "This recovery action runs inside Avenue Guard and is fully audited.", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this recovery action", type: "checkbox", required: true }], confirm: "Run action", run: (body) => api("/api/staff/system", { method: "POST", body: { ...body, action: systemAction.dataset.systemAction } }) });
  const incident = event.target.closest("[data-incident]");
  if (incident) return showIncident(incident.dataset.incident);
  const complete = event.target.closest("[data-complete-task]");
  if (complete) return api(`/api/staff/tasks/${complete.dataset.completeTask}`, { method: "PATCH", body: { status: "done" } }).then(() => { showNotice("Task completed"); return render(); }).catch((error) => showNotice(error.message, true));
  const qa = event.target.closest("[data-qa]");
  if (qa) return actionDialog({ title: "Review QA action", description: "Tier adjustments require a reason and confirmation. They remain auditable and preserve the original tier.", fields: [{ name: "action", label: "Outcome", type: "select", options: [["ok","Reviewed OK"],["discussion","Needs discussion"],["rereview","Re-review requested"],["adjust","Adjust recommendation tier"]] }, { name: "tier", label: "Tier (used only for adjustment)", type: "select", options: ["rate","feature","epic","legendary","mythic"].map((value) => [value,titleCase(value)]) }, { name: "reason", label: "Reason", type: "textarea" }, { name: "confirmed", label: "I confirm this tier adjustment when selected", type: "checkbox" }], run: (body) => api(`/api/staff/qa/${qa.dataset.qa}`, { method: "POST", body }) });
  const interviewOutcome = event.target.closest("[data-interview-outcome]");
  if (interviewOutcome) return actionDialog({
    title: "Record interview outcome",
    description: "Document what the interview clarified. This private record resolves any open rubric calibration but does not decide the application by itself.",
    fields: [
      { name: "notes", label: "Interview outcome notes", type: "textarea", required: true },
      { name: "recommendation", label: "Current recommendation", type: "select", options: [["hold","Hold"],["accept","Accept"],["reject","Reject"]] },
      { name: "confirmed", label: "I confirm the interview is complete", type: "checkbox", required: true },
    ],
    confirm: "Complete interview",
    run: (body) => api(`/api/staff/applications/${interviewOutcome.dataset.applicationId}/interview`, { method: "POST", body: { ...body, interview_id: Number(interviewOutcome.dataset.interviewOutcome) } }),
  });
  const appealAction = event.target.closest("[data-appeal-action]");
  if (appealAction) {
    const action = appealAction.dataset.appealAction;
    const id = appealAction.dataset.id;
    const appeal = state.appeals.find((item) => String(item.id) === String(id));
    if (!appeal) return showNotice("That appeal is no longer available", true);
    if (action === "assess") {
      const current = (appeal.assessments || []).find((item) => exactId(item.reviewer_id) === exactId(state.user.id));
      const dimensions = [
        ["factual_accuracy", "Factual accuracy"], ["rule_applicability", "Rule applicability"],
        ["proportionality", "Proportionality"], ["consistency", "Comparable-case consistency"],
        ["new_evidence", "New evidence"], ["current_risk", "Current community risk"],
      ];
      return actionDialog({
        title: current ? "Update appeal assessment" : "Add appeal assessment",
        description: "Record evidence for each fairness dimension. Avenue Guard does not calculate a credibility or personality score.",
        fields: [
          ...dimensions.map(([key, label]) => ({ name: key, label, type: "textarea", value: current?.findings?.[key] || "", required: true })),
          { name: "recommendation", label: "Recommendation", type: "select", value: current?.recommendation || "upheld", options: [["upheld","Uphold"],["reduced","Reduce"],["removed","Remove"],["record_corrected","Correct record"],["returned_for_reconsideration","Return for reconsideration"],["ineligible","Ineligible"],["duplicate","Duplicate"]] },
          { name: "rationale", label: "Assessment rationale", type: "textarea", value: current?.rationale || "", required: true },
        ],
        confirm: "Save assessment",
        run: (body) => {
          const findings = Object.fromEntries(dimensions.map(([key]) => [key, body[key]]));
          return api(`/api/staff/appeals/${id}/assessment`, { method: "POST", body: { findings, recommendation: body.recommendation, rationale: body.rationale } });
        },
      });
    }
    if (action === "message" || action === "request_information") return actionDialog({
      title: action === "message" ? "Message applicant" : "Request more information",
      description: "The message is always saved in the secure appeal portal. Discord DM delivery is optional and may fail when Avenue Guard cannot contact the user.",
      fields: [{ name: "body", label: "Message", type: "textarea", required: true }, { name: "notify_dm", label: "Also try to send a Discord DM", type: "checkbox", checked: true }],
      confirm: "Send message",
      run: (body) => api(`/api/staff/appeals/${id}/${action === "message" ? "message" : "action"}`, { method: "POST", body: action === "message" ? body : { ...body, action } }),
    });
    if (action === "decide") return actionDialog({
      title: "Decide punishment appeal",
      description: "Two independent non-conflicted assessments are required. Avenue Guard can remove a verified ban, timeout, or configured restriction role. Applicant-reported records require manual verification.",
      fields: [
        { name: "outcome", label: "Outcome", type: "select", options: [["upheld","Uphold"],["reduced","Reduce"],["removed","Remove"],["record_corrected","Correct record"],["returned_for_reconsideration","Return for reconsideration"],["ineligible","Ineligible"],["duplicate","Duplicate"]] },
        { name: "internal_rationale", label: "Private staff rationale", type: "textarea", required: true },
        { name: "applicant_explanation", label: "Explanation shown to applicant", type: "textarea", required: true },
        { name: "execute_removal", label: "If the outcome is Remove, apply the verified change in Discord", type: "checkbox", checked: item.lookup_status === "found", disabled: item.lookup_status !== "found" },
        { name: "confirmed", label: "I confirm this final appeal decision", type: "checkbox", required: true },
      ],
      confirm: "Record decision",
      run: (body) => api(`/api/staff/appeals/${id}/action`, { method: "POST", body: { ...body, action } }),
    });
    const descriptions = {
      claim: "Claim this appeal for triage.", review: "Move this appeal into active evidence review.",
      recuse: "Release your claim and exclude your assessment from the decision.", reopen: "Reopen this decided appeal for a controlled second review.",
    };
    return actionDialog({
      title: titleCase(action), description: descriptions[action] || "Update this appeal.",
      fields: [{ name: "confirmed", label: `I confirm this ${titleCase(action).toLowerCase()} action`, type: "checkbox", required: true }],
      confirm: titleCase(action),
      run: (body) => api(`/api/staff/appeals/${id}/action`, { method: "POST", body: { ...body, action } }),
    });
  }
  const app = event.target.closest("[data-app-action]");
  if (app) {
    const action = app.dataset.appAction;
    const label = app.dataset.appActionLabel || `${titleCase(action)} application`;
    const application = state.applications.find((item) => String(item.id) === String(app.dataset.id));
    if (!application) return showNotice("That application is no longer available", true);
    if (action === "assess") {
      const current = (application.assessments || []).find((assessment) => exactId(assessment.reviewer_id) === exactId(state.user.id));
      const dimensions = application.rubric?.dimensions || [];
      const fields = dimensions.flatMap((dimension) => [
        { name: `score_${dimension.key}`, label: `${dimension.label} score`, type: "select", value: current?.scores?.[dimension.key] || "3", options: [1,2,3,4,5].map((value) => [String(value), `${value} / 5`]) },
        { name: `evidence_${dimension.key}`, label: `${dimension.label} evidence`, type: "textarea", value: current?.evidence?.[dimension.key] || "", required: true },
      ]);
      fields.push({ name: "recommendation", label: "Current recommendation", type: "select", value: current?.recommendation || "hold", options: [["hold","Hold"],["interview","Interview"],["accept","Accept"],["reject","Reject"]] });
      return actionDialog({
        title: current ? "Update my assessment" : "Add my assessment",
        description: "Score every dimension from 1 to 5 and record the evidence behind each score. The portal never turns these dimensions into an unexplained overall score.",
        fields,
        confirm: "Save assessment",
        run: (body) => {
          const scores = {};
          const evidence = {};
          for (const dimension of dimensions) {
            scores[dimension.key] = Number(body[`score_${dimension.key}`]);
            evidence[dimension.key] = body[`evidence_${dimension.key}`];
          }
          return api(`/api/staff/applications/${app.dataset.id}/assessment`, { method: "POST", body: { scores, evidence, recommendation: body.recommendation } });
        },
      });
    }
    if (action === "message") return actionDialog({
      title: "DM applicant",
      description: "Avenue Guard will deliver this private message through the durable Discord queue. The application status will not change.",
      fields: [{ name: "message", label: "Message", type: "textarea", required: true }],
      confirm: "Send DM",
      run: (body) => api(`/api/staff/applications/${app.dataset.id}/action`, { method: "POST", body: { ...body, action } }),
    });
    if (action === "calibrate") return actionDialog({
      title: "Resolve calibration",
      description: "Document how the independent assessments were reconciled. This note is internal and the original assessments remain unchanged.",
      fields: [{ name: "reason", label: "Calibration note", type: "textarea", required: true }, { name: "confirmed", label: "I confirm the scoring disagreement has been discussed", type: "checkbox", required: true }],
      confirm: "Resolve calibration",
      run: (body) => api(`/api/staff/applications/${app.dataset.id}/action`, { method: "POST", body: { ...body, action } }),
    });
    const decisionCategories = (application.decision_categories?.[action] || []).map((value) => [value, titleCase(value)]);
    const fields = action === "interview"
      ? [
          { name: "reason", label: "Internal reason for interview", type: "textarea", required: true },
          { name: "clarification_questions", label: "Questions to clarify (one per line)", type: "textarea", required: true },
          { name: "recommendation", label: "Current recommendation", type: "select", options: [["hold","Hold"],["accept","Accept"],["reject","Reject"]] },
          { name: "confirmed", label: "I confirm this application action", type: "checkbox", required: true },
        ]
      : [
          ...(decisionCategories.length ? [{ name: "category", label: "Internal reason category", type: "select", options: decisionCategories }] : []),
          { name: "reason", label: "Private staff rationale", type: "textarea", required: ["hold","accept","reject"].includes(action) },
          ...(["accept","reject"].includes(action) ? [{ name: "applicant_message", label: "Optional respectful message to applicant", type: "textarea" }] : []),
          ...(["accept","reject"].includes(action) ? [{ name: "confirmed", label: "I confirm this application action", type: "checkbox", required: true }] : []),
        ];
    return actionDialog({
      title: label,
      description: action === "interview" && label === "Do another interview"
        ? "Avenue Guard will create a new private interview ticket and notify the applicant."
        : "The decision and any resulting Discord role, DM, thread, or interview ticket is delivered through the durable workflow.",
      fields,
      confirm: label,
      danger: action === "reject",
      run: (body) => api(`/api/staff/applications/${app.dataset.id}/action`, { method: "POST", body: { ...body, action } }),
    });
  }
  const probation = event.target.closest("[data-probation-action]");
  if (probation) {
    const action = probation.dataset.probationAction;
    return actionDialog({
      title: action === "complete" ? "Complete probation" : action === "extend" ? "Extend probation" : "End probation early",
      description: "This checkpoint is private, audited, and delivered to the staff member through Avenue Guard.",
      danger: action === "end",
      fields: [...(action === "extend" ? [{ name: "days", label: "Additional days", type: "number", min: 1, value: "7", required: true }] : []), { name: "reason", label: "Documented outcome", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this probation outcome", type: "checkbox", required: true }],
      confirm: action === "complete" ? "Complete" : action === "extend" ? "Extend" : "End probation",
      run: (body) => api(`/api/staff/applications/${probation.dataset.id}/probation`, { method: "POST", body: { ...body, action } }),
    });
  }
  const appNote = event.target.closest("[data-app-note]");
  if (appNote) return actionDialog({ title: "Add internal application note", description: "Applicants cannot see internal notes.", fields: [{ name: "body", label: "Note", type: "textarea", required: true }], confirm: "Add note", run: (body) => api(`/api/staff/applications/${appNote.dataset.appNote}/note`, { method: "POST", body }) });
  const staff = event.target.closest("[data-staff-action]");
  if (staff) {
    const options = [["promote","Promote to Head Reviewer"],["demote","Demote to Reviewer"],["deactivate","Deactivate"],["restore","Restore Reviewer"]];
    if (can("staff.manage_all")) options.push(["set_admin","Grant Admin"],["revoke_admin","Revoke Admin"]);
    if (can("developer.access")) options.push(["set_owner","Grant Owner"],["revoke_owner","Revoke Owner"],["remove","Remove from team"]);
    return actionDialog({ title: "Manage staff access", description: "Discord roles are changed through the durable outbox. Dev access is config-only.", fields: [{ name: "action", label: "Action", type: "select", options }, { name: "reason", label: "Reason", type: "textarea", required: true }, { name: "confirmed", label: "I confirm this staff access change", type: "checkbox", required: true }], run: async (body) => { const result = await api(`/api/staff/staff/${staff.dataset.staffAction}/action`, { method: "POST", body }); state.staffAssignees = null; return result; } });
  }
  const nickname = event.target.closest("[data-nickname-id]");
  if (nickname) return actionDialog({ title: "Edit portal nickname", description: "This affects the staff portal only, not the Discord server nickname.", fields: [{ name: "portal_nickname", label: "Portal nickname", value: nickname.dataset.nicknameValue || "" }, ...(nickname.dataset.nicknameId === state.user.id ? [] : [{ name: "reason", label: "Reason", type: "textarea", required: true }])], confirm: "Save nickname", run: (body) => api(`/api/staff/staff/${nickname.dataset.nicknameId}/nickname`, { method: "PATCH", body }) });
});

$("#view-mode-select").addEventListener("change", async (event) => {
  const previous = state.viewRole;
  state.viewRole = event.target.value;
  try {
    const session = await api("/api/staff/session");
    applySession(session);
    closeDrawer();
    setShell();
    await render();
  } catch (error) {
    state.viewRole = previous;
    event.target.value = previous;
    showNotice(error.message, true);
  }
});

document.addEventListener("submit", async (event) => {
  if (event.target.id !== "profile-nickname-form") return;
  event.preventDefault();
  const submit = event.target.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const portal_nickname = new FormData(event.target).get("portal_nickname")?.toString().trim() || "";
    const result = await api("/api/staff/profile", { method: "PATCH", body: { portal_nickname } });
    state.user = { ...state.user, ...result.profile };
    $("#user-name").textContent = state.user.display_name;
    $("#profile-menu-name").textContent = state.user.display_name;
    showNotice("Portal nickname saved");
    closeDrawer();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("#global-search").focus();
    showJumpResults();
    return;
  }
  if (event.key === "Escape" && $("#action-dialog").open) return;
  if (event.key === "Escape" && $("#detail-drawer").classList.contains("open")) {
    closeDrawer();
    return;
  }
  if (event.key === "Tab" && $("#detail-drawer").classList.contains("open")) {
    const focusable = [...$("#detail-drawer").querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter((item) => !item.disabled && item.offsetParent !== null);
    if (focusable.length) {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  const row = event.target.closest?.("[data-open-queue]");
  const task = event.target.closest?.("[data-open-task]");
  if (!["Enter", " "].includes(event.key)) return;
  if (row) { event.preventDefault(); openQueue(row.dataset.openQueue); }
  else if (task) { event.preventDefault(); openTaskInspector(task.dataset.openTask); }
});

$("#refresh-button").addEventListener("click", render);
$("#drawer-close").addEventListener("click", closeDrawer);
$("#drawer-scrim").addEventListener("click", closeDrawer);
$("#menu-button").addEventListener("click", () => { const sidebar = $("#sidebar"); const open = sidebar.classList.toggle("open"); $("#menu-button").setAttribute("aria-expanded", String(open)); });
$("#profile-button").addEventListener("click", () => {
  const menu = $("#profile-menu");
  menu.hidden = !menu.hidden;
  $("#profile-button").setAttribute("aria-expanded", String(!menu.hidden));
  if (!menu.hidden) menu.querySelector("button")?.focus();
});
document.addEventListener("click", (event) => {
  if (event.target.closest(".sidebar-profile-wrap")) return;
  $("#profile-menu").hidden = true;
  $("#profile-button").setAttribute("aria-expanded", "false");
  if (!event.target.closest(".search-wrap")) {
    $("#search-results").hidden = true;
    $("#global-search").setAttribute("aria-expanded", "false");
  }
});
$("#logout-button").addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": decodeURIComponent(cookieValue("av_staff_csrf")) }, credentials: "same-origin" });
  } finally {
    location.href = "/staff";
  }
});
let searchTimer;
const jumpTargets = [
  ["work", "my-work", "My Work"], ["work", "queue", "Queue"], ["work", "outreach", "Outreach"],
  ["work", "tasks", "Tasks"], ["team", "statistics", "Statistics"], ["team", "applications", "Applications"],
  ["admin", "operations", "Operations"], ["admin", "requests", "Requests"], ["admin", "system", "System"],
];
function showJumpResults(term = "") {
  const normalized = term.toLowerCase();
  const targets = jumpTargets.filter(([module, section, label]) => (!normalized || label.toLowerCase().includes(normalized)) && modules[module] && sectionAllowed(section) && (module !== "admin" || can("admin.access")));
  const box = $("#search-results");
  box.innerHTML = targets.map(([module, section, label]) => `<button class="search-result jump-result" type="button" data-nav="${module}/${section}"><strong>${esc(label)}</strong><small>Jump to ${esc(modules[module].label)}</small></button>`).join("") || '<div class="search-result">No matching destinations</div>';
  box.hidden = false;
  $("#global-search").setAttribute("aria-expanded", "true");
}
$("#global-search").addEventListener("focus", (event) => {
  if (!event.target.value.trim()) showJumpResults();
});
$("#global-search").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  const term = event.target.value.trim();
  if (term.length < 2) { showJumpResults(term); return; }
  searchTimer = setTimeout(async () => {
    try {
      const data = await api(`/api/staff/search?q=${encodeURIComponent(term)}`);
      const box = $("#search-results");
      box.innerHTML = data.items.length ? data.items.map((item) => `<button class="search-result" type="button" ${item.type === "level" ? `data-open-queue="${item.id}"` : `data-search-type="${esc(item.type)}" data-search-id="${esc(item.id)}"`}><strong>${esc(item.current_level_name || item.title || item.display_name || "Staff application")}</strong><br><small>${esc(titleCase(item.role || item.type))}</small></button>`).join("") : '<div class="search-result">No matching staff records</div>';
      box.hidden = false;
      $("#global-search").setAttribute("aria-expanded", "true");
    } catch { $("#search-results").hidden = true; }
  }, 280);
});

if (!forwardLegacyOAuthCallback()) initialize();
