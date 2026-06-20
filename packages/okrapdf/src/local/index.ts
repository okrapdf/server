import { basename, extname } from 'path';
import { existsSync } from 'fs';
import { pathToFileURL } from 'url';
import { OkraRuntimeError } from '../errors.js';
import {
  copySourceIntoStore,
  createLocalDocumentId,
  ensureLocalStore,
  initializeDocumentDir,
  readDocumentPageText,
  readDocumentRecord,
  resolveLocalDataDir,
  writeDocumentPageText,
  writeDocumentRecord,
} from './store.js';
import { extractLocalDocument, localToolReport } from './extract.js';
import type {
  LocalCitation,
  LocalDoctorReport,
  LocalDocumentRecord,
  LocalTableCandidate,
} from './types.js';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'what',
  'when',
  'where',
  'who',
  'why',
  'with',
]);

function sanitizeExcerpt(text: string, maxLength = 280): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trimEnd()}…` : normalized;
}

function sanitizeTablePreview(text: string, maxLength = 320): string {
  const normalized = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trimEnd()}…` : normalized;
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function buildDocumentInfo(record: LocalDocumentRecord) {
  return {
    documentId: record.documentId,
    filename: record.filename,
    status: record.status,
    pageCount: record.pageCount,
    charCount: record.charCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    error: record.error,
    extractor: record.extractor,
  };
}

function ensureReady(documentId: string, dataDir?: string): LocalDocumentRecord {
  const record = readDocumentRecord(documentId, dataDir);
  if (record.status === 'failed') {
    throw new OkraRuntimeError(
      'INVALID_REQUEST',
      record.error || `Local document ${documentId} failed to process`,
      500,
    );
  }
  return record;
}

function snippetAround(text: string, tokens: string[]): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const lower = normalized.toLowerCase();
  let index = -1;
  for (const token of tokens) {
    index = lower.indexOf(token);
    if (index >= 0) break;
  }
  if (index < 0) {
    return sanitizeExcerpt(normalized);
  }
  const start = Math.max(0, index - 110);
  const end = Math.min(normalized.length, index + 170);
  return sanitizeExcerpt(normalized.slice(start, end));
}

function summarizeText(record: LocalDocumentRecord, dataDir?: string): { summary: string; citations: LocalCitation[] } {
  const citations: LocalCitation[] = [];
  const seenPages = new Set<number>();
  const snippets: string[] = [];

  for (const page of record.pages) {
    const text = readDocumentPageText(record.documentId, page.pageNumber, dataDir)
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    for (const block of text) {
      snippets.push(block);
      if (!seenPages.has(page.pageNumber)) {
        citations.push({
          type: 'page_location',
          cited_text: sanitizeExcerpt(block, 200),
          start_page_number: page.pageNumber,
          end_page_number: page.pageNumber,
          // Proof = the stored source PDF at the cited page (file://…#page=N) —
          // the self-host equivalent of the cloud's res.okrapdf.com page image.
          citation_url: `${pathToFileURL(record.storedPath).href}#page=${page.pageNumber}`,
          // Summary snippets are approximate (first block per page), not a
          // grounded exact span — so the honest match grade is 'fuzzy'.
          match: 'fuzzy',
        });
        seenPages.add(page.pageNumber);
      }
      if (snippets.join(' ').length >= 420 || citations.length >= 3) {
        break;
      }
    }
    if (snippets.join(' ').length >= 420 || citations.length >= 3) break;
  }

  const summary = snippets.length > 0
    ? sanitizeExcerpt(snippets.join(' '), 520)
    : `No extractable text was found in ${record.filename}.`;

  return { summary, citations };
}

export function ingestLocalDocument(sourcePath: string, dataDir?: string) {
  if (!existsSync(sourcePath)) {
    throw new OkraRuntimeError('DOCUMENT_NOT_FOUND', `File not found: ${sourcePath}`, 404);
  }
  if (extname(sourcePath).toLowerCase() !== '.pdf') {
    throw new OkraRuntimeError('INVALID_REQUEST', `Local ingest only supports PDFs: ${sourcePath}`, 400);
  }

  const resolvedDataDir = ensureLocalStore(dataDir);
  const documentId = createLocalDocumentId();
  initializeDocumentDir(documentId, resolvedDataDir);
  const storedPath = copySourceIntoStore(documentId, sourcePath, resolvedDataDir);
  const now = new Date().toISOString();

  const extracted = extractLocalDocument(storedPath, resolvedDataDir);

  const pages = extracted.pages.map((page) => {
    const textPath = writeDocumentPageText(documentId, page.pageNumber, page.text, resolvedDataDir);
    return {
      pageNumber: page.pageNumber,
      textPath,
      charCount: page.text.length,
      excerpt: sanitizeExcerpt(page.text, 160),
      ocrApplied: page.ocrApplied,
    };
  });

  const record: LocalDocumentRecord = {
    documentId,
    filename: basename(sourcePath),
    storedPath,
    sourcePath,
    status: extracted.charCount > 0 ? 'ready' : 'failed',
    pageCount: extracted.pageCount,
    charCount: extracted.charCount,
    createdAt: now,
    updatedAt: now,
    error: extracted.charCount > 0 ? null : 'No extractable text found in this PDF.',
    extractor: {
      ...extracted.tools,
      ocrUsed: extracted.ocrUsed,
    },
    pages,
  };

  writeDocumentRecord(record, resolvedDataDir);
  return {
    ...buildDocumentInfo(record),
    storedPath: record.storedPath,
  };
}

