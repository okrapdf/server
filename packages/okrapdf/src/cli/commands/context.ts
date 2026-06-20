import type { Command } from 'commander';
import type { OkraClient } from '../../client';
import {
  createOfflineContextClient,
  getOfflineContextFixture,
  listOfflineContextFixtures,
  type AskContextResponse,
  type GetContextResponse,
  type OkraContextClient,
  type ReadStructureResponse,
  type ResolveSourceResponse,
} from '../../context';
import { handleError, writeOutput } from '../output';
import type { GlobalFlags } from '../output';
import { OkraRuntimeError } from '../../errors';

export interface ContextCommandDeps {
  globals: () => GlobalFlags;
  getClient: () => OkraClient;
}

export interface ContextCommandOptions {
  offline?: string;
  sourceId?: string;
  maxDepth?: string;
  maxTokens?: string;
  page?: string;
  section?: string | string[];
}

function contextClient(options: ContextCommandOptions, deps: ContextCommandDeps): OkraContextClient {
  if (options.offline) return createOfflineContextClient(options.offline);
  return deps.getClient().context;
}

function fixtureSourceId(options: ContextCommandOptions): string | undefined {
  if (!options.offline) return undefined;
  return getOfflineContextFixture(options.offline).source.source_id;
}

function sourceId(options: ContextCommandOptions, explicit?: string): string {
  const resolved = explicit || options.sourceId || fixtureSourceId(options);
  if (!resolved) {
    // Forgetting --source-id is a common agent mistake. Throw the same
    // structured envelope the rest of the CLI uses ({ error, message,
    // next_actions } at 400) instead of a bare Error — a bare Error renders as
    // a generic `error: "error"`, `code: 1`, empty next_actions, leaving the
    // agent with nothing to act on.
    const message =
      'Provide a source id: pass --source-id <doc-id> (or a positional source id), or --offline <fixture>.';
    throw new OkraRuntimeError('INVALID_REQUEST', message, 400, {
      error: 'source_required',
      message,
      next_actions: [
        { cmd: 'okra documents list', why: 'List your documents to find a source/doc id.' },
        { cmd: 'okra context resolve "<url-or-title>"', why: 'Resolve a URL, SHA-256, or title to a source id first.' },
      ],
    });
  }
  return resolved;
}

