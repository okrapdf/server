import { existsSync } from 'fs';
import { join } from 'path';
import { extractLocalDocument, localToolReport } from '../../local/extract.js';

// Shared, real (non-stub) capability implementations for the self-host runtime.
//
// The parser path runs poppler (pdftotext/pdfinfo) + tesseract via
// `extractLocalDocument`, so a cloned `docker compose up` produces document-derived
// text/OCR with ZERO external paid services. The audit/redact paths derive their
// output from the actual document graph (text layer coverage, missing title, PII
// regex), so they are basic but genuinely computed — never canned placeholder text.
//
// When the source PDF is not on disk or poppler/tesseract are missing, the parser
// returns ok:false with a reason so callers can emit an HONEST "unavailable" record
// instead of fabricating content.

type Bbox = { x: number; y: number; w: number; h: number };

const FULL_TEXT_BBOX: Bbox = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
const BAND_BBOX: Bbox = { x: 0.08, y: 0.2, w: 0.84, h: 0.05 };

export function originalPdfPath(dataDir: string, documentId: string): string {
  return join(dataDir, 'documents', documentId, 'original.pdf');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export interface LocalParseResult {
  ok: boolean;
  reason?: string;
  pageCount?: number;
  ocrUsed?: boolean;
  blocks: Array<Record<string, unknown>>;
}

/**
 * Real local extraction: poppler text layer with tesseract OCR fallback per page.
 * Returns one paragraph block per non-empty page. Bbox is page-region level
 * (pdftotext -layout has no per-block geometry); precise bbox is a follow-up.
 */
export function localParse(
  dataDir: string | undefined,
  documentId: string | undefined,
  runId: string,
  idPrefix: string,
): LocalParseResult {
  if (!dataDir || !documentId) {
    return { ok: false, reason: 'no data directory or document id available', blocks: [] };
  }
  const source = originalPdfPath(dataDir, documentId);
  if (!existsSync(source)) {
    return { ok: false, reason: 'source PDF not found on disk', blocks: [] };
  }
  const tools = localToolReport(dataDir);
  if (!tools.ok) {
    return { ok: false, reason: 'pdftotext/pdfinfo not installed (install poppler-utils)', blocks: [] };
  }
  try {
    const doc = extractLocalDocument(source, dataDir);
    const blocks = doc.pages
      .filter((page) => page.text.trim().length > 0)
      .map((page) => ({
        id: `${idPrefix}_p${page.pageNumber}`,
        kind: 'paragraph',
        page_number: page.pageNumber,
        text: page.text,
        bbox: { ...FULL_TEXT_BBOX },
        confidence: page.ocrApplied ? 0.7 : 0.95,
        created_by_run_id: runId,
      }));
    return { ok: true, pageCount: doc.pageCount, ocrUsed: doc.ocrUsed, blocks };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      blocks: [],
    };
  }
}

function pageNumbers(graph: Record<string, unknown>): number[] {
  const pages = recordArray(graph.pages)
    .map((page) => (typeof page.page_number === 'number' ? page.page_number : null))
    .filter((value): value is number => value !== null);
  return pages.length ? pages : [1];
}

// A block counts as real extracted page text only if it has substantive content
// and is not metadata or a low-confidence fallback ("extraction unavailable")
// block. Fallback blocks are written with confidence ~0.2; real text is >= 0.7.
function isRealTextBlock(block: Record<string, unknown>): boolean {
  if (block.id === 'blk_source_summary') return false;
  const text = typeof block.text === 'string' ? block.text.trim() : '';
  if (!text) return false;
  const confidence = typeof block.confidence === 'number' ? block.confidence : 1;
  return confidence >= 0.5;
}

function pagesWithText(graph: Record<string, unknown>): Set<number> {
  const pages = new Set<number>();
  for (const block of recordArray(graph.blocks)) {
    if (!isRealTextBlock(block)) continue;
    pages.add(typeof block.page_number === 'number' ? block.page_number : 1);
  }
  return pages;
}

