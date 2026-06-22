// liteparse parser container — native @llamaindex/liteparse behind the uniform
// okra parser HTTP contract. Stateless (LRU-1 cache is a per-process optimization
// so the orchestrator's per-page calls don't re-parse the whole doc).
//
//   GET  /health                          -> { ok, parser, version }
//   POST /pages  { pdf_base64 }           -> { pageCount }
//   POST /parse  { pdf_base64, page }     -> { page, blocks: CanonicalBlock[] }  (bbox 0-1)
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { LiteParse } from '@llamaindex/liteparse';

const PORT = Number(process.env.PORT || 8080);
const parser = new LiteParse({ ocrEnabled: false });

/** LRU-1: the orchestrator processes one document's pages back-to-back. */
let cache = null; // { key: string, result: any }

async function parseDoc(bytes) {
  const key = createHash('sha256').update(bytes).digest('hex');
  if (cache && cache.key === key) return cache.result;
  const result = await parser.parse(bytes);
  cache = { key, result };
  return result;
}

function pageBlocks(result, page) {
  const p = result?.pages?.[page - 1];
  if (!p) return [];
  const W = p.width || 1;
  const H = p.height || 1;
  return (p.textItems || [])
    .filter((it) => it && typeof it.text === 'string' && it.text.trim())
    .map((it) => ({
      type: 'text',
      value: it.text,
      bbox: {
        x: Math.max(0, Math.min(1, (it.x || 0) / W)),
        y: Math.max(0, Math.min(1, (it.y || 0) / H)),
        w: Math.max(0, Math.min(1, (it.width || 0) / W)),
        h: Math.max(0, Math.min(1, (it.height || 0) / H)),
      },
      ...(typeof it.confidence === 'number' ? { confidence: it.confidence } : {}),
    }));
}

function readJson(req, limitBytes = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const send = (status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(200, { ok: true, parser: 'liteparse', version: '2.1.2' });
    }
    if (req.method === 'POST' && (url.pathname === '/pages' || url.pathname === '/parse')) {
      const body = await readJson(req);
      if (!body.pdf_base64) return send(400, { error: 'pdf_base64 required' });
      const bytes = Buffer.from(body.pdf_base64, 'base64');
      const result = await parseDoc(bytes);
      if (url.pathname === '/pages') {
        return send(200, { pageCount: result?.pages?.length ?? 0 });
      }
      const page = Number(body.page || 1);
      return send(200, { page, blocks: pageBlocks(result, page) });
    }
    send(404, { error: 'not_found' });
  } catch (e) {
    send(500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`liteparse parser listening on :${PORT}`));
