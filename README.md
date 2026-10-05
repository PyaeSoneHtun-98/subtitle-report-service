# Subtitle dictionary reporting service

Separate backend project for [Subtitle Bridge Issue #71](https://github.com/PyaeSoneHtun-98/stremio_dictionary/issues/71).
The player has only a report icon and an HTTPS client. Supabase code stays here.

## What it does

- A public POST endpoint accepts an explicitly reported word/headword/phrase and version metadata.
- No end-user accounts, explanation form, email integration, or player Supabase SDK. A separate owner-only dashboard is now prepared.
- Existing translations are checked manually by the owner.
- Reports are private; neither anonymous nor authenticated database clients can read/write them.
- Duplicate terms are grouped with counts. Retried requests reuse a UUID and count once for seven days.
- At most 500 new request IDs per UTC hour across the service. Retries of accepted IDs still succeed.
- No IP addresses, device identifiers, subtitle sentences, video paths, stream URLs, credentials, or
  translations are intentionally collected. Do not enable request-body/custom term logging.

## Files

- `supabase/functions/report-dictionary/index.ts`: hosted entry point.
- `handler.mjs`: request validation and safe HTTP responses.
- `store.mjs`: server-only credential handling and database RPC.
- `supabase/migrations/202610020001_dictionary_reports.sql`: private permissions, grouping,
  idempotent receipt storage, and atomic hourly quota.
- `tests/`: actual production-handler tests and real PostgreSQL migration/permission tests
  using PGlite; no hosted credentials required.

## 1. Create your Supabase project

1. Open [Supabase Dashboard](https://supabase.com/dashboard), sign in, and choose **New project**.
2. Choose your organization and a project name such as `subtitle-dictionary-reports`.
3. Choose a region near your expected users and save the generated database password privately.
4. Wait until the database is ready. Copy the **project reference ID** from the project's settings
   or dashboard URL. Its public URL is `https://YOUR_PROJECT_REF.supabase.co`.
5. You can share the public URL/reference with the app developer. Do not share passwords, access
   tokens, or secret/service-role keys in chat or commit them to either repository.

## 2. Apply the prepared migration

Use a normal PowerShell terminal with Node.js 22+ and npm installed:

```powershell
Set-Location D:\Projects\subtitle-report-service
npm ci
npm test
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Complete the browser login and enter the database password only in the CLI prompt if requested.
This directory already has a Supabase config; do not run `supabase init` over it.
Use a dedicated new project so this migration cannot affect unrelated application tables.
The dry run should show only `202610020001_dictionary_reports.sql`.
If you use SQL Editor instead, run that exact migration once and track it in the CLI migration
history before future `db push` operations.

## 3. Deploy the endpoint

```powershell
npx supabase functions deploy report-dictionary --project-ref YOUR_PROJECT_REF --no-verify-jwt --use-api
```

The endpoint is:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/report-dictionary
```

JWT verification is intentionally disabled: the desktop app does not have user accounts.
The function alone uses the hosted server secret. It supports Supabase's injected
`SUPABASE_SECRET_KEYS.default` and legacy `SUPABASE_SERVICE_ROLE_KEY`.
If those are unavailable, add a server-only **REPORT_SERVICE_KEY** secret through the dashboard's
Edge Function Secrets page using a secret key from API settings. Never put this key in the player.
Deploy via `--use-api` does not require Docker. Local `supabase start/functions serve` does.

Official references:
[CLI/deployment](https://supabase.com/docs/guides/functions/deploy),
[public-function configuration](https://supabase.com/docs/guides/functions/function-configuration),
[server secrets](https://supabase.com/docs/guides/functions/secrets),
[database RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 4. Smoke-test a real report

This intentionally creates one report. Run only after deploying your project:

```powershell
$reportEndpoint = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/report-dictionary'
$reportBody = @{
  requestId = [guid]::NewGuid().ToString()
  term = 'example'
  category = 'missing'
  targetLanguage = 'my'
  appVersion = '1.0.6'
  dictionaryVersion = '1.0'
  phraseDictionaryVersion = '1.0.0'
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri $reportEndpoint -ContentType 'application/json' -Body $reportBody
# Repeat the SAME body to verify retry deduplication:
Invoke-RestMethod -Method Post -Uri $reportEndpoint -ContentType 'application/json' -Body $reportBody
```

Both calls should return `ok: true`. The table should contain one `example/missing` report with
`report_count = 1`. Remove this smoke-test row through the dashboard after verification.

## 5. Connect the official app

For local app development, create `D:\Projects\stremio_dictionary\.env.local`:

```dotenv
SUBTITLE_BRIDGE_REPORT_ENDPOINT=https://YOUR_PROJECT_REF.supabase.co/functions/v1/report-dictionary
```

Restart/rebuild the app. The flag is disabled until a valid endpoint is configured.
For official Windows builds, set the same public URL as the repository **Actions variable**
`SUBTITLE_BRIDGE_REPORT_ENDPOINT` under Settings → Secrets and variables → Actions → Variables.
The player CI and release workflows already read it. There is no key to add to the app.

Perform real Windows acceptance: missing term, existing headword, detected phrase, successful
tooltip/checkmark, rapid double click, failed/offline retry, switching/dismissing cards while
submission is pending, and a small window. Confirm no report click toggles playback.

## 6. Review reports

Open Table Editor → `public.dictionary_reports`. Sort by `report_count` or `last_reported_at`.
Use the status column: `new`, `reviewed`, `added`, `rejected`.

You can also use SQL Editor:

```sql
select term, category, report_count, dictionary_version, phrase_dictionary_version,
       last_app_version, status, last_reported_at
from public.dictionary_reports
where status = 'new'
order by report_count desc, last_reported_at desc;
```

Reports do not change the frozen dictionaries. Review corrections in the dictionary source project
and ship a separately versioned update. Restrict dashboard access to trusted maintainers.

## Endpoint contract

POST JSON, at most 2 KiB; these seven fields only:
`requestId` (v4 UUID), `term` (normalized term, 1–120 characters, at most five tokens),
`category` (`missing` or `incorrect`), `targetLanguage` (`my`), `appVersion`,
`dictionaryVersion`, `phraseDictionaryVersion`.

202: `{ "ok": true }`; 400: invalid report; 405: wrong method; 415: wrong content type;
429: hourly quota reached; 503: retryable storage failure. Responses never contain submitted terms,
credentials, or database output. No browser CORS access is required for Electron main-process calls.

## Operational limits

The endpoint is anonymous and its URL is public. A desktop-embedded token would not prove that
requests came from the official app. Treat reports as untrusted. The database quota bounds accepted
storage writes, but it does not prevent an attacker exhausting that quota or consuming Edge Function
invocations. Monitor Supabase usage; add gateway rate limiting/CAPTCHA if actual abuse requires it.

The quota uses a single locked row so counts/receipts are atomic. It is intended for a small report
volume. Retry receipts older than seven days are purged on the first submission in a new hour;
owner review rows remain until manually removed. Hosting infrastructure may keep its own access
metadata; do not promise that the provider never sees an IP address.

## Validation status

Local Node handler/storage tests and PGlite migration/permission tests pass.
Project axcpqizzmjwdwwpdaggf is linked. The existing migration is up to date; report-dictionary was deployed as ACTIVE version 1 with JWT verification disabled on 2026-10-02. Live table/function presence and restricted RPC permissions were verified through the Management API.
Real submission acceptance is still failing: the owner sees the retry tooltip, and local Node/Electron network checks cannot obtain an HTTP response from the project endpoint. The management API is reachable. Investigate connectivity before claiming manual acceptance.

## Vercel reporting endpoint and owner interface

The direct Supabase hostname remains unreachable without VPN on the tested connection. The owner requested a Vercel endpoint plus a private report-review interface on 2026-10-05. See [VERCEL_SETUP.md](VERCEL_SETUP.md) for the routes, private owner setup, security behavior, and truthful remaining acceptance gates.
