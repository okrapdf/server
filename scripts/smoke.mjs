#!/usr/bin/env node
// End-to-end smoke: upload the sample PDF, run the parse recipe, and assert the
// document graph contains real extracted text. Proves the server + bundle +
// poppler/tesseract extraction work end to end — no okraPDF cloud involved.
//
//   OKRA_API_KEY=... OKRA_BASE_URL=http://localhost:8787 node scripts/smoke.mjs
//
// Run it against your own deployment to verify it works.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.env.OKRA_BASE_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const key = process.env.OKRA_API_KEY ?? '';
const auth = { Authorization: `Bearer ${key}` };
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docId = `smoke-${Date.now()}`;

function die(msg) {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exit(1);
}

// 1. health
let r = await fetch(`${base}/health`).catch((e) => die(`/health unreachable: ${e.message}`));
if (!r.ok) die(`/health → ${r.status}`);
console.log('✓ health');

// 2. upload the sample PDF (raw body)
const pdf = readFileSync(resolve(root, 'samples/hello.pdf'));
r = await fetch(`${base}/document/${docId}/upload`, {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/pdf', 'x-file-name': 'hello.pdf' },
  body: pdf,
});
if (!r.ok) die(`upload → ${r.status} (set OKRA_API_KEY?)`);
console.log('✓ upload');

// 3. run the parse recipe (poppler text layer + tesseract OCR)
r = await fetch(`${base}/v1/workflows`, {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({ recipe_id: 'recipe.parse-document', document_id: docId }),
});
if (!r.ok) die(`parse → ${r.status}`);
console.log('✓ parse');

// 4. the document graph must contain the real extracted text
r = await fetch(`${base}/v1/documents/${docId}/graph`, { headers: auth });
if (!r.ok) die(`graph → ${r.status}`);
const graph = JSON.stringify(await r.json());
if (!graph.includes('quick brown fox')) die('graph is missing the extracted text ("quick brown fox")');
console.log('✓ graph has real extracted text');

console.log('SMOKE PASS');
