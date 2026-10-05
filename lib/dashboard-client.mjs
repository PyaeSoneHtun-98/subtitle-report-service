export class DashboardError extends Error {
  constructor(status, code) { super('Request unavailable'); this.status = status; this.code = code; }
}
export async function adminRequest(action, body, signal) {
  const response = await fetch('/api/admin?action=' + action, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    credentials: 'same-origin', cache: 'no-store', signal,
  });
  let data;
  try { data = await response.json(); } catch { throw new DashboardError(response.status, 'unavailable'); }
  if (!response.ok || !data.ok) throw new DashboardError(response.status, data.code);
  return data;
}
export function errorMessage(error) {
  if (error?.code === 'login_failed') return 'Sign-in failed. Check your owner email and password.';
  if (error?.code === 'not_configured') return 'Owner access is not configured. Check the Vercel server settings.';
  if (error?.code === 'storage_access_denied') return 'Report storage denied access. Check the server secret key and database permissions.';
  if (error?.code === 'storage_schema_unavailable') return 'Report storage is not ready. Check the database migration and Data API configuration.';
  if (error?.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  return 'We could not load your reports. Please try again.';
}