export function getLocalDocumentStatus(documentId: string, dataDir?: string) {
  const record = readDocumentRecord(documentId, dataDir);
  return {
    ...buildDocumentInfo(record),
    pagesWithText: record.pages.filter((page) => page.charCount > 0).length,
  };
}

export function summarizeLocalDocument(documentId: string, dataDir?: string) {
  const record = ensureReady(documentId, dataDir);
  const { summary, citations } = summarizeText(record, dataDir);
  return {
    ...buildDocumentInfo(record),
    summary,
    citations,
  };
}

export function searchLocalDocument(documentId: string, query: string, dataDir?: string) {
  const record = ensureReady(documentId, dataDir);
  const tokens = tokenizeQuery(query);
  const matches = record.pages
    .map((page) => {
      const text = readDocumentPageText(record.documentId, page.pageNumber, dataDir);
      const lower = text.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        const occurrences = lower.split(token).length - 1;
        score += occurrences * Math.max(1, token.length);
      }
      return {
        page: page.pageNumber,
        snippet: snippetAround(text, tokens),
        score,
      };
    })
    .filter((match) => match.score > 0 || tokens.length === 0)
    .sort((lhs, rhs) => rhs.score - lhs.score)
    .slice(0, 5);

  return {
    ...buildDocumentInfo(record),
    query,
    matches,
  };
}

export function readLocalPage(documentId: string, pageNumber: number, dataDir?: string) {
  const record = ensureReady(documentId, dataDir);
  const page = record.pages.find((entry) => entry.pageNumber === pageNumber);
  if (!page) {
    throw new OkraRuntimeError(
      'DOCUMENT_NOT_FOUND',
      `Page ${pageNumber} not found for local document ${documentId}`,
      404,
    );
  }

  return {
    ...buildDocumentInfo(record),
    page: page.pageNumber,
    text: readDocumentPageText(documentId, pageNumber, dataDir),
    ocrApplied: page.ocrApplied,
  };
}

function looksLikeTableRow(line: string): boolean {
  return /\S(?:.*(?: {2,}|\t).*)\S/.test(line.trim());
}

function detectTableCandidates(text: string, page: number, query?: string): LocalTableCandidate[] {
  const lines = text.split('\n');
  const tables: Array<{ rows: string[]; heading?: string }> = [];
  let current: string[] = [];
  let previousNonEmpty = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (looksLikeTableRow(line)) {
      current.push(line.trimEnd());
      continue;
    }

    if (current.length >= 2) {
      tables.push({ rows: current, heading: previousNonEmpty || undefined });
    }
    current = [];
    if (trimmed) {
      previousNonEmpty = trimmed;
    }
  }

  if (current.length >= 2) {
    tables.push({ rows: current, heading: previousNonEmpty || undefined });
  }

  const loweredQuery = query?.toLowerCase().trim();

  return tables
    .map((table) => {
      const body = table.rows.join('\n');
      const preview = sanitizeTablePreview(
        table.heading ? `${table.heading}\n${body}` : body,
        320,
      );
      const score = loweredQuery
        ? (preview.toLowerCase().includes(loweredQuery) ? 10 : 0)
        : 1;
      return {
        page,
        preview,
        rowCount: table.rows.length,
        score,
      };
    })
    .filter((table) => table.score > 0);
}

export function findLocalTables(documentId: string, query?: string, dataDir?: string) {
  const record = ensureReady(documentId, dataDir);
  const tables = record.pages
    .flatMap((page) =>
      detectTableCandidates(
        readDocumentPageText(record.documentId, page.pageNumber, dataDir),
        page.pageNumber,
        query,
      ),
    )
    .sort((lhs, rhs) => (rhs.score ?? 0) - (lhs.score ?? 0))
    .slice(0, 8)
    .map(({ page, preview, rowCount }) => ({ page, preview, rowCount }));

  return {
    ...buildDocumentInfo(record),
    query,
    tables,
  };
}

export function doctorLocalHarness(dataDir?: string): LocalDoctorReport {
  const resolvedDataDir = resolveLocalDataDir(dataDir);
  ensureLocalStore(resolvedDataDir);
  return localToolReport(resolvedDataDir);
}
