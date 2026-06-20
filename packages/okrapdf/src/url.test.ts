import { describe, expect, it } from 'vitest';
import { doc } from './url.js';

describe('doc URL builder', () => {
  describe('pg_N flat URLs', () => {
    it('pg[N].png returns flat page image URL', () => {
      const d = doc('ocr-abc');
      expect(d.pg[1].png()).toBe(
        'https://api.okrapdf.com/document/ocr-abc/pg_1.png',
      );
    });

    it('pg[N].md returns flat page markdown URL', () => {
      const d = doc('ocr-abc');
      expect(d.pg[1].md()).toBe(
        'https://api.okrapdf.com/document/ocr-abc/pg_1.md',
      );
    });

    it('pg[N].json returns flat page blocks URL', () => {
      const d = doc('ocr-abc');
      expect(d.pg[1].json()).toBe(
        'https://api.okrapdf.com/document/ocr-abc/pg_1.json',
      );
    });

    it('pg[N] with provider includes t_ segment', () => {
      const d = doc('ocr-abc', { provider: 'llamaparse' });
      expect(d.pg[1].md()).toBe(
        'https://api.okrapdf.com/document/ocr-abc/t_llamaparse/pg_1.md',
      );
    });

    it('pg[N].png with provider includes t_ segment', () => {
      const d = doc('ocr-abc', { provider: 'llamaparse' });
      expect(d.pg[2].png()).toBe(
        'https://api.okrapdf.com/document/ocr-abc/t_llamaparse/pg_2.png',
      );
    });

    it('works with fileName + provider', () => {
      const d = doc('ocr-abc', { fileName: 'report.pdf', provider: 'docling' });
      expect(d.pg[1].md()).toBe(
        'https://api.okrapdf.com/document/ocr-abc/t_docling/pg_1.md',
      );
    });
  });

  describe('thumbnail', () => {
    it('uses pg_1 flat URL', () => {
      const d = doc('ocr-abc');
      expect(d.thumbnail.url()).toBe(
        'https://api.okrapdf.com/document/ocr-abc/pg_1.png',
      );
    });

    it('respects provider transformation', () => {
      const d = doc('ocr-abc', { provider: 'llamaparse' });
      expect(d.thumbnail.url()).toBe(
        'https://api.okrapdf.com/document/ocr-abc/t_llamaparse/pg_1.png',
      );
    });
  });

  describe('full document markdown', () => {
    it('d.full.md() returns full.md URL', () => {
      const d = doc('doc-abc');
      expect(d.full.md()).toBe(
        'https://api.okrapdf.com/document/doc-abc/full.md',
      );
    });

    it('works with custom base URL', () => {
      const d = doc('doc-abc', 'https://worker.example.com');
      expect(d.full.md()).toBe(
        'https://worker.example.com/document/doc-abc/full.md',
      );
    });
  });

  describe('download', () => {
    it('d.download() returns download URL', () => {
      const d = doc('doc-abc');
      expect(d.download()).toBe(
        'https://api.okrapdf.com/document/doc-abc/download',
      );
    });

    it('works with custom base URL', () => {
      const d = doc('doc-abc', 'https://worker.example.com');
      expect(d.download()).toBe(
        'https://worker.example.com/document/doc-abc/download',
      );
    });
  });

  describe('page ranges', () => {
    it('pg.range(1, 5).md() returns range URL', () => {
      const d = doc('doc-abc');
      expect(d.pg.range(1, 5).md()).toBe(
        'https://api.okrapdf.com/document/doc-abc/pg_1-5.md',
      );
    });

    it('pg.range(1, 5).json() returns range URL', () => {
      const d = doc('doc-abc');
      expect(d.pg.range(1, 5).json()).toBe(
        'https://api.okrapdf.com/document/doc-abc/pg_1-5.json',
      );
    });

    it('pg.list(1, 3, 5).md() returns list URL', () => {
      const d = doc('doc-abc');
      expect(d.pg.list(1, 3, 5).md()).toBe(
        'https://api.okrapdf.com/document/doc-abc/pg_1,3,5.md',
      );
    });

    it('pg.list(1, 3, 5).json() returns list URL', () => {
      const d = doc('doc-abc');
      expect(d.pg.list(1, 3, 5).json()).toBe(
        'https://api.okrapdf.com/document/doc-abc/pg_1,3,5.json',
      );
    });

    it('range with provider includes t_ segment', () => {
      const d = doc('doc-abc', { provider: 'llamaparse' });
      expect(d.pg.range(2, 4).md()).toBe(
        'https://api.okrapdf.com/document/doc-abc/t_llamaparse/pg_2-4.md',
      );
    });
  });

  describe('placeholder', () => {
    it('per-page placeholder inserts d_ segment', () => {
      const d = doc('doc-abc');
      expect(d.pg[2].png({ placeholder: 'shimmer' })).toBe(
        'https://api.okrapdf.com/document/doc-abc/d_shimmer/pg_2.png',
      );
    });

    it('per-page placeholder auto', () => {
      const d = doc('doc-abc');
      expect(d.pg[2].png({ placeholder: 'auto' })).toBe(
        'https://api.okrapdf.com/document/doc-abc/d_auto/pg_2.png',
      );
    });

    it('builder-level placeholder applies to all png URLs', () => {
      const d = doc('doc-abc', { placeholder: 'shimmer' });
      expect(d.pg[2].png()).toBe(
        'https://api.okrapdf.com/document/doc-abc/d_shimmer/pg_2.png',
      );
    });

    it('page-level placeholder overrides builder-level', () => {
      const d = doc('doc-abc', { placeholder: 'shimmer' });
      expect(d.pg[2].png({ placeholder: 'auto' })).toBe(
        'https://api.okrapdf.com/document/doc-abc/d_auto/pg_2.png',
      );
    });

    it('builder-level placeholder applies to thumbnail', () => {
      const d = doc('doc-abc', { placeholder: 'shimmer' });
      expect(d.thumbnail.url()).toBe(
        'https://api.okrapdf.com/document/doc-abc/d_shimmer/pg_1.png',
      );
    });

    it('placeholder + provider together', () => {
      const d = doc('doc-abc', { provider: 'llamaparse', placeholder: 'shimmer' });
      expect(d.pg[1].png()).toBe(
        'https://api.okrapdf.com/document/doc-abc/t_llamaparse/d_shimmer/pg_1.png',
      );
    });

    it('md URLs do not get placeholder from builder-level', () => {
      const d = doc('doc-abc', { placeholder: 'shimmer' });
      // md URLs still get the d_ segment since defaultImage applies to all pg routes
      expect(d.pg[1].md()).toBe(
        'https://api.okrapdf.com/document/doc-abc/d_shimmer/pg_1.md',
      );
    });
  });

  describe('document root URL', () => {
    it('uses "document" artifact when fileName is not provided', () => {
      const d = doc('ocr-abc');
      expect(d.url()).toBe(
        'https://api.okrapdf.com/document/ocr-abc/document.json',
      );
    });

    it('uses slugified fileName as artifact', () => {
      const d = doc('ocr-abc123', { fileName: 'Quarterly Report 2025.pdf' });
      expect(d.url()).toBe(
        'https://api.okrapdf.com/document/ocr-abc123/quarterly-report-2025.json',
      );
    });

    it('supports explicit baseUrl + fileName options', () => {
      const d = doc('ocr-custom', 'https://worker.example.com', { fileName: 'invoice.pdf' });
      expect(d.url()).toBe('https://worker.example.com/document/ocr-custom/invoice.json');
    });
  });

  describe('entities', () => {
    it('tables collection URL with format', () => {
      const d = doc('ocr-abc123', { fileName: 'Quarterly Report 2025.pdf' });
      expect(d.entities.tables[0].url({ format: 'html' })).toBe(
        'https://api.okrapdf.com/document/ocr-abc123/entities/tables/0/quarterly-report-2025.html?format=html',
      );
    });

    it('inserts /t_{provider} for entities', () => {
      const d = doc('ocr-abc', { provider: 'googleocr' });
      expect(d.entities.tables.url({ format: 'csv' })).toBe(
        'https://api.okrapdf.com/document/ocr-abc/t_googleocr/entities/tables/document.csv?format=csv',
      );
    });
  });

  describe('provider transformations', () => {
    it('per-call provider overrides default', () => {
      const d = doc('ocr-abc', { provider: 'googleocr' });
      expect(d.url({ provider: 'unstructured', format: 'html' })).toBe(
        'https://api.okrapdf.com/document/ocr-abc/t_unstructured/document.html?format=html',
      );
    });

    it('no provider = no transformation segment', () => {
      const d = doc('ocr-abc');
      expect(d.pg[0].json()).toBe(
        'https://api.okrapdf.com/document/ocr-abc/pg_0.json',
      );
    });
  });

  describe('delivery transforms', () => {
    it('single transform: { w: 200 }', () => {
      const d = doc('doc-abc');
      expect(d.pg[1].png({ transform: { w: 200 } })).toBe(
        'https://api.okrapdf.com/document/doc-abc/w_200/pg_1.png',
      );
    });

    it('multiple transforms follow DELIVERY_KEY_ORDER', () => {
      const d = doc('doc-abc');
      expect(d.pg[1].png({ transform: { w: 200, h: 300, q: 80, bl: 20 } })).toBe(
        'https://api.okrapdf.com/document/doc-abc/w_200,h_300,q_80,bl_20/pg_1.png',
      );
    });

    it('combined: provider + placeholder + transform', () => {
      const d = doc('doc-abc', { provider: 'llamaparse', placeholder: 'shimmer' });
      expect(d.pg[1].png({ transform: { w: 200, h: 300 } })).toBe(
        'https://api.okrapdf.com/document/doc-abc/t_llamaparse/d_shimmer/w_200,h_300/pg_1.png',
      );
    });

    it('per-call placeholder override + transform', () => {
      const d = doc('doc-abc', { placeholder: 'shimmer' });
      expect(d.pg[2].png({ placeholder: 'auto', transform: { w: 100 } })).toBe(
        'https://api.okrapdf.com/document/doc-abc/d_auto/w_100/pg_2.png',
      );
    });

    it('thumbnail with transform', () => {
      const d = doc('doc-abc', { provider: 'llamaparse', placeholder: 'shimmer' });
      expect(d.thumbnail.url({ transform: { w: 100, h: 100, c: 'cover' } })).toBe(
        'https://api.okrapdf.com/document/doc-abc/t_llamaparse/d_shimmer/w_100,h_100,c_cover/pg_1.png',
      );
    });

    it('range with transform', () => {
      const d = doc('doc-abc', { provider: 'llamaparse' });
      expect(d.pg.range(1, 5).json({ transform: { q: 90 } })).toBe(
        'https://api.okrapdf.com/document/doc-abc/t_llamaparse/q_90/pg_1-5.json',
      );
    });

    it('invalid transform throws at build time', () => {
      const d = doc('doc-abc');
      expect(() => d.pg[1].png({ transform: { w: -1 } })).toThrow('Invalid delivery transform');
      expect(() => d.pg[1].png({ transform: { q: 200 } })).toThrow('Invalid delivery transform');
      expect(() => d.pg[1].png({ transform: { bl: 0 } })).toThrow('Invalid delivery transform');
    });

    it('empty transform = no segment added', () => {
      const d = doc('doc-abc');
      expect(d.pg[1].png({ transform: {} })).toBe(
        'https://api.okrapdf.com/document/doc-abc/pg_1.png',
      );
    });

    it('format enum values in transform', () => {
      const d = doc('doc-abc');
      expect(d.pg[1].png({ transform: { w: 200, f: 'avif', q: 80, bl: 20 } })).toBe(
        'https://api.okrapdf.com/document/doc-abc/w_200,q_80,f_avif,bl_20/pg_1.png',
      );
    });

    it('transform on document root URL', () => {
      const d = doc('doc-abc');
      expect(d.url({ transform: { w: 200 } })).toBe(
        'https://api.okrapdf.com/document/doc-abc/w_200/document.json',
      );
    });
  });

  describe('output schema', () => {
    it('d.output("invoice").url() → /o_invoice/document.json', () => {
      const d = doc('doc-abc', { provider: 'llamaparse' });
      expect(d.output('invoice').url()).toBe(
        'https://api.okrapdf.com/document/doc-abc/t_llamaparse/o_invoice/document.json',
      );
    });

    it('d.output("invoice").pg[1].json() → /o_invoice/pg_1.json', () => {
      const d = doc('doc-abc', { provider: 'llamaparse' });
      expect(d.output('invoice').pg[1].json()).toBe(
        'https://api.okrapdf.com/document/doc-abc/t_llamaparse/o_invoice/pg_1.json',
      );
    });

    it('d.output("invoice").entities.tables.url()', () => {
      const d = doc('doc-abc', { provider: 'llamaparse' });
      expect(d.output('invoice').entities.tables.url()).toBe(
        'https://api.okrapdf.com/document/doc-abc/t_llamaparse/o_invoice/entities/tables/document.json',
      );
    });

    it('output at builder level via options', () => {
      const d = doc('doc-abc', { provider: 'llamaparse', output: 'receipt' });
      expect(d.pg[1].json()).toBe(
        'https://api.okrapdf.com/document/doc-abc/t_llamaparse/o_receipt/pg_1.json',
      );
    });

    it('output + placeholder + transform combined', () => {
      const d = doc('doc-abc', { provider: 'llamaparse', placeholder: 'shimmer' });
      expect(d.output('invoice').pg[1].png({ transform: { w: 200 } })).toBe(
        'https://api.okrapdf.com/document/doc-abc/t_llamaparse/d_shimmer/o_invoice/w_200/pg_1.png',
      );
    });

    it('output does not leak into original builder', () => {
      const d = doc('doc-abc');
      d.output('invoice'); // create scoped builder but don't use it
      expect(d.pg[1].json()).toBe(
        'https://api.okrapdf.com/document/doc-abc/pg_1.json',
      );
    });
  });

  describe('public option', () => {
    it('switches doc path from /document/ to /v1/documents/', () => {
      const d = doc('doc-abc', { public: true });
      expect(d.pg[1].md()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/pg_1.md',
      );
    });

    it('affects pg.png, thumbnail, full, download uniformly', () => {
      const d = doc('doc-abc', { public: true });
      expect(d.full.md()).toBe('https://api.okrapdf.com/v1/documents/doc-abc/full.md');
      expect(d.download()).toBe('https://api.okrapdf.com/v1/documents/doc-abc/download');
    });

    it('composes with provider and placeholder', () => {
      const d = doc('doc-abc', { public: true, provider: 'llamaparse', placeholder: 'shimmer' });
      expect(d.pg[1].md()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/t_llamaparse/d_shimmer/pg_1.md',
      );
    });
  });

  describe('cdnImage option', () => {
    it('wraps png with /cdn-cgi/image/ and defaults format=auto', () => {
      const d = doc('doc-abc', { cdnImage: true });
      expect(d.pg[1].png()).toBe(
        'https://api.okrapdf.com/cdn-cgi/image/format=auto/document/doc-abc/pg_1.png',
      );
    });

    it('maps short transform keys (w,h,q,dpr) to CF long keys', () => {
      const d = doc('doc-abc', { cdnImage: true });
      expect(d.pg[1].png({ transform: { w: 200, h: 300, q: 85, dpr: 2 } })).toBe(
        'https://api.okrapdf.com/cdn-cgi/image/width=200,height=300,quality=85,dpr=2,format=auto/document/doc-abc/pg_1.png',
      );
    });

    it('honors explicit format (skips auto default)', () => {
      const d = doc('doc-abc', { cdnImage: true });
      expect(d.pg[1].png({ transform: { w: 200, f: 'avif' } })).toBe(
        'https://api.okrapdf.com/cdn-cgi/image/width=200,format=avif/document/doc-abc/pg_1.png',
      );
    });

    it('does not wrap md or json URLs', () => {
      const d = doc('doc-abc', { cdnImage: true });
      expect(d.pg[1].md()).toBe(
        'https://api.okrapdf.com/document/doc-abc/pg_1.md',
      );
      expect(d.pg[1].json()).toBe(
        'https://api.okrapdf.com/document/doc-abc/pg_1.json',
      );
    });

    it('wraps thumbnail.url the same as pg[1].png', () => {
      const d = doc('doc-abc', { cdnImage: true });
      expect(d.thumbnail.url({ transform: { w: 400 } })).toBe(
        'https://api.okrapdf.com/cdn-cgi/image/width=400,format=auto/document/doc-abc/pg_1.png',
      );
    });

    it('transform lives in the CF wrapper only — no /w_200/ segment on origin', () => {
      const d = doc('doc-abc', { cdnImage: true });
      // Passing a transform must NOT emit both /cdn-cgi/image/width=200/ AND
      // /w_200/ — only the CF wrapper carries the transform under cdnImage.
      const url = d.pg[1].png({ transform: { w: 200 } });
      expect(url).not.toContain('/w_200/');
      expect(url).toContain('/cdn-cgi/image/width=200');
    });
  });

  describe('public + cdnImage combined (recommended for public <img>)', () => {
    it('emits /cdn-cgi/image/ around the /v1/documents/ source', () => {
      const d = doc('doc-abc', { public: true, cdnImage: true });
      expect(d.pg[1].png({ transform: { w: 160, q: 85 } })).toBe(
        'https://api.okrapdf.com/cdn-cgi/image/width=160,quality=85,format=auto/v1/documents/doc-abc/pg_1.png',
      );
    });

    it('still passes md/json through the public path without CF wrap', () => {
      const d = doc('doc-abc', { public: true, cdnImage: true });
      expect(d.pg[1].md()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/pg_1.md',
      );
    });

    it('public composes with output', () => {
      const d = doc('doc-abc', { public: true }).output('invoice');
      expect(d.pg[1].json()).toBe(
        'https://api.okrapdf.com/v1/documents/doc-abc/o_invoice/pg_1.json',
      );
    });
  });

  describe('cdnImage validation', () => {
    it('unknown transform keys silently dropped under cdnImage', () => {
      const d = doc('doc-abc', { cdnImage: true });
      // md, zm, anim, seg, g, fl are NOT in CF_KEY_MAP — they should be dropped.
      // `w` survives; format=auto default is appended.
      const url = d.pg[1].png({
        transform: { w: 200, md: 'keep', zm: 0.5, g: 'face', fl: 'h' } as Record<string, unknown>,
      });
      expect(url).toBe(
        'https://api.okrapdf.com/cdn-cgi/image/width=200,format=auto/document/doc-abc/pg_1.png',
      );
    });

    it("rejects c: 'squeeze' under cdnImage (CF does not support it)", () => {
      const d = doc('doc-abc', { cdnImage: true });
      expect(() => d.pg[1].png({ transform: { c: 'squeeze' } })).toThrow(/squeeze/);
    });

    it("allows c: 'squeeze' when cdnImage is off (our origin handles it)", () => {
      const d = doc('doc-abc');
      expect(d.pg[1].png({ transform: { c: 'squeeze' } })).toBe(
        'https://api.okrapdf.com/document/doc-abc/c_squeeze/pg_1.png',
      );
    });

    it('still validates bounds under cdnImage (e.g. q out of range)', () => {
      const d = doc('doc-abc', { cdnImage: true });
      expect(() => d.pg[1].png({ transform: { q: 150 } })).toThrow();
    });
  });

  describe('CF Images — content-addressed IDs', () => {
    const PDF_SHA =
      'a1b2c3d4e5f67890abcdef1234567890fedcba0987654321abcdefabcdef1234';
    const HASH = 'abcd1234efgh5678';

    it('emits imagedelivery.net URL when pdfSha+renderer+accountHash all set', () => {
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA,
        renderer: 'mupdf150',
        accountHash: HASH,
      });
      expect(d.pg[1].png()).toBe(
        'https://imagedelivery.net/abcd1234efgh5678/okra-prod-a1b2c3d4e5f6-p1-r1-mupdf150/public',
      );
    });

    it('honors variant override on png()', () => {
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA,
        renderer: 'mupdf150',
        accountHash: HASH,
      });
      expect(d.pg[1].png({ variant: 'thumb' })).toBe(
        'https://imagedelivery.net/abcd1234efgh5678/okra-prod-a1b2c3d4e5f6-p1-r1-mupdf150/thumb',
      );
      expect(d.pg[1].png({ variant: 'hero' })).toBe(
        'https://imagedelivery.net/abcd1234efgh5678/okra-prod-a1b2c3d4e5f6-p1-r1-mupdf150/hero',
      );
    });

    it('thumbnail.url defaults to variant=thumb under CF Images', () => {
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA,
        renderer: 'mupdf150',
        accountHash: HASH,
      });
      expect(d.thumbnail.url()).toBe(
        'https://imagedelivery.net/abcd1234efgh5678/okra-prod-a1b2c3d4e5f6-p1-r1-mupdf150/thumb',
      );
    });

    it('honors env override (staging, dev)', () => {
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA,
        renderer: 'mupdf150',
        accountHash: HASH,
        env: 'staging',
      });
      expect(d.pg[1].png()).toBe(
        'https://imagedelivery.net/abcd1234efgh5678/okra-staging-a1b2c3d4e5f6-p1-r1-mupdf150/public',
      );
    });

    it('honors renderer override (pdfjs2x)', () => {
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA,
        renderer: 'pdfjs2x',
        accountHash: HASH,
      });
      expect(d.pg[1].png()).toBe(
        'https://imagedelivery.net/abcd1234efgh5678/okra-prod-a1b2c3d4e5f6-p1-r1-pdfjs2x/public',
      );
    });

    it('honors renderVersion override (r2, r3)', () => {
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA,
        renderer: 'mupdf150',
        accountHash: HASH,
        renderVersion: 2,
      });
      expect(d.pg[1].png()).toBe(
        'https://imagedelivery.net/abcd1234efgh5678/okra-prod-a1b2c3d4e5f6-p1-r2-mupdf150/public',
      );
    });

    it('honors pdfShaLength=16 escalation', () => {
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA,
        renderer: 'mupdf150',
        accountHash: HASH,
        pdfShaLength: 16,
      });
      expect(d.pg[1].png()).toBe(
        'https://imagedelivery.net/abcd1234efgh5678/okra-prod-a1b2c3d4e5f67890-p1-r1-mupdf150/public',
      );
    });

    it('honors imagesBaseUrl override (custom delivery domain)', () => {
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA,
        renderer: 'mupdf150',
        accountHash: HASH,
        imagesBaseUrl: 'https://cdn.example.com',
      });
      expect(d.pg[1].png()).toBe(
        'https://cdn.example.com/abcd1234efgh5678/okra-prod-a1b2c3d4e5f6-p1-r1-mupdf150/public',
      );
    });

    it('normalizes uppercase sha to lowercase', () => {
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA.toUpperCase(),
        renderer: 'mupdf150',
        accountHash: HASH,
      });
      expect(d.pg[1].png()).toBe(
        'https://imagedelivery.net/abcd1234efgh5678/okra-prod-a1b2c3d4e5f6-p1-r1-mupdf150/public',
      );
    });

    it('md and json URLs are unaffected (still hit origin path)', () => {
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA,
        renderer: 'mupdf150',
        accountHash: HASH,
      });
      expect(d.pg[1].md()).toBe('https://api.okrapdf.com/document/doc-abc/pg_1.md');
      expect(d.pg[1].json()).toBe('https://api.okrapdf.com/document/doc-abc/pg_1.json');
    });

    it('falls back to legacy path when any of pdfSha/renderer/accountHash is missing', () => {
      // Missing accountHash
      const d1 = doc('doc-abc', { pdfSha: PDF_SHA, renderer: 'mupdf150' });
      expect(d1.pg[1].png()).toBe('https://api.okrapdf.com/document/doc-abc/pg_1.png');

      // Missing renderer
      const d2 = doc('doc-abc', { pdfSha: PDF_SHA, accountHash: HASH });
      expect(d2.pg[1].png()).toBe('https://api.okrapdf.com/document/doc-abc/pg_1.png');

      // Missing pdfSha
      const d3 = doc('doc-abc', { renderer: 'mupdf150', accountHash: HASH });
      expect(d3.pg[1].png()).toBe('https://api.okrapdf.com/document/doc-abc/pg_1.png');
    });

    it('falls back to legacy CF Transformations when transform is passed explicitly', () => {
      // Caller passing `transform` signals legacy-style inline transforms.
      // The CF Images path only activates for zero-arg / variant-only calls.
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA,
        renderer: 'mupdf150',
        accountHash: HASH,
        cdnImage: true, // legacy opt-in
      });
      const url = d.pg[1].png({ transform: { w: 200, q: 85 } });
      expect(url).toContain('/cdn-cgi/image/width=200,quality=85');
      expect(url).not.toContain('imagedelivery.net');
    });

    it('rejects non-hex pdfSha', () => {
      expect(() =>
        doc('doc-abc', { pdfSha: 'not-hex-zzzz', renderer: 'mupdf150', accountHash: HASH }),
      ).toThrow(/hex/);
    });

    it('rejects too-short pdfSha', () => {
      expect(() =>
        doc('doc-abc', { pdfSha: 'abc', renderer: 'mupdf150', accountHash: HASH }),
      ).toThrow(/8 chars/);
    });

    it('rejects invalid pdfShaLength (not 12 or 16)', () => {
      expect(() =>
        doc('doc-abc', {
          pdfSha: PDF_SHA,
          renderer: 'mupdf150',
          accountHash: HASH,
          pdfShaLength: 14,
        }),
      ).toThrow(/12 or 16/);
    });

    it('rejects pdfSha shorter than pdfShaLength', () => {
      expect(() =>
        doc('doc-abc', {
          pdfSha: 'a1b2c3d4e5',
          renderer: 'mupdf150',
          accountHash: HASH,
          pdfShaLength: 16,
        }),
      ).toThrow(/hex chars/);
    });

    it('rejects invalid env (non-alphanumeric)', () => {
      expect(() =>
        doc('doc-abc', {
          pdfSha: PDF_SHA,
          renderer: 'mupdf150',
          accountHash: HASH,
          env: 'my env',
        }),
      ).toThrow(/env/);
    });

    it('rejects invalid renderer (uppercase or special chars)', () => {
      expect(() =>
        doc('doc-abc', {
          pdfSha: PDF_SHA,
          renderer: 'MuPDF 150',
          accountHash: HASH,
        }),
      ).toThrow(/renderer/);
    });

    it('rejects invalid variant name', () => {
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA,
        renderer: 'mupdf150',
        accountHash: HASH,
      });
      expect(() => d.pg[1].png({ variant: 'foo/bar' })).toThrow(/variant/);
      expect(() => d.pg[1].png({ variant: 'foo bar' })).toThrow(/variant/);
    });

    it('strips leading/trailing slashes on accountHash', () => {
      const d = doc('doc-abc', {
        pdfSha: PDF_SHA,
        renderer: 'mupdf150',
        accountHash: '/abcd1234/',
      });
      expect(d.pg[1].png()).toBe(
        'https://imagedelivery.net/abcd1234/okra-prod-a1b2c3d4e5f6-p1-r1-mupdf150/public',
      );
    });
  });
});
