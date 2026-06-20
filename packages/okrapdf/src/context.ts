import { OkraRuntimeError } from './errors';
import type { PageLocationCitation } from './types';

export type OkraContextToolName =
  | 'resolve_source'
  | 'read_structure'
  | 'get_context'
  | 'ask'
  | 'open_source';

export type OkraContextAllowanceScope =
  | 'public_unlicensed'
  | 'open_license'
  | 'public_domain'
  | 'user_private'
  | 'owner_permissioned'
  | 'blocked';

export type OkraContextScope =
  | 'metadata'
  | 'structure'
  | 'bounded_context'
  | 'answer'
  | 'source_redirect'
  | 'full_text'
  | 'full_markdown';

export interface OkraContextPolicy {
  structure: boolean;
  cited_snippets: boolean;
  qa: boolean;
  summaries: 'disabled' | 'bounded' | 'allowed';
  full_text_export: boolean;
  full_markdown: boolean;
  read_full_section: boolean;
  cross_user_cache: boolean;
  requires_original_source: boolean;
  max_snippet_chars: number;
  max_context_tokens: number;
  max_adjacent_snippets: number;
}

export interface ResolveSourceRequest {
  url?: string;
  sha256?: string;
  title_hint?: string;
  user_asserted_access?: boolean;
}

export interface ResolveSourceResponse {
  object: 'pdf_source';
  source_id: string;
  canonical_url?: string;
  sha256?: string;
  title?: string;
  page_count?: number;
  detected_license: {
    status: 'unknown' | 'unlicensed' | 'open_license' | 'public_domain' | 'permissioned' | 'blocked';
    label: string;
    url?: string;
    confidence: number;
    evidence: string[];
  };
  allowance_scope: OkraContextAllowanceScope;
  allowance_policy?: OkraContextPolicy;
  confidence: number;
  warnings: string[];
  is_synthetic?: boolean;
}

export interface ReadStructureRequest {
  source_id: string;
  max_depth?: number;
  include_artifacts?: boolean;
}

export interface ContextStructureNode {
  id: string;
  title: string;
  level: number;
  kind?: 'front_matter' | 'toc' | 'section' | 'subsection' | 'appendix' | 'table' | 'figure' | 'form' | 'references' | 'metadata';
  page_start: number;
  page_end?: number;
  parent_id?: string;
  path?: string[];
  token_estimate: number;
  content_kinds?: Array<'text' | 'table' | 'figure' | 'form' | 'appendix' | 'references' | 'metadata'>;
  confidence?: number;
  summary_preview?: string;
}

export interface ContextStructureArtifact {
  id: string;
  title_hint?: string;
  page: number;
  section_id?: string;
  columns: string[];
  row_count_hint?: number;
  confidence?: number;
}

export interface ReadStructureResponse {
  object: 'pdf_structure';
  source_id: string;
  title?: string;
  canonical_url?: string;
  page_count?: number;
  pages_parsed?: number;
  coverage?: 'unknown' | 'empty' | 'partial' | 'complete';
  page_coverage?: 'unknown' | 'empty' | 'partial' | 'complete';
  page_coverage_percent?: number;
  allowance_scope: OkraContextAllowanceScope;
  policy?: OkraContextPolicy;
  outline: ContextStructureNode[];
  tables: ContextStructureArtifact[];
  figures: ContextStructureArtifact[];
  generated_at?: string;
}

export interface GetContextRequest {
  source_id: string;
  query: string;
  section_ids?: string[];
  context_scope?: OkraContextScope;
  max_tokens?: number;
}

/**
 * Context (ask/get/resolve) citations are the same Anthropic page_location
 * contract as extract/collections — one citation type across the SDK (M-CITE).
 * Kept as a named alias so existing `ContextCitation` imports still resolve.
 */
export type ContextCitation = PageLocationCitation;

export interface ContextBlock {
  block_id: string;
  kind: 'snippet' | 'table_summary' | 'figure_summary' | 'metadata' | 'section_summary' | 'navigation';
  section_id?: string;
  page?: number;
  page_start?: number;
  page_end?: number;
  title?: string;
  text: string;
  token_estimate: number;
  citations: ContextCitation[];
  confidence?: number;
}

