import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT || 4174);
const legacyApi = process.env.LEGACY_API === "1";
const withdrawnApplication = process.env.WITHDRAWN_APPLICATION === "1";
const now = Math.floor(Date.now() / 1000);
const user = {
  id: "1102884420207255653",
  display_name: "Rodrigo",
  portal_nickname: "Rodrigo",
  discord_display_name: "Rodrigo",
  username: "rodrigo",
  avatar_url: "https://cdn.discordapp.com/avatars/1454985687177887866/d268221fd7a7a5529897730d18edd5a0.webp?size=128",
  role: "dev",
  role_label: "Dev",
  staff_access: true,
  capabilities: ["staff.access", "admin.access", "queue.view", "queue.claim", "queue.reassign", "queue.manage_state", "outreach.record", "tasks.assign", "tasks.manage_team", "notes.owner", "review.qa", "review.adjust_tier", "applications.review_judge", "staff.manage", "staff.view", "staff.manage_standard_roles", "staff.manage_all", "staff.manage_nicknames", "requests.manage", "requests.schedule", "tracking.manage", "pps.manage_cycles", "pps.override", "operations.view", "audit.view", "audit.view_full", "config.manage_safe", "developer.access"],
};
const viewRoles = [
  ["reviewer", "Reviewer", ["staff.access", "queue.view", "queue.claim", "outreach.record"]],
  ["head_reviewer", "Head Reviewer", ["staff.access", "queue.view", "queue.claim", "queue.reassign", "review.qa", "applications.review_judge"]],
  ["admin", "Admin", ["staff.access", "admin.access", "queue.view", "applications.review_judge", "staff.view"]],
  ["owner", "Owner", user.capabilities.filter((capability) => capability !== "developer.access")],
  ["dev", "Dev", user.capabilities],
];
const api = {
  version: legacyApi ? 0 : 5,
  features: legacyApi ? [] : ["application_data_reset", "application_interviews", "application_review_embeds", "application_review_threads", "application_cooldown", "multi_type_applications", "hidden_queue_entries", "staff_manual_management", "staff_assignee_directory", "task_assignment_dm", "task_recipient_dm", "view_role_preview"],
};
const queue = [
  { id: 1, rank: 1, level_id: "101935961", level_name: "Synergy", creator: "CreatorName", tier: "mythic", cp: 0, waiting_cycles: 2, components: { f: 17.9, g: 3.22, h: 4.24, p: 25.36, complete: true }, state: "queued", claim: null },
  { id: 2, rank: 2, level_id: "123456789", level_name: "Chromatic Path", creator: "Builder", tier: "epic", cp: null, waiting_cycles: 1, components: { f: 4.83, g: null, h: 1.5, p: null, complete: false }, state: "in_cycle", claim: { user_id: user.id, claimed_ts: now - 7200, stale: false } },
  { id: 3, rank: null, level_id: "987654321", level_name: "Hidden Test", creator: "Builder", tier: "feature", cp: 2, waiting_cycles: 0, components: { f: 0.8, g: 1.2, h: 0, p: 2, complete: true }, state: "hidden", hidden_from_state: "queued", claim: null },
];
const publicLevels = queue.filter((item) => item.state !== "hidden").map((item) => ({
  level_id: item.level_id,
  level_name: item.level_name,
  uploader_name: item.creator,
  recommendation_type: item.tier,
  recommended_at: now - 172800,
  public_queue_state: item.id === 1 ? "queued" : "in_cycle",
  public_outreach_state: item.id === 1 ? "queued_for_outreach" : "outreach_in_progress",
  public_outcome_state: "unknown",
  public_priority_band: item.rank === 1 ? "top_priority" : "high_priority",
}));

