/**
 * okra collection — List collections and run fan-out queries.
 *
 * Usage:
 *   okra collection list                                          # table
 *   okra collection list --json                                   # JSON array
 *   okra collection query mag7-10k "What was total revenue?"      # table
 *   okra collection query mag7-10k "What was total revenue?" -o /tmp/rev.csv
 *   okra collection query mag7-10k "Revenue?" --json              # raw JSONL
 */

import type { OkraClient } from '../../client';
import { OkraRuntimeError } from '../../errors';
import type { CollectionMarkdownExport, PageLocationCitation } from '../../types';
import type { GlobalFlags } from '../output';
import { progress, csvEscape } from '../output';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CollectionRow {
  id: string;
  name: string;
  description?: string | null;
  document_count: number;
}

export interface QueryResultRow {
  doc_id: string;
  status: string;
  answer: string;
  cost_usd: number;
  duration_ms: number;
  error?: string;
  citations?: PageLocationCitation[];
  /** Structured data when query included a schema. */
  data?: Record<string, unknown>;
}

export interface QuerySummary {
  completed: number;
  failed: number;
  total_cost_usd: number;
}

export interface CollectionListOpts extends GlobalFlags {}

export interface CollectionQueryOpts extends GlobalFlags {
  /** File path to a JSON Schema, or a pre-parsed schema object. */
  schema?: string | Record<string, unknown>;
  cite?: boolean;
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function collectionList(
  client: OkraClient,
  _opts: CollectionListOpts,
): Promise<CollectionRow[]> {
  return client.collections.list() as Promise<CollectionRow[]>;
}

export function formatCollectionList(rows: CollectionRow[], json?: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return 'No collections found.';

  const header = 'ID\tNAME\tDOCS';
  const lines = rows.map(
    (r) => `${r.id}\t${r.name}\t${r.document_count}`,
  );
  return [header, ...lines].join('\n');
}

// ─── Create ─────────────────────────────────────────────────────────────────

export interface CollectionCreateOpts extends GlobalFlags {
  description?: string;
  docs?: string;
}

export async function collectionCreate(
  client: OkraClient,
  name: string,
  opts: CollectionCreateOpts,
): Promise<CollectionRow> {
  const body: Record<string, unknown> = { name };
  if (opts.description) body.description = opts.description;
  if (opts.docs) body.document_ids = opts.docs.split(',').map((s) => s.trim());

  return client.request<CollectionRow>('/v1/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Show ───────────────────────────────────────────────────────────────────

export interface CollectionDetail extends CollectionRow {
  visibility?: string;
  // The /v1/collections/:id endpoint returns embedded docs shaped
  // { id, added_at, file_name, phase, pages_total, total_nodes, source } —
  // note `phase`/`pages_total`, NOT the `status`/`total_pages` of the
  // /v1/documents index. `status` is kept only as a forward-compat fallback.
  documents?: Array<{
    id: string;
    file_name?: string | null;
    phase?: string | null;
    pages_total?: number | null;
    status?: string;
  }>;
}

export async function collectionShow(
  client: OkraClient,
  nameOrId: string,
): Promise<CollectionDetail> {
  return client.request<CollectionDetail>(
    `/v1/collections/${encodeURIComponent(nameOrId)}`,
  );
}

export function formatCollectionDetail(detail: CollectionDetail, json?: boolean): string {
  if (json) return JSON.stringify(detail);
  const lines = [
    `ID:          ${detail.id}`,
    `Name:        ${detail.name}`,
    `Description: ${detail.description || '(none)'}`,
    `Visibility:  ${detail.visibility || 'private'}`,
    `Documents:   ${detail.document_count}`,
  ];
  if (detail.documents?.length) {
    lines.push('');
    lines.push('DOC_ID\tFILE\tPHASE\tPAGES');
    for (const d of detail.documents) {
      // The embedded docs report `phase`/`pages_total`; `status` is only a
      // forward-compat fallback. Reading `d.status` alone left PHASE blank even
      // for `phase: "complete"` docs (mirror of the #661 list-table mismatch).
      const phase = d.phase || d.status || '—';
      const pages = d.pages_total != null ? String(d.pages_total) : '—';
      lines.push(`${d.id}\t${d.file_name || '—'}\t${phase}\t${pages}`);
    }
  }
  return lines.join('\n');
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export async function collectionDelete(
  client: OkraClient,
  nameOrId: string,
): Promise<{ ok: boolean }> {
  return client.request<{ ok: boolean }>(
    `/v1/collections/${encodeURIComponent(nameOrId)}`,
    { method: 'DELETE' },
  );
}

// ─── Add / Remove Documents ─────────────────────────────────────────────────

export async function collectionAddDocs(
  client: OkraClient,
  nameOrId: string,
  documentIds: string[],
): Promise<{ ok: boolean; added: number }> {
  return client.request<{ ok: boolean; added: number }>(
    `/v1/collections/${encodeURIComponent(nameOrId)}/documents`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_ids: documentIds }),
    },
  );
}

export async function collectionRemoveDocs(
  client: OkraClient,
  nameOrId: string,
  documentIds: string[],
): Promise<{ ok: boolean; removed: number }> {
  return client.request<{ ok: boolean; removed: number }>(
    `/v1/collections/${encodeURIComponent(nameOrId)}/documents`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_ids: documentIds }),
    },
  );
}

