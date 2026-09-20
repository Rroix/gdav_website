import assert from "node:assert/strict";
import test from "node:test";

import {
  CSRF_COOKIE,
  OAUTH_COOKIE,
  SESSION_COOKIE,
  cookie,
  createOAuthState,
  portalDestinationUrl,
  secureEqual,
  verifyOAuthState,
} from "../netlify/functions/_shared/portal.mjs";
import { handler as callback } from "../netlify/functions/auth-callback.mjs";
import { handler as login } from "../netlify/functions/auth-login.mjs";
import { handler as proxy, resolveProxyRoute } from "../netlify/functions/api-proxy.mjs";
import { handler as logout } from "../netlify/functions/auth-logout.mjs";

process.env.OAUTH_STATE_SECRET = "test-only-state-secret-with-more-than-32-bytes";
const originalFetch = globalThis.fetch;

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function oauthEvent(state, destination = "/staff") {
  return {
    httpMethod: "GET",
    headers: { cookie: `${OAUTH_COOKIE}=${encodeURIComponent(state)}` },
    queryStringParameters: { code: "one-time-code", state },
    rawUrl: `https://gdavenue.netlify.app/api/auth/callback?code=one-time-code&state=${encodeURIComponent(state)}`,
    destination,
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.OAUTH_STATE_SECRET = "test-only-state-secret-with-more-than-32-bytes";
  delete process.env.DISCORD_CLIENT_ID;
  delete process.env.DISCORD_CLIENT_SECRET;
  delete process.env.AVENUE_GUARD_API_URL;
  delete process.env.AVENUE_GUARD_API_TOKEN;
  delete process.env.URL;
});

test("OAuth state is signed, destination-bound, and tamper evident", () => {
  const value = createOAuthState("/apply");
  const parsed = verifyOAuthState(value);
  assert.equal(parsed.destination, "/apply");
  assert.equal(verifyOAuthState(`${value}tampered`), null);
});

test("portal destinations are absolute, canonical, and contain only approved query values", () => {
  process.env.URL = "https://gdavenue.netlify.app";
  const staff = new URL(portalDestinationUrl({}, "/staff"));
  const apply = new URL(portalDestinationUrl({}, "/apply", { auth_error: "Try again" }));
  assert.equal(staff.href, "https://gdavenue.netlify.app/staff/");
  assert.equal(apply.pathname, "/apply/");
  assert.equal(apply.searchParams.get("auth_error"), "Try again");
  assert.equal(apply.searchParams.has("code"), false);
  assert.equal(apply.searchParams.has("state"), false);
});

test("session cookies keep the server session HttpOnly while CSRF remains readable", () => {
  const session = cookie(SESSION_COOKIE, "secret", { httpOnly: true, maxAge: 60 });
  const csrf = cookie(CSRF_COOKIE, "csrf", { maxAge: 60 });
  assert.match(session, /HttpOnly/);
  assert.match(session, /Secure/);
  assert.match(session, /SameSite=Strict/);
  assert.doesNotMatch(csrf, /HttpOnly/);
});

test("private proxy denies unauthenticated requests before contacting the bot", async () => {
  const response = await proxy({
    httpMethod: "GET",
    headers: {},
    rawUrl: "https://gdavenue.netlify.app/api/staff/session",
  });
  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).error.code, "session_required");
});

test("production staff and application rewrites resolve without query splats", async () => {
  assert.deepEqual(
    resolveProxyRoute({ rawUrl: "https://gdavenue.netlify.app/api/staff/session" }),
    { scope: "staff", tail: "session" },
  );
  assert.deepEqual(
    resolveProxyRoute({ path: "/.netlify/functions/api-proxy/apply/mine" }),
    { scope: "apply", tail: "mine" },
  );
  assert.deepEqual(
    resolveProxyRoute({ rawUrl: "https://gdavenue.netlify.app/api/apply/options" }),
    { scope: "apply", tail: "options" },
  );
  assert.deepEqual(
    resolveProxyRoute({ path: "/.netlify/functions/api-proxy/apply/form/mod" }),
    { scope: "apply", tail: "form/mod" },
  );
  assert.equal(resolveProxyRoute({ rawUrl: "https://gdavenue.netlify.app/api/staff/../private" }), null);
  assert.equal(resolveProxyRoute({ rawUrl: "https://gdavenue.netlify.app/api/staff/%E0%A4%A" }), null);
});