const payloads = {
  "/api/staff/session": { user, api, view_mode: { active: false, actual_role: "dev", roles: viewRoles.map(([key, label, capabilities]) => ({ key, label, capabilities })) } },
  "/api/apply/session": { user: { ...user, role: "applicant", role_label: "Applicant", staff_access: false, capabilities: ["applications.self"] }, api },
  "/api/apply/mine": { items: withdrawnApplication ? [{ id: 1, application_type: "judge", status: "withdrawn", answers: {}, created_ts: now - 86400, updated_ts: now - 3600 }] : [] },
  "/api/apply/options": { items: [{ application_type: "judge", label: "Reviewer application", description: "Review Geometry Dash levels and recommend rating tiers.", enabled: true, cooldown: { days: 5, active: false } }, { application_type: "mod", label: "Mod application", description: "Help moderate GD Avenue and support the community.", enabled: true, cooldown: { days: 5, active: false } }, { application_type: "appeal", label: "Appeal application", description: "This application will be added in a future update.", enabled: false }], applications_open: true, cooldown: { days: 5, active: false }, cooldowns: { judge: { days: 5, active: false }, mod: { days: 5, active: false } }, active_applications: [], active_application: null },
  "/api/apply/form": { application: { id: 15, application_type: "judge", status: "draft", answers: {} }, questions: [
    { key: "age", label: "How old are you?", type: "single_choice", required: true, options: ["12 or under", "13 to 15", "16 to 18", "19 or above"] },
    { key: "motivation", label: "Why do you want to be a reviewer?", type: "long_text", required: true, options: [] },
    { key: "experience", label: "Tell us about your experience reviewing levels across different servers", type: "long_text", required: true, options: [] },
    { key: "improvements", label: "What could GD Avenue improve?", type: "long_text", required: true, options: [] },
    { key: "weekly_capacity", label: "How many levels can you review per week?", type: "single_choice", required: true, options: ["1-2", "3-6", "7-9", "10 or more"] },
    { key: "timezone", label: "What is your timezone?", type: "short_text", required: true, options: [], help_url: "https://www.checkmytimezone.com/" },
    { key: "level_review", label: "Review Synergy (Level ID 101935961)", type: "long_text", required: true, options: [], review_prompt: { key: "synergy-101935961", name: "Synergy", level_id: "101935961", youtube_url: "https://www.youtube.com/watch?v=bfQj4ZU2nQM", youtube_embed_url: "https://www.youtube-nocookie.com/embed/bfQj4ZU2nQM" } },
  ], form: { application_type: "judge", label: "Reviewer application", description: "Review Geometry Dash levels and recommend rating tiers." } },
  "/api/apply/form/judge": null,
  "/api/apply/form/mod": { application: { id: 16, application_type: "mod", status: "draft", answers: {} }, form: { application_type: "mod", label: "Mod application", description: "Help moderate GD Avenue and support the community." }, questions: [
    { key: "age", label: "How old are you?", type: "single_choice", required: true, options: ["12 or under", "13 to 15", "16 to 18", "19 or above"] },
    { key: "motivation", label: "Why do you want to be a mod?", type: "long_text", required: true, options: [] },
    { key: "experience", label: "Tell us a bit about your experience moderating servers", type: "long_text", required: true, options: [] },
    { key: "improvements", label: "What do you think GD Avenue can improve on?", type: "long_text", required: true, options: [] },
    { key: "availability", label: "How much time can you dedicate to moderating the server?", type: "long_text", required: true, options: [] },
    { key: "timezone", label: "What is your timezone?", type: "short_text", required: true, options: [], help_url: "https://www.checkmytimezone.com/" },
    { key: "moderation_scenario", label: "A member is harassing others and breaking rules. What would you do?", type: "long_text", required: true, options: [] },
  ] },
  "/api/staff/overview": { user, summary: { active_claims: 2, stale_claims: 1, tasks_remaining: 3, tasks_due: 1, followups_due: 1 }, progress: { reviews_month: 24, tasks_done: 6, tasks_total: 8, outreach_attempts: 4, confirmed_submissions: 2, active_days: 12, milestones: [{ key: "reviews_25", label: "25 reviews" }] }, pipeline: { queued: 17, in_cycle: 4, awaiting_outcome: 6, rated: 9 }, pending_applications: 2, recent_activity: [{ event: "claim_created", entity_id: "queue:1", created_ts: now - 900 }] },
  "/api/staff/outreach": { items: [{ queue_id: 2, current_level_name: "Chromatic Path", level_id: "123456789", status: "attempted", route_type: "network", private_target_label: "Private target", event_ts: now - 1800 }], pipeline: { active: 4, awaiting_outcome: 6, completed: 9 } },
  "/api/staff/tasks": { items: [{ id: 1, title: "Check outcome window", status: "in_progress", priority: "high", due_ts: now + 3600, system_key: "outcome-window:2" }], progress: { done: 6, total: 8 } },
  "/api/staff/notes": { items: [{ id: 1, scope: "owners", body: "Confirm the next outreach cycle after the weekend event.", updated_ts: now - 600 }] },
  "/api/staff/team": { review_progress: { done: 34, total: 48 }, queue: { queued: 17 }, claims: { active: 6, stale: 1 }, outreach_week: { attempts: 8, submissions: 4 }, pending_applications: 3, workload: [{ user_id: user.id, identity: user, active_claims: 2 }, { user_id: "998877665544332211", identity: { id: "998877665544332211", display_name: "9guzzy" }, active_claims: 4 }] },
  "/api/staff/statistics": { scope: "team", reviewers: [{ reviewed_by: "785212232786640966", identity: { id: "785212232786640966", display_name: "Average" }, reviews: 28, median_turnaround: 14400 }, { reviewed_by: user.id, identity: user, reviews: 24, median_turnaround: 10800 }], tiers: { rate: 9, feature: 12, epic: 18, legendary: 8, mythic: 5 }, results: { sent: 41, rejected: 9, other: 2 }, outreach: { attempts: 18, submissions: 8, followups: 4, routes: [{ route_type: "direct", attempts: 10, submissions: 5 }, { route_type: "network", attempts: 8, submissions: 3 }] }, tasks_completed: 16, active_weeks: 12, stale_claims: 1, queue: { queued: 17, in_cycle: 4, awaiting_outcome: 6, rated: 9 }, waiting_distribution: { 0: 8, 1: 5, 2: 4, "3": 2, "4+": 2 }, cp_distribution: { 0: 6, 1: 5, 2: 3, 3: 2, "4+": 2, unknown: 3 } },
  "/api/staff/qa": { items: [{ request_message_id: "1550265958688489472", level_id: "101935961", result: "sent", send_type: "mythic", reviewed_by: user.id, reviewer: user, qa_status: "unreviewed" }] },
  "/api/staff/applications": { application_types: ["judge", "mod"], items: [{ id: 14, guild_id: "717003826288394271", applicant_id: "998877665544332211", applicant: { id: "998877665544332211", display_name: "9guzzy" }, application_type: "judge", application_label: "Reviewer application", claimed_by: user.id, claimed_by_identity: user, submitted_ts: now - 86400, status: "under_review", review_thread_id: "1461483580197703832", interview_ticket_channel_id: "1524293581991444510", answers: { age: "16 to 18", motivation: "I want to help creators receive clear, consistent feedback.", experience: "Two years of level reviewing and community moderation.", improvements: "More calibration sessions.", weekly_capacity: "3-6", timezone: "UTC+1", level_review: "The level has consistent decoration and readable gameplay." }, timeline: [{ event: "submitted", actor_id: "998877665544332211", actor: { id: "998877665544332211", display_name: "9guzzy" }, created_ts: now - 86400 }, { event: "claim", actor_id: user.id, actor: user, created_ts: now - 7200 }], internal_notes: [{ author_id: user.id, author: user, body: "Strong examples; discuss availability in interview.", created_ts: now - 3600 }] }, { id: 15, guild_id: "717003826288394271", applicant_id: "1156180438977617990", applicant: { id: "1156180438977617990", display_name: "Mod Applicant" }, application_type: "mod", application_label: "Mod application", claimed_by: null, submitted_ts: now - 172800, status: "interview", answers: { age: "19 or above", motivation: "I want to help the community.", experience: "I moderate another server.", availability: "Several evenings each week.", timezone: "Europe/Madrid", moderation_scenario: "I would stop the behavior, preserve evidence, and escalate proportionally." }, timeline: [], internal_notes: [] }] },
  "/api/staff/staff": { items: [{ id: user.id, display_name: "Rodrigo", avatar_url: user.avatar_url, role: "owner", active: true, reviews: 24, workload: 2, last_activity_ts: now - 900 }] },
  "/api/staff/assignees": { items: [{ id: user.id, display_name: "Rodrigo", avatar_url: user.avatar_url, role: "dev", role_label: "Dev" }, { id: "998877665544332211", display_name: "9guzzy", avatar_url: "", role: "reviewer", role_label: "Reviewer" }, { id: "785212232786640966", display_name: "Average", avatar_url: "", role: "head_reviewer", role_label: "Head Reviewer" }] },
  "/api/staff/operations": { service: { state: "online", detail: "All core services ready" }, runtime: { ready: true, responsive: true }, database: { connected: true }, outbox: { pending: 1 }, request_wave: { state: "open" }, incidents: [] },
  "/api/staff/requests": { state: { state: "open", wave_id: 7, review_system_version: "pps_v1", submitted_count: 38, request_limit: 50, close_ts: now + 7200, request_type: "any", request_message_id: "1550265958688489472" }, progress: { total: 38, reviewed: 24, pending: 14 }, scheduled: [{ id: 3, request_limit: 40, close_minutes: 120, open_ts: now + 86400, request_type: "only_demons", open_message: "Demons wave" }] },
  "/api/staff/community": { tracking: { available: true, weekly_reward: "managed_per_week" }, support: { tickets: { open: 3, waiting_for_staff: 2, resolved: 18 } }, forum: { rules: [{ forum_channel_id: "1524293581991444510", required_word: "cubical", match_mode: "contains" }] }, server_presentation: { icon_rotation_mode: "disabled", icon_count: 2, current_index: 0 } },
  "/api/staff/system": { service: { state: "online", detail: "All core services ready" }, runtime: { ready: true, responsive: true, heartbeat_age_seconds: 8, event_loop_lag_ms: 12 }, database: { connected: true, uses_remote: true, waiting_operations: 0 }, outbox: { pending: 1, processing: 0, dead: 0, delivered: 84 }, request_wave: { state: "open" }, incidents: [], providers: {}, background_workers: { "priority.maintenance": "running" }, public_cache: { state: "available" }, schemas: [{ component: "core", schema_version: 10 }], identity_repairs: { repaired: { records: 2, rows_changed: 4 }, unresolved: { records: 0, rows_changed: 0 } }, dead_outbox: [], available_actions: ["restart_stopped_tasks", "rebuild_public_cache", "request_repair", "restore_drill"] },
  "/api/staff/pps": { model_version: "pps_v1", outcome_window_seconds: 2592000, dashboard: { active_cycle: 4, queue: 27 } },
  "/api/staff/audit": { items: [{ event: "claim_created", entity_id: "queue:1", actor_id: user.id, created_ts: now - 900 }] },
  "/api/staff/configuration": { configuration: { claim_stale_hours: 48, applications_open: true } },
};
payloads["/api/apply/form/judge"] = payloads["/api/apply/form"];

