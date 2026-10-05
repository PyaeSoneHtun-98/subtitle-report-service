// Classification only; the Supabase server verifies the actual credential.
export function serverKeyKind(key) {
  if (typeof key !== 'string' || key !== key.trim()) return 'unsupported';
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return 'secret';
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return 'unsupported';
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role === 'service_role' ? 'legacy-service-role' : 'unsupported';
  } catch { return 'unsupported'; }
}
