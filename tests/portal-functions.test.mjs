import assert from "node:assert/strict";
import test from "node:test";

import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  cookie,
  createOAuthState,
  secureEqual,
  verifyOAuthState,
} from "../netlify/functions/_shared/portal.mjs";
import { handler as proxy } from "../netlify/functions/api-proxy.mjs";
import { handler as logout } from "../netlify/functions/auth-logout.mjs";

process.env.OAUTH_STATE_SECRET = "test-only-state-secret-with-more-than-32-bytes";

test("OAuth state is signed, destination-bound, and tamper evident", () => {
  const value = createOAuthState("/apply");
  const parsed = verifyOAuthState(value);
  assert.equal(parsed.destination, "/apply");
  assert.equal(verifyOAuthState(`${value}tampered`), null);
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
    queryStringParameters: { scope: "staff", path: "overview" },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).error, "session_required");
});

test("private proxy rejects mutations without a matching CSRF header", async () => {
  const response = await proxy({
    httpMethod: "POST",
    headers: { cookie: `${SESSION_COOKIE}=session; ${CSRF_COOKIE}=expected` },
    queryStringParameters: { scope: "staff", path: "notes" },
    body: "{}",
  });
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).error, "csrf_failed");
  assert.equal(secureEqual("same", "same"), true);
  assert.equal(secureEqual("same", "different"), false);
});

test("logout is POST-only and requires the double-submit CSRF value", async () => {
  const getResponse = await logout({ httpMethod: "GET", headers: {} });
  assert.equal(getResponse.statusCode, 405);

  const rejected = await logout({
    httpMethod: "POST",
    headers: { cookie: `${CSRF_COOKIE}=expected`, "x-csrf-token": "wrong" },
  });
  assert.equal(rejected.statusCode, 403);

  const accepted = await logout({
    httpMethod: "POST",
    headers: { cookie: `${CSRF_COOKIE}=expected`, "x-csrf-token": "expected" },
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.multiValueHeaders["Set-Cookie"].length, 2);
  assert.ok(accepted.multiValueHeaders["Set-Cookie"].every((value) => value.includes("Max-Age=0")));
});