export interface GetContextResponse {
  object: 'pdf_context';
  source_id: string;
  query: string;
  context_scope: OkraContextScope;
  context_blocks: ContextBlock[];
  citations: ContextCitation[];
  omitted_reason?: 'scope_limit' | 'copyright_guardrail' | 'token_budget' | 'not_found' | 'original_source_required';
  policy?: OkraContextPolicy;
}

export interface AskContextRequest {
  source_id: string;
  question: string;
  section_ids?: string[];
  max_answer_tokens?: number;
}

export interface AskContextResponse {
  object: 'pdf_answer';
  source_id: string;
  question: string;
  answer: string;
  citations: ContextCitation[];
  confidence: number;
  follow_up_sections: string[];
  policy?: OkraContextPolicy;
}

export interface OpenSourceRequest {
  source_id: string;
  page?: number;
  section_id?: string;
}

export interface OpenSourceResponse {
  object: 'original_source_link';
  source_id: string;
  url: string;
  page?: number;
  section_id?: string;
}

export interface OkraContextClient {
  resolveSource(request: ResolveSourceRequest): Promise<ResolveSourceResponse>;
  readStructure(request: ReadStructureRequest): Promise<ReadStructureResponse>;
  getContext(request: GetContextRequest): Promise<GetContextResponse>;
  ask(request: AskContextRequest): Promise<AskContextResponse>;
  openSource(request: OpenSourceRequest): Promise<OpenSourceResponse>;
}

export interface OfflineContextExample {
  id: string;
  sample_id: string;
  title: string;
  user_query: string;
  user_visible_result: string;
  tool_name: OkraContextToolName;
  request: ResolveSourceRequest | ReadStructureRequest | GetContextRequest | AskContextRequest | OpenSourceRequest;
  response: ResolveSourceResponse | ReadStructureResponse | GetContextResponse | AskContextResponse | OpenSourceResponse;
}

export interface ContextTraceComparison {
  id: string;
  sample_id: string;
  title: string;
  task: string;
  baseline: {
    strategy: 'without_okra';
    summary: string;
    token_estimate: number;
    pages_touched: number[];
    result_confidence: number;
    risk_notes: string[];
  };
  okra: {
    strategy: 'with_okra';
    summary: string;
    token_estimate: number;
    pages_touched: number[];
    result_confidence: number;
    risk_notes: string[];
  };
  outcome: {
    target_table_id?: string;
    target_page?: number;
    saved_tokens_estimate: number;
    token_reduction_percent: number;
    pages_avoided: number;
    result: string;
  };
}

export interface ContextAgentSimulation {
  id: string;
  sample_id: string;
  title: string;
  agent_user: {
    kind: 'claude' | 'codex' | 'other_agent';
    name: string;
    prompt: string;
  };
  mocked_tool_exchanges: OfflineContextExample[];
  final_handoff: {
    parser_task: string;
    target_table_id?: string;
    target_page?: number;
    expected_title?: string;
    expected_columns: string[];
    validation_checks: string[];
  };
}

export interface OfflineContextFixture {
  id: string;
  title: string;
  description: string;
  source: ResolveSourceResponse;
  structure: ReadStructureResponse;
  contextResponses: GetContextResponse[];
  answers: AskContextResponse[];
  examples: OfflineContextExample[];
  traces: ContextTraceComparison[];
  simulations: ContextAgentSimulation[];
}

const publicUnlicensedPolicy: OkraContextPolicy = {
  structure: true,
  cited_snippets: true,
  qa: true,
  summaries: 'bounded',
  full_text_export: false,
  full_markdown: false,
  read_full_section: false,
  cross_user_cache: false,
  requires_original_source: true,
  max_snippet_chars: 480,
  max_context_tokens: 2_400,
  max_adjacent_snippets: 2,
};

const source: ResolveSourceResponse = {
  object: 'pdf_source',
  source_id: 'src_demo_earnings_q4_2025',
  canonical_url: 'https://example.com/samples/northwind-q4-2025-earnings.pdf',
  sha256: '5'.repeat(64),
  title: 'Northwind Systems Q4 2025 Earnings Release',
  page_count: 32,
  detected_license: {
    status: 'unlicensed',
    label: 'No open license detected',
    confidence: 0.46,
    evidence: ['Public investor-relations URL is reachable', 'No reuse license marker detected'],
  },
  allowance_scope: 'public_unlicensed',
  allowance_policy: publicUnlicensedPolicy,
  confidence: 0.88,
  warnings: ['Use table inventory and bounded table context; full Markdown export is disabled'],
  is_synthetic: true,
};

