import { createReportHandler } from '../../../supabase/functions/report-dictionary/handler.mjs';
import { createRelayStore } from '../../../lib/relay.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;
const handle = request => createReportHandler(createRelayStore(process.env.REPORT_UPSTREAM_URL))(request);
export const POST = handle;
export const GET = handle;
