import { describe, expect, it } from 'vitest';
import {
  createHttpContextClient,
  createOfflineContextClient,
  getOfflineContextFixture,
  listOfflineContextFixtures,
} from './context';

describe('Context7-shaped context API', () => {
  it('lists offline fixtures for CLI/API dogfooding', () => {
    const fixtures = listOfflineContextFixtures();
    expect(fixtures.some((fixture) => fixture.id === 'earnings-release-pl-table')).toBe(true);
  });

  it('uses the offline fixture to locate the earnings P/L table', async () => {
    const client = createOfflineContextClient('earnings-release-pl-table');
    const source = await client.resolveSource({ url: 'https://example.com/report.pdf' });
    const structure = await client.readStructure({ source_id: source.source_id, include_artifacts: true });
    const table = structure.tables.find((candidate) => candidate.id === 'tbl-earnings-income-statement');

    expect(table?.page).toBe(6);
    expect(table?.columns).toContain('Year Ended Dec. 31 2025');

    const context = await client.getContext({
      source_id: source.source_id,
      query: 'Find the profit and loss table and return the title, columns, and page number.',
      context_scope: 'structure',
    });

    expect(context.context_blocks[0]?.text).toContain('page 6');
    // M-CITE: citations are Anthropic page_location shape (start/end_page_number, not `page`).
    expect(context.citations[0]?.start_page_number).toBe(6);
    expect(context.citations[0]?.end_page_number).toBe(6);
    expect(context.citations[0]?.bbox).toEqual({ x: 0.08, y: 0.16, w: 0.84, h: 0.12 });
    expect(context.citations[0]?.bbox_source).toBe('node');
    expect(structure.pages_parsed).toBe(structure.page_count);
    expect(structure.coverage).toBe('complete');
  });

  it('captures mocked agent simulations and token traces', () => {
    const fixture = getOfflineContextFixture('earnings-release-pl-table');
    const simulationKinds = new Set(fixture.simulations.map((simulation) => simulation.agent_user.kind));
    const trace = fixture.traces[0];

    expect(simulationKinds.has('claude')).toBe(true);
    expect(simulationKinds.has('codex')).toBe(true);
    expect(trace?.okra.token_estimate).toBeLessThan(trace?.baseline.token_estimate ?? 0);
    expect(trace?.outcome.target_table_id).toBe('tbl-earnings-income-statement');
  });

  it('posts to the planned HTTP API paths', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const client = createHttpContextClient({
      baseUrl: 'https://api.test',
      apiKey: 'okra_test',
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(JSON.stringify({ object: 'pdf_source', source_id: 'src_http', detected_license: { status: 'unknown', label: 'Unknown', confidence: 0, evidence: [] }, allowance_scope: 'blocked', confidence: 0, warnings: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    await client.resolveSource({ url: 'https://example.com/report.pdf' });

    expect(calls[0]?.url).toBe('https://api.test/v1/context/resolve_source');
    expect(calls[0]?.body).toMatchObject({ url: 'https://example.com/report.pdf' });
  });
});