const incomeStatementBbox = { x: 0.08, y: 0.16, w: 0.84, h: 0.12 };
const incomeStatementCitation: ContextCitation = {
  type: 'page_location',
  cited_text: 'Condensed Consolidated Statements of Operations',
  start_page_number: 6,
  end_page_number: 6,
  citation_url: `https://res.okrapdf.com/v1/documents/${source.source_id}/pg_6.png`,
  match: 'exact',
  bbox: incomeStatementBbox,
  bbox_source: 'node',
};

const structure: ReadStructureResponse = {
  object: 'pdf_structure',
  source_id: source.source_id,
  title: source.title,
  canonical_url: source.canonical_url,
  page_count: source.page_count,
  pages_parsed: source.page_count,
  coverage: 'complete',
  page_coverage: 'complete',
  page_coverage_percent: 100,
  allowance_scope: source.allowance_scope,
  policy: publicUnlicensedPolicy,
  outline: [
    {
      id: 'earnings-highlights',
      title: 'Quarterly Highlights',
      level: 1,
      page_start: 1,
      page_end: 3,
      token_estimate: 1_240,
      summary_preview: 'Revenue, margin, EPS, operating cash flow, and CEO commentary.',
    },
    {
      id: 'earnings-condensed-statements',
      title: 'Condensed Consolidated Financial Statements',
      level: 1,
      page_start: 4,
      page_end: 9,
      token_estimate: 3_900,
      content_kinds: ['text', 'table'],
      summary_preview: 'Income statement, balance sheet, and cash flow statement tables.',
    },
    {
      id: 'earnings-income-statement',
      title: 'Condensed Consolidated Statements of Operations',
      level: 2,
      parent_id: 'earnings-condensed-statements',
      path: ['Condensed Consolidated Financial Statements'],
      page_start: 6,
      page_end: 6,
      token_estimate: 780,
      content_kinds: ['table'],
      summary_preview: 'P/L table with revenue, cost of revenue, gross profit, operating income, net income, and EPS columns.',
    },
    {
      id: 'earnings-non-gaap',
      title: 'Non-GAAP Reconciliations',
      level: 1,
      page_start: 18,
      page_end: 24,
      token_estimate: 2_950,
      content_kinds: ['text', 'table'],
      summary_preview: 'Adjusted operating income, adjusted EBITDA, free cash flow, and constant-currency reconciliation tables.',
    },
  ],
  tables: [
    {
      id: 'tbl-earnings-income-statement',
      title_hint: 'Condensed Consolidated Statements of Operations',
      page: 6,
      section_id: 'earnings-income-statement',
      columns: [
        'Three Months Ended Dec. 31 2025',
        'Three Months Ended Dec. 31 2024',
        'Year Ended Dec. 31 2025',
        'Year Ended Dec. 31 2024',
      ],
      row_count_hint: 18,
      confidence: 0.93,
    },
    {
      id: 'tbl-earnings-balance-sheet',
      title_hint: 'Condensed Consolidated Balance Sheets',
      page: 7,
      section_id: 'earnings-condensed-statements',
      columns: ['Dec. 31 2025', 'Dec. 31 2024'],
      row_count_hint: 22,
      confidence: 0.9,
    },
    {
      id: 'tbl-earnings-cash-flow',
      title_hint: 'Condensed Consolidated Statements of Cash Flows',
      page: 8,
      section_id: 'earnings-condensed-statements',
      columns: ['Year Ended Dec. 31 2025', 'Year Ended Dec. 31 2024'],
      row_count_hint: 20,
      confidence: 0.88,
    },
    {
      id: 'tbl-earnings-adjusted-ebitda',
      title_hint: 'Adjusted EBITDA Reconciliation',
      page: 20,
      section_id: 'earnings-non-gaap',
      columns: ['Three Months Ended Dec. 31 2025', 'Three Months Ended Dec. 31 2024'],
      row_count_hint: 14,
      confidence: 0.84,
    },
  ],
  figures: [],
};

