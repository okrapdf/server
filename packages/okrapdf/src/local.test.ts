import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  doctorLocalHarness,
  findLocalTables,
  searchLocalDocument,
  summarizeLocalDocument,
} from './local/index.js';
import {
  initializeDocumentDir,
  writeDocumentPageText,
  writeDocumentRecord,
} from './local/store.js';
import type { LocalDocumentRecord } from './local/types.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okra-local-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function seedDocument(dataDir: string): LocalDocumentRecord {
  const documentId = 'doc-local-seeded';
  initializeDocumentDir(documentId, dataDir);
  const page1Path = writeDocumentPageText(
    documentId,
    1,
    'Quarterly revenue summary\n\nRevenue increased 42 percent year over year.\nOperating income improved as well.',
    dataDir,
  );
  const page2Path = writeDocumentPageText(
    documentId,
    2,
    'Income Statement\nRevenue   120\nCost of Revenue   40\nGross Profit   80',
    dataDir,
  );

  const record: LocalDocumentRecord = {
    documentId,
    filename: 'sample.pdf',
    storedPath: join(dataDir, 'docs', documentId, 'source.pdf'),
    sourcePath: '/tmp/sample.pdf',
    status: 'ready',
    pageCount: 2,
    charCount: 170,
    createdAt: '2026-04-01T20:00:00.000Z',
    updatedAt: '2026-04-01T20:00:00.000Z',
    error: null,
    extractor: {
      pdftotext: { available: true, path: '/opt/homebrew/bin/pdftotext' },
      pdfinfo: { available: true, path: '/opt/homebrew/bin/pdfinfo' },
      pdftoppm: { available: true, path: '/opt/homebrew/bin/pdftoppm' },
      tesseract: { available: true, path: '/opt/homebrew/bin/tesseract' },
      ocrUsed: false,
    },
    pages: [
      {
        pageNumber: 1,
        textPath: page1Path,
        charCount: 103,
        excerpt: 'Quarterly revenue summary',
        ocrApplied: false,
      },
      {
        pageNumber: 2,
        textPath: page2Path,
        charCount: 67,
        excerpt: 'Income Statement',
        ocrApplied: false,
      },
    ],
  };

  writeDocumentRecord(record, dataDir);
  return record;
}

describe('local pdf tools', () => {
  it('summarizes seeded page text', () => {
    const dataDir = makeTempDir();
    seedDocument(dataDir);

    const result = summarizeLocalDocument('doc-local-seeded', dataDir);
    expect(result.summary).toContain('Revenue increased 42 percent');
    // #580: self-host citations use the Anthropic page_location shape — same as
    // every cloud surface (extract --cite, context get/ask).
    const c = result.citations[0]!;
    expect(c.type).toBe('page_location');
    expect(c.start_page_number).toBe(1);
    expect(c.end_page_number).toBe(1);
    expect(c.cited_text.length).toBeGreaterThan(0);
    expect(c.match).toBe('fuzzy');
    // citation_url points at the stored source PDF at the cited page.
    expect(c.citation_url.startsWith('file://')).toBe(true);
    expect(c.citation_url).toContain('#page=1');
  });

  it('returns scored search matches', () => {
    const dataDir = makeTempDir();
    seedDocument(dataDir);

    const result = searchLocalDocument('doc-local-seeded', 'revenue', dataDir);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]?.snippet.toLowerCase()).toContain('revenue');
  });

  it('detects table-like rows from layout text', () => {
    const dataDir = makeTempDir();
    seedDocument(dataDir);

    const result = findLocalTables('doc-local-seeded', 'income statement', dataDir);
    expect(result.tables.length).toBeGreaterThan(0);
    expect(result.tables[0]?.preview).toContain('Revenue   120');
  });

  it('reports local tool availability', () => {
    const dataDir = makeTempDir();
    const report = doctorLocalHarness(dataDir);
    expect(report.dataDir).toBe(dataDir);
    expect(existsSync(dataDir)).toBe(true);
    expect(typeof report.tools.pdftotext.available).toBe('boolean');
  });
});