test("private proxy rejects mutations without a matching CSRF header", async () => {
  const response = await proxy({
    httpMethod: "POST",
    headers: { cookie: `${SESSION_COOKIE}=session; ${CSRF_COOKIE}=expected` },
    rawUrl: "https://gdavenue.netlify.app/api/staff/notes",
    body: "{}",
  });
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).error.code, "csrf_failed");
  assert.equal(secureEqual("same", "same"), true);
  assert.equal(secureEqual("same", "different"), false);
});

test("authenticated reload proxies the secure cookie session without exposing secrets", async () => {
  process.env.AVENUE_GUARD_API_URL = "https://avenue-guard.example";
  process.env.AVENUE_GUARD_API_TOKEN = "private-service-token";
  let backendRequest;
  globalThis.fetch = async (url, options) => {
    backendRequest = { url: String(url), options };
    return jsonResponse(200, {
      user: {
        id: "1102884420207255552",
        display_name: "Average",
        portal_nickname: "Average",
        discord_display_name: "Average GD",
        global_display_name: "Average",
        username: "average",
        avatar_url: "https://cdn.example/avatar.png",
        role: "dev",
        role_label: "Dev",
        staff_access: true,
        capabilities: ["staff.access", "queue.view"],
      },
    });
  };
  const response = await proxy({
    httpMethod: "GET",
    headers: { cookie: `${SESSION_COOKIE}=browser-session` },
    rawUrl: "https://gdavenue.netlify.app/api/staff/session",
    queryStringParameters: {},
  });
  assert.equal(response.statusCode, 200);
  assert.equal(backendRequest.url, "https://avenue-guard.example/api/staff/session");
  assert.equal(backendRequest.options.headers["X-Staff-Session"], "browser-session");
  assert.equal(backendRequest.options.headers["X-Avenue-Portal-Key"], "private-service-token");
  assert.doesNotMatch(response.body, /browser-session|private-service-token/);
  assert.equal(JSON.parse(response.body).user.id, "1102884420207255552");
  assert.equal(typeof JSON.parse(response.body).user.id, "string");
});

test("proxy forwards Dev view role to Avenue Guard without treating it as authority", async () => {
  process.env.AVENUE_GUARD_API_URL = "https://avenue-guard.example";
  process.env.AVENUE_GUARD_API_TOKEN = "private-service-token";
  let backendRequest;
  globalThis.fetch = async (url, options) => {
    backendRequest = { url: String(url), options };
    return jsonResponse(200, { user: { role: "reviewer" } });
  };
  const response = await proxy({
    httpMethod: "GET",
    headers: {
      cookie: `${SESSION_COOKIE}=browser-session`,
      "x-staff-view-role": "reviewer",
    },
    rawUrl: "https://gdavenue.netlify.app/api/staff/session",
    queryStringParameters: {},
  });
  assert.equal(response.statusCode, 200);
  assert.equal(backendRequest.options.headers["X-Staff-View-Role"], "reviewer");
  assert.equal(backendRequest.options.headers["X-Staff-Session"], "browser-session");
});