// ─── Publish / Unpublish ─────────────────────────────────────────────────────

export async function collectionSetVisibility(
  client: OkraClient,
  nameOrId: string,
  visibility: 'public' | 'private',
): Promise<{ ok: boolean }> {
  return client.request<{ ok: boolean }>(
    `/v1/collections/${encodeURIComponent(nameOrId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility }),
    },
  );
}

// ─── Query ───────────────────────────────────────────────────────────────────

/**
 * Fan-out query using the SDK's streaming NDJSON parser.
 * Called directly from bin.ts.
 */
export async function collectionQueryRaw(
  client: OkraClient,
  nameOrId: string,
  question: string,
  opts: CollectionQueryOpts,
): Promise<{ results: QueryResultRow[]; summary: QuerySummary }> {
  progress(`Querying collection "${nameOrId}"…`, opts.quiet);

  let schema: Record<string, unknown> | undefined;
  if (opts.schema) {
    if (typeof opts.schema === 'object') {
      schema = opts.schema;
    } else {
      const { readFileSync } = await import('fs');
      const filePath: string = opts.schema;
      // A malformed --schema file must produce a structured envelope, not a bare
      // SyntaxError → handleError's generic error:"error", code:1 dead-end.
      const raw = readFileSync(filePath, 'utf8');
      try {
        schema = JSON.parse(raw);
      } catch (error) {
        const message = `--schema file ${filePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
        throw new OkraRuntimeError('INVALID_REQUEST', message, 400, {
          error: 'invalid_schema',
          message,
          next_actions: [
            { cmd: 'okra collections extract <name> --schema ./schema.json --cite', why: 'Point --schema at a valid JSON Schema file.' },
          ],
        });
      }
    }
  }

  const stream = client.collections.query(nameOrId, question, {
    ...(schema ? { schema } : {}),
    ...(opts.cite ? { cite: true } : {}),
  });

  const results: QueryResultRow[] = [];

  for await (const event of stream) {
    if (event.type === 'start') {
      progress(`  ${event.doc_count} documents`, opts.quiet);
    } else if (event.type === 'result') {
      // Structured fan-out (--schema): the server streams the extracted object
      // as the `answer` JSON string. Parse it into `data` so a batch result row
      // matches single-doc `okra extract` ({ doc_id, data, … }) — agents get a
      // parsed object, not a string they must re-parse.
      let data = event.data as Record<string, unknown> | undefined;
      if (!data && schema && typeof event.answer === 'string' && event.answer.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(event.answer);
          if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
        } catch {
          /* leave data undefined; `answer` still carries the raw text */
        }
      }
      results.push({
        doc_id: event.doc_id,
        status: event.status,
        answer: event.answer ?? '',
        cost_usd: event.usage?.cost_usd ?? 0,
        duration_ms: event.duration_ms ?? 0,
        error: event.error,
        ...(event.citations ? { citations: event.citations } : {}),
        data,
      });
      progress(
        `  ${event.status === 'fulfilled' ? '+' : '!'} ${event.doc_id} (${event.duration_ms}ms)`,
        opts.quiet,
      );
    } else if (event.type === 'done') {
      return {
        results,
        summary: {
          completed: event.completed,
          failed: event.failed,
          total_cost_usd: event.total_cost_usd,
        },
      };
    } else if (event.type === 'error') {
      // A stream-level error event = the whole fan-out failed mid-stream. A bare
      // `throw new Error(...)` here surfaced through handleError as the generic
      // error:"error", code:1 dead-end (no stable code, status, or recovery) —
      // same class as the facet/jobs-wait envelope fixes. Throw a structured
      // OkraRuntimeError so the agent gets a stable code + 502 + a retry action.
      const message = event.error || 'Collection query failed mid-stream.';
      throw new OkraRuntimeError('HTTP_ERROR', message, 502, {
        error: 'collection_query_failed',
        message,
        next_actions: [
          { cmd: `okra collections query ${nameOrId} ${JSON.stringify(question)}`, why: 'Retry the fan-out query — the stream errored before completing.' },
        ],
      });
    }
  }

  // Stream ended without 'done' event — return what we have
  return {
    results,
    summary: { completed: results.length, failed: 0, total_cost_usd: 0 },
  };
}

// ─── Formatters ──────────────────────────────────────────────────────────────

