import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { collectionQueryRaw, formatCollectionDetail, formatExtractCsv, type CollectionDetail } from './collection';
import { OkraRuntimeError } from '../../errors';

type FanoutEvent = Record<string, unknown> & { type: string };

function mockClient(events: FanoutEvent[]): any {
  return {
    collections: {
      // eslint-disable-next-line require-yield
      query: async function* () {
        for (const e of events) yield e;
      },
    },
  };
}

describe('collectionQueryRaw — structured fan-out shape', () => {
  it('parses the answer JSON string into `data` when a schema is set (matches single-doc extract)', async () => {
    const events: FanoutEvent[] = [
      { type: 'start', doc_count: 1 },
      {
        type: 'result',
        doc_id: 'doc-1',
        status: 'fulfilled',
        answer: '{"vendor":"Acme","total":42}',
        duration_ms: 10,
        usage: { cost_usd: 0 },
      },
      { type: 'done', completed: 1, failed: 0, total_cost_usd: 0 },
    ];

    const { results } = await collectionQueryRaw(
      mockClient(events),
      'col',
      'extract',
      { schema: { type: 'object' }, quiet: true } as any,
    );

    // data is the parsed object (was only available as the `answer` string).
    expect(results[0].data).toEqual({ vendor: 'Acme', total: 42 });
    // answer is preserved (back-compat).
    expect(results[0].answer).toBe('{"vendor":"Acme","total":42}');
  });

  it('leaves `data` undefined for prose answers (no schema)', async () => {
    const events: FanoutEvent[] = [
      { type: 'result', doc_id: 'doc-1', status: 'fulfilled', answer: 'Revenue increased.', duration_ms: 5 },
      { type: 'done', completed: 1, failed: 0, total_cost_usd: 0 },
    ];

    const { results } = await collectionQueryRaw(mockClient(events), 'col', 'q', { quiet: true } as any);
    expect(results[0].data).toBeUndefined();
    expect(results[0].answer).toBe('Revenue increased.');
  });

  it('prefers server-provided `data` over parsing the answer', async () => {
    const events: FanoutEvent[] = [
      {
        type: 'result',
        doc_id: 'doc-1',
        status: 'fulfilled',
        answer: '{"from":"answer"}',
        data: { from: 'server' },
        duration_ms: 5,
      },
      { type: 'done', completed: 1, failed: 0, total_cost_usd: 0 },
    ];

    const { results } = await collectionQueryRaw(
      mockClient(events),
      'col',
      'extract',
      { schema: { type: 'object' }, quiet: true } as any,
    );
    expect(results[0].data).toEqual({ from: 'server' });
  });

  it('throws a structured invalid_schema (400) for a malformed --schema file (was error:"error"/code:1)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'okra-coll-schema-'));
    const badSchema = join(dir, 'bad.json');
    writeFileSync(badSchema, '{not valid json');
    try {
      const err = await collectionQueryRaw(mockClient([]), 'col', 'q', { schema: badSchema, quiet: true } as any).catch((e) => e);
      expect(err).toBeInstanceOf(OkraRuntimeError);
      expect((err as OkraRuntimeError).status).toBe(400);
      expect(((err as OkraRuntimeError).details as { error: string }).error).toBe('invalid_schema');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws a structured OkraRuntimeError on a stream-level error event (was a bare Error → code:1)', async () => {
    const events: FanoutEvent[] = [
      { type: 'start', doc_count: 2 },
      { type: 'error', error: 'fan-out backend unavailable' },
    ];
    const err = await collectionQueryRaw(mockClient(events), 'mag7-10k', 'Revenue?', { quiet: true } as any).catch((e) => e);
    expect(err).toBeInstanceOf(OkraRuntimeError);
    expect(err.status).toBe(502);
    expect(err.code).toBe('HTTP_ERROR');
    expect(String(err.message)).toContain('fan-out backend unavailable');
    // details carry a stable error code + a retry next_action referencing the collection.
    const details = err.details as { error: string; next_actions: Array<{ cmd: string }> };
    expect(details.error).toBe('collection_query_failed');
    expect(details.next_actions[0].cmd).toContain('okra collections query mag7-10k');
  });
});

