// Runs only in a credential-configured Vercel build. No raw report or credential output.
import { resolveServerCredentials } from '../supabase/functions/report-dictionary/store.mjs';
import { supabaseUrl } from '../lib/http.mjs';
import { readReportPage } from '../lib/report-store.mjs';
import { serverKeyKind } from '../lib/credentials.mjs';
const { url, key } = resolveServerCredentials(name => process.env[name]);
if (!process.env.VERCEL || !key) {
  console.log('Storage readiness: skipped (no deployment credentials).');
} else {
  if (serverKeyKind(key) === 'unsupported') throw new Error('Storage readiness: REPORT_SERVICE_KEY must be sb_secret_ or legacy service_role, not a public key.');
  const base = supabaseUrl(url);
  if (!base) throw new Error('Storage readiness: invalid project URL.');
  const headers = { apikey: key };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  const call = (path, options) => fetch(base + path, { ...options, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(8000) });
  try {
    await readReportPage(call, headers);
    console.log('Storage readiness: production report-list query and exact-count parsing passed.');
  } catch (error) {
    throw new Error('Storage readiness: ' + (error.code ?? 'storage_unavailable') + '.');
  }
}
