// gemini-vision parser container — a faithful self-host port of okraPDF cloud's
// Gemini vision parser (api.okrapdf.com /parse "gemini-vision"). It sends each
// page to Google Gemini as an inline PDF and parses the returned
// `<div data-bbox=... data-label=...>` layout HTML into the uniform okra parser
// HTTP contract. BYOK: set GOOGLE_API_KEY (or GEMINI_API_KEY).
//
//   GET  /health                       -> { ok, parser, version, model, configured }
//   POST /pages  { pdf_base64 }        -> { pageCount }                  (pdf-lib, no LLM call)
//   POST /parse  { pdf_base64, page }  -> { page, blocks: CanonicalBlock[] }  (bbox 0-1)
//
// Mirrors the cloud prompts + bbox math 1:1 (Gemini emits 0-1000 coords in
// [y_min,x_min,y_max,x_max] order; we swap to [x,y] and divide by 1000).
import { createServer } from 'node:http';
import { PDFDocument } from 'pdf-lib';

const PORT = Number(process.env.PORT || 8081);
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = process.env.OKRA_GEMINI_MODEL || 'gemini-3-flash-preview';
const DEFAULT_THINKING_BUDGET = process.env.OKRA_GEMINI_THINKING_BUDGET
  ? Number(process.env.OKRA_GEMINI_THINKING_BUDGET)
  : 32_768;
const MAX_OUTPUT_TOKENS = Number(process.env.OKRA_GEMINI_MAX_OUTPUT_TOKENS || 16_384);
const TIMEOUT_MS = Number(process.env.OKRA_GEMINI_TIMEOUT_MS || 120_000);
const MAX_RETRIES = Number(process.env.OKRA_GEMINI_MAX_RETRIES || 3);

function apiKey() {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
}

// ── prompts (ported verbatim from the cloud parser) ──────────────────────────
const SYSTEM_PROMPT_LAYOUT =
  'You are a document parser. Your task is to convert document images to clean, well-structured markdown.' +
  '\n\nGuidelines:\n' +
  '- Preserve the document structure (headings, paragraphs, lists, tables)\n' +
  '- Convert tables to HTML format (<table>, <tr>, <th>, <td>)\n' +
  '- For existing tables in the document: use colspan and rowspan attributes to preserve merged cells and hierarchical headers\n' +
  '- For charts/graphs being converted to tables: use flat combined column headers (e.g., "Primary 2015" not separate rows) so each data cell\'s row contains all its labels\n' +
  '- Describe images/figures briefly in square brackets like [Figure: description]\n' +
  '- Preserve any code blocks with appropriate syntax highlighting\n' +
  '- Maintain reading order (left-to-right, top-to-bottom for Western documents)\n' +
  '- Do not add commentary or explanations - only output the parsed content' +
  '\n\n' +
  'Additionally, wrap each layout element in a <div> tag with:\n' +
  '- data-bbox="[y_min, x_min, y_max, x_max]" — bounding box in normalized 0-1000 ' +
  'coordinates where x is horizontal (left edge = 0, right edge = 1000) and y is ' +
  'vertical (top = 0, bottom = 1000). The order is [y_min, x_min, y_max, x_max].\n' +
  '- data-label="<category>" — one of: Caption, Footnote, Formula, List-item, ' +
  'Page-footer, Page-header, Picture, Section-header, Table, Text, Title\n\n' +
  'Place elements in reading order. Every piece of content must be inside exactly one <div> wrapper.';

const SYSTEM_PROMPT =
  SYSTEM_PROMPT_LAYOUT +
  '\n\nThis input is a multi-page PDF. For every layout element, add an additional ' +
  'attribute data-page="N" (1-indexed) indicating which page the element appears on. ' +
  'Emit elements in reading order within each page, and pages in ascending order. Do not interleave pages.';

const USER_PROMPT =
  'Parse this document page and output its content as clean markdown, with each layout ' +
  'element wrapped in a <div data-bbox="[y_min,x_min,y_max,x_max]" data-label="Category"> tag. ' +
  'Use HTML tables for any tabular data. For charts/graphs, use flat combined column headers. ' +
  'Output ONLY the parsed content with div wrappers, no explanations.' +
  ' Every <div> must include data-page="N" (1-indexed) identifying its source page.';

const LABEL_MAP = {
  caption: 'Caption', footnote: 'Footnote', formula: 'Formula',
  'list-item': 'List-item', list_item: 'List-item',
  'page-footer': 'Page-footer', page_footer: 'Page-footer',
  'page-header': 'Page-header', page_header: 'Page-header',
  picture: 'Picture', figure: 'Picture',
  'section-header': 'Section-header', section_header: 'Section-header',
  table: 'Table', text: 'Text', title: 'Title',
};
const canonicalLabel = (raw) => LABEL_MAP[String(raw).toLowerCase()] ?? raw;

// ── bbox / layout-HTML parsing (ported from the cloud parser) ────────────────
const BBOX_FIRST = new RegExp(
  String.raw`<div\s+[^>]*?data-bbox=["'](\[[^\]]+\])["'][^>]*?data-label=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/div>`,
  'gi',
);
const LABEL_FIRST = new RegExp(
  String.raw`<div\s+[^>]*?data-label=["']([^"']+)["'][^>]*?data-bbox=["'](\[[^\]]+\])["'][^>]*?>([\s\S]*?)<\/div>`,
  'gi',
);
const DATA_PAGE = /data-page=["'](\d+)["']/i;

function tryParseBbox(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 4 && parsed.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return parsed;
    }
  } catch { /* fall through */ }
  return null;
}

