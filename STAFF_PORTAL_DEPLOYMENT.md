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
server-side, requests `/users/@me`, and sends the Discord user ID plus sanitized
display identity to Avenue Guard. Avenue Guard looks up the user in the configured guild with the bot and
maps the live member roles to `judge`, `head_judge`, or `owner`. The callback then
sets an `HttpOnly`, `Secure`, `SameSite=Strict` session cookie and returns a 303
redirect to the absolute, canonical `/staff/` URL. Absolute trailing-slash URLs
prevent Netlify's directory canonicalization from carrying the callback query into
the portal. The authorization code and state are never stored in browser
application state.

The role mapping is refreshed on every authenticated bot API request. A member
who leaves the guild or loses an authorized role receives HTTP 403 on the next
authorization check. The browser cannot submit or select its own role.

An application-purpose session may remain an `applicant` session when the
Discord identity is outside the guild. That exception exists only so a banned
person can open and answer their punishment appeal. Reviewer and Mod application
routes still perform a live guild-membership check, and outside users receive no
staff capabilities.

## Punishment appeal authority

Avenue Guard reads the current Discord guild ban and, when Discord still retains
it, the matching ban audit entry. The bot needs **Ban Members** to inspect and
remove bans and **View Audit Log** to recover the issuing time, actor, and audit
reason. Discord audit entries are retained for 45 days, so older provenance may
remain unknown.

Sapphire remains GD Avenue's normal moderation tool. The portal does not connect
to or rewrite Sapphire's private case database. When Sapphire supplied an audit
reason to Discord, Avenue Guard can preserve that official Discord reason. If
the live ban reason and audit reason disagree, both are retained for staff and
the conflict is flagged. Missing evidence is never invented.

Appeal decisions require two independent assessments, and the moderator identified
as the issuer cannot assess or make the final decision. An approved removal can
enqueue an idempotent Discord unban. The private portal thread is the durable
contact record; a staff member may additionally request a best-effort Discord DM.

If a mobile or embedded browser revisits a callback after the first code exchange,
the callback verifies the already-created secure session and redirects to the
clean destination instead of showing an expired-attempt page. A stale session is
cleared instead of being redirected repeatedly. A callback without
either the matching one-time state cookie or an existing session still fails closed.

Session responses include an Avenue Guard API version and explicit feature list.
New Dev controls remain visible but disabled when the deployed bot does not
advertise their route, with an explicit deployment-mismatch message. This prevents
misleading 404 actions without making Add Staff, application deletion, hidden
levels, or role preview appear to have been removed. It does not replace the
bot-first deployment order below.

## Deploy order

1. Set `STAFF_API_TOKEN` on Render and deploy Avenue Guard first.
2. Confirm `https://avenue-guard.onrender.com/ready` returns HTTP 200.
3. Confirm database schema version 13 completed successfully.
4. Set all five Netlify variables above.
5. Configure the Discord redirect URL.
6. Deploy this website directory to Netlify.
7. Run the production checks below.

## Production checks

- Request `/api/staff/session` signed out and confirm HTTP 401, not HTTP 404.
- Visit `/staff/` signed out and complete OAuth; confirm the final URL is exactly `/staff/` without `code` or `state`.
- Verify an ordinary member can use `/apply` but cannot access staff data.
- Verify a banned account outside the guild can sign in to `/apply`, sees staff
  applications disabled, and can open a punishment appeal with its Discord reason.
- Verify Judge, Head Judge, and Owner navigation and mutation permissions.
- As Dev, use **View as** for every role and confirm all preview requests are read-only.
- Remove a test Judge role and confirm their next request is denied.
- Reload `/staff` and confirm the secure cookie preserves the authorized session.
- Inspect `/api/staff/session` and confirm it contains only the sanitized user ID,
  display name, avatar URL, role, staff-access flag, and capability names.
- Race two queue claims and confirm only one active owner.
- Record an attempt, submission, same-target follow-up, and different-target submission.
- Confirm a Head Judge cannot adjust a tier after submission while the Owner can.
- Accept a test application and confirm the status stays `accepted_pending_role` until the outbox grants the role.
- Submit an application and confirm its configured question types and selected review showcase appear in one private Discord forum thread.
- Confirm the selected review showcase is embedded on `/apply`, includes the level name and ID, and retains an external YouTube fallback link.
- Revisit an already-used callback with a valid session and confirm it returns to a clean URL; repeat with an expired session and confirm all browser auth cookies are cleared without a redirect loop.
- As a Dev applicant, use **Delete my application data**, enter `DELETE`, and confirm the stale application disappears while unrelated portal records remain intact.
- Proceed with an interview and confirm one private ticket and one applicant DM are delivered, including after an outbox retry.
- Confirm the applicant sees `accepted` after role delivery even before staff reopen Applications.
- Submit a test punishment appeal and confirm the staff inspector shows the
  Discord reason source, date when available, and any reason conflict.
- Confirm the issuing moderator cannot assess the appeal and that a final decision
  remains disabled until two independent assessments exist.
- Send a portal message with Discord DM disabled, then enabled; confirm the portal
  message persists in both cases and the DM status is separately visible.
- Approve a test removal, execute the unban, and confirm the outbox becomes
  delivered and the punishment snapshot becomes `unbanned_by_appeal`.
- Add and remove a test staff profile by Discord ID as Dev, then confirm the role delivery and audit history.
- Hide and restore a test queue entry as Dev; confirm it disappears from public levels, queue counts, and normal internal filters while hidden.
- Assign a task to another staff member and confirm Avenue Guard sends the assignment DM once.
- Deactivate a test Judge and confirm the inactive record remains available for Restore after Discord removes the role.
- Search `/levels` by ID, name, and creator and inspect that no exact PPS, CP, requester, reviewer, note, target, or route is exposed.
- Check `/staff`, `/apply`, `/levels`, and `/level/[id]` at desktop and mobile widths.

For a local UI fixture with production-shaped responses, run `node tests/staff-preview-server.mjs` and open `http://127.0.0.1:4174/staff/`. To verify version-mismatch behavior, run `PORT=4175 LEGACY_API=1 WITHDRAWN_APPLICATION=1 node tests/staff-preview-server.mjs`; Add Staff and application deletion must remain visible but disabled. The fixture never connects to production or Turso.

## Rollback

Rolling back Netlify does not change durable bot state. The web portal can be disabled independently by setting `staff_portal.enabled` to `false` or removing `STAFF_API_TOKEN` from Render. Existing Discord `/pps` commands remain the recovery interface. The schema migration is additive and does not need to be reversed to disable the portal.
