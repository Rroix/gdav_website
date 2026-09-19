# GD Avenue Staff Portal Deployment

The website is the presentation and OAuth layer. Avenue Guard remains the authorization, business-rule, and durable-state boundary. Browser code never connects to Turso and never receives the Discord client secret, bot token, or private Avenue API token.

```text
Browser -> Netlify OAuth/functions -> private Avenue Guard API
        -> capability checks -> PPS/outbox services -> Turso
```

The production API routes are Netlify rewrites, not browser-side aliases:

```text
/api/auth/login       -> /.netlify/functions/auth-login
/api/auth/callback    -> /.netlify/functions/auth-callback
/api/auth/logout      -> /.netlify/functions/auth-logout
/api/staff/<path>     -> /.netlify/functions/api-proxy/staff/<path>
/api/apply/<path>     -> /.netlify/functions/api-proxy/apply/<path>
```

The path-based proxy target is intentional. A query-string wildcard such as
`?path=:splat` is not reliable in the deployed rewrite and can leave the proxy
without the requested resource path.

## Required Netlify environment

```text
DISCORD_CLIENT_ID=<Avenue Guard application ID>
DISCORD_CLIENT_SECRET=<Discord OAuth client secret>
OAUTH_STATE_SECRET=<independent random secret, at least 32 bytes>
AVENUE_GUARD_API_URL=https://avenue-guard.onrender.com
AVENUE_GUARD_API_TOKEN=<same value as Render STAFF_API_TOKEN>
```

Generate `OAUTH_STATE_SECRET` and `STAFF_API_TOKEN` independently. Do not commit either value.

## Discord OAuth

Add this production redirect to the Avenue Guard application:

```text
https://gdavenue.netlify.app/api/auth/callback
```

The OAuth flow requests only `identify`. Avenue Guard resolves server membership and current role IDs for every private request, so role changes take effect without trusting browser state.

After Discord returns the authorization code, the Netlify callback exchanges it
server-side, requests `/users/@me`, and sends only that Discord user ID to Avenue
Guard. Avenue Guard looks up the user in the configured guild with the bot and
maps the live member roles to `judge`, `head_judge`, or `owner`. The callback then
sets an `HttpOnly`, `Secure`, `SameSite=Strict` session cookie and redirects to the
clean `/staff` URL. The authorization code and state are never stored in browser
application state.

The role mapping is refreshed on every authenticated bot API request. A member
who leaves the guild or loses an authorized role receives HTTP 403 on the next
authorization check. The browser cannot submit or select its own role.

## Deploy order

1. Set `STAFF_API_TOKEN` on Render and deploy Avenue Guard first.
2. Confirm `https://avenue-guard.onrender.com/ready` returns HTTP 200.
3. Confirm database schema version 10 completed successfully.
4. Set all five Netlify variables above.
5. Configure the Discord redirect URL.
6. Deploy this website directory to Netlify.
7. Run the production checks below.

## Production checks

- Request `/api/staff/session` signed out and confirm HTTP 401, not HTTP 404.
- Visit `/staff` signed out and complete OAuth; confirm the final URL is exactly `/staff` without `code` or `state`.
- Verify an ordinary member can use `/apply` but cannot access staff data.
- Verify Judge, Head Judge, and Owner navigation and mutation permissions.
- Remove a test Judge role and confirm their next request is denied.
- Reload `/staff` and confirm the secure cookie preserves the authorized session.
- Inspect `/api/staff/session` and confirm it contains only the sanitized user ID,
  display name, avatar URL, role, staff-access flag, and capability names.
- Race two queue claims and confirm only one active owner.
- Record an attempt, submission, same-target follow-up, and different-target submission.
- Confirm a Head Judge cannot adjust a tier after submission while the Owner can.
- Accept a test application and confirm the status stays `accepted_pending_role` until the outbox grants the role.
- Confirm the applicant sees `accepted` after role delivery even before staff reopen Applications.
- Deactivate a test Judge and confirm the inactive record remains available for Restore after Discord removes the role.
- Search `/levels` by ID, name, and creator and inspect that no exact PPS, CP, requester, reviewer, note, target, or route is exposed.
- Check `/staff`, `/apply`, `/levels`, and `/level/[id]` at desktop and mobile widths.

For a local UI fixture with production-shaped responses, run `node tests/staff-preview-server.mjs` and open `http://127.0.0.1:4174/staff/`. The fixture never connects to production or Turso.

## Rollback

Rolling back Netlify does not change durable bot state. The web portal can be disabled independently by setting `staff_portal.enabled` to `false` or removing `STAFF_API_TOKEN` from Render. Existing Discord `/pps` commands remain the recovery interface. The schema migration is additive and does not need to be reversed to disable the portal.
