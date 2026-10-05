import { resolveServerCredentials } from '../supabase/functions/report-dictionary/store.mjs';
import { createAdminHandler } from '../lib/admin.mjs';
const credentials = resolveServerCredentials(name => process.env[name]);
export default { fetch: createAdminHandler({ ...credentials, ownerId: process.env.REPORT_ADMIN_USER_ID }) };
