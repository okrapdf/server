/**
 * okra self-host orchestrator entrypoint (workerd).
 * Thin HTTP front door → per-document DocumentAgent (the durable run lives there).
 */
import { DocumentAgent, type Env } from './document-agent';

export { DocumentAgent };

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024; // 64 MiB cap on request bodies

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** Serve a static UI asset; fall back to index.html for SPA navigations. */
async function serveAsset(req: Request, env: Env): Promise<Response> {
  const res = await env.ASSETS.fetch(req);
  if (res.status === 404 && req.method === 'GET' && (req.headers.get('accept') ?? '').includes('text/html')) {
    const url = new URL(req.url);
    url.pathname = '/index.html';
    return env.ASSETS.fetch(new Request(url, { headers: req.headers }));
  }
  return res;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return json({ ok: true, service: 'okra-self-host-orchestrator' });
    }

    const m = url.pathname.match(/^\/v1\/documents\/([^/]+)\/(upload|parse|status|graph)$/);
    if (!m) {
      // API paths stay JSON 404s; everything else is the bundled self-host UI
      // (wrangler [assets]), with an SPA fallback to index.html for navigations.
      if (url.pathname.startsWith('/v1/')) return json({ error: 'not_found' }, 404);
      return serveAsset(req, env);
    }
    const documentId = decodeURIComponent(m[1]);
    const action = m[2];
    const stub = env.DOCUMENT_AGENT.get(env.DOCUMENT_AGENT.idFromName(documentId));

    try {
      if (action === 'upload' || action === 'parse') {
        if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
        if (Number(req.headers.get('content-length') ?? 0) > MAX_UPLOAD_BYTES) return json({ error: 'payload_too_large' }, 413);
        const ct = req.headers.get('content-type') ?? '';
        let pdfBase64: string;
        let fileName: string | undefined;
        let parserId: string | undefined;
        if (ct.includes('application/json')) {
          const body = (await req.json()) as { pdf_base64?: string; file_name?: string; parser?: string };
          if (!body.pdf_base64) return json({ error: 'pdf_base64 required' }, 400);
          pdfBase64 = body.pdf_base64;
          fileName = body.file_name;
          parserId = body.parser;
        } else {
          const buf = new Uint8Array(await req.arrayBuffer());
          if (buf.byteLength === 0) return json({ error: 'empty body' }, 400);
          if (buf.byteLength > MAX_UPLOAD_BYTES) return json({ error: 'payload_too_large' }, 413);
          pdfBase64 = bytesToBase64(buf);
          fileName = req.headers.get('x-file-name') ?? undefined;
          parserId = url.searchParams.get('parser') ?? undefined;
        }
        const res = await stub.startRun({ documentId, pdfBase64, fileName, parserId });
        return json(res, 202);
      }
      if (action === 'status') {
        if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
        return json(await stub.getStatus());
      }
      if (action === 'graph') {
        if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
        return json(await stub.getGraph());
      }
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
    return json({ error: 'not_found' }, 404);
  },
};