describe('formatCollectionDetail — embedded-document table field mapping', () => {
  // The /v1/collections/:id endpoint returns embedded docs shaped
  // { id, file_name, phase, pages_total, … } — NOT the status/total_pages of
  // the /v1/documents index. Reading `d.status` alone left PHASE blank even for
  // `phase: "complete"` docs (mirror of the #661 list-table mismatch).
  const detail = {
    id: 'col-1',
    name: 'invoices',
    description: null,
    document_count: 1,
    visibility: 'private',
    documents: [
      { id: 'doc-1', file_name: 'ZE71396630.pdf', phase: 'complete', pages_total: 1 },
    ],
  } as unknown as CollectionDetail;

  it('renders phase/pages_total from the actual API row (was blank STATUS)', () => {
    const out = formatCollectionDetail(detail, false);
    const header = out.split('\n').find((l) => l.startsWith('DOC_ID'));
    expect(header).toBe('DOC_ID\tFILE\tPHASE\tPAGES');
    const row = out.split('\n').find((l) => l.startsWith('doc-1'));
    expect(row).toBe('doc-1\tZE71396630.pdf\tcomplete\t1');
  });

  it('still honors the legacy `status` field when `phase` is absent (forward-compat)', () => {
    const legacy = {
      ...detail,
      documents: [{ id: 'doc-2', file_name: 'a.pdf', status: 'parsing' }],
    } as unknown as CollectionDetail;
    const row = formatCollectionDetail(legacy, false).split('\n').find((l) => l.startsWith('doc-2'));
    expect(row).toBe('doc-2\ta.pdf\tparsing\t—');
  });

  it('falls back to em-dash for null file_name / phase / pages', () => {
    const empty = {
      ...detail,
      documents: [{ id: 'doc-3', file_name: null, phase: null, pages_total: null }],
    } as unknown as CollectionDetail;
    const row = formatCollectionDetail(empty, false).split('\n').find((l) => l.startsWith('doc-3'));
    expect(row).toBe('doc-3\t—\t—\t—');
  });

  it('json mode is unchanged (raw passthrough)', () => {
    expect(JSON.parse(formatCollectionDetail(detail, true))).toEqual(detail);
  });
});

describe('formatExtractCsv — array/object values must not corrupt the CSV', () => {
  const results = [
    {
      doc_id: 'doc-1',
      status: 'fulfilled',
      answer: '',
      cost_usd: 0.01,
      duration_ms: 12,
      // `tags` is an array, `total` a number, `vendor` a string with a comma.
      data: { vendor: 'Acme, Inc.', total: 42, tags: ['a', 'b', 'c'] },
    },
  ] as unknown as Parameters<typeof formatExtractCsv>[0];

  it('JSON-encodes + quotes array values instead of leaking raw commas', () => {
    const csv = formatExtractCsv(results);
    const [header, row] = csv.split('\n');
    expect(header).toBe('doc_id,vendor,total,tags,cost_usd,duration_ms');
    // The row must have exactly 6 fields once RFC-4180 quoting is honored —
    // a bare String(['a','b','c']) → "a,b,c" used to inflate this to 8.
    const fields = parseCsvLine(row);
    expect(fields).toHaveLength(6);
    expect(fields[0]).toBe('doc-1');
    expect(fields[1]).toBe('Acme, Inc.'); // comma-containing string stays one field
    expect(fields[2]).toBe('42'); // number unquoted
    expect(fields[3]).toBe('["a","b","c"]'); // array → quoted JSON, one field
  });
});

// Minimal RFC-4180 line parser: splits on commas outside double-quotes and
// unescapes doubled quotes — enough to assert field count + values in tests.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else { inQuotes = false; }
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
