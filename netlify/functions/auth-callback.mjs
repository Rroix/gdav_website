import {
  CSRF_COOKIE,
  OAUTH_COOKIE,
  SESSION_COOKIE,
  botRequest,
  cookie,
  cookies,
  portalDestinationUrl,
  required,
  secureEqual,
  siteUrl,
  verifyOAuthState,
} from "./_shared/portal.mjs";

export async function handler(event) {
  const jar = cookies(event);
  const state = String(event.queryStringParameters?.state || "");
  const parsedState = verifyOAuthState(state);
  const stateCookie = String(jar[OAUTH_COOKIE] || "");
  if (!parsedState) {
    return { statusCode: 400, body: "This sign-in attempt expired. Return to the portal and try again." };
  }
  const cleanDestination = (params = {}) => portalDestinationUrl(
    event,
    parsedState.destination,
    params,
  );
  if (!stateCookie || !secureEqual(stateCookie, state)) {
    // Some mobile browsers revisit the callback after the first exchange has
    // already created the session and cleared the one-time state cookie. Check
    // the server session before treating the callback as completed; a stale
    // cookie must not bounce between the portal and the callback forever.
    if (jar[SESSION_COOKIE]) {
      try {
        const session = await botRequest(
          parsedState.destination === "/apply" ? "/api/apply/session" : "/api/staff/session",
          { session: jar[SESSION_COOKIE] },
        );
        if (session.status < 400) {
          return {
            statusCode: 303,
            headers: {
              Location: cleanDestination(),
              "Set-Cookie": cookie(OAUTH_COOKIE, "", { httpOnly: true, sameSite: "Lax", maxAge: 0 }),
              "Cache-Control": "no-store",
            },
            body: "",
          };
        }
      } catch {
        // Clear stale browser credentials below. A fresh login can then start.
      }
      return {
        statusCode: 303,
        multiValueHeaders: {
          "Set-Cookie": [
            cookie(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0 }),
            cookie(CSRF_COOKIE, "", { maxAge: 0 }),
            cookie(OAUTH_COOKIE, "", { httpOnly: true, sameSite: "Lax", maxAge: 0 }),
          ],
        },
        headers: {
          Location: cleanDestination({
            auth_error: "Your previous sign-in expired. Please continue with Discord again.",
          }),
          "Cache-Control": "no-store",
        },
        body: "",
      };
    }
    return { statusCode: 400, body: "This sign-in attempt expired. Return to the portal and try again." };
  }
  const code = String(event.queryStringParameters?.code || "").trim();
  if (!code) {
    return {
      statusCode: 400,
      headers: {
        "Set-Cookie": cookie(OAUTH_COOKIE, "", { httpOnly: true, sameSite: "Lax", maxAge: 0 }),
        "Cache-Control": "no-store",
      },
      body: "This sign-in attempt is incomplete. Return to the portal and try again.",
    };
  }
  try {
    const redirectUri = `${siteUrl(event)}/api/auth/callback`;
    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: required("DISCORD_CLIENT_ID"),
        client_secret: required("DISCORD_CLIENT_SECRET"),
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) throw new Error("Discord token exchange failed");
    const oauth = await tokenResponse.json();
    const identityResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${oauth.access_token}` },
    });
    if (!identityResponse.ok) throw new Error("Discord identity lookup failed");
    const identity = await identityResponse.json();
    const sessionResponse = await botRequest("/api/staff/auth/session", {
      method: "POST",
      body: {
        user_id: identity.id,
        purpose: parsedState.destination === "/apply" ? "apply" : "staff",
      },
    });
    if (sessionResponse.status >= 400) {
      const reason = String(
        sessionResponse.payload?.error?.message
        || sessionResponse.payload?.message
        || "Access could not be verified",
      );
      return {
        statusCode: 303,
        headers: {
          Location: cleanDestination({ auth_error: reason }),
          "Set-Cookie": cookie(OAUTH_COOKIE, "", { httpOnly: true, sameSite: "Lax", maxAge: 0 }),
          "Cache-Control": "no-store",
        },
        body: "",
      };
    }
    const ttl = Math.max(60, Number(sessionResponse.payload.expires_ts || 0) - Math.floor(Date.now() / 1000));
    return {
      statusCode: 303,
      multiValueHeaders: {
        "Set-Cookie": [
          cookie(SESSION_COOKIE, sessionResponse.payload.session_token, { httpOnly: true, maxAge: ttl }),
          cookie(CSRF_COOKIE, sessionResponse.payload.csrf_token, { maxAge: ttl }),
          cookie(OAUTH_COOKIE, "", { httpOnly: true, sameSite: "Lax", maxAge: 0 }),
        ],
      },
      headers: { Location: cleanDestination(), "Cache-Control": "no-store" },
      body: "",
    };
  } catch {
    const reason = "Discord sign-in could not be completed. Please try again.";
    return {
      statusCode: 303,
      headers: {
        Location: cleanDestination({ auth_error: reason }),
        "Set-Cookie": cookie(OAUTH_COOKIE, "", { httpOnly: true, sameSite: "Lax", maxAge: 0 }),
        "Cache-Control": "no-store",
      },
      body: "",
    };
  }
}
