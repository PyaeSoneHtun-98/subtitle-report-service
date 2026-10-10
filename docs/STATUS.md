# Reporting service status

## Current work

### Issue #3 — app-matched dashboard theme (2026-10-10)

Owner assigned implementation to Codex. Branch: `codex/issue-3-charcoal-dashboard`.
This focused UI change is stacked on open Draft PR #2; neither PR is merged.

- App palette: charcoal #181818, layered gray surfaces, off-white text and white controls on gray.
- Approved app SVG on login/inbox and browser icon; clearer text, spacing, focus and responsive layouts.
- Only CSS, two decorative brand images, metadata and documentation changed; owner authentication,
  reporting/storage/API and React request lifecycle are unchanged.
- Local `npm run check` passed: 25 Node/SQL/API tests, 8 React lifecycle tests, Next.js production build.
  Local storage readiness was skipped without deployment credentials; this is not live storage acceptance.
- Synthetic actual-component browser previews passed desktop 1280px, narrow 390px and 320px:
  no page-wide horizontal overflow, SVG loaded, search, selection, status save, retry, empty state
  and pagination verified. Small-screen details remain scroll-reachable; status navigation scrolls
  horizontally within its own container. Login also verified at 320px. Fixtures use no live reports.
- Code-head CI #7 passed at `4bcece6fb2a5492e3f5a48369d5a61835290acef`.
- Production deployment `dpl_CDQ2HpMduK5kZyXjvQS4qcGTVf9U` is READY at
  https://subtitle-report-service.vercel.app. Vercel's build passed the real production
  report-list query and count parser with unchanged server configuration.
- Anonymous live checks: dashboard/health 200, admin session 401, reporting GET 405;
  nonce CSP is present, deployed charcoal CSS loads, approved SVG hash matches the source.
  Production browser login shell also shows charcoal background and loaded branding without overflow.
- Draft PR #4 targets the existing Next.js branch. Owner live theme acceptance and final merge
  decision remain pending; no private reports were read and no live report status was changed.

### Earlier Next.js implementation

Issue #1: Next.js rewrite and report-list failure fix, implemented by Codex at the owner's request.
Branch: `codex/issue-1-next-dashboard`.
Source repository: https://github.com/PyaeSoneHtun-98/subtitle-report-service
Production: https://subtitle-report-service.vercel.app

The app is separate from the Subtitle Bridge player. The player sends only the agreed HTTPS report
payload; backend credentials and owner UI are never packaged into the desktop app.

## Report-list failure — 2026-10-05

Owner screenshot showed session HTTP 200 and reports HTTP 503. A deployment readiness probe reproduced
Supabase HTTP 401 / PostgreSQL 42501 (insufficient privileges). Live metadata confirmed service_role
has schema USAGE, table SELECT/UPDATE, and RLS bypass. Owner confirmed that REPORT_SERVICE_KEY held an
sb_publishable_ key. This public key can support login but cannot read the deliberately private table.

Owner replaced the value privately with an sb_secret_ key. The next deployment passed the real
production report-list query, bounded JSON reading, and exact-count parsing. Public/anon table
permissions were not expanded. No credential was retrieved or printed.

The owner API now rejects public/anon keys during configuration. Safe storage errors distinguish
access denial from other unavailable storage; no raw upstream error bodies are exposed.

## Implemented

- Next.js 16 App Router, React, responsive inbox and owner login.
- Status navigation, word search, category filtering, grouped counts, pagination, selected report
  details, and manual review status.
- Aborted stale reads, unmount cleanup, single-flight writes, and retryable errors.
- Existing public reporting route and Supabase receipt/group/quota contract preserved.
- Credentials stay server-only; secure HttpOnly owner cookie and live owner identity verification.
- Same-origin admin POSTs; nonced production CSP; no report/credential/request-body logging.
- Build-time storage readiness check in credential-configured Vercel deployments.
- CI runs real PostgreSQL/HTTP handler tests, React behavioral tests, and production build.
- Generated files, secret environments, provider caches, and synthetic preview are ignored.

## Verified

- Local npm run check: 25 Node/SQL/API tests plus 8 actual React lifecycle tests; production build.
- Dependency audit: zero known vulnerabilities at installation.
- Synthetic desktop and 390px narrow inbox preview; no live owner data in that preview.
- Earlier Next.js deployment dpl_Ce16C2tQPdYoJbcQ7NbPLiSUroNi passed the checks below;
  the current theme deployment is recorded under Issue #3 above.
- Real report-list storage query passed in the Vercel build with the privately corrected key.
- Anonymous no-VPN HTTPS: dashboard/health HTTP 200, admin session/report reads HTTP 401,
  forged session HTTP 401, foreign-origin admin POST HTTP 403.
- Two retries with the pre-existing synthetic receipt returned HTTP 202 through the new Next.js route.

## Owner acceptance and CI

On 2026-10-05 the owner confirmed actual login, loading the synthetic report, and saving its review
status work on the deployed Next.js app. This is owner-reported acceptance, not agent credential use.
Exact-code-head CI #3 passed at 13ed2f8ab0d064b51fba291587feba923cf6f318.

## Pending

- Live non-owner acceptance remains pending; automated tests verify non-owner denial.
- Final code review and merge decision; no merge is requested.
- Vercel Git auto-deploy integration is not yet connected; deployment currently uses the CLI.
- Player reporting shipped in v1.0.7: PR #72 and the separate FFmpeg fix PR #74 are merged.
  Earlier player acceptance and FFmpeg 404 notes are historical; consult the player repository for current status.
