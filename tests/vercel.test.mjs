import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminHandler } from '../lib/admin.mjs';
import { createRelayStore } from '../lib/relay.mjs';
import { createReportHandler } from '../supabase/functions/report-dictionary/handler.mjs';
import health from '../api/health.js';

const ownerId = '12345678-1234-4123-8123-123456789abc';
const otherId = '22345678-1234-4123-8123-123456789abc';
const base = 'https://exampleproject.supabase.co';
const config = { url: base, key: 'sb_secret_test_only', ownerId };
const origin = 'https://reports.example.test';
function request(action, options = {}) {
  const { params = {}, ...init } = options;
  return new Request(origin + '/api/admin?' + new URLSearchParams({ action, ...params }), init);
}
function post(action, body, headers = {}) {
  return request(action, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
const signed = (action, params) => action === 'reports' ? post(action, { status: '', category: '', q: '', page: '0', ...params }, { Cookie: '__Host-report_owner=test-user-token' }) : request(action, { params, headers: { Cookie: '__Host-report_owner=test-user-token' } });
const report = { requestId: ownerId, term: 'example', category: 'incorrect', targetLanguage: 'my', appVersion: '1.0.6', dictionaryVersion: '1.0', phraseDictionaryVersion: '1.0.0' };

test('health endpoint is public, has no configuration/credentials and performs no submission', async () => {
  const response = await health.fetch(new Request(origin + '/api/health'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'dictionary-reports' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await health.fetch(new Request(origin + '/api/health', { method: 'POST' }))).status, 405);
});

test('admin fails closed without credentials and never reads storage without a valid owner session', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('Must not run'); };
  assert.equal((await createAdminHandler({ ...config, key: '' }, fetcher)(signed('reports'))).status, 503);
  assert.equal((await createAdminHandler({ ...config, url: 'http://localhost' }, fetcher)(signed('reports'))).status, 503);
  const handler = createAdminHandler(config, fetcher);
  assert.equal((await handler(post('reports', {}))).status, 401);
  assert.equal((await handler(post('reports', {}, { Cookie: '__Host-report_owner=%ZZ' }))).status, 401);
  assert.equal((await handler(request('reports', { method: 'POST', params: { token: 'not-a-cookie' }, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }))).status, 401);
  assert.equal(calls, 0);
});

test('admin rejects cross-origin writes and unsupported methods before contacting Supabase', async () => {
  let calls = 0;
  const handler = createAdminHandler(config, async () => { calls++; });
  assert.equal((await handler(post('login', { email: 'owner@example.test', password: 'test-only' }, { Origin: 'https://evil.test' }))).status, 403);
  assert.equal((await handler(post('logout', {}, { Origin: '' }))).status, 403);
  assert.equal((await handler(request('status'))).status, 405);
  assert.equal((await handler(request('unknown'))).status, 404);
  assert.equal(calls, 0);
});

test('login permits only the configured owner and stores a bounded secure HttpOnly cookie', async () => {
  const calls = [];
  let identity = otherId;
  const handler = createAdminHandler(config, async (url, options) => {
    calls.push({ url, options });
    return Response.json({ user: { id: identity }, access_token: 'test-user-token', expires_in: 7200 });
  });
  const data = { email: 'owner@example.test', password: 'test-only-password' };
  let response = await handler(post('login', data));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('set-cookie'), null);
  identity = ownerId;
  response = await handler(post('login', data));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const cookie = response.headers.get('set-cookie');
  for (const attribute of ['__Host-report_owner=', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=3600']) assert.ok(cookie.includes(attribute));
  assert.equal(calls[1].url, base + '/auth/v1/token?grant_type=password');
  assert.equal(calls[1].options.headers.apikey, config.key);
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.redirect, 'error');
});

