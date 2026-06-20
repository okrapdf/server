/**
 * E2E integration tests — verifies every OkraClient method works against live api.okrapdf.com.
 * Requires OKRA_API_KEY env var. Skipped in CI (no key).
 * Run: OKRA_API_KEY=okra_... pnpm vitest run src/client.e2e.test.ts
 */
import { describe, expect, it } from 'vitest';
import { OkraClient } from './client';

const API_KEY = process.env.OKRA_API_KEY;
const describeE2E = API_KEY ? describe : describe.skip;

describeE2E('OkraClient e2e against live API', () => {
  const client = new OkraClient({ apiKey: API_KEY! });
  let docId: string;
  let docPhase: string;

  // ─── Document CRUD ──────────────────────────────────────────────────

  it('listDocuments returns array', async () => {
    const result = await client.listDocuments();
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);

    // Pick a complete doc for subsequent tests
    const ready = result.find(
      (d: any) => d.phase === 'complete' || d.phase === 'completed' || d.status === 'completed',
    );
    if (!ready) {
      // Fall back to any doc
      docId = result[0].id;
      docPhase = result[0].phase || result[0].status || 'unknown';
    } else {
      docId = ready.id;
      docPhase = ready.phase || ready.status;
    }
    expect(docId).toBeTruthy();
  }, 15000);

  it('status returns phase and pages', async () => {
    const s = await client.status(docId);
    expect(s.phase).toBeTruthy();
    expect(typeof s.totalPages).toBe('number');
  }, 10000);

  // ─── Content reads ──────────────────────────────────────────────────

  it('pages returns page data', async () => {
    const p = await client.pages(docId);
    // SDK may return { pages: [...] } or Page[]
    const arr = Array.isArray(p) ? p : (p as any).pages;
    expect(arr).toBeInstanceOf(Array);
    expect(arr.length).toBeGreaterThan(0);
  }, 10000);

  it('page returns single page', async () => {
    const p = await client.page(docId, 1);
    expect(p).toBeTruthy();
  }, 10000);

  // TODO: read() needs /v1/documents/:id/full.md — requires API rewrite deploy
  it.skip('read returns markdown string', async () => {
    const md = await client.read(docId);
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(10);
  }, 15000);

  it('entities returns node data', async () => {
    const e = await client.entities(docId);
    // SDK may return { nodes: [...] } or array
    const arr = Array.isArray(e) ? e : (e as any).nodes;
    expect(arr).toBeInstanceOf(Array);
  }, 10000);

  it('logs returns log data', async () => {
    try {
      const l = await client.logs(docId);
      expect(l).toBeTruthy();
    } catch (e: any) {
      // logs endpoint may not exist on all API versions
      expect(e.status).toBe(404);
    }
  }, 10000);

  // ─── URL builders ───────────────────────────────────────────────────

  it('downloadUrl returns /document/ path', () => {
    const url = client.downloadUrl(docId);
    expect(url).toContain('/document/');
    expect(url).toContain(docId);
    expect(url).toContain('/download');
  });

  it('modelEndpoint returns /document/ path', () => {
    const url = client.modelEndpoint(docId);
    expect(url).toContain('/document/');
    expect(url).toContain(docId);
  });

  // ─── Config ─────────────────────────────────────────────────────────

  it('getKeyWorkflow returns config object', async () => {
    const config = await client.getKeyWorkflow();
    expect(config).toBeTruthy();
    expect(typeof config).toBe('object');
  }, 10000);

  // ─── Collections ────────────────────────────────────────────────────

  it('collectionList returns array', async () => {
    const cols = await client.collectionList();
    expect(cols).toBeInstanceOf(Array);
  }, 10000);

  // ─── Completion (non-streaming) ─────────────────────────────────────

  // TODO: generate/stream need API rewrite for /document/:id/chat/completions via SDK path
  it.skip('generate returns completion response', async () => {
    const result = await client.generate(docId, {
      messages: [
        { role: 'user', content: 'What is this document about? Reply in one sentence.' },
      ],
    });
    expect(result.choices).toBeInstanceOf(Array);
    expect(result.choices.length).toBeGreaterThan(0);
    const content = result.choices[0].message?.content;
    expect(typeof content).toBe('string');
    expect(content!.length).toBeGreaterThan(5);
  }, 60000);

  // ─── Streaming completion ───────────────────────────────────────────

  it.skip('stream returns async iterable of chunks', async () => {
    const s = await client.stream(docId, {
      messages: [{ role: 'user', content: 'Say hello in 3 words.' }],
    });
    let chunks = 0;
    let text = '';
    for await (const chunk of s) {
      chunks++;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) text += delta;
    }
    expect(chunks).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  }, 60000);

  // ─── Download (verify URL resolves) ─────────────────────────────────

  it('download URL returns 200', async () => {
    const url = client.downloadUrl(docId);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('pdf');
  }, 15000);

  // ─── SQL query ──────────────────────────────────────────────────────

  it('query executes SQL against document nodes', async () => {
    const result = await client.query(docId, "SELECT count(*) as cnt FROM nodes");
    expect(result).toBeTruthy();
  }, 10000);

  // ─── X-Okra-Version header ──────────────────────────────────────────

  it('API returns X-Okra-Version header', async () => {
    const res = await fetch('https://api.okrapdf.com/v1/documents', {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const version = res.headers.get('X-Okra-Version');
    // Version header may not be deployed yet — just check the response works
    expect(res.status).toBe(200);
    // If header exists, it should be semver-ish
    if (version) {
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    }
  }, 10000);
});
