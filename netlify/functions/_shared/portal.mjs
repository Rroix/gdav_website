import crypto from "node:crypto";

export const SESSION_COOKIE = "av_staff_session";
export const CSRF_COOKIE = "av_staff_csrf";
export const OAUTH_COOKIE = "av_oauth_state";

export function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function cookies(event) {
  const raw = event.headers?.cookie || event.headers?.Cookie || "";
  return Object.fromEntries(raw.split(";").map((item) => {
    const index = item.indexOf("=");
    if (index < 0) return ["", ""];
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1))];
  }).filter(([key]) => key));
}

export function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || "/"}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Number(options.maxAge) || 0)}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure !== false) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite || "Strict"}`);
  return parts.join("; ");
}

export function secureEqual(left, right) {
  const first = Buffer.from(String(left || ""));
  const second = Buffer.from(String(right || ""));
  return first.length > 0 && first.length === second.length && crypto.timingSafeEqual(first, second);
}

function signature(value) {
  return crypto.createHmac("sha256", required("OAUTH_STATE_SECRET")).update(value).digest("base64url");
}

export function createOAuthState(destination) {
  const payload = Buffer.from(JSON.stringify({
    nonce: crypto.randomBytes(24).toString("base64url"),
    destination: destination === "/apply" ? "/apply" : "/staff",
    created: Date.now(),
  })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyOAuthState(value) {
  const [payload, supplied, ...rest] = String(value || "").split(".");
  if (!payload || !supplied || rest.length) return null;
  const expected = signature(payload);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.nonce || Date.now() - Number(parsed.created) > 10 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function siteUrl(event) {
  const configured = String(process.env.URL || "").replace(/\/$/, "");
  if (configured) return configured;
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.host;
  return `${proto}://${host}`;
}

export async function botRequest(path, { method = "GET", body, session, csrf, idempotency } = {}) {
  const base = required("AVENUE_GUARD_API_URL").replace(/\/$/, "");
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Avenue-Portal-Key": required("AVENUE_GUARD_API_TOKEN"),
  };
  if (session) headers["X-Staff-Session"] = session;
  if (csrf) headers["X-CSRF-Token"] = csrf;
  if (idempotency) headers["Idempotency-Key"] = idempotency;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; }
    catch { payload = apiError("invalid_backend_response", "Avenue Guard returned an invalid response"); }
    return { status: response.status, payload };
  } finally {
    clearTimeout(timeout);
  }
}

export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

export function apiError(code, message, correlationId = "") {
  return {
    ok: false,
    error: {
      code: String(code),
      message: String(message),
      ...(correlationId ? { correlation_id: String(correlationId) } : {}),
    },
  };
}