function json(response, body) {
  response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === "/api/staff/session") {
    const selected = viewRoles.find(([key]) => key === request.headers["x-staff-view-role"]);
    if (!selected) return json(response, payloads["/api/staff/session"]);
    const [role, label, capabilities] = selected;
    return json(response, { user: { ...user, role, role_label: label, staff_access: capabilities.includes("staff.access"), capabilities }, api, view_mode: { active: true, actual_role: "dev", roles: viewRoles.map(([key, itemLabel, itemCapabilities]) => ({ key, label: itemLabel, capabilities: itemCapabilities })) } });
  }
  if (url.pathname === "/api/levels") {
    const term = (url.searchParams.get("q") || "").trim().toLowerCase();
    return json(response, { levels: publicLevels.filter((item) => !term || `${item.level_id} ${item.level_name} ${item.uploader_name}`.toLowerCase().includes(term)) });
  }
  if (url.pathname.startsWith("/api/level/")) {
    const item = publicLevels.find((entry) => entry.level_id === url.pathname.split("/").pop());
    if (item) return json(response, item);
    response.writeHead(404, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: "not_found" })); return;
  }
  if (url.pathname === "/api/staff/queue") {
    const items = url.searchParams.get("filter") === "hidden" ? queue.filter((item) => item.state === "hidden") : queue.filter((item) => item.state !== "hidden");
    return json(response, { items, page: 1, limit: 50, total: items.length });
  }
  if (/^\/api\/staff\/queue\/[123]$/.test(url.pathname)) {
    const item = queue.find((entry) => String(entry.id) === url.pathname.split("/").pop());
    return json(response, { queue: item, outreach: payloads["/api/staff/outreach"].items, history: [{ event: "recommended", created_ts: now - 172800 }], notes: payloads["/api/staff/notes"].items });
  }
  if (request.method !== "GET" && url.pathname.startsWith("/api/")) return json(response, { ok: true });
  if (payloads[url.pathname]) return json(response, payloads[url.pathname]);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || pathname === "/staff" || pathname === "/staff/") pathname = pathname.startsWith("/staff") ? "/staff/index.html" : "/index.html";
  if (pathname === "/apply" || pathname === "/apply/") pathname = "/apply/index.html";
  if (pathname === "/levels" || pathname === "/levels/") pathname = "/levels/index.html";
  if (/^\/level\/\d{7,9}$/.test(pathname)) pathname = "/level.html";
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root)) { response.writeHead(403); response.end(); return; }
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not a file");
    const type = target.endsWith(".css") ? "text/css" : target.endsWith(".js") ? "text/javascript" : "text/html";
    response.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404); response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Staff preview: http://127.0.0.1:${port}/staff/`));
