export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ ok: true, service: 'dictionary-reports' }, { headers: { 'Cache-Control': 'no-store' } });
}
export function HEAD() { return new Response(null, { headers: { 'Cache-Control': 'no-store' } }); }
