# Reporting service agent instructions

Read README.md, VERCEL_SETUP.md, docs/STATUS.md, and the active issue/PR before changes.
This repository is separate from the Subtitle Bridge Electron player.

- Use an issue-specific codex/ branch and a Draft PR for substantial work.
- Run npm run check (Node/SQL/API tests, React behavioral tests, Next.js build).
- Record real deployment and owner acceptance separately from fixtures and mocks.
- Never read or print private .env files, keys, passwords, session cookies, raw upstream errors, or
  report terms in diagnostics. Do not enable framework request or provider-body logging.
- Never commit .env files, .vercel caches, Supabase credential caches, generated output, or report data.
- Keep all credentials server-only; no NEXT_PUBLIC secret, client Supabase access, or admin UI in the player.
- Keep report storage private. Public submissions use only the bounded seven-field contract.
- Every owner read/status write must verify the live configured owner identity.
- Preserve Secure/HttpOnly/SameSite cookie flags and same-origin admin writes.
- Preserve receipt idempotency, grouped counts, quota, and existing public HTTPS route.
- No dictionary edits, deletes, account/password changes, or merge/release unless explicitly requested.
