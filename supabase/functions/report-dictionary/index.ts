import { createReportHandler } from './handler.mjs'
import { createReportStore, resolveServerCredentials } from './store.mjs'

// Credentials never leave Supabase. The public endpoint has no user login requirement.
const credentials = resolveServerCredentials((name: string) => Deno.env.get(name))
Deno.serve(createReportHandler(createReportStore(credentials)))