test("proxy preserves exact snowflake strings across every staff workflow shape", async () => {
  process.env.AVENUE_GUARD_API_URL = "https://avenue-guard.example";
  process.env.AVENUE_GUARD_API_TOKEN = "private-service-token";
  const exact = "1102884420207255653";
  const payload = {
    profile: { user_id: exact, role_ids: ["901431567719731230"] },
    claim: { claimed_by: exact },
    outreach: { actor_id: exact },
    qa: { reviewed_by: exact, qa_by: exact },
    audit: { actor_id: exact },
    task: { assignee_id: exact, created_by: exact },
    application: { applicant_id: exact, decided_by: exact },
  };
  globalThis.fetch = async () => jsonResponse(200, payload);
  const response = await proxy({
    httpMethod: "GET",
    headers: { cookie: `${SESSION_COOKIE}=browser-session` },
    rawUrl: "https://gdavenue.netlify.app/api/staff/identity-contract",
    queryStringParameters: {},
  });
  assert.equal(response.statusCode, 200);
  const received = JSON.parse(response.body);
  assert.deepEqual(received, payload);
  for (const section of Object.values(received)) {
    for (const [key, value] of Object.entries(section)) {
      if (key.endsWith("_id") || key.endsWith("_by")) assert.equal(typeof value, "string");
      if (key === "role_ids") assert.equal(typeof value[0], "string");
    }
  }
});

test("OAuth login uses identify only and the server callback route", async () => {
  process.env.DISCORD_CLIENT_ID = "1454985687177887866";
  process.env.URL = "https://gdavenue.netlify.app";
  const response = await login({ queryStringParameters: {}, headers: {} });
  assert.equal(response.statusCode, 302);
  const authorize = new URL(response.headers.Location);
  assert.equal(authorize.searchParams.get("scope"), "identify");
  assert.equal(authorize.searchParams.get("redirect_uri"), "https://gdavenue.netlify.app/api/auth/callback");
  assert.match(response.headers["Set-Cookie"], /HttpOnly/);
});

test("OAuth callback exchanges identity server-side and creates a clean staff session", async () => {
  process.env.DISCORD_CLIENT_ID = "client-id";
  process.env.DISCORD_CLIENT_SECRET = "discord-client-secret";
  process.env.AVENUE_GUARD_API_URL = "https://avenue-guard.example";
  process.env.AVENUE_GUARD_API_TOKEN = "private-service-token";
  process.env.URL = "https://gdavenue.netlify.app";
  const state = createOAuthState("/staff");
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/oauth2/token")) return jsonResponse(200, { access_token: "discord-access-token" });
    if (String(url).includes("/users/@me")) return jsonResponse(200, { id: "101", username: "Reviewer" });
    return jsonResponse(201, {
      session_token: "server-session-token",
      csrf_token: "server-csrf-token",
      expires_ts: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "101", role: "judge" },
    });
  };
  const response = await callback(oauthEvent(state));
  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.Location, "https://gdavenue.netlify.app/staff/");
  assert.equal(new URL(response.headers.Location).search, "");
  const cookies = response.multiValueHeaders["Set-Cookie"];
  assert.ok(cookies.some((value) => value.startsWith(`${SESSION_COOKIE}=`) && value.includes("HttpOnly") && value.includes("Secure")));
  assert.ok(cookies.some((value) => value.startsWith(`${CSRF_COOKIE}=`) && !value.includes("HttpOnly")));
  const backend = requests.find((request) => request.url.endsWith("/api/staff/auth/session"));
  assert.deepEqual(JSON.parse(backend.options.body), { user_id: "101", purpose: "staff" });
  assert.equal(backend.options.headers["X-Avenue-Portal-Key"], "private-service-token");
  assert.doesNotMatch(response.body, /discord-access-token|discord-client-secret|private-service-token/);
});

