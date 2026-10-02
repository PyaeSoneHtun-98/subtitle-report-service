import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportStore, resolveServerCredentials } from '../supabase/functions/report-dictionary/store.mjs';

test('supports hosted modern secrets and legacy keys without putting a secret key into JWT authorization', async () => {
  const credentials = resolveServerCredentials(name => ({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_server_only' }),
  })[name]);
  let options;
  const store = createReportStore(credentials, async (url, init) => {
    assert.equal(url, 'https://example.supabase.co/rest/v1/rpc/submit_dictionary_report');
    options = init;
    return Response.json('accepted');
  });
  const report = {
    requestId: '12345678-1234-4123-8123-123456789abc', term: 'word', category: 'missing',
    targetLanguage: 'my', appVersion: '1.0.6', dictionaryVersion: '1.0', phraseDictionaryVersion: '1.0.0',
  };
  assert.equal(await store(report), 'accepted');
  assert.deepEqual(options.headers, { apikey: 'sb_secret_server_only', 'Content-Type': 'application/json' });
  assert.equal(options.redirect, 'error');
  assert.deepEqual(JSON.parse(options.body), {
    p_request_id: report.requestId, p_term: 'word', p_category: 'missing', p_target_language: 'my',
    p_app_version: '1.0.6', p_dictionary_version: '1.0', p_phrase_dictionary_version: '1.0.0',
  });
  assert.equal(resolveServerCredentials(name => ({ SUPABASE_SECRET_KEYS: '{bad', SUPABASE_SERVICE_ROLE_KEY: 'legacy' })[name]).key, 'legacy');
});

test('unconfigured or failed storage returns no secret or raw database response', async () => {
  await assert.rejects(createReportStore({})(null), /Service not configured/);
  await assert.rejects(createReportStore({ url: 'https://example.supabase.co', key: 'legacy' },
    async () => new Response('private database output', { status: 500 }))({}), /^Error: Storage unavailable$/);
});
