import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/202610020001_dictionary_reports.sql', import.meta.url), 'utf8');
async function database() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(migration);
  return db;
}
async function submit(db, overrides = {}) {
  const report = {
    requestId: randomUUID(), term: 'example', category: 'missing', targetLanguage: 'my',
    appVersion: '1.0.6', dictionaryVersion: '1.0', phraseDictionaryVersion: '1.0.0', ...overrides,
  };
  const result = await db.query('select public.submit_dictionary_report($1::uuid,$2,$3,$4,$5,$6,$7) as result', [
    report.requestId, report.term, report.category, report.targetLanguage,
    report.appVersion, report.dictionaryVersion, report.phraseDictionaryVersion,
  ]);
  return result.rows[0].result;
}

test('real migration groups reports, counts distinct requests and makes response-loss retries idempotent', async () => {
  const db = await database();
  try {
    const requestId = randomUUID();
    assert.equal(await submit(db, { requestId }), 'accepted');
    assert.equal(await submit(db, { requestId }), 'accepted');
    assert.equal(await submit(db, { requestId, term: 'different' }), 'invalid');
    assert.equal(await submit(db), 'accepted');
    assert.equal((await db.query('select report_count from public.dictionary_reports')).rows[0].report_count, 2);
    assert.equal((await db.query('select submissions from reports_private.submission_limit')).rows[0].submissions, 2);
    await db.exec("update public.dictionary_reports set status = 'reviewed'");
    assert.equal(await submit(db), 'accepted');
    assert.equal((await db.query('select status from public.dictionary_reports')).rows[0].status, 'reviewed');
    assert.equal(await submit(db, { category: 'incorrect', term: 'give up' }), 'accepted');
    assert.equal(await submit(db, { dictionaryVersion: '1.1' }), 'accepted');
    assert.equal((await db.query('select count(*)::integer as count from public.dictionary_reports')).rows[0].count, 3);
  } finally { await db.close(); }
});

test('anonymous and authenticated database access is denied; service role alone may submit', async () => {
  const db = await database();
  try {
    await submit(db);
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(db.query('select * from public.dictionary_reports'), /permission denied/);
      await assert.rejects(submit(db), /permission denied/);
      await assert.rejects(db.query('select * from reports_private.receipts'), /permission denied/);
      await db.exec('reset role');
    }
    // RLS still hides reports if a public SELECT grant is accidentally introduced later.
    await db.exec('grant select on public.dictionary_reports to anon; set role anon;');
    assert.deepEqual((await db.query('select * from public.dictionary_reports')).rows, []);
    await db.exec('reset role; set role service_role;');
    assert.equal(await submit(db), 'accepted');
    assert.equal((await db.query('select count(*)::integer as count from public.dictionary_reports')).rows[0].count, 1);
    await db.exec('reset role');
  } finally { await db.close(); }
});

test('hourly quota is atomic and accepted retries work even when the quota is exhausted', async () => {
  const db = await database();
  try {
    await db.exec('update reports_private.submission_limit set submissions = 499');
    const requestId = randomUUID();
    assert.equal(await submit(db, { requestId }), 'accepted');
    assert.equal(await submit(db), 'limited');
    assert.equal(await submit(db, { requestId }), 'accepted');
    assert.equal((await db.query('select report_count from public.dictionary_reports')).rows[0].report_count, 1);
    await db.exec("update reports_private.submission_limit set window_start = now() - interval '2 hours'");
    assert.equal(await submit(db), 'accepted');
    assert.equal((await db.query('select submissions from reports_private.submission_limit')).rows[0].submissions, 1);
  } finally { await db.close(); }
});

test('failed storage rolls back the quota and receipt; database independently rejects invalid fields', async () => {
  const db = await database();
  try {
    for (const overrides of [
      { targetLanguage: 'ja' }, { category: 'other' }, { term: null }, { term: 'x'.repeat(121) },
      { term: 'https://example.test' }, { appVersion: null }, { dictionaryVersion: 'invalid' },
    ]) assert.equal(await submit(db, overrides), 'invalid');
    assert.equal(await submit(db), 'accepted');
    await db.exec('alter table public.dictionary_reports add constraint test_storage_failure check (report_count < 2)');
    await assert.rejects(submit(db), /test_storage_failure/);
    assert.equal((await db.query('select submissions from reports_private.submission_limit')).rows[0].submissions, 1);
    assert.equal((await db.query('select count(*)::integer as count from reports_private.receipts')).rows[0].count, 1);
  } finally { await db.close(); }
});
