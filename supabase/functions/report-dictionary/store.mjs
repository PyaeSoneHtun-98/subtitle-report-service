export function resolveServerCredentials(getEnv) {
  let modernKeys = {};
  try { modernKeys = JSON.parse(getEnv('SUPABASE_SECRET_KEYS') ?? '{}'); } catch { /* fail closed below */ }
  return {
    url: getEnv('SUPABASE_URL'),
    key: getEnv('REPORT_SERVICE_KEY') || modernKeys.default || getEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function createReportStore({ url, key }, fetcher = fetch) {
  return async function store(report) {
    if (!url || !key) throw new Error('Service not configured');
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    // New secret keys belong in apikey, not a JWT Authorization header.
    if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
    const response = await fetcher(url + '/rest/v1/rpc/submit_dictionary_report', {
      method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        p_request_id: report.requestId, p_term: report.term, p_category: report.category,
        p_target_language: report.targetLanguage, p_app_version: report.appVersion,
        p_dictionary_version: report.dictionaryVersion, p_phrase_dictionary_version: report.phraseDictionaryVersion,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Storage unavailable');
    }
    return response.json();
  };
}