export function formatCollectionCsv(results: QueryResultRow[]): string {
  const header = 'doc_id,status,answer,cost_usd,duration_ms';
  const rows = results.map((r) =>
    [
      r.doc_id,
      r.status,
      csvEscape(r.answer),
      r.cost_usd,
      r.duration_ms,
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function formatCollectionTable(results: QueryResultRow[]): string {
  if (results.length === 0) return 'No results.';
  const header = 'DOC_ID\tSTATUS\tANSWER\tCOST\tDUR_MS';
  const rows = results.map(
    (r) =>
      `${r.doc_id}\t${r.status}\t${r.answer.slice(0, 80)}${r.answer.length > 80 ? '…' : ''}\t$${r.cost_usd.toFixed(4)}\t${r.duration_ms}`,
  );
  return [header, ...rows].join('\n');
}

export function formatQueryJsonl(results: QueryResultRow[]): string {
  return results.map((r) => JSON.stringify(r)).join('\n');
}

// ─── Structured Extract Formatters ───────────────────────────────────────────

/**
 * Collect all unique data keys across results for column headers.
 * Preserves insertion order from the first result that has each key.
 */
function collectDataKeys(results: QueryResultRow[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const r of results) {
    if (!r.data) continue;
    for (const k of Object.keys(r.data)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  return keys;
}

/** Format structured extraction results as CSV with flattened data columns. */
export function formatExtractCsv(results: QueryResultRow[]): string {
  const dataKeys = collectDataKeys(results);
  const header = ['doc_id', ...dataKeys, 'cost_usd', 'duration_ms'].join(',');
  const rows = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => {
      const dataCols = dataKeys.map((k) => {
        const v = r.data?.[k];
        if (v == null) return '';
        if (typeof v === 'string') return csvEscape(v);
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        // Objects/arrays (e.g. line_items, tags) must be JSON-encoded AND escaped —
        // a bare String([1,2,3]) → "1,2,3" injects raw commas that shift every
        // later column and corrupt the CSV. csvEscape quotes the JSON safely.
        return csvEscape(JSON.stringify(v));
      });
      return [r.doc_id, ...dataCols, r.cost_usd, r.duration_ms].join(',');
    });
  return [header, ...rows].join('\n');
}

/** Format structured extraction results as a human-readable table. */
export function formatExtractTable(results: QueryResultRow[]): string {
  const fulfilled = results.filter((r) => r.status === 'fulfilled' && r.data);
  if (fulfilled.length === 0) return 'No results with structured data.';

  const dataKeys = collectDataKeys(fulfilled);
  // Build column widths
  const colHeaders = dataKeys.map((k) => k.toUpperCase());
  const colWidths = colHeaders.map((h, i) => {
    const key = dataKeys[i];
    const maxData = fulfilled.reduce((max, r) => {
      const v = r.data?.[key];
      const len = v == null ? 0 : String(v).length;
      return Math.max(max, len);
    }, 0);
    return Math.max(h.length, Math.min(maxData, 40));
  });

  const pad = (s: string, w: number) => s.length > w ? s.slice(0, w - 1) + '\u2026' : s.padEnd(w);

  const headerLine = colHeaders.map((h, i) => pad(h, colWidths[i])).join('  ');
  const rows = fulfilled.map((r) =>
    dataKeys.map((k, i) => {
      const v = r.data?.[k];
      const s = v == null ? '' : String(v);
      return pad(s, colWidths[i]);
    }).join('  '),
  );
  return [headerLine, ...rows].join('\n');
}

/** Format structured extraction results as JSON array. */
export function formatExtractJson(results: QueryResultRow[]): string {
  const items = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => ({ doc_id: r.doc_id, data: r.data ?? {} }));
  return JSON.stringify(items, null, 2);
}

// ─── Export ─────────────────────────────────────────────────────────────────

export interface CollectionExportOpts extends GlobalFlags {
  flat?: boolean;
  zip?: boolean;
}

export async function collectionExport(
  client: OkraClient,
  nameOrId: string,
  opts: CollectionExportOpts & { zip: true },
): Promise<Uint8Array>;
export async function collectionExport(
  client: OkraClient,
  nameOrId: string,
  opts: CollectionExportOpts & { zip?: false | undefined },
): Promise<CollectionMarkdownExport>;
export async function collectionExport(
  client: OkraClient,
  nameOrId: string,
  opts: CollectionExportOpts,
): Promise<CollectionMarkdownExport | Uint8Array> {
  if (opts.zip) {
    progress(`Exporting markdown zip from "${nameOrId}"…`, opts.quiet);
    const bytes = await client.collections.exportMarkdown(nameOrId, { format: 'zip' }) as Uint8Array;
    progress(`  ${bytes.byteLength} bytes`, opts.quiet);
    return bytes;
  }

  progress(`Exporting markdown from "${nameOrId}"…`, opts.quiet);
  const result = await client.collections.exportMarkdown(nameOrId) as CollectionMarkdownExport;
  progress(
    `  ${result.totalDocuments} documents, ${result.totalPages} pages`,
    opts.quiet,
  );
  return result;
}

export function formatCollectionExportFlat(result: CollectionMarkdownExport): string {
  const parts: string[] = [];
  for (const doc of result.documents) {
    parts.push(`# ${doc.fileName || doc.docId}`);
    parts.push('');
    for (const page of doc.pages) {
      parts.push(page.content);
      parts.push('');
    }
    parts.push('===');
    parts.push('');
  }
  return parts.join('\n');
}
