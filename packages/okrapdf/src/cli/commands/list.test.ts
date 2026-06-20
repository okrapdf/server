import { describe, expect, it } from 'vitest';
import { formatDocumentList } from './list';
import type { DocumentListItem } from '../../types';

// The /v1/documents index returns rows shaped { status, total_pages, inserted_at },
// which don't match the DocumentListItem type's { phase, pages_total, created_at }.
// formatDocumentList must read the actual API fields so the human table isn't blank.
const apiRow = {
  id: 'doc-abc',
  file_name: 'report.pdf',
  status: 'completed',
  total_pages: 7,
  inserted_at: '2026-06-16T22:00:00.000Z',
} as unknown as DocumentListItem;

describe('formatDocumentList (#list table field mapping)', () => {
  it('renders status/total_pages/inserted_at from the actual API row (was blank)', () => {
    const out = formatDocumentList([apiRow], false);
    const dataRow = out.split('\n')[2]; // header, divider, then first row
    const cells = dataRow.split('\t');
    expect(cells[0]).toBe('doc-abc');
    expect(cells[1]).toBe('report.pdf');
    expect(cells[2]).toBe('completed'); // Phase ← status (was undefined/blank)
    expect(cells[3]).toBe('7'); // Pages ← total_pages (was —)
    expect(cells[4]).not.toBe('—'); // Created ← inserted_at (was —)
  });

  it('still honors the type-declared names when present (forward-compatible)', () => {
    const typedRow = { id: 'doc-x', file_name: 'a.pdf', phase: 'parsing', pages_total: 3, created_at: '2026-06-16T00:00:00Z' } as unknown as DocumentListItem;
    const cells = formatDocumentList([typedRow], false).split('\n')[2].split('\t');
    expect(cells[2]).toBe('parsing');
    expect(cells[3]).toBe('3');
  });

  it('json mode is unchanged (raw passthrough)', () => {
    expect(JSON.parse(formatDocumentList([apiRow], true))).toEqual([apiRow]);
  });

  it('empty list', () => {
    expect(formatDocumentList([], false)).toBe('No documents found.');
  });
});
