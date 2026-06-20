import { describe, expect, it } from 'vitest';
import { localAudit, localRedact } from './local-capabilities.js';

function realTextBlock(page: number, text: string) {
  return { id: `blk_p${page}`, kind: 'paragraph', page_number: page, text, confidence: 0.95 };
}

const sourceSummary = { id: 'blk_source_summary', kind: 'paragraph', page_number: 1, text: 'File: x.pdf', confidence: 1 };
const fallbackBlock = {
  id: 'blk_parse_starter',
  kind: 'paragraph',
  page_number: 1,
  text: 'Local PDF extraction unavailable (source PDF not found on disk). Install poppler-utils.',
  confidence: 0.2,
};

describe('localRedact (basic PII policy)', () => {
  it('proposes redactions for real PII in extracted text', () => {
    const graph = {
      pages: [{ page_number: 1 }],
      blocks: [sourceSummary, realTextBlock(1, 'Contact jane.doe@example.com or SSN 123-45-6789 today.')],
    };
    const redactions = localRedact(graph, 'run_1', 'redaction_x');
    const labels = redactions.flatMap((r) =>
      (r.regions as Array<Record<string, unknown>>).map((reg) => reg.label),
    );
    expect(labels).toContain('email');
    expect(labels).toContain('us-ssn');
    expect(redactions[0]?.state).toBe('proposed');
  });

  it('proposes nothing when there is no PII', () => {
    const graph = { pages: [{ page_number: 1 }], blocks: [realTextBlock(1, 'Just ordinary prose with no identifiers.')] };
    expect(localRedact(graph, 'run_1', 'redaction_x')).toEqual([]);
  });

  it('does NOT scan the low-confidence "unavailable" fallback block', () => {
    // even if the fallback text somehow contained a pattern, it must be ignored
    const graph = { pages: [{ page_number: 1 }], blocks: [{ ...fallbackBlock, text: 'unavailable a@b.com' }] };
    expect(localRedact(graph, 'run_1', 'redaction_x')).toEqual([]);
  });
});

describe('localAudit (basic WCAG, graph-derived)', () => {
  it('does not flag a page that has real extracted text', () => {
    const graph = {
      document: { filename: 'doc.pdf' },
      pages: [{ page_number: 1 }],
      blocks: [realTextBlock(1, 'Real readable content on page one.')],
    };
    const findings = localAudit(graph, 'run_1', 'finding_x');
    expect(findings.some((f) => f.rule_id === 'okra.local.audit.no_text_layer')).toBe(false);
    expect(findings.some((f) => f.id === 'finding_x')).toBe(true); // summary always present
  });

  it('flags a page whose only block is the low-confidence fallback as no-text', () => {
    const graph = { document: { filename: 'doc.pdf' }, pages: [{ page_number: 1 }], blocks: [fallbackBlock] };
    const findings = localAudit(graph, 'run_1', 'finding_x');
    expect(findings.some((f) => f.rule_id === 'okra.local.audit.no_text_layer')).toBe(true);
  });

  it('flags a missing document title', () => {
    const graph = { document: {}, pages: [{ page_number: 1 }], blocks: [realTextBlock(1, 'text')] };
    const findings = localAudit(graph, 'run_1', 'finding_x');
    expect(findings.some((f) => f.rule_id === 'okra.local.audit.missing_title')).toBe(true);
  });
});
