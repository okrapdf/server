/**
 * okra list — List all documents for the authenticated user.
 *
 * Usage:
 *   okra list                    # table format
 *   okra list --json             # JSON array
 */

import type { OkraClient } from '../../client';
import type { DocumentListItem } from '../../types';
import type { GlobalFlags } from '../output';

export interface ListResult {
  documents: DocumentListItem[];
}

export async function listDocuments(
  client: OkraClient,
  _opts: GlobalFlags,
): Promise<ListResult> {
  const documents = await client.listDocuments();
  return { documents };
}

export function formatDocumentList(documents: DocumentListItem[], json?: boolean): string {
  if (json) {
    return JSON.stringify(documents);
  }

  if (documents.length === 0) {
    return 'No documents found.';
  }

  const lines: string[] = [];
  const header = ['ID', 'File', 'Phase', 'Pages', 'Created'];
  lines.push(header.join('\t'));
  lines.push(header.map(h => '-'.repeat(h.length)).join('\t'));

  for (const doc of documents) {
    // The /v1/documents index returns `status`/`total_pages`/`inserted_at`,
    // which don't match the DocumentListItem type's `phase`/`pages_total`/
    // `created_at` — so the human table showed empty Phase/Pages/Created. Read
    // the type-declared name first (forward-compatible) then the actual API name.
    const d = doc as DocumentListItem & { status?: string; total_pages?: number | null; inserted_at?: string };
    const phase = d.phase || d.status || '—';
    const pages = d.pages_total ?? d.total_pages;
    const created = d.created_at ?? d.inserted_at;
    lines.push([
      d.id,
      d.file_name ?? '—',
      phase,
      pages != null ? String(pages) : '—',
      created ? new Date(created).toLocaleDateString() : '—',
    ].join('\t'));
  }

  return lines.join('\n');
}