function parseLayoutBlocks(content) {
  const rawMatches = [];
  for (const m of content.matchAll(BBOX_FIRST)) {
    rawMatches.push({ pos: m.index ?? 0, bboxStr: m[1], label: m[2], text: m[3], openTag: m[0].slice(0, m[0].indexOf('>') + 1) });
  }
  for (const m of content.matchAll(LABEL_FIRST)) {
    rawMatches.push({ pos: m.index ?? 0, bboxStr: m[2], label: m[1], text: m[3], openTag: m[0].slice(0, m[0].indexOf('>') + 1) });
  }
  rawMatches.sort((a, b) => a.pos - b.pos);
  const seen = new Set();
  const blocks = [];
  for (const m of rawMatches) {
    if (seen.has(m.pos)) continue;
    seen.add(m.pos);
    const bbox = tryParseBbox(m.bboxStr);
    if (!bbox) continue;
    const pageMatch = DATA_PAGE.exec(m.openTag);
    const page = pageMatch ? Number.parseInt(pageMatch[1], 10) : undefined;
    blocks.push({ bbox, label: m.label, text: m.text.trim(), ...(page && page > 0 ? { page } : {}) });
  }
  return blocks;
}

// Gemini emits [y_min, x_min, y_max, x_max] — swap to [x_min, y_min, x_max, y_max].
function swapGeminiBbox(b) {
  if (!Array.isArray(b) || b.length !== 4) return b;
  const [yMin, xMin, yMax, xMax] = b;
  return [xMin, yMin, xMax, yMax];
}

// 0-1000 → normalized 0-1 {x,y,w,h}.
function bboxToNormalized([x1, y1, x2, y2]) {
  return {
    x: Math.max(0, Math.min(x1, x2)) / 1000,
    y: Math.max(0, Math.min(y1, y2)) / 1000,
    w: Math.max(0, Math.abs(x2 - x1)) / 1000,
    h: Math.max(0, Math.abs(y2 - y1)) / 1000,
  };
}

// ── Gemini call ──────────────────────────────────────────────────────────────
function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
function base64ToBytes(b64) {
  const bin = atob(b64.replace(/^data:application\/pdf;base64,/, '').replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function isRetryable(err) {
  const status = err?.status;
  if (typeof status === 'number') return status === 408 || status === 429 || status >= 500;
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b(429|408|5\d{2})\b/.test(msg)) return true;
  return /rate limit|quota|timeout|aborted|ECONNRESET|ETIMEDOUT/i.test(msg);
}

async function callGemini(pageBase64) {
  const key = apiKey();
  if (!key) {
    throw new Error('GOOGLE_API_KEY (or GEMINI_API_KEY) is not set — gemini-vision runs BYOK only.');
  }
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: pageBase64 } }, { text: USER_PROMPT }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      ...(DEFAULT_THINKING_BUDGET !== null && Number.isFinite(DEFAULT_THINKING_BUDGET)
        ? { thinkingConfig: { thinkingBudget: DEFAULT_THINKING_BUDGET } }
        : {}),
    },
  };
  const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        const err = new Error(`Gemini API error ${res.status}: ${detail.slice(0, 400)}`);
        err.status = res.status;
        throw err;
      }
      const payload = await res.json();
      if (payload.error) throw new Error(`Gemini API error: ${payload.error.message ?? payload.error.status ?? 'unknown'}`);
      const parts = payload?.candidates?.[0]?.content?.parts ?? [];
      return parts.map((p) => p.text ?? '').join('');
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt >= MAX_RETRIES) throw err;
      const backoff = Math.min(30_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, backoff));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// Extract a single 1-indexed page as its own PDF so each /parse call is bounded.
async function extractPagePdf(pdfBytes, page) {
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  if (page < 1 || page > total) throw new Error(`page ${page} out of range (1..${total})`);
  const sub = await PDFDocument.create();
  const [copied] = await sub.copyPages(src, [page - 1]);
  sub.addPage(copied);
  return new Uint8Array(await sub.save());
}

async function parsePage(pdfBytes, page) {
  const pageBase64 = bytesToBase64(await extractPagePdf(pdfBytes, page));
  const layoutText = await callGemini(pageBase64);
  return parseLayoutBlocks(layoutText).map((b) => {
    const text = b.text;
    return {
      type: 'text',
      label: canonicalLabel(b.label),
      ...(text ? { value: text } : {}),
      bbox: bboxToNormalized(swapGeminiBbox(b.bbox)),
    };
  });
}

// ── HTTP server (uniform okra parser contract) ───────────────────────────────
function readJson(req, limitBytes = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(e); }
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
      return send(200, { ok: true, parser: 'gemini-vision', version: '0.1.0', model: DEFAULT_MODEL, configured: Boolean(apiKey()) });
    }
    if (req.method === 'POST' && (url.pathname === '/pages' || url.pathname === '/parse')) {
      const body = await readJson(req);
      if (!body.pdf_base64) return send(400, { error: 'pdf_base64 required' });
      const bytes = base64ToBytes(body.pdf_base64);
      if (url.pathname === '/pages') {
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        return send(200, { pageCount: doc.getPageCount() });
      }
      const page = Number(body.page || 1);
      const blocks = await parsePage(bytes, page);
      return send(200, { page, blocks });
    }
    send(404, { error: 'not_found' });
  } catch (e) {
    send(500, { error: e instanceof Error ? e.message : String(e) });
  }
});

// Only listen when run directly (`node server.mjs`); stay importable for tests.
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  server.listen(PORT, '0.0.0.0', () =>
    console.log(`gemini-vision parser listening on :${PORT} (model ${DEFAULT_MODEL}, key ${apiKey() ? 'set' : 'MISSING'})`),
  );
}

export { parseLayoutBlocks, swapGeminiBbox, bboxToNormalized, canonicalLabel, parsePage, callGemini };
