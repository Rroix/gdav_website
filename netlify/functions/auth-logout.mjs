import { CSRF_COOKIE, OAUTH_COOKIE, SESSION_COOKIE, botRequest, cookie, cookies, json, secureEqual } from "./_shared/portal.mjs";

export async function handler(event) {
  const jar = cookies(event);
  if (String(event.httpMethod || "GET").toUpperCase() !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Method not allowed" });
  }
  const suppliedCsrf = String(event.headers?.["x-csrf-token"] || event.headers?.["X-CSRF-Token"] || "");
  const verified = secureEqual(suppliedCsrf, jar[CSRF_COOKIE]);
  if (verified && jar[SESSION_COOKIE]) {
    try {
      await botRequest("/api/staff/session", {
        method: "DELETE",
        session: jar[SESSION_COOKIE],
        csrf: suppliedCsrf,
      });
    } catch {
      // Local cookie removal is sufficient when the backend is unavailable.
    }
  }
  return {
    statusCode: 200,
    multiValueHeaders: {
      "Set-Cookie": [
        cookie(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0 }),
        cookie(CSRF_COOKIE, "", { maxAge: 0 }),
        cookie(OAUTH_COOKIE, "", { httpOnly: true, sameSite: "Lax", maxAge: 0 }),
      ],
    },
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify({ ok: true }),
  };
}