test("OAuth callback reads the standardized Avenue Guard error contract", async () => {
  process.env.DISCORD_CLIENT_ID = "client-id";
  process.env.DISCORD_CLIENT_SECRET = "client-secret";
  process.env.AVENUE_GUARD_API_URL = "https://avenue-guard.example";
  process.env.AVENUE_GUARD_API_TOKEN = "private-service-token";
  const state = createOAuthState("/staff");
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("/oauth2/token")) return { ok: true, json: async () => ({ access_token: "oauth-token" }) };
    if (String(url).includes("/users/@me")) return { ok: true, json: async () => ({ id: "1102884420207255552" }) };
    return {
      status: 403,
      text: async () => JSON.stringify({ ok: false, error: { code: "staff_role_required", message: "A current staff role is required" } }),
    };
  };
  try {
    const response = await callback({
      headers: { cookie: `${OAUTH_COOKIE}=${encodeURIComponent(state)}`, host: "gdavenue.netlify.app" },
      queryStringParameters: { state, code: "code" },
    });
    assert.equal(response.statusCode, 303);
    const destination = new URL(response.headers.Location);
    assert.equal(destination.searchParams.get("auth_error"), "A current staff role is required");
    assert.equal(destination.pathname, "/staff/");
    assert.equal(destination.searchParams.has("code"), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("application callback requests an application session instead of staff elevation", async () => {
  process.env.DISCORD_CLIENT_ID = "client-id";
  process.env.DISCORD_CLIENT_SECRET = "discord-client-secret";
  process.env.AVENUE_GUARD_API_URL = "https://avenue-guard.example";
  process.env.AVENUE_GUARD_API_TOKEN = "private-service-token";
  process.env.URL = "https://gdavenue.netlify.app";
  const state = createOAuthState("/apply");
  let backendBody;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/oauth2/token")) return jsonResponse(200, { access_token: "discord-access-token" });
    if (String(url).includes("/users/@me")) return jsonResponse(200, { id: "999" });
    backendBody = JSON.parse(options.body);
    return jsonResponse(201, { session_token: "session", csrf_token: "csrf", expires_ts: Math.floor(Date.now() / 1000) + 3600 });
  };
  const response = await callback(oauthEvent(state, "/apply"));
  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.Location, "https://gdavenue.netlify.app/apply/");
  assert.deepEqual(backendBody, { user_id: "999", purpose: "apply" });
});

test("revisited OAuth callback redirects an existing session without reusing the code", async () => {
  process.env.AVENUE_GUARD_API_URL = "https://avenue-guard.example";
  process.env.AVENUE_GUARD_API_TOKEN = "private-service-token";
  const state = createOAuthState("/staff");
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return jsonResponse(200, { user: { id: "101", role: "reviewer" } });
  };
  const response = await callback({
    headers: { cookie: `${SESSION_COOKIE}=existing-session`, host: "gdavenue.netlify.app" },
    queryStringParameters: { state, code: "already-used-code" },
  });
  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.Location, "https://gdavenue.netlify.app/staff/");
  assert.deepEqual(requests, ["https://avenue-guard.example/api/staff/session"]);
});

test("revisited OAuth callback clears a stale session instead of looping", async () => {
  process.env.AVENUE_GUARD_API_URL = "https://avenue-guard.example";
  process.env.AVENUE_GUARD_API_TOKEN = "private-service-token";
  const state = createOAuthState("/apply");
  globalThis.fetch = async () => jsonResponse(401, { error: { code: "session_expired" } });
  const response = await callback({
    headers: { cookie: `${SESSION_COOKIE}=stale-session`, host: "gdavenue.netlify.app" },
    queryStringParameters: { state, code: "already-used-code" },
  });
  assert.equal(response.statusCode, 303);
  assert.match(response.headers.Location, /^https:\/\/gdavenue\.netlify\.app\/apply\/\?auth_error=/);
  assert.equal(response.multiValueHeaders["Set-Cookie"].length, 3);
  assert.ok(response.multiValueHeaders["Set-Cookie"].every((value) => value.includes("Max-Age=0")));
});

