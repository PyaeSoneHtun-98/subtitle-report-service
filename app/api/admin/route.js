import { resolveServerCredentials } from '../../../supabase/functions/report-dictionary/store.mjs';
import { createAdminHandler } from '../../../lib/admin.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;
function handle(request) {
  const credentials = resolveServerCredentials(name => process.env[name]);
  return createAdminHandler({ ...credentials, ownerId: process.env.REPORT_ADMIN_USER_ID })(request);
}
export const GET = handle;
export const POST = handle;
