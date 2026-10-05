import { createReportHandler } from '../supabase/functions/report-dictionary/handler.mjs';
import { createRelayStore } from '../lib/relay.mjs';
export default { fetch: createReportHandler(createRelayStore(process.env.REPORT_UPSTREAM_URL)) };
