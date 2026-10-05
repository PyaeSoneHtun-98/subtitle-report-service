export default {
  fetch(request) {
    if (!['GET', 'HEAD'].includes(request.method))
      return Response.json({ ok: false }, { status: 405, headers: { Allow: 'GET, HEAD' } });
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ ok: true, service: 'dictionary-reports' }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  },
};
