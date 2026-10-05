# Vercel endpoint and owner dashboard

This deployment stays in `D:\Projects\subtitle-report-service`, separate from the player repository.

## Next.js application

This project now uses Next.js App Router. `npm run check` runs 25 Node/SQL/API tests, 8 React
behavioral tests, and a production build. Vercel uses the Next.js framework preset. The build
executes the same bounded report-list query as the owner API when server credentials are present;
a storage failure stops deployment before replacing the stable production alias.

## Routes

- `GET /api/health`: public connectivity check; no report or database call.
- `POST /api/report-dictionary`: validates the existing seven-field report contract, then forwards
  it to the deployed Supabase function. UUIDs, quota, and private database rules are preserved.
- `/`: owner dashboard shell, with search, type/status filters, counts, pagination, and review statuses.
- `/api/admin`: owner-only session, report listing, and status changes.

The dashboard does not call Supabase from the browser. Authentication and database requests go
through Vercel, so the browser only needs connectivity to the deployed Vercel URL.

## 1. Deploy and test connectivity first

Use the authenticated Vercel CLI from this folder:

```powershell
vercel link --project subtitle-report-service
vercel env add REPORT_UPSTREAM_URL production
vercel deploy --prod
```

Set `REPORT_UPSTREAM_URL` to:
`https://axcpqizzmjwdwwpdaggf.supabase.co/functions/v1/report-dictionary`.

Open the returned production domain at `/api/health` without VPN.
Expected: HTTP 200 and `{"ok":true,"service":"dictionary-reports"}`.
A reachable provider homepage does not prove that this deployment is reachable.
Do not change the player's endpoint until this exact deployment is verified.
Use the stable production domain, not an authentication-protected preview deployment URL.

## 2. Configure one owner account privately

The Supabase dashboard account is separate from an Auth user inside this project.

1. In Supabase → Authentication → Users → Add user → Create user, create the owner email/password
   account. Keep the password private. Confirm its email in that form if offered.
2. Copy that user's UID. Only this exact UID is allowed to read or review reports.
3. In Vercel → this project's Settings → Environment Variables, add these for **Production**:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://axcpqizzmjwdwwpdaggf.supabase.co` |
| `REPORT_SERVICE_KEY` | A server secret key from Supabase Settings → API Keys; legacy service_role also supported |
| `REPORT_ADMIN_USER_ID` | Owner Auth user's UID |

Enter `REPORT_SERVICE_KEY` directly into Vercel's private settings. Never send it in chat, put it in
HTML/JavaScript, prefix it with `NEXT_PUBLIC_`, commit it, or put it in the player. A publishable/anon
key is not sufficient. Supabase secret/service-role keys bypass RLS and belong only on the server:
[Supabase API key documentation](https://supabase.com/docs/guides/getting-started/api-keys).

After changing the environment, redeploy. If using the dashboard redeploy action, use the current
project environment rather than the old deployment's settings.

## 3. Use the dashboard

Open the production URL and sign in with the owner Auth email/password.

- Default filter: New.
- Search a word or phrase and filter missing translations versus existing-translation issues.
- Each row shows the grouped count, latest report time, and dictionary/app versions.
- Change review status to `new`, `reviewed`, `added`, or `rejected`.
- Status edits do not change the frozen dictionaries or delete report groups.
- Sessions last at most one hour; sign in again when expired. No refresh token is kept.
- Sign out clears the browser's dashboard session cookie.

## Security and privacy

- Anonymous reporters cannot list/read reports. Non-owner Auth users are denied.
- The server verifies the live Supabase user identity before every read or status change.
- The access token is stored only in a Secure, HttpOnly, SameSite=Strict host-only cookie.
- Mutating admin requests require the same Origin; no browser CORS access is enabled.
- Login bodies, queries, upstream responses, and page sizes are bounded.
- Browser rendering uses DOM text nodes, not HTML from report terms.
- No credentials, cookies, passwords, report terms, or upstream error bodies are logged by our code.
- Supabase and Vercel may keep infrastructure access metadata. Do not enable request-body logging.
- The dashboard shell is public; report data requires login. Production reporting must remain
  publicly callable. Preview deployment protection must not become a required reporting credential.
- Vercel receives explicitly submitted reports as a hosting processor; the relay adds no identity
  fields and preserves the existing payload and retry receipt.
- The public endpoint remains anonymous. Database quotas bound accepted writes, not hosting
  invocations; monitor provider usage and apply hosting rate controls if abuse appears.

## Validation

`npm run check` passes 33 tests and the Next.js production build, including production SQL/roles and the actual
Vercel handlers: owner/non-owner access, secure session cookie, cross-origin write rejection,
bounded filters/pagination, status-only updates, safe errors, and relay receipt/payload behavior.
The dashboard layout was checked locally with synthetic fixtures, not real owner authentication
or live reports. Deployment connectivity, owner login, real reports, and affected Windows
acceptance must be recorded separately.


## Deployment checks — 2026-10-05

- Production: https://subtitle-report-service.vercel.app
- Anonymous requests without VPN: dashboard HTTP 200, health HTTP 200, reporting GET HTTP 405, no redirects or Vercel authentication bypass.
- Two POSTs of the same synthetic smoke report returned HTTP 202. The live database confirms its receipt and grouped count of 1.
- One synthetic example report remains in the private table; it is testing data, not user feedback.
- Owner UID and privately entered server key are configured in Production and redeployed. Anonymous/session-forgery requests return HTTP 401; foreign-origin POST returns HTTP 403. Public dashboard/health remain HTTP 200 without VPN. No secret value was retrieved.
- Real owner login/status changes and player manual acceptance remain pending.


## Resolved owner storage configuration failure — 2026-10-05

Owner session worked but listing returned 503. Production storage probe reproduced HTTP 401 /
PostgreSQL 42501. Owner confirmed REPORT_SERVICE_KEY contained sb_publishable_. The database stayed
private; the owner replaced it privately with sb_secret_. The subsequent deployment passed the
actual report-list query and count parsing. Public/anon keys are now explicitly rejected by owner
configuration. Real owner browser login/list/status recheck remains pending.
