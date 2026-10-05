import { boundedJson, supabaseUrl } from './http.mjs';
export function createRelayStore(endpoint, fetcher = fetch) {
  let upstream = null;
  try {
    const url = new URL(endpoint);
    if (supabaseUrl(url.origin) && !url.username && !url.password && !url.port && !url.search && !url.hash &&
        url.pathname === '/functions/v1/report-dictionary') upstream = url.href;
  } catch { /* unconfigured endpoints fail closed */ }
  return async report => {
    if (!upstream) throw new Error('Unavailable');
    const response = await fetcher(upstream, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(report), redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(8000),
    });
    if (response.status === 429 || response.status === 400) {
      await response.body?.cancel();
      return response.status === 429 ? 'limited' : 'invalid';
    }
    if (response.status !== 200 && response.status !== 202) {
      await response.body?.cancel();
      throw new Error('Unavailable');
    }
    if ((await boundedJson(response, 1024))?.ok !== true) throw new Error('Unavailable');
    return 'accepted';
  };
}
