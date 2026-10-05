import { boundedJson, supabaseUrl } from './http.mjs';
import { readBoundedJson } from '../supabase/functions/report-dictionary/handler.mjs';
const COOKIE = '__Host-report_owner';
const STATUSES = ['new', 'reviewed', 'added', 'rejected'];
const CATEGORIES = ['missing', 'incorrect'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = 'id,term,category,report_count,status,dictionary_version,phrase_dictionary_version,last_app_version,first_reported_at,last_reported_at';
const tokenFrom = request => {
  const raw = request.headers.get('cookie') ?? '';
  if (raw.length > 8192) return null;
  const entry = raw.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  if (!entry) return null;
  try { const token = decodeURIComponent(entry.slice(COOKIE.length + 1)); return token && token.length <= 4096 ? token : null; }
  catch { return null; }
};
function reply(status, value, cookie) {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...(cookie ? { 'Set-Cookie': cookie } : {}),
  } });
}
function cookie(value, age) {
  return COOKIE + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + age;
}
export function createAdminHandler({ url, key, ownerId }, fetcher = fetch) {
  const base = supabaseUrl(url);
  const configured = base && typeof key === 'string' && key.length > 0 && typeof ownerId === 'string' && UUID.test(ownerId);
  const databaseHeaders = { apikey: key, 'Content-Type': 'application/json' };
  if (key && !key.startsWith('sb_secret_')) databaseHeaders.Authorization = 'Bearer ' + key;
  const call = (path, options) => fetcher(base + path, { ...options, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(8000) });
  async function owner(request) {
    const token = tokenFrom(request);
    if (!token) return false;
    const response = await call('/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + token } });
    if (!response.ok) { await response.body?.cancel(); return false; }
    const user = await boundedJson(response);
    return typeof user.id === 'string' && user.id.toLowerCase() === ownerId.toLowerCase();
  }
  return async request => {
    try {
      const url = new URL(request.url);
      const action = url.searchParams.get('action') ?? 'session';
      const method = request.method;
      const expected = { login: 'POST', logout: 'POST', session: 'GET', reports: 'POST', status: 'POST' }[action];
      if (!expected) return reply(404, { ok: false });
      if (method !== expected) return reply(405, { ok: false });
      if (method === 'POST' && request.headers.get('origin') !== url.origin) return reply(403, { ok: false });
      if (action === 'logout') return reply(200, { ok: true }, cookie('', 0));
      if (!configured) return reply(503, { ok: false, code: 'not_configured' });
      if (method === 'POST' && request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
        return reply(415, { ok: false });
      if (action === 'login') {
        let data;
        try { data = await readBoundedJson(request); } catch { return reply(400, { ok: false }); }
        if (!data || Object.keys(data).length !== 2 || typeof data.email !== 'string' ||
            data.email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
            typeof data.password !== 'string' || !data.password || data.password.length > 256)
          return reply(400, { ok: false });
        const response = await call('/auth/v1/token?grant_type=password', {
          method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.email, password: data.password }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          return reply(response.status === 429 ? 429 : 403, { ok: false, code: 'login_failed' });
        }
        const session = await boundedJson(response);
        if (session.user?.id?.toLowerCase() !== ownerId.toLowerCase() ||
            typeof session.access_token !== 'string' || !session.access_token || session.access_token.length > 4096 ||
            !Number.isFinite(session.expires_in) || session.expires_in <= 0)
          return reply(403, { ok: false, code: 'login_failed' });
        return reply(200, { ok: true }, cookie(session.access_token, Math.min(3600, Math.floor(session.expires_in))));
      }
      if (!await owner(request)) return reply(401, { ok: false, code: 'sign_in_required' }, cookie('', 0));
      if (action === 'session') return reply(200, { ok: true });
      if (action === 'reports') {
        let data;
        try { data = await readBoundedJson(request); } catch { return reply(400, { ok: false }); }
        const fields = ['status', 'category', 'q', 'page'];
        if (!data || Array.isArray(data) || Object.keys(data).length !== fields.length ||
            Object.keys(data).some(name => !fields.includes(name)) ||
            fields.some(name => typeof data[name] !== 'string')) return reply(400, { ok: false });
        const status = data.status;
        const category = data.category;
        const query = data.q.normalize('NFKC').trim();
        const pageText = data.page;
        if ((status && !STATUSES.includes(status)) || (category && !CATEGORIES.includes(category)) ||
            query.length > 120 || (query && !/^[\p{L}\p{N}'’ .-]+$/u.test(query)) ||
            !/^\d{1,4}$/.test(pageText)) return reply(400, { ok: false });
        const filters = new URLSearchParams({
          select: COLUMNS, order: 'last_reported_at.desc,id.desc', limit: '50', offset: String(Number(pageText) * 50),
        });
        if (status) filters.set('status', 'eq.' + status);
        if (category) filters.set('category', 'eq.' + category);
        if (query) filters.set('term', 'ilike.*' + query + '*');
        const response = await call('/rest/v1/dictionary_reports?' + filters, {
          headers: { ...databaseHeaders, Prefer: 'count=exact' },
        });
        if (!response.ok) { await response.body?.cancel(); throw new Error('Unavailable'); }
        const reports = await boundedJson(response, 131072);
        if (!Array.isArray(reports) || reports.length > 50) throw new Error('Unavailable');
        const count = Number(response.headers.get('content-range')?.split('/')[1]);
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Unavailable');
        return reply(200, { ok: true, reports, total: count, page: Number(pageText) });
      }
      let data;
      try { data = await readBoundedJson(request); } catch { return reply(400, { ok: false }); }
      if (!data || Object.keys(data).length !== 2 || typeof data.id !== 'string' ||
          !/^[1-9]\d{0,18}$/.test(data.id) || BigInt(data.id) > 9223372036854775807n ||
          !STATUSES.includes(data.status)) return reply(400, { ok: false });
      const filters = new URLSearchParams({ id: 'eq.' + data.id, select: 'id,status' });
      const response = await call('/rest/v1/dictionary_reports?' + filters, {
        method: 'PATCH', headers: { ...databaseHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ status: data.status }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error('Unavailable'); }
      const changed = await boundedJson(response);
      if (!Array.isArray(changed) || changed.length !== 1) return reply(404, { ok: false });
      return reply(200, { ok: true });
    } catch {
      // Never log credentials, cookies, lookup terms, reports, or upstream error bodies.
      return reply(503, { ok: false, code: 'temporarily_unavailable' });
    }
  };
}
