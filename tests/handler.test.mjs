import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportHandler, normalizeReport } from '../supabase/functions/report-dictionary/handler.mjs';

const report = {
  requestId: '12345678-1234-4123-8123-123456789abc', term: ' UnknownWord ', category: 'missing',
  appVersion: '1.0.6', dictionaryVersion: '1.0', phraseDictionaryVersion: '1.0.0', targetLanguage: 'my',
};
const request = (body = report, options = {}) => new Request('https://example.test/report-dictionary', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...options,
});

test('normalizes terms and accepts existing-entry/phrase reports without an explanation', async () => {
  let stored;
  const handler = createReportHandler(async value => { stored = value; return 'accepted'; });
  const response = await handler(request({ ...report, term: ' Give  Up ', category: 'incorrect' }));
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(stored.term, 'give up');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('rejects fields that could collect context, paths, credentials, or arbitrary text', async () => {
  let calls = 0;
  const handler = createReportHandler(async () => { calls++; return 'accepted'; });
  for (const value of [
    { ...report, context: 'private subtitle' }, { ...report, apiKey: 'secret' },
    { ...report, term: 'https://private.test/stream' }, { ...report, term: 'C:\\Videos\\file.mkv' },
    { ...report, term: 'word\ncontext' }, { ...report, term: 'one two three four five six' },
    { ...report, term: 'x'.repeat(121) }, { ...report, category: 'other' },
    { ...report, targetLanguage: 'ja' }, { ...report, appVersion: 'x'.repeat(33) },
    { ...report, requestId: 'not-a-uuid' }, null, [],
  ]) {
    assert.equal(normalizeReport(value), null);
    assert.equal((await handler(request(value))).status, 400);
  }
  assert.equal(calls, 0);
});

test('validates HTTP method, content type, JSON, and streamed body size before storage', async () => {
  let calls = 0;
  const handler = createReportHandler(async () => { calls++; return 'accepted'; });
  assert.equal((await handler(new Request('https://example.test/', { method: 'GET' }))).status, 405);
  assert.equal((await handler(request(report, { headers: { 'Content-Type': 'text/plain' } }))).status, 415);
  assert.equal((await handler(request(report, { body: '{broken' }))).status, 400);
  assert.equal((await handler(request(report, { headers: { 'Content-Type': 'application/json', 'Content-Length': '99999' } }))).status, 400);
  // No Content-Length: the limit still applies to the bytes actually read.
  assert.equal((await handler(request(report, { body: 'x'.repeat(2049) }))).status, 400);
  assert.equal(calls, 0);
});

test('returns safe retryable errors and never exposes a database error or payload', async () => {
  const limited = await createReportHandler(async () => 'limited')(request());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '3600');
  const unavailable = await createReportHandler(async () => { throw new Error('secret/private word'); })(request());
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { ok: false, code: 'temporarily_unavailable' });
  assert.equal((await createReportHandler(async () => 'invalid')(request())).status, 400);
  assert.equal((await createReportHandler(async () => 'unknown')(request())).status, 503);
});
