import { boundedJson } from './http.mjs';
export const REPORT_COLUMNS = 'id,term,category,report_count,status,dictionary_version,phrase_dictionary_version,last_app_version,first_reported_at,last_reported_at';
export class StorageError extends Error {
  constructor(code) { super('Report storage unavailable'); this.code = code; }
}
export async function readReportPage(call, headers, { status = '', category = '', q = '', page = '0' } = {}) {
  const filters = new URLSearchParams({
    select: REPORT_COLUMNS, order: 'last_reported_at.desc,id.desc', limit: '50', offset: String(Number(page) * 50),
  });
  if (status) filters.set('status', 'eq.' + status);
  if (category) filters.set('category', 'eq.' + category);
  if (q) filters.set('term', 'ilike.*' + q + '*');
  const response = await call('/rest/v1/dictionary_reports?' + filters, { headers: { ...headers, Prefer: 'count=exact' } });
  if (!response.ok) {
    await response.body?.cancel();
    throw new StorageError([401, 403].includes(response.status) ? 'storage_access_denied' : response.status === 404 ? 'storage_schema_unavailable' : 'storage_unavailable');
  }
  const reports = await boundedJson(response, 131072);
  const range = response.headers.get('content-range');
  if (!Array.isArray(reports) || reports.length > 50 || !range || !/^(?:\d+-\d+|\*)\/\d+$/.test(range))
    throw new StorageError('storage_response_invalid');
  const count = Number(range.split('/')[1]);
  if (!Number.isSafeInteger(count) || count < 0) throw new StorageError('storage_response_invalid');
  return { reports, total: count, page: Number(page) };
}