test('login rejects oversized, extra-field, malformed, and non-JSON input without authenticating', async () => {
  let calls = 0;
  const handler = createAdminHandler(config, async () => { calls++; });
  for (const body of [null, {}, { email: 'owner@example.test', password: 'x', owner: true }, { email: 'bad', password: 'x' }, { email: 'owner@example.test', password: 'x'.repeat(257) }]) {
    assert.equal((await handler(post('login', body))).status, 400);
  }
  assert.equal((await handler(request('login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: 'x'.repeat(2049) }))).status, 400);
  assert.equal((await handler(post('login', {}, { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal(calls, 0);
});

test('every admin read verifies the live identity and denies a non-owner or invalid session', async () => {
  const calls = [];
  const handler = createAdminHandler(config, async (url, options) => {
    calls.push({ url, options });
    return Response.json({ id: otherId });
  });
  assert.equal((await handler(signed('reports'))).status, 401);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, base + '/auth/v1/user');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-user-token');
  const invalid = createAdminHandler(config, async () => Response.json({}, { status: 401 }));
  assert.equal((await invalid(signed('session'))).status, 401);
});

test('owner report listing uses bounded pagination and fixed columns without exposing credentials', async () => {
  const calls = [];
  const handler = createAdminHandler(config, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: ownerId });
    return Response.json([{ id: 1, term: 'example', report_count: 2, status: 'new' }], { headers: { 'Content-Range': '50-50/51' } });
  });
  const response = await handler(signed('reports', { page: '1', q: 'give up', status: 'new', category: 'missing' }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.total, 51); assert.equal(data.page, 1);
  const url = new URL(calls[1].url);
  assert.equal(url.searchParams.get('limit'), '50'); assert.equal(url.searchParams.get('offset'), '50');
  assert.equal(url.searchParams.get('term'), 'ilike.*give up*'); assert.equal(url.searchParams.get('status'), 'eq.new');
  assert.equal(url.searchParams.get('category'), 'eq.missing');
  assert.ok(!url.searchParams.get('select').includes('*'));
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.headers.apikey, config.key);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!JSON.stringify(data).includes(config.key));
});

test('invalid owner filters cannot become arbitrary storage queries', async () => {
  let calls = 0;
  const handler = createAdminHandler(config, async () => { calls++; return Response.json({ id: ownerId }); });
  for (const params of [{ page: '-1' }, { page: '10000' }, { status: 'delete' }, { category: 'other' }, { q: 'a*' }, { q: 'x'.repeat(121) }]) {
    assert.equal((await handler(signed('reports', params))).status, 400);
  }
  assert.equal(calls, 6); // Identity checks only; no database query.
});

test('review updates authenticate first and change only the selected row status', async () => {
  const calls = [];
  const handler = createAdminHandler(config, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: ownerId });
    return Response.json([{ id: 7, status: 'reviewed' }]);
  });
  let response = await handler(post('status', { id: '7', status: 'reviewed' }, { Cookie: '__Host-report_owner=test-user-token' }));
  assert.equal(response.status, 200);
  assert.equal(new URL(calls[1].url).searchParams.get('id'), 'eq.7');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[1].options.body), { status: 'reviewed' });
  for (const body of [{ id: '7', status: 'reviewed', term: 'overwrite' }, { id: '7', status: 'invalid' }, { id: '0', status: 'new' }, { id: '9223372036854775808', status: 'new' }]) {
    response = await handler(post('status', body, { Cookie: '__Host-report_owner=test-user-token' }));
    assert.equal(response.status, 400);
  }
  assert.equal(calls.filter(call => call.options.method === 'PATCH').length, 1);
});

test('upstream failures never expose response bodies or secrets; logout clears the cookie', async () => {
  const handler = createAdminHandler(config, async () => { throw new Error('private credential and report body'); });
  const response = await handler(signed('reports'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: 'temporarily_unavailable' });
  const logout = await handler(post('logout', {}));
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));
});

test('report relay preserves retry receipts and privacy and acknowledges only bounded successful responses', async () => {
  const calls = [];
  const relay = createRelayStore(base + '/functions/v1/report-dictionary', async (url, options) => {
    calls.push({ url, options }); return Response.json({ ok: true }, { status: 202 });
  });
  const handler = createReportHandler(relay);
  const req = () => new Request(origin + '/api/report-dictionary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
  assert.equal((await handler(req())).status, 202);
  assert.equal((await handler(req())).status, 202);
  assert.deepEqual(JSON.parse(calls[0].options.body), report);
  assert.equal(JSON.parse(calls[1].options.body).requestId, report.requestId);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[0].options.headers.apikey, undefined);
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  for (const response of [Response.json({ ok: false }, { status: 202 }), new Response('x'.repeat(1025), { status: 202 }), Response.json({ ok: true }, { status: 500 })]) {
    await assert.rejects(createRelayStore(base + '/functions/v1/report-dictionary', async () => response)(report), Error);
  }
});

test('report relay rejects unsafe/unconfigured targets and preserves quota/invalid outcomes', async () => {
  let calls = 0;
  for (const endpoint of ['', 'http://exampleproject.supabase.co/functions/v1/report-dictionary', base + '/rest/v1/', base + '/functions/v1/report-dictionary?key=secret', 'https://exampleproject.supabase.co.evil.test/functions/v1/report-dictionary']) {
    await assert.rejects(createRelayStore(endpoint, async () => { calls++; })(report), Error);
  }
  assert.equal(calls, 0);
  assert.equal(await createRelayStore(base + '/functions/v1/report-dictionary', async () => new Response(null, { status: 429 }))(report), 'limited');
  assert.equal(await createRelayStore(base + '/functions/v1/report-dictionary', async () => new Response(null, { status: 400 }))(report), 'invalid');
});