const tableInventoryContext: GetContextResponse = {
  object: 'pdf_context',
  source_id: source.source_id,
  query: 'Find the profit and loss table and return the title, columns, and page number.',
  context_scope: 'structure',
  context_blocks: [
    {
      block_id: 'ctx-earnings-table-inventory',
      kind: 'navigation',
      section_id: 'earnings-condensed-statements',
      page_start: 4,
      page_end: 9,
      title: 'Table inventory for financial statements',
      text: 'Candidate P/L table: Condensed Consolidated Statements of Operations on page 6. Columns: Three Months Ended Dec. 31 2025, Three Months Ended Dec. 31 2024, Year Ended Dec. 31 2025, Year Ended Dec. 31 2024. Other nearby tables are balance sheet on page 7 and cash flow on page 8.',
      token_estimate: 76,
      citations: [
        { ...incomeStatementCitation },
      ],
      confidence: 0.93,
    },
  ],
  citations: [
    { ...incomeStatementCitation },
  ],
  policy: publicUnlicensedPolicy,
};

const parserTargetContext: GetContextResponse = {
  object: 'pdf_context',
  source_id: source.source_id,
  query: 'Give me the minimal parse target for extracting the P/L table.',
  context_scope: 'bounded_context',
  context_blocks: [
    {
      block_id: 'ctx-earnings-parser-target',
      kind: 'table_summary',
      section_id: 'earnings-income-statement',
      page: 6,
      title: 'Parser target',
      text: 'Parse page 6 and target table tbl-earnings-income-statement. Expected title is Condensed Consolidated Statements of Operations and expected row count is about 18.',
      token_estimate: 38,
      citations: [
        { ...incomeStatementCitation },
      ],
      confidence: 0.91,
    },
  ],
  citations: [
    { ...incomeStatementCitation },
  ],
  policy: publicUnlicensedPolicy,
};

const pageAnswer: AskContextResponse = {
  object: 'pdf_answer',
  source_id: source.source_id,
  question: 'Which page should I parse to extract the P/L table?',
  answer: 'Parse page 6. The target table is titled Condensed Consolidated Statements of Operations, with quarter and year comparison columns for Dec. 31 2025 and Dec. 31 2024.',
  citations: [
    { ...incomeStatementCitation },
  ],
  confidence: 0.92,
  follow_up_sections: ['earnings-condensed-statements'],
  policy: publicUnlicensedPolicy,
};

const openPage: OpenSourceResponse = {
  object: 'original_source_link',
  source_id: source.source_id,
  url: `${source.canonical_url}#page=6`,
  page: 6,
  section_id: 'earnings-income-statement',
};

const examples: OfflineContextExample[] = [
  {
    id: 'earnings-release-pl-table:resolve-source',
    sample_id: 'earnings-release-pl-table',
    title: 'Resolve source',
    user_query: 'Index the Q4 earnings release for agent extraction.',
    user_visible_result: 'Northwind Systems Q4 2025 Earnings Release resolves as public unlicensed with 88% confidence.',
    tool_name: 'resolve_source',
    request: { url: source.canonical_url, sha256: source.sha256, title_hint: source.title },
    response: source,
  },
  {
    id: 'earnings-release-pl-table:read-structure',
    sample_id: 'earnings-release-pl-table',
    title: 'Read table inventory',
    user_query: 'List the financial tables with titles, columns, and page numbers.',
    user_visible_result: 'The P/L table is Condensed Consolidated Statements of Operations on page 6.',
    tool_name: 'read_structure',
    request: { source_id: source.source_id, max_depth: 3, include_artifacts: true },
    response: structure,
  },
  {
    id: 'earnings-release-pl-table:get-context:1',
    sample_id: 'earnings-release-pl-table',
    title: 'P/L table locator',
    user_query: tableInventoryContext.query,
    user_visible_result: tableInventoryContext.context_blocks[0]?.text ?? '',
    tool_name: 'get_context',
    request: {
      source_id: source.source_id,
      query: tableInventoryContext.query,
      section_ids: ['earnings-condensed-statements'],
      context_scope: 'structure',
      max_tokens: 900,
    },
    response: tableInventoryContext,
  },
  {
    id: 'earnings-release-pl-table:get-context:2',
    sample_id: 'earnings-release-pl-table',
    title: 'Targeted parser handoff',
    user_query: parserTargetContext.query,
    user_visible_result: parserTargetContext.context_blocks[0]?.text ?? '',
    tool_name: 'get_context',
    request: {
      source_id: source.source_id,
      query: parserTargetContext.query,
      section_ids: ['earnings-income-statement'],
      context_scope: 'bounded_context',
      max_tokens: 600,
    },
    response: parserTargetContext,
  },
  {
    id: 'earnings-release-pl-table:ask:1',
    sample_id: 'earnings-release-pl-table',
    title: 'Target page answer',
    user_query: pageAnswer.question,
    user_visible_result: pageAnswer.answer,
    tool_name: 'ask',
    request: {
      source_id: source.source_id,
      question: pageAnswer.question,
      section_ids: ['earnings-income-statement'],
      max_answer_tokens: 250,
    },
    response: pageAnswer,
  },
  {
    id: 'earnings-release-pl-table:open-source',
    sample_id: 'earnings-release-pl-table',
    title: 'Open original page',
    user_query: 'Open the original source page for the P/L table.',
    user_visible_result: 'Open the original PDF at page 6.',
    tool_name: 'open_source',
    request: { source_id: source.source_id, page: 6, section_id: 'earnings-income-statement' },
    response: openPage,
  },
];

