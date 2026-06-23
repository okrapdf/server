/**
 * okra self-host orchestrator entrypoint (workerd).
 * Thin HTTP front door → per-document DocumentAgent (the durable run lives there).
 */
import { DocumentAgent, WorkspaceIndex, type Env } from './document-agent';

export { DocumentAgent, WorkspaceIndex };

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

/** Decode the client's percent-encoded x-file-name header back to UTF-8. */
function decodeFileName(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // tolerate a plain (un-encoded) value
  }
}

/** Parsers this build ships with; their URLs resolve as OKRA_PARSER_<ID>_URL. */
const KNOWN_PARSERS = ['liteparse', 'gemini-vision'] as const;

/** Live health of each configured parser sidecar (for the UI's runtime status). */
async function parserHealth(env: Env): Promise<Array<{ id: string; ok: boolean; configured?: boolean }>> {
  const envRec = env as unknown as Record<string, string | undefined>;
  return Promise.all(
    KNOWN_PARSERS.map(async (id) => {
      const base = envRec[`OKRA_PARSER_${id.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}_URL`];
      if (!base) return { id, ok: false };
      try {
        const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2500) });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; configured?: boolean };
        return { id, ok: Boolean(body.ok ?? res.ok), configured: body.configured };
      } catch {
        return { id, ok: false };
      }
    }),
  );
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

async function listIndex(env: Env) {
  try { return await env.OKRA_INDEX.get(env.OKRA_INDEX.idFromName('workspace')).list(); }
  catch { return []; }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return json({ ok: true, service: 'okra-self-host-orchestrator', parsers: await parserHealth(env) });
    }

    if (url.pathname === '/v1/documents') {
      if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
      return json({ documents: await listIndex(env) });
    }
    if (url.pathname === '/v1/jobs') {
      if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
      return json({ jobs: await listIndex(env) });
    }

    const m = url.pathname.match(/^\/v1\/documents\/([^/]+)\/(upload|parse|status|graph|pdf)$/);
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
          // x-file-name is percent-encoded by the client (header values are
          // ISO-8859-1 only) — decode back to the real UTF-8 filename.
          fileName = decodeFileName(req.headers.get('x-file-name'));
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
      if (action === 'pdf') {
        if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
        const b64 = await stub.getPdfBase64();
        if (!b64) return json({ error: 'not_found' }, 404);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'cache-control': 'private, max-age=300' } });
      }
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
    return json({ error: 'not_found' }, 404);
  },
};
