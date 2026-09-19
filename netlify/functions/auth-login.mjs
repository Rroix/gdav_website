import { OAUTH_COOKIE, cookie, createOAuthState, required, siteUrl } from "./_shared/portal.mjs";

export async function handler(event) {
  try {
    const destination = event.queryStringParameters?.return === "apply" ? "/apply" : "/staff";
    const state = createOAuthState(destination);
    const redirectUri = `${siteUrl(event)}/api/auth/callback`;
    const params = new URLSearchParams({
      client_id: required("DISCORD_CLIENT_ID"),
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "identify",
      state,
    });
    return {
      statusCode: 302,
      headers: {
        Location: `https://discord.com/oauth2/authorize?${params}`,
        "Set-Cookie": cookie(OAUTH_COOKIE, state, { httpOnly: true, sameSite: "Lax", maxAge: 600 }),
        "Cache-Control": "no-store",
      },
      body: "",
    };
  } catch {
    return { statusCode: 503, body: "Staff sign-in is not configured" };
  }
}