const trace: ContextTraceComparison = {
  id: 'trace-earnings-pl-table',
  sample_id: 'earnings-release-pl-table',
  title: 'Extract P/L Table From Earnings PDF',
  task: 'User wants the profit-and-loss table from a public earnings release. Compare a broad scan path against an Okra table-index path.',
  baseline: {
    strategy: 'without_okra',
    summary: 'The agent converts or reads a large portion of the PDF, then asks the model to infer which financial table is the P/L table before sending a page to the parser.',
    token_estimate: 25_200,
    pages_touched: Array.from({ length: 32 }, (_, index) => index + 1),
    result_confidence: 0.72,
    risk_notes: ['May confuse income statement, segment revenue, and non-GAAP reconciliation tables.'],
  },
  okra: {
    strategy: 'with_okra',
    summary: 'The agent resolves the source, reads table inventory, then sends only page 6 and table id tbl-earnings-income-statement to the parser.',
    token_estimate: 2_980,
    pages_touched: [1, 4, 5, 6, 7, 8, 9],
    result_confidence: 0.92,
    risk_notes: ['Still needs parser verification against the source page image before trusting cell values.'],
  },
  outcome: {
    target_table_id: 'tbl-earnings-income-statement',
    target_page: 6,
    saved_tokens_estimate: 22_220,
    token_reduction_percent: 88,
    pages_avoided: 25,
    result: 'Okra saves the broad-read step by returning a table index first. The parser receives page 6, table id, expected title, expected columns, and row-count hint.',
  },
};

const simulations: ContextAgentSimulation[] = [
  {
    id: 'sim-claude-earnings-pl-table',
    sample_id: 'earnings-release-pl-table',
    title: 'Claude Finds The P/L Table Before Parsing',
    agent_user: {
      kind: 'claude',
      name: 'Claude analyst agent',
      prompt: 'I need to extract the profit-and-loss table from this earnings PDF. Do not read the whole release if you can find the right table first.',
    },
    mocked_tool_exchanges: [examples[0], examples[1], examples[2]],
    final_handoff: {
      parser_task: 'Parse only page 6 and extract table tbl-earnings-income-statement as an income-statement/P&L table.',
      target_table_id: 'tbl-earnings-income-statement',
      target_page: 6,
      expected_title: 'Condensed Consolidated Statements of Operations',
      expected_columns: structure.tables[0]?.columns ?? [],
      validation_checks: [
        'Extracted table title matches the table inventory title.',
        'Extracted columns match the expected quarter and year comparison columns.',
        'Parser reports approximately 18 rows.',
      ],
    },
  },
  {
    id: 'sim-codex-earnings-parser-step',
    sample_id: 'earnings-release-pl-table',
    title: 'Codex Builds A Targeted Parser Step',
    agent_user: {
      kind: 'codex',
      name: 'Codex extraction agent',
      prompt: 'Create a parser step for extracting the P/L table. Ask Okra what page and table id to target, then produce the parser instruction.',
    },
    mocked_tool_exchanges: [examples[1], examples[3], examples[5]],
    final_handoff: {
      parser_task: 'Call the table parser with source_id src_demo_earnings_q4_2025, page 6, table_id tbl-earnings-income-statement, and expected_row_count 18.',
      target_table_id: 'tbl-earnings-income-statement',
      target_page: 6,
      expected_title: 'Condensed Consolidated Statements of Operations',
      expected_columns: structure.tables[0]?.columns ?? [],
      validation_checks: [
        'Reject extraction if the parser returns a balance sheet, cash-flow statement, segment table, or adjusted EBITDA reconciliation.',
        'Keep the original-source citation URL attached to the extracted table.',
      ],
    },
  },
];