function documentTitle(graph: Record<string, unknown>): string | null {
  const doc = isRecord(graph.document) ? graph.document : {};
  const title = typeof doc.filename === 'string' ? doc.filename.trim() : '';
  return title.length ? title : null;
}

/**
 * Basic WCAG/PDF-UA audit derived from the real graph: flags pages without an
 * extractable text layer (scanned/untagged) and a missing document title. Always
 * emits a summary finding using `primaryId` so the audit step is observable.
 */
export function localAudit(
  graph: Record<string, unknown>,
  runId: string,
  primaryId: string,
): Array<Record<string, unknown>> {
  const pages = pageNumbers(graph);
  const withText = pagesWithText(graph);
  const noText = pages.filter((page) => !withText.has(page));
  const title = documentTitle(graph);

  const findings: Array<Record<string, unknown>> = [];

  findings.push({
    id: primaryId,
    kind: 'wcag',
    standard: 'WCAG 2.2',
    rule_id: 'okra.local.audit.summary',
    severity: noText.length || !title ? 'warning' : 'info',
    message:
      `Basic audit: ${pages.length} page(s) inspected; ` +
      `${noText.length} without an extractable text layer; ` +
      `document title ${title ? 'present' : 'missing'}. ` +
      `This is a basic heuristic pass — manual review still required for full PDF/UA / Section 508 conformance.`,
    evidence: [{ page_number: pages[0] ?? 1, bbox: { ...FULL_TEXT_BBOX }, label: 'audit-summary' }],
    created_by_run_id: runId,
  });

  for (const page of noText) {
    findings.push({
      id: `${primaryId}_p${page}_no_text`,
      kind: 'wcag',
      standard: 'WCAG 2.2',
      rule_id: 'okra.local.audit.no_text_layer',
      severity: 'warning',
      message: `Page ${page} has no extractable text (likely scanned image or untagged). Screen readers cannot read it; add OCR / tagging.`,
      evidence: [{ page_number: page, bbox: { ...FULL_TEXT_BBOX }, label: 'no-text-layer' }],
      created_by_run_id: runId,
    });
  }

  if (!title) {
    findings.push({
      id: `${primaryId}_missing_title`,
      kind: 'wcag',
      standard: 'WCAG 2.2',
      rule_id: 'okra.local.audit.missing_title',
      severity: 'warning',
      message: 'Document has no title. WCAG 2.4.2 / PDF/UA requires a document title for assistive tech.',
      evidence: [{ page_number: pages[0] ?? 1, bbox: { ...BAND_BBOX }, label: 'missing-title' }],
      created_by_run_id: runId,
    });
  }

  return findings;
}

const PII_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { label: 'us-ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: 'phone', re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { label: 'credit-card', re: /\b(?:\d[ -]?){13,16}\b/g },
];

/**
 * Basic policy redactor: regex-scans real extracted text for PII and proposes
 * page-level redaction regions for human review. Emits NOTHING when no PII is
 * found (honest — no fabricated candidate). Region bbox is page-band level until a
 * bbox-aware redactor lands.
 */
export function localRedact(
  graph: Record<string, unknown>,
  runId: string,
  primaryId: string,
): Array<Record<string, unknown>> {
  const redactions: Array<Record<string, unknown>> = [];
  let index = 0;
  for (const block of recordArray(graph.blocks)) {
    if (!isRealTextBlock(block)) continue;
    const text = typeof block.text === 'string' ? block.text : '';
    const page = typeof block.page_number === 'number' ? block.page_number : 1;
    for (const { label, re } of PII_PATTERNS) {
      const matches = text.match(re);
      if (!matches || matches.length === 0) continue;
      redactions.push({
        id: index === 0 ? primaryId : `${primaryId}_${index}`,
        state: 'proposed',
        regions: [{ page_number: page, bbox: { ...BAND_BBOX }, label }],
        reason: `Basic policy redactor matched ${matches.length} ${label} pattern(s) on page ${page}. Verify before applying.`,
        created_by_run_id: runId,
      });
      index += 1;
    }
  }
  return redactions;
}
