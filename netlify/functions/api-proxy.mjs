import crypto from "node:crypto";
import { CSRF_COOKIE, SESSION_COOKIE, botRequest, cookies, json, secureEqual } from "./_shared/portal.mjs";

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);

export async function handler(event) {
  const method = String(event.httpMethod || "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) return json(405, { error: "method_not_allowed", message: "Method not allowed" });
  const scope = event.queryStringParameters?.scope === "apply" ? "apply" : "staff";
  const tail = String(event.queryStringParameters?.path || "").replace(/^\/+/, "");
  if (!tail || tail.includes("..")) return json(404, { error: "not_found", message: "Resource not found" });
  const jar = cookies(event);
  if (!jar[SESSION_COOKIE]) return json(401, { error: "session_required", message: "Sign in with Discord to continue" });
  const mutation = method !== "GET";
  const suppliedCsrf = String(event.headers?.["x-csrf-token"] || event.headers?.["X-CSRF-Token"] || "");
  if (mutation && !secureEqual(suppliedCsrf, jar[CSRF_COOKIE])) {
    return json(403, { error: "csrf_failed", message: "This action could not be verified; refresh and try again" });
  }
  let body;
  if (event.body) {
    try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body); }
    catch { return json(400, { error: "invalid_json", message: "The request body is not valid JSON" }); }
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
    });
    return json(result.status, result.payload);
  } catch {
    return json(503, { error: "backend_unavailable", message: "Avenue Guard is temporarily unavailable" });
  }
}