test("OAuth callback does not trust signed state without browser binding or a session", async () => {
  const state = createOAuthState("/staff");
  let contacted = false;
  globalThis.fetch = async () => { contacted = true; throw new Error("must not run"); };
  const response = await callback({
    headers: { host: "gdavenue.netlify.app" },
    queryStringParameters: { state, code: "code" },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(contacted, false);
});

test("OAuth callback rejects a present state cookie that does not match", async () => {
  const state = createOAuthState("/staff");
  let contacted = false;
  globalThis.fetch = async () => { contacted = true; throw new Error("must not run"); };
  const response = await callback({
    headers: { cookie: `${OAUTH_COOKIE}=different` },
    queryStringParameters: { state, code: "code" },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(contacted, false);
});

test("OAuth callback rejects a missing code before contacting Discord", async () => {
  const state = createOAuthState("/staff");
  let contacted = false;
  globalThis.fetch = async () => { contacted = true; throw new Error("must not run"); };
  const response = await callback({
    headers: { cookie: `${OAUTH_COOKIE}=${encodeURIComponent(state)}`, host: "gdavenue.netlify.app" },
    queryStringParameters: { state },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(contacted, false);
  assert.match(response.headers["Set-Cookie"], /Max-Age=0/);
});

test("proxy forwards add-staff and application deletion mutations exactly", async () => {
  process.env.AVENUE_GUARD_API_URL = "https://avenue-guard.example";
  process.env.AVENUE_GUARD_API_TOKEN = "private-service-token";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse(200, { ok: true });
  };
  const headers = {
    cookie: `${SESSION_COOKIE}=browser-session; ${CSRF_COOKIE}=csrf-token`,
    "x-csrf-token": "csrf-token",
    "idempotency-key": "workflow-test-key-123",
  };
  const addStaff = await proxy({
    httpMethod: "POST",
    headers,
    rawUrl: "https://gdavenue.netlify.app/api/staff/staff",
    body: JSON.stringify({ user_id: "1156180438977617990", role: "admin" }),
    queryStringParameters: {},
  });
  const deleteApplication = await proxy({
    httpMethod: "DELETE",
    headers: { ...headers, "idempotency-key": "workflow-test-key-456" },
    rawUrl: "https://gdavenue.netlify.app/api/apply/mine",
    body: JSON.stringify({ confirmation: "DELETE" }),
    queryStringParameters: {},
  });
  assert.equal(addStaff.statusCode, 200);
  assert.equal(deleteApplication.statusCode, 200);
  assert.equal(calls[0].url, "https://avenue-guard.example/api/staff/staff");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[1].url, "https://avenue-guard.example/api/apply/mine");
  assert.equal(calls[1].options.method, "DELETE");
  assert.deepEqual(JSON.parse(calls[1].options.body), { confirmation: "DELETE" });
});

test("invalid OAuth state is rejected before Discord or Avenue Guard is contacted", async () => {
  let contacted = false;
  globalThis.fetch = async () => { contacted = true; throw new Error("must not run"); };
  const response = await callback({
    headers: { cookie: `${OAUTH_COOKIE}=different` },
    queryStringParameters: { code: "code", state: "invalid" },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(contacted, false);
});

test("missing OAuth environment secrets fail closed", async () => {
  const response = await login({ queryStringParameters: {}, headers: {} });
  assert.equal(response.statusCode, 503);
  assert.doesNotMatch(response.body, /OAUTH_STATE_SECRET|DISCORD_CLIENT_SECRET/);
});

test("logout is POST-only and always clears stale browser credentials", async () => {
  const getResponse = await logout({ httpMethod: "GET", headers: {} });
  assert.equal(getResponse.statusCode, 405);

  const rejected = await logout({
    httpMethod: "POST",
    headers: { cookie: `${CSRF_COOKIE}=expected`, "x-csrf-token": "wrong" },
  });
  assert.equal(rejected.statusCode, 200);
  assert.equal(rejected.multiValueHeaders["Set-Cookie"].length, 3);

  const accepted = await logout({
    httpMethod: "POST",
    headers: { cookie: `${CSRF_COOKIE}=expected`, "x-csrf-token": "expected" },
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.multiValueHeaders["Set-Cookie"].length, 3);
  assert.ok(accepted.multiValueHeaders["Set-Cookie"].every((value) => value.includes("Max-Age=0")));
});