export const offlineContextFixtures: OfflineContextFixture[] = [
  {
    id: 'earnings-release-pl-table',
    title: 'Earnings Release P/L Table',
    description: 'Public earnings PDF fixture where the agent asks Okra for table inventory first, then parses only the target P/L table page.',
    source,
    structure,
    contextResponses: [tableInventoryContext, parserTargetContext],
    answers: [pageAnswer],
    examples,
    traces: [trace],
    simulations,
  },
];

export function listOfflineContextFixtures(): Array<Pick<OfflineContextFixture, 'id' | 'title' | 'description'>> {
  return offlineContextFixtures.map(({ id, title, description }) => ({ id, title, description }));
}

export function getOfflineContextFixture(id = 'earnings-release-pl-table'): OfflineContextFixture {
  const fixture = offlineContextFixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Unknown offline context fixture: ${id}`);
  }
  return fixture;
}

function matchesQuery(candidate: string, query: string): boolean {
  const normalizedCandidate = candidate.trim().toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  return normalizedCandidate === normalizedQuery || normalizedQuery.includes('p/l') || normalizedQuery.includes('profit');
}

export function createOfflineContextClient(fixtureId = 'earnings-release-pl-table'): OkraContextClient {
  const fixture = getOfflineContextFixture(fixtureId);

  return {
    async resolveSource() {
      return fixture.source;
    },
    async readStructure(request) {
      if (request.source_id !== fixture.source.source_id) {
        throw new Error(`Offline fixture does not include source_id: ${request.source_id}`);
      }
      return fixture.structure;
    },
    async getContext(request) {
      const matched = fixture.contextResponses.find((response) => matchesQuery(response.query, request.query));
      if (matched) {
        return { ...matched, query: request.query };
      }
      return {
        object: 'pdf_context',
        source_id: request.source_id,
        query: request.query,
        context_scope: request.context_scope ?? 'bounded_context',
        context_blocks: [],
        citations: [],
        omitted_reason: 'not_found',
        policy: fixture.source.allowance_policy,
      };
    },
    async ask(request) {
      const matched = fixture.answers.find((answer) => matchesQuery(answer.question, request.question));
      if (matched) {
        return { ...matched, question: request.question };
      }
      return {
        ...pageAnswer,
        question: request.question,
      };
    },
    async openSource(request) {
      const page = request.page ?? 1;
      return {
        object: 'original_source_link',
        source_id: request.source_id,
        url: `${fixture.source.canonical_url}#page=${page}`,
        page,
        section_id: request.section_id,
      };
    },
  };
}

export interface HttpContextClientOptions {
  baseUrl?: string;
  apiKey?: string;
  sharedSecret?: string;
  fetch?: typeof globalThis.fetch;
}

export function createHttpContextClient(options: HttpContextClientOptions = {}): OkraContextClient {
  const baseUrl = (options.baseUrl ?? 'https://api.okrapdf.com').replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (options.apiKey) headers.set('Authorization', `Bearer ${options.apiKey}`);
    if (options.sharedSecret) headers.set('x-document-agent-secret', options.sharedSecret);

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = typeof parsed?.message === 'string' ? parsed.message : `Request failed with status ${response.status}`;
      // Carry the server's structured error body (`{ error, message, next_actions }`)
      // so the CLI's failure envelope surfaces the stable code + recovery actions.
      throw new OkraRuntimeError('HTTP_ERROR', message, response.status, parsed ?? text);
    }
    return parsed as T;
  }

  return {
    resolveSource: (request) => postJson('/v1/context/resolve_source', request),
    readStructure: (request) => postJson('/v1/context/read_structure', request),
    getContext: (request) => postJson('/v1/context/get_context', request),
    ask: (request) => postJson('/v1/context/ask', request),
    openSource: (request) => postJson('/v1/context/open_source', request),
  };
}
