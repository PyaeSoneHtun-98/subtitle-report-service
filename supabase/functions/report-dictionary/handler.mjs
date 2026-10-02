const MAX_BODY_BYTES = 2048;
const FIELDS = ['requestId', 'term', 'category', 'appVersion', 'dictionaryVersion', 'phraseDictionaryVersion', 'targetLanguage'];
const VERSION = /^\d+\.\d+(?:\.\d+)?(?:-[a-z0-9.-]+)?$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeReport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).length !== FIELDS.length || Object.keys(value).some(key => !FIELDS.includes(key))) return null;
  if (typeof value.term !== 'string' || value.term.length > 120) return null;
  const term = value.term.normalize('NFKC').trim().toLowerCase().replace(/ +/g, ' ');
  if (!term || term.length > 120 || term.split(' ').length > 5 || !/^[\p{L}\p{N}][\p{L}\p{N}'’ .-]*$/u.test(term)) return null;
  if (value.category !== 'missing' && value.category !== 'incorrect') return null;
  if (typeof value.requestId !== 'string' || !UUID.test(value.requestId)) return null;
  if (value.targetLanguage !== 'my') return null;
  for (const field of ['appVersion', 'dictionaryVersion', 'phraseDictionaryVersion']) {
    if (typeof value[field] !== 'string' || value[field].length > 32 || !VERSION.test(value[field])) return null;
  }
  return { ...value, term, requestId: value.requestId.toLowerCase() };
}

function reply(status, code, ok = false) {
  return Response.json({ ok, ...(code ? { code } : {}) }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 429 ? { 'Retry-After': '3600' } : {}) }
  });
}

async function readBoundedJson(request) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw new Error('body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error('body');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

// No browser CORS access is needed: the official desktop app calls this from Electron's main process.
// storeReport is injected so exactly this production handler is exercised by Node behavioral tests.
export function createReportHandler(storeReport) {
  return async function handle(request) {
    if (request.method !== 'POST') return reply(405, 'method_not_allowed');
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, 'json_required');
    let report;
    try { report = normalizeReport(await readBoundedJson(request)); }
    catch { return reply(400, 'invalid_report'); }
    if (!report) return reply(400, 'invalid_report');
    try {
      const result = await storeReport(report);
      if (result === 'accepted') return reply(202, null, true);
      if (result === 'limited') return reply(429, 'rate_limited');
      if (result === 'invalid') return reply(400, 'invalid_report');
      return reply(503, 'temporarily_unavailable');
    } catch {
      // Deliberately do not log payloads, terms, credentials, or database responses.
      return reply(503, 'temporarily_unavailable');
    }
  };
}
