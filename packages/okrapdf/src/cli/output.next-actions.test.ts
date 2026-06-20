import { describe, expect, it } from 'vitest';
import { inferNextActions } from './output';

const SOURCE = 'doc-abc123';

function cmds(actions: { cmd: string }[]): string[] {
  return actions.map((a) => a.cmd);
}

describe('inferNextActions — context get/ask cited-page handoff', () => {
  it('adds `context open --page <cited>` when the answer carried a citation', () => {
    const result = {
      source_id: SOURCE,
      citations: [
        { type: 'page_location', start_page_number: 4, citation_url: 'https://res.okrapdf.com/…/pg_4.png' },
      ],
    };
    for (const command of ['context get', 'context ask', 'ask']) {
      const actions = inferNextActions(command, result);
      const list = cmds(actions);
      expect(list).toContain(`okra context open ${SOURCE} --page 4`);
      expect(list.some((c) => c.startsWith(`okra context structure ${SOURCE}`))).toBe(true);
      // The cited-page handoff leads (verify what you just got), structure follows.
      expect(list[0]).toBe(`okra context open ${SOURCE} --page 4`);
    }
  });

  it('uses the first valid (>0) citation page, skipping malformed entries', () => {
    const result = {
      source_id: SOURCE,
      citations: [
        { type: 'page_location' }, // no page
        { start_page_number: 0 }, // not a real page
        { start_page_number: 7 },
      ],
    };
    expect(cmds(inferNextActions('context get', result))).toContain(`okra context open ${SOURCE} --page 7`);
  });

  it('omits the open action when there is no citation (no noise on empty answers)', () => {
    const result = { source_id: SOURCE, citations: [], context_blocks: [], omitted_reason: 'not_found' };
    const list = cmds(inferNextActions('context get', result));
    expect(list.some((c) => c.includes('context open'))).toBe(false);
    expect(list).toEqual([`okra context structure ${SOURCE}`]);
  });

  it('returns no actions when there is no source id', () => {
    expect(inferNextActions('context get', { citations: [{ start_page_number: 2 }] })).toEqual([]);
  });
});

describe('inferNextActions — collections extract fan-out handoff', () => {
  it('points at a row document for verification after a structured fan-out', () => {
    const result = {
      results: [
        { doc_id: 'doc-row1', data: { total: '$10' }, status: 'fulfilled', citations: [] },
        { doc_id: 'doc-row2', data: { total: '$20' }, status: 'fulfilled', citations: [] },
      ],
      summary: { completed: 2, failed: 0 },
    };
    const cmds = inferNextActions('collections extract', result).map((a) => a.cmd);
    expect(cmds.length).toBeGreaterThan(0); // was an empty dead-end before
    expect(cmds.some((c) => c.includes('okra context get') && c.includes('--source-id doc-row1'))).toBe(true);
  });

  it('returns no actions when the fan-out produced no rows', () => {
    expect(inferNextActions('collections extract', { results: [], summary: { completed: 0, failed: 0 } })).toEqual([]);
  });
});

describe('inferNextActions — parse → jobs wait → context lifecycle', () => {
  const parseResult = {
    object: 'job',
    job_id: 'lifecycle-doc-4aa2e449-1781630705106',
    id: 'lifecycle-doc-4aa2e449-1781630705106',
    document_id: 'doc-4aa2e449',
    status: 'queued',
  };

  it('parse points at jobs wait on the queued job (was a dead-end)', () => {
    const cmds = inferNextActions('parse', parseResult).map((a) => a.cmd);
    expect(cmds).toEqual([`okra jobs wait lifecycle-doc-4aa2e449-1781630705106`]);
  });

  it('jobs wait on a parse job points back at context structure (loop closes)', () => {
    const cmds = inferNextActions('jobs wait', { ...parseResult, job_type: 'parse', status: 'completed' }).map((a) => a.cmd);
    expect(cmds).toEqual([`okra context structure doc-4aa2e449`]);
  });

  it('jobs wait derives the doc id from the lifecycle job id when no explicit field', () => {
    const cmds = inferNextActions('jobs wait', {
      job_id: 'lifecycle-doc-abc123-999',
      job_type: 'parse',
    }).map((a) => a.cmd);
    expect(cmds).toEqual([`okra context structure doc-abc123`]);
  });

  it('jobs wait stays quiet for a non-parse job', () => {
    expect(inferNextActions('jobs wait', { job_id: 'render-xyz', job_type: 'render' })).toEqual([]);
  });

  it('read nudges toward cited verification', () => {
    const cmds = inferNextActions('read', { documentId: 'doc-xyz', markdown: '# hi' }).map((a) => a.cmd);
    expect(cmds).toEqual([`okra context get "<claim to verify>" --source-id doc-xyz`]);
  });
});

describe('inferNextActions — extract → verify wiring (#380)', () => {
  it('a grounded extract suggests vision-verifying a value against its cited page', () => {
    const result = {
      document_id: 'doc-inv',
      data: { total: '$3201' },
      citations: [{ field: 'total', type: 'page_location', start_page_number: 2 }],
    };
    const cmds = inferNextActions('extract', result).map((a) => a.cmd);
    expect(cmds.some((c) => c.startsWith('okra documents verify doc-inv') && c.includes('--page 2'))).toBe(true);
    // still offers the cited-context read
    expect(cmds.some((c) => c.includes('okra context get'))).toBe(true);
  });

  it('an ungrounded extract (no citations) does not suggest verify, but suggests --cite', () => {
    const cmds = inferNextActions('extract', { document_id: 'doc-x', data: { total: '$10' } }).map((a) => a.cmd);
    expect(cmds.some((c) => c.includes('documents verify'))).toBe(false);
    expect(cmds.some((c) => c.includes('--cite'))).toBe(true);
  });
});

describe('inferNextActions — documents get unknown-doc recovery (#652)', () => {
  it('suggests documents list when the result has no fileName (empty/unknown doc)', () => {
    const cmds = inferNextActions('documents get', { documentId: 'doc-typo', phase: 'idle' }).map((a) => a.cmd);
    expect(cmds).toEqual(['okra documents list']);
  });

  it('stays quiet for a real doc (has fileName)', () => {
    expect(inferNextActions('documents get', { documentId: 'doc-real', phase: 'complete', fileName: 'report.pdf', totalPages: 3 })).toEqual([]);
  });
});