function parsePositiveInt(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function formatSource(source: ResolveSourceResponse): string {
  return [
    `${source.title ?? source.source_id}`,
    `  source_id: ${source.source_id}`,
    `  pages:     ${source.page_count ?? '?'}`,
    `  scope:     ${source.allowance_scope}`,
    `  license:   ${source.detected_license.label} (${Math.round(source.detected_license.confidence * 100)}%)`,
    `  confidence:${Math.round(source.confidence * 100)}%`,
    source.canonical_url ? `  url:       ${source.canonical_url}` : undefined,
    ...source.warnings.map((warning) => `  warning:   ${warning}`),
  ].filter((line): line is string => !!line).join('\n');
}

function formatStructure(structure: ReadStructureResponse): string {
  const lines = [
    `${structure.title ?? structure.source_id}`,
    `  source_id: ${structure.source_id}`,
    `  pages:     ${structure.page_count ?? '?'}`,
    `  sections:  ${structure.outline.length}`,
    `  tables:    ${structure.tables.length}`,
    '',
    'Sections:',
    ...structure.outline.map((node) => {
      const pageRange = node.page_end && node.page_end !== node.page_start
        ? `pp. ${node.page_start}-${node.page_end}`
        : `p. ${node.page_start}`;
      return `${'  '.repeat(Math.max(node.level - 1, 0))}- ${node.title} (${pageRange}, ${node.token_estimate} tokens)`;
    }),
  ];
  return lines.join('\n');
}

export function formatContextTables(structure: ReadStructureResponse, json?: boolean): string {
  if (json) return JSON.stringify({ source_id: structure.source_id, tables: structure.tables });
  if (!structure.tables.length) return 'No tables exposed.';
  return structure.tables.map((table) => [
    `${table.id}`,
    `  title:   ${table.title_hint ?? '-'}`,
    `  page:    ${table.page}`,
    `  columns: ${table.columns.length ? table.columns.join(' | ') : '-'}`,
    `  rows:    ${table.row_count_hint ?? '?'}`,
    `  score:   ${table.confidence !== undefined ? `${Math.round(table.confidence * 100)}%` : '?'}`,
  ].join('\n')).join('\n\n');
}

function formatContext(response: GetContextResponse): string {
  if (!response.context_blocks.length) {
    return `No context returned. Reason: ${response.omitted_reason ?? 'not_found'}`;
  }
  return response.context_blocks.map((block) => [
    `${block.title ?? block.kind}`,
    block.text,
    ...block.citations.map((citation) => `  cite: page ${citation.start_page_number} ${citation.citation_url}`),
  ].join('\n')).join('\n\n');
}

function formatAnswer(response: AskContextResponse): string {
  return [
    response.answer,
    '',
    `confidence: ${Math.round(response.confidence * 100)}%`,
    ...response.citations.map((citation) => `cite: page ${citation.start_page_number} ${citation.citation_url}`),
  ].join('\n');
}

function sectionIds(options: ContextCommandOptions): string[] | undefined {
  if (Array.isArray(options.section)) {
    return options.section.length ? options.section : undefined;
  }
  return options.section ? [options.section] : undefined;
}

function singleSectionId(options: ContextCommandOptions): string | undefined {
  return Array.isArray(options.section) ? options.section[0] : options.section;
}

export async function runContextAsk(
  questionParts: string[],
  options: ContextCommandOptions,
  deps: ContextCommandDeps,
  explicitSourceId?: string,
): Promise<void> {
  const question = questionParts.join(' ').trim();
  if (!question) {
    throw new Error('Provide a question.');
  }

  const g = deps.globals();
  const client = contextClient(options, deps);
  const response = await client.ask({
    source_id: sourceId(options, explicitSourceId),
    question,
    section_ids: sectionIds(options),
  });
  writeOutput(g.json ? JSON.stringify(response) : formatAnswer(response), g.output);
}

export function registerContextCommand(program: Command, deps: ContextCommandDeps): void {
  const guarded = <Args extends unknown[]>(action: (...args: Args) => Promise<void>) =>
    async (...args: Args): Promise<void> => {
      try {
        await action(...args);
      } catch (error) {
        handleError(error, deps.globals().json);
      }
    };

  const context = program
    .command('context')
    .description('Navigate source structure and retrieve bounded context before parsing')
    .summary('Context-first source tools');

  context
    .command('fixtures')
    .description('List built-in offline context fixtures')
    .action(() => {
      const g = deps.globals();
      const fixtures = listOfflineContextFixtures();
      writeOutput(
        g.json
          ? JSON.stringify(fixtures)
          : fixtures.map((fixture) => `${fixture.id}\n  ${fixture.title}\n  ${fixture.description}`).join('\n\n'),
        g.output,
      );
    });

  context
    .command('resolve [source]')
    .description('Resolve a URL or SHA into a context source')
    .option('--offline <fixture>', 'Use a built-in offline fixture')
    .option('--sha256 <sha>', 'Resolve by PDF SHA-256 instead of URL')
    .action(guarded(async (source: string | undefined, options: ContextCommandOptions & { sha256?: string }) => {
      const g = deps.globals();
      const client = contextClient(options, deps);
      const response = await client.resolveSource({
        url: source?.startsWith('http') ? source : undefined,
        sha256: options.sha256,
        title_hint: source && !source.startsWith('http') ? source : undefined,
      });
      writeOutput(g.json ? JSON.stringify(response) : formatSource(response), g.output);
    }));

  context
    .command('structure [sourceId]')
    .description('Read navigable sections, page ranges, and artifacts')
    .option('--offline <fixture>', 'Use a built-in offline fixture')
    .option('--max-depth <n>', 'Maximum outline depth')
    .option('--no-artifacts', 'Skip tables and figures')
    .action(guarded(async (explicitSourceId: string | undefined, options: ContextCommandOptions & { artifacts?: boolean }) => {
      const g = deps.globals();
      const client = contextClient(options, deps);
      const response = await client.readStructure({
        source_id: sourceId(options, explicitSourceId),
        max_depth: parsePositiveInt(options.maxDepth, '--max-depth'),
        include_artifacts: options.artifacts !== false,
      });
      writeOutput(g.json ? JSON.stringify(response) : formatStructure(response), g.output);
    }));

  context
    .command('tables [sourceId]')
    .description('List detected tables with title, columns, page, and row-count hints')
    .option('--offline <fixture>', 'Use a built-in offline fixture')
    .action(guarded(async (explicitSourceId: string | undefined, options: ContextCommandOptions) => {
      const g = deps.globals();
      const client = contextClient(options, deps);
      const response = await client.readStructure({
        source_id: sourceId(options, explicitSourceId),
        include_artifacts: true,
      });
      writeOutput(formatContextTables(response, g.json), g.output);
    }));

  context
    .command('get <query...>')
    .description('Retrieve bounded, cited context for a query')
    .option('--offline <fixture>', 'Use a built-in offline fixture')
    .option('--source-id <id>', 'Source id')
    .option('--max-tokens <n>', 'Maximum context tokens')
    .option('--section <id>', 'Repeatable section id', (value: string, acc: string[]) => [...acc, value], [] as string[])
    .action(guarded(async (queryParts: string[], options: ContextCommandOptions & { section?: string[] }) => {
      const g = deps.globals();
      const client = contextClient(options, deps);
      const response = await client.getContext({
        source_id: sourceId(options),
        query: queryParts.join(' '),
        max_tokens: parsePositiveInt(options.maxTokens, '--max-tokens'),
        section_ids: options.section?.length ? options.section : undefined,
      });
      writeOutput(g.json ? JSON.stringify(response) : formatContext(response), g.output);
    }));

  context
    .command('ask <question...>')
    .description('Answer from bounded context with citations')
    .option('--offline <fixture>', 'Use a built-in offline fixture')
    .option('--source-id <id>', 'Source id')
    .option('--section <id>', 'Repeatable section id', (value: string, acc: string[]) => [...acc, value], [] as string[])
    .action(guarded(async (questionParts: string[], options: ContextCommandOptions & { section?: string[] }) => {
      await runContextAsk(questionParts, options, deps);
    }));

  context
    .command('open [sourceId]')
    .description('Return the original-source URL for a page or section')
    .option('--offline <fixture>', 'Use a built-in offline fixture')
    .option('--page <n>', 'Page number')
    .option('--section <id>', 'Section id')
    .action(guarded(async (explicitSourceId: string | undefined, options: ContextCommandOptions) => {
      const g = deps.globals();
      const client = contextClient(options, deps);
      const response = await client.openSource({
        source_id: sourceId(options, explicitSourceId),
        page: parsePositiveInt(options.page, '--page'),
        section_id: singleSectionId(options),
      });
      writeOutput(g.json ? JSON.stringify(response) : response.url, g.output);
    }));

  context
    .command('trace')
    .description('Show with-vs-without traces for an offline fixture')
    .requiredOption('--offline <fixture>', 'Use a built-in offline fixture')
    .action((options: ContextCommandOptions) => {
      const g = deps.globals();
      const traces = getOfflineContextFixture(options.offline).traces;
      writeOutput(
        g.json
          ? JSON.stringify(traces)
          : traces.map((trace) => [
            trace.title,
            `  without_okra: ${trace.baseline.token_estimate.toLocaleString()} tokens`,
            `  with_okra:    ${trace.okra.token_estimate.toLocaleString()} tokens`,
            `  saved:        ${trace.outcome.saved_tokens_estimate.toLocaleString()} tokens (${trace.outcome.token_reduction_percent}%)`,
            `  target:       ${trace.outcome.target_table_id ?? '-'} on page ${trace.outcome.target_page ?? '?'}`,
            `  result:       ${trace.outcome.result}`,
          ].join('\n')).join('\n\n'),
        g.output,
      );
    });

  context
    .command('simulate')
    .description('Show mocked Claude/Codex sessions for an offline fixture')
    .requiredOption('--offline <fixture>', 'Use a built-in offline fixture')
    .action((options: ContextCommandOptions) => {
      const g = deps.globals();
      const simulations = getOfflineContextFixture(options.offline).simulations;
      writeOutput(
        g.json
          ? JSON.stringify(simulations)
          : simulations.map((simulation) => [
            `${simulation.title} (${simulation.agent_user.kind})`,
            `  prompt: ${simulation.agent_user.prompt}`,
            `  mocked tools: ${simulation.mocked_tool_exchanges.map((exchange) => exchange.tool_name).join(' -> ')}`,
            `  handoff: ${simulation.final_handoff.parser_task}`,
          ].join('\n')).join('\n\n'),
        g.output,
      );
    });
}
