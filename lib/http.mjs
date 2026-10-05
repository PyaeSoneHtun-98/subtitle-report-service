export async function boundedJson(response, limit = 16384) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Unavailable');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw new Error('Unavailable');
      chunks.push(part.value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export function supabaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
        url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch { return null; }
}
