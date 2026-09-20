import crypto from "node:crypto";
import { CSRF_COOKIE, SESSION_COOKIE, apiError, botRequest, cookies, json, secureEqual } from "./_shared/portal.mjs";

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);

export function resolveProxyRoute(event) {
  const queryScope = event.queryStringParameters?.scope;
  const queryTail = String(event.queryStringParameters?.path || "").replace(/^\/+/, "");
  if (["staff", "apply"].includes(queryScope) && queryTail && !queryTail.includes("..")) {
    return { scope: queryScope, tail: queryTail };
  }

  const candidates = [event.rawUrl, event.rawPath, event.path]
    .filter(Boolean)
    .map((value) => {
      try { return new URL(String(value), "https://local.invalid").pathname; }
      catch { return String(value).split("?", 1)[0]; }
    });
  for (const path of candidates) {
    const match = path.match(/^(?:\/api|\/\.netlify\/functions\/api-proxy)\/(staff|apply)\/(.+)$/);
    if (!match) continue;
    let tail;
    try {
      tail = decodeURIComponent(match[2]).replace(/^\/+/, "");
    } catch {
      continue;
    }
    if (tail && !tail.includes("..")) return { scope: match[1], tail };
  }
  return null;
}

export async function handler(event) {
  const method = String(event.httpMethod || "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) return json(405, apiError("method_not_allowed", "Method not allowed"));
  const route = resolveProxyRoute(event);
  if (!route) return json(404, apiError("not_found", "Resource not found"));
  const { scope, tail } = route;
  const jar = cookies(event);
  if (!jar[SESSION_COOKIE]) return json(401, apiError("session_required", "Sign in with Discord to continue"));
  const mutation = method !== "GET";
  const suppliedCsrf = String(event.headers?.["x-csrf-token"] || event.headers?.["X-CSRF-Token"] || "");
  if (mutation && !secureEqual(suppliedCsrf, jar[CSRF_COOKIE])) {
    return json(403, apiError("csrf_failed", "This action could not be verified; refresh and try again"));
  }
  let body;
  if (event.body) {
    try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body); }
    catch { return json(400, apiError("invalid_json", "The request body is not valid JSON")); }
  }
  const query = new URLSearchParams(event.multiValueQueryStringParameters || event.queryStringParameters || {});
  query.delete("scope");
  query.delete("path");
  const suffix = query.toString() ? `?${query}` : "";
  try {
    const result = await botRequest(`/api/${scope}/${tail}${suffix}`, {
      method,
      body,
      session: jar[SESSION_COOKIE],
      csrf: suppliedCsrf,
      idempotency: event.headers?.["idempotency-key"] || crypto.randomUUID(),
      viewRole: event.headers?.["x-staff-view-role"] || event.headers?.["X-Staff-View-Role"] || "",
    });
    return json(result.status, result.payload);
  } catch {
    return json(503, apiError("backend_unavailable", "Avenue Guard is temporarily unavailable"));
  }
}
