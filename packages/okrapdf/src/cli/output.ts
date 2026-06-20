/**
 * Shared output helpers for agent-friendly CLI.
 *
 * Conventions:
 * - Human text → stderr (progress, messages)
 * - Machine data → stdout (JSON, CSV, doc IDs)
 * - Exit codes: 0 = success, 1 = client/auth error, 2 = server error
 */

import { writeFileSync } from 'fs';
import { OkraRuntimeError } from '../errors';

export type OutputFormat = 'json' | 'table';

/** Global flags propagated from program.opts(). */
export interface GlobalFlags {
  json?: boolean;
  quiet?: boolean;
  output?: string;
  outputFormat?: OutputFormat;
}

export interface NextAction {
  cmd: string;
  why: string;
}

export interface MachineSuccessEnvelope<T = unknown> {
  ok: true;
  command: string;
  result: T;
  cost: { usd: number | null };
  citations: string[];
  next_actions: NextAction[];
}

export interface MachineFailureEnvelope {
  ok: false;
  command: string;
  error: string;
  message?: string;
  cost?: { usd: number | null };
  citations?: string[];
  next_actions: NextAction[];
  [key: string]: unknown;
}

export type MachineEnvelope<T = unknown> = MachineSuccessEnvelope<T> | MachineFailureEnvelope;

interface OutputContext {
  json?: boolean;
  command?: string;
}

let outputContext: OutputContext = {};

const AUTO_ENVELOPE_COMMANDS = new Set([
  'agents list',
  'agents get',
  'agents profiles',
  'audit',
  'ask',
  'chat',
  'collections list',
  'collections create',
  'collections show',
  'collections delete',
  'collections add',
  'collections remove',
  'collections query',
  'collections extract',
  'collections publish',
  'collections unpublish',
  'content-types',
  'content-types list',
  'content-types show',
  'context fixtures',
  'context resolve',
  'context structure',
  'context tables',
  'context get',
  'context ask',
  'context open',
  'context trace',
  'context simulate',
  'delete',
  'doctor',
  'documents list',
  'documents upload',
  'documents get',
  'documents read',
  'documents reparse',
  'documents verify',
  'documents urls',
  'documents wait-for',
  'documents delete',
  'extract',
  'facet deploy',
  'facet list',
  'facet info',
  'facet invoke',
  'facet runs',
  'facet rm',
  'files list',
  'files upload',
  'files get',
  'files url',
  'files delete',
  'find',
  'jobs list',
  'jobs get',
  'jobs wait',
  'jobs events',
  'jobs cancel',
  'jobs retry',
  'jobs resume',
  'lens init',
  'lens deploy',
  'lens list',
  'lens info',
  'lens apply',
  'lens state',
  'lens runs',
  'lens rm',
  'list',
  'open',
  'parse',
  'read',
  'redact',
  'render',
  'resources',
  'resources list',
  'resources show',
  'search',
  'self-host capability-evidence',
  'self-host compose',
  'self-host env',
  'self-host evidence-bundle',
  'self-host implementations',
  'self-host materialize',
  'self-host network-plan',
  'self-host plan',
  'self-host proof',
  'self-host publish-pack',
  'self-host railway',
  'self-host readiness',
  'self-host smoke',
  'self-host template',
  'self-host template-evidence',
  'self-host template-listing',
  'self-host validate',
  'status',
  'upload',
  'workflows catalog',
  'workflows steps',
  'workflows examples',
  'workflows validate',
  'workflows build',
  'workflows run',
]);

const COMMAND_GROUPS = new Set([
  'agents',
  'auth',
  'collections',
  'content-types',
  'context',
  'documents',
  'facet',
  'files',
  'jobs',
  'lens',
  'resources',
  'self-host',
  'workflows',
]);

const COMMAND_GROUP_ALIASES: Record<string, string> = {
  agent: 'agents',
  col: 'collections',
  collection: 'collections',
  'content-type': 'content-types',
  ct: 'content-types',
  doc: 'documents',
  docs: 'documents',
  document: 'documents',
  file: 'files',
  job: 'jobs',
  resource: 'resources',
  selfhost: 'self-host',
  workflow: 'workflows',
};

const SUBCOMMAND_ALIASES: Record<string, Record<string, string>> = {
  agents: {
    ls: 'list',
  },
  collections: {
    ls: 'list',
    rm: 'delete',
  },
  'content-types': {
    get: 'show',
    ls: 'list',
  },
  documents: {
    ls: 'list',
    rm: 'delete',
    status: 'get',
    url: 'urls',
  },
  files: {
    ls: 'list',
    rm: 'delete',
  },
  jobs: {
    ls: 'list',
    show: 'get',
  },
  resources: {
    get: 'show',
    ls: 'list',
  },
  workflows: {
    list: 'catalog',
  },
};

const VALUE_FLAGS = new Set([
  '-o',
  '--output',
  '-k',
  '--key',
  '--offline',
  '--sha256',
  '--source-id',
  '--max-depth',
  '--max-tokens',
  '--page',
  '--section',
  '--schema',
  '--prompt',
  '--mode',
  '--input',
  '--file',
  '--file-name',
  '--doc',
  '--model',
  '--limit',
  '--cursor',
  '--type',
  '--status',
  '--dataset',
  '--metadata',
  '--engine',
  '--standard',
  '--recipe',
  '--policy',
  '--api-key',
  '--document-id',
  '--workflow',
  '--match',
  '--timeout',
  '--timeout-ms',
  '--description',
  '--docs',
  '--format',
  '-f',
  '--top-k',
  '-c',
  '--min-confidence',
  '-p',
  '--pages',
  '--sort',
  '--view',
  '--payload',
  '--payload-file',
  '--bbox',
  '--state',
  '--target',
  '--template-url',
  '--evidence-bundle',
  '--template-evidence',
  '--base-url',
  '--model-backed',
  '--capability-evidence',
  '--smoke-evidence',
  '--evidence-out',
  '--service',
]);

const BOOLEAN_FLAGS = new Set([
  '-j',
  '--json',
  '-q',
  '--quiet',
  '--no-wait',
  '--no-artifacts',
  '--dry-run',
  '--source-only',
  '--confirm-rights',
  '--attest',
  '--stream',
  '--save',
  '--literal',
  '--flat',
  '--zip',
  '--stats',
  '--reset',
  '--validate',
  '--help',
  '-h',
  '--version',
  '-V',
]);

export function normalizeGlobalFlags(
  flags: GlobalFlags,
  stdoutIsTTY = process.stdout.isTTY === true,
  command?: string,
): GlobalFlags {
  const outputFormat = parseOutputFormat(flags.output);
  const outputPath = outputFormat ? undefined : flags.output;
  const explicitHuman = outputFormat === 'table';
  const explicitJson = flags.json === true || outputFormat === 'json';
  const canonicalCommand = command === undefined ? undefined : canonicalizeCommandName(command);
  const canAutoEnvelope = canonicalCommand === undefined || AUTO_ENVELOPE_COMMANDS.has(canonicalCommand);
  const autoJson = !explicitJson && !explicitHuman && !outputPath && !stdoutIsTTY && canAutoEnvelope;

  return {
    ...flags,
    output: outputPath,
    outputFormat,
    json: explicitJson || autoJson,
  };
}

export function setOutputContext(context: OutputContext): void {
  outputContext = {
    ...context,
    command: context.command === undefined ? undefined : canonicalizeCommandName(context.command),
  };
}

export function resetOutputContext(): void {
  outputContext = {};
}

export function inferCommandFromArgv(argv: string[]): string {
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token || token === '--') break;

    if (token.startsWith('-')) {
      const flagName = token.includes('=') ? token.slice(0, token.indexOf('=')) : token;
      if (!token.includes('=') && VALUE_FLAGS.has(flagName)) i += 1;
      if (!VALUE_FLAGS.has(flagName) && !BOOLEAN_FLAGS.has(flagName) && !token.includes('=')) i += 1;
      continue;
    }

    if (positional.length === 0) {
      positional.push(canonicalizeCommandGroup(token));
    } else {
      positional.push(canonicalizeSubcommand(positional[0], token));
    }
    if (positional.length >= 2 && COMMAND_GROUPS.has(positional[0])) break;
    if (positional.length >= 1 && !COMMAND_GROUPS.has(positional[0])) break;
  }

  if (!positional.length) return 'unknown';
  if (COMMAND_GROUPS.has(positional[0]) && positional[1]) return `${positional[0]} ${positional[1]}`;
  return positional[0];
}

/** Write data to stdout or --output file. */
export function writeOutput(data: string, outputPath?: string): void {
  const output = maybeWrapMachineOutput(data);
  if (outputPath) {
    writeFileSync(outputPath, output);
    process.stderr.write(`Wrote → ${outputPath}\n`);
  } else {
    process.stdout.write(output + '\n');
  }
}

/** Progress message to stderr (suppressed by --quiet). */
export function progress(msg: string, quiet?: boolean): void {
  if (!quiet) process.stderr.write(msg + '\n');
}

/** Escape a value for CSV — wraps in quotes if it contains comma, quote, or newline. */
export function csvEscape(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Generic, non-semantic codes that should be upgraded to a status-derived
 *  code when an HTTP status is available (so agents branch on a stable code). */
const GENERIC_ERROR_CODES: ReadonlySet<string> = new Set(['HTTP_ERROR', 'error']);

/** Map an HTTP status to the stable semantic `error` code the skill documents.
 *  Returns undefined for non-HTTP statuses (e.g. exit-code 1) so the caller
 *  keeps the original code. */
/**
 * A stable error CODE is a bare identifier — snake_case, kebab, or SCREAMING,
 * no spaces or punctuation beyond `. _ -`. A value with spaces/colons (e.g.
 * "document not found", "Document not found", "D1_ERROR: no such column…") is a
 * human MESSAGE that leaked into the server body's `error` field. Treat those as
 * not-a-code so the envelope falls back to the stable status-derived code
 * (`not_found`, `server_error`, …) — the message still lands in `message`. This
 * gives agents one stable `error` to branch on across every command (#666).
 */
function isCodeShaped(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[A-Za-z][A-Za-z0-9._-]*$/.test(value)
  );
}

function statusToErrorCode(status: number): string | undefined {
  if (status >= 500) return 'server_error';
  switch (status) {
    case 400:
    case 422:
      return 'invalid_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 408:
      return 'timeout';
    case 409:
      return 'conflict';
    case 429:
      return 'rate_limited';
    default:
      return undefined;
  }
}

/**
 * Structured error handler. In JSON mode emit a machine FAILURE envelope on
 * STDOUT (mirroring the success envelope) so `okra ... --json | jq` parses
 * errors too and agents read a uniform { ok, command, error, message,
 * next_actions } contract — the same shape as a confirmation-gate refusal.
 * Non-JSON mode writes a human line to stderr. Exit code stays meaningful.
 */
export function handleError(error: unknown, json?: boolean): never {
  const msg = error instanceof Error ? error.message : String(error);
  const status = error instanceof OkraRuntimeError ? error.status : 1;
  const useJson = json ?? outputContext.json ?? false;

  if (useJson) {
    // Prefer the server's structured error body (`{ error, message, next_actions }`)
    // carried in OkraRuntimeError.details over the bare exception string, so the
    // stable error code + recovery actions reach the agent.
    const details = error instanceof OkraRuntimeError ? error.details : undefined;
    const body =
      details !== null && typeof details === 'object' ? (details as Record<string, unknown>) : undefined;
    // The server error body comes in two shapes across endpoints:
    //   { error: 'not_found', message, next_actions }            (string code)
    //   { error: { code, message }, code, message, ...details }   (context-live)
    // Surface the stable string code from whichever is present.
    const bodyError = body?.error;
    const nestedCode =
      bodyError !== null && typeof bodyError === 'object'
        ? (bodyError as Record<string, unknown>).code
        : undefined;
    // Only a code-shaped value becomes the envelope `error`. A freeform server
    // message in `error`/`code` (spaces/punctuation) is skipped so we fall
    // through to the OkraRuntimeError code → status-derived code (#666).
    const resolvedCode =
      (isCodeShaped(bodyError) ? bodyError : undefined) ||
      (isCodeShaped(body?.code) ? (body!.code as string) : undefined) ||
      (isCodeShaped(nestedCode) ? (nestedCode as string) : undefined) ||
      (error instanceof OkraRuntimeError ? error.code : undefined) ||
      'error';
    // When the only code we have is a generic transport/fallback value
    // ('HTTP_ERROR' from a bare HTTP throw, or the 'error' fallback), derive a
    // stable semantic code from the HTTP status so the agent gets the SAME code
    // regardless of which client path threw — e.g. extract's 404 reads
    // 'not_found' like context, not 'HTTP_ERROR'. A meaningful code (TIMEOUT,
    // not_found from the server body, …) is never overridden.
    const errorCode = GENERIC_ERROR_CODES.has(resolvedCode)
      ? statusToErrorCode(status) ?? resolvedCode
      : resolvedCode;
    const message = (body && typeof body.message === 'string' && body.message) || msg;
    const nextActions: NextAction[] = body && Array.isArray(body.next_actions)
      ? (body.next_actions as NextAction[])
      : [];

    // Surface the server body's extra structured fields (e.g. `available_engines`,
    // `engine`, `document_id`, `job_id`) at the envelope top level so agents find
    // recovery data where the skill documents it — not buried in `details`. The
    // canonical fields set below win; nested objects stay in `details`.
    const RESERVED_ENVELOPE_KEYS = new Set(['ok', 'command', 'error', 'message', 'code', 'next_actions', 'details']);
    const extras: Record<string, unknown> = {};
    if (body) {
      for (const [k, v] of Object.entries(body)) {
        if (!RESERVED_ENVELOPE_KEYS.has(k)) extras[k] = v;
      }
    }

    const envelope: MachineFailureEnvelope = {
      ok: false,
      command: outputContext.command ?? 'unknown',
      error: errorCode,
      message,
      code: status,
      next_actions: nextActions,
      ...extras,
      ...(details !== undefined ? { details } : {}),
    };
    process.stdout.write(JSON.stringify(envelope) + '\n');
  } else {
    process.stderr.write(`Error: ${msg}\n`);
  }

  process.exit(status >= 500 ? 2 : 1);
}

function parseOutputFormat(value: string | undefined): OutputFormat | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'json') return 'json';
  if (normalized === 'table' || normalized === 'text' || normalized === 'human') return 'table';
  return undefined;
}

function maybeWrapMachineOutput(data: string): string {
  if (!outputContext.json) return data;

  const parsed = parseJson(data);
  if (parsed === undefined || isMachineEnvelope(parsed)) return data;

  return JSON.stringify(createMachineEnvelope(parsed, outputContext.command ?? 'unknown'));
}

function parseJson(data: string): unknown | undefined {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

function isMachineEnvelope(value: unknown): value is MachineEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.object === 'doctor_report') {
    return typeof record.ok === 'boolean'
      && typeof record.command === 'string'
      && typeof record.base_url === 'string'
      && Array.isArray(record.checks)
      && Array.isArray(record.next_actions);
  }
  if (record.ok === true) {
    return typeof record.command === 'string'
      && 'result' in record
      && typeof record.cost === 'object'
      && Array.isArray(record.citations)
      && Array.isArray(record.next_actions);
  }

  return record.ok === false
    && typeof record.command === 'string'
    && typeof record.error === 'string'
    && Array.isArray(record.next_actions);
}

function createMachineEnvelope(result: unknown, command: string): MachineSuccessEnvelope {
  const canonicalCommand = canonicalizeCommandName(command);
  return {
    ok: true,
    command: canonicalCommand,
    result,
    cost: { usd: extractCostUsd(result) },
    citations: extractCitations(result),
    next_actions: inferNextActions(canonicalCommand, result),
  };
}

function canonicalizeCommandName(command: string): string {
  const parts = command.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'unknown';
  const group = canonicalizeCommandGroup(parts[0]);
  if (parts.length === 1) return group;
  return [group, canonicalizeSubcommand(group, parts[1])].join(' ');
}

function canonicalizeCommandGroup(command: string): string {
  const normalized = command.toLowerCase();
  return COMMAND_GROUP_ALIASES[normalized] ?? normalized;
}

function canonicalizeSubcommand(group: string, command: string): string {
  const normalized = command.toLowerCase();
  return SUBCOMMAND_ALIASES[group]?.[normalized] ?? normalized;
}

function extractCostUsd(value: unknown): number | null {
  return extractAggregateCostUsd(value) ?? extractAnyCostUsd(value);
}

function extractAggregateCostUsd(value: unknown, depth = 0): number | null {
  if (!value || typeof value !== 'object' || depth > 8) return null;
  if (Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const direct = parseAggregateCostUsd(record);
  if (direct !== null) return direct;

  for (const nested of Object.values(record)) {
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
    const found = extractAggregateCostUsd(nested, depth + 1);
    if (found !== null) return found;
  }

  return null;
}

function extractAnyCostUsd(value: unknown, depth = 0): number | null {
  if (!value || typeof value !== 'object' || depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractAnyCostUsd(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const aggregate = parseAggregateCostUsd(record);
  if (aggregate !== null) return aggregate;

  for (const key of ['cost_usd', 'costUsd', 'costUSD']) {
    const parsed = parseFiniteNumber(record[key]);
    if (parsed !== null) return parsed;
  }

  for (const nested of Object.values(record)) {
    const found = extractAnyCostUsd(nested, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function parseAggregateCostUsd(record: Record<string, unknown>): number | null {
  const summary = record.summary;
  if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
    for (const key of ['total_cost_usd', 'totalCostUsd']) {
      const parsed = parseFiniteNumber((summary as Record<string, unknown>)[key]);
      if (parsed !== null) return parsed;
    }
  }

  for (const key of ['total_cost_usd', 'totalCostUsd']) {
    const parsed = parseFiniteNumber(record[key]);
    if (parsed !== null) return parsed;
  }

  const cost = record.cost;
  if (cost && typeof cost === 'object' && !Array.isArray(cost)) {
    const parsed = parseFiniteNumber((cost as Record<string, unknown>).usd);
    if (parsed !== null) return parsed;
  }

  return null;
}

function parseFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCitations(value: unknown): string[] {
  const citations = new Set<string>();
  collectCitationSummaries(value, citations);
  return [...citations];
}

function collectCitationSummaries(value: unknown, citations: Set<string>, key = '', depth = 0): void {
  if (depth > 10 || value == null) return;
  if (typeof value === 'string') {
    if (isHttpUrl(value) && isCitationLikeUrl(key, value)) citations.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCitationSummaries(item, citations, key, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const page = typeof record.page === 'number'
    ? record.page
    : typeof record.page_number === 'number'
      ? record.page_number
      : typeof record.start_page_number === 'number' // Anthropic-shaped grounded citation (#505)
        ? record.start_page_number
        : null;
  const text = typeof record.text === 'string'
    ? record.text
    : typeof record.cited_text === 'string' // Anthropic-shaped grounded citation (#505)
      ? record.cited_text
      : typeof record.quote === 'string'
        ? record.quote
        : typeof record.snippet === 'string'
          ? record.snippet
          : null;
  const match = typeof record.match === 'string' ? record.match : null;
  if (page !== null && page > 0 && text && match !== 'none') {
    citations.add(`page ${page}: ${text.slice(0, 120)}`);
  }

  for (const [childKey, childValue] of Object.entries(record)) {
    collectCitationSummaries(childValue, citations, childKey, depth + 1);
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isCitationLikeUrl(key: string, value: string): boolean {
  const normalized = key.toLowerCase();
  return value.includes('res.okrapdf.com')
    || normalized.includes('citation')
    || normalized.includes('source_url')
    || normalized === 'url'
    || normalized.endsWith('_url')
    || normalized.endsWith('url');
}

/**
 * Document id from a job result — an explicit field if present, else parsed from
 * the lifecycle job id (`lifecycle-doc-<id>-<ts>`). Lets `parse`/`jobs wait`
 * chain back to the document's cited surface.
 */
function documentIdFromJobResult(result: unknown): string | undefined {
  const explicit = findStringByKey(result, ['document_id', 'documentId', 'doc_id', 'docId']);
  if (explicit) return explicit;
  const jobId = findStringByKey(result, ['job_id', 'jobId', 'id']);
  const match = jobId ? jobId.match(/(doc-[a-z0-9]+)/i) : null;
  return match ? match[1] : undefined;
}

/** First citation page number in a context get/ask result, if any. */
function firstCitationPage(result: unknown): number | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const citations = (result as { citations?: unknown }).citations;
  if (!Array.isArray(citations)) return undefined;
  for (const c of citations) {
    const page = c && typeof c === 'object' ? (c as { start_page_number?: unknown }).start_page_number : undefined;
    if (typeof page === 'number' && Number.isFinite(page) && page > 0) return page;
  }
  return undefined;
}

export function inferNextActions(command: string, result: unknown): NextAction[] {
  const normalized = command.toLowerCase();
  const sourceId = findStringByKey(result, ['source_id', 'sourceId']);
  const explicitDocId = findStringByKey(result, ['doc_id', 'docId', 'document_id', 'documentId']);
  const collection = findStringByKey(result, ['collection', 'name']);

  if (normalized === 'context resolve' && sourceId) {
    return [
      {
        cmd: `okra context structure ${quoteArg(sourceId)}`,
        why: 'Read sections, page ranges, and artifact inventory before retrieving content.',
      },
      {
        cmd: `okra context get "<query>" --source-id ${quoteArg(sourceId)}`,
        why: 'Retrieve bounded cited context for the specific parser or QA task.',
      },
      {
        cmd: `okra context ask "<question>" --source-id ${quoteArg(sourceId)}`,
        why: 'Answer a focused question from bounded context with citations.',
      },
    ];
  }

  if (normalized === 'context structure' && sourceId) {
    return [
      {
        cmd: `okra context tables ${quoteArg(sourceId)}`,
        why: 'List detected tables before choosing a parse target.',
      },
      {
        cmd: `okra context get "<target context>" --source-id ${quoteArg(sourceId)}`,
        why: 'Fetch only the sections needed for the next extraction or answer.',
      },
    ];
  }

  if (normalized === 'context tables' && sourceId) {
    const tableId = findStringByKey(result, ['table_id', 'tableId', 'id']);
    return [
      {
        cmd: `okra context get "Give me the minimal parse target${tableId ? ` for ${tableId}` : ''}" --source-id ${quoteArg(sourceId)}`,
        why: 'Turn table inventory into a compact parse instruction.',
      },
    ];
  }

  if ((normalized === 'context get' || normalized === 'context ask' || normalized === 'ask') && sourceId) {
    const actions: NextAction[] = [];
    // When the answer carried a citation, point at the cited source page so the
    // agent can verify or hand off the claim — the documented verification loop.
    const citedPage = firstCitationPage(result);
    if (citedPage !== undefined) {
      actions.push({
        cmd: `okra context open ${quoteArg(sourceId)} --page ${citedPage}`,
        why: 'Open the cited source page to verify the answer or hand off the exact location.',
      });
    }
    actions.push({
      cmd: `okra context structure ${quoteArg(sourceId)}`,
      why: 'Return to the source outline when you need adjacent sections or tables.',
    });
    return actions;
  }

  if (normalized === 'files url') {
    const fileId = findStringByKey(result, ['file_id', 'fileId', 'id']);
    return fileId
      ? [
        {
          cmd: `okra files get ${quoteArg(fileId)}`,
          why: 'Inspect file metadata before reusing the bytes URL.',
        },
      ]
      : [];
  }

  if (normalized === 'jobs events') {
    const jobId = findStringByKey(result, ['job_id', 'jobId', 'id']);
    return jobId
      ? [
        {
          cmd: `okra jobs get ${quoteArg(jobId)}`,
          why: 'Check current job status and result metadata.',
        },
      ]
      : [];
  }

  // parse queues an async (re)parse — the agent must wait for it before the
  // refreshed content is queryable. Without this the parse loop dead-ends.
  if (normalized === 'parse') {
    const jobId = findStringByKey(result, ['job_id', 'jobId', 'id']);
    return jobId
      ? [
        {
          cmd: `okra jobs wait ${quoteArg(jobId)}`,
          why: 'Wait for the parse job to finish before reading the refreshed document.',
        },
      ]
      : [];
  }

  // After a parse job finishes, point back at the document's cited surface so the
  // parse → wait → context loop closes. Gated to parse/lifecycle jobs.
  if (normalized === 'jobs wait') {
    const jobId = findStringByKey(result, ['job_id', 'jobId', 'id']) ?? '';
    const jobType = findStringByKey(result, ['job_type', 'jobType', 'type']) ?? '';
    const isParseJob = /lifecycle|parse/i.test(jobId) || /parse/i.test(jobType);
    const docId = documentIdFromJobResult(result);
    return isParseJob && docId
      ? [
        {
          cmd: `okra context structure ${quoteArg(docId)}`,
          why: 'Read the refreshed outline now that the parse job has finished.',
        },
      ]
      : [];
  }

  // After reading raw markdown, nudge toward bounded, cited retrieval to verify
  // any load-bearing claim (read returns ungrounded text).
  if (normalized === 'read') {
    const docId = findStringByKey(result, ['document_id', 'documentId', 'doc_id', 'docId']);
    return docId
      ? [
        {
          cmd: `okra context get "<claim to verify>" --source-id ${quoteArg(docId)}`,
          why: 'Verify a load-bearing claim from the markdown against bounded, cited context.',
        },
      ]
      : [];
  }

  // `documents get` materializes an empty *idle* shell for an unknown/typo'd id
  // (HTTP 200, no fileName — see #652), which an agent can mistake for a real
  // doc awaiting processing. A genuinely-uploaded doc always carries a fileName,
  // so its absence means "no such document": give a recovery path.
  if (normalized === 'documents get') {
    const fileName = findStringByKey(result, ['fileName', 'file_name']);
    return fileName
      ? []
      : [
        {
          cmd: 'okra documents list',
          why: 'This id returned no document data (no file name, idle) — it may not exist or was never uploaded. List your documents to find a valid id.',
        },
      ];
  }

  if (normalized === 'documents urls') {
    const docId = findStringByKey(result, ['doc_id', 'docId', 'document_id', 'documentId', 'id']);
    return docId
      ? [
        {
          cmd: `okra chat "<question>" --doc ${quoteArg(docId)}`,
          why: 'Use the document URL output to continue with a document question.',
        },
      ]
      : [];
  }

  if (normalized === 'documents verify') {
    const verdict = findStringByKey(result, ['verdict'])?.toLowerCase();
    const docId = explicitDocId;
    const claim = findStringByKey(result, ['claim']);
    return verdict && verdict !== 'supported' && docId && claim
      ? [
        {
          cmd: `okra context get ${quoteArg(claim)} --source-id ${quoteArg(docId)}`,
          why: 'Retrieve bounded cited context for the unsupported claim.',
        },
      ]
      : [];
  }

  if (normalized === 'documents wait-for') {
    const docId = explicitDocId;
    const page = findNumberByKey(result, ['page']);
    return docId
      ? [
        ...(page !== undefined
          ? [{
              cmd: `okra documents read ${quoteArg(docId)} --pages ${page}`,
              why: 'Inspect the page containing the first matched node.',
            }]
          : []),
        {
          cmd: `okra context get "<target context>" --source-id ${quoteArg(docId)}`,
          why: 'Retrieve bounded cited context around the matched term.',
        },
      ]
      : [];
  }

  const uploadDocId = normalized === 'upload' || normalized === 'documents upload'
    ? findStringByKey(result, ['doc_id', 'docId', 'document_id', 'documentId', 'id'])
    : undefined;

  if (uploadDocId) {
    // Lead with the context-first path the okra-agent skill recommends (resolve
    // is unnecessary — upload already returns the source id).
    return [
      {
        cmd: `okra context structure ${quoteArg(uploadDocId)}`,
        why: 'Read the outline, page ranges, tables, and figures before retrieving content.',
      },
      {
        cmd: `okra context get "<query>" --source-id ${quoteArg(uploadDocId)}`,
        why: 'Retrieve bounded, cited context for the specific parse or QA task.',
      },
      {
        cmd: `okra extract ${quoteArg(uploadDocId)} --schema ./schema.json --cite`,
        why: 'Run grounded structured extraction once the schema is known.',
      },
    ];
  }

  if (normalized === 'extract' && explicitDocId) {
    const grounded = hasCitations(result);
    const citedPage = firstCitationPage(result);
    return [
      // If the values aren't grounded (no --cite, or grounding found nothing),
      // lead with the one-flag fix: re-run with --cite so every field comes back
      // with a page+bbox citation — the okra differentiator. An ungrounded value
      // reads as a guess.
      ...(grounded
        ? []
        : [{
            cmd: `okra extract ${quoteArg(explicitDocId)} --schema ./schema.json --cite`,
            why: 'Re-run with --cite to ground each extracted value in a page+bbox citation; an ungrounded value reads as a guess.',
          }]),
      // When grounded, the strongest check on a load-bearing value is a verdict:
      // verify the claim against its cited page (supported/contradicted/not_visible).
      ...(grounded && citedPage !== undefined
        ? [{
            cmd: `okra documents verify ${quoteArg(explicitDocId)} "<a specific extracted value>" --page ${citedPage}`,
            why: 'Vision-verify a load-bearing extracted value against its cited page — a supported/contradicted/not_visible verdict, stronger than citation presence.',
          }]
        : []),
      {
        cmd: `okra context get "<extracted field> context" --source-id ${quoteArg(explicitDocId)}`,
        why: 'Verify a load-bearing extracted value against bounded, cited context.',
      },
      {
        cmd: `okra context structure ${quoteArg(explicitDocId)}`,
        why: 'Return to the source outline for adjacent sections or tables.',
      },
    ];
  }

  if (normalized === 'collections query' && collection) {
    return [
      {
        cmd: `okra collections export ${quoteArg(collection)} --flat`,
        why: 'Export source markdown when you need to audit collection-level answers.',
      },
    ];
  }

  // After a structured fan-out, point at a single row's document so the agent
  // can verify a load-bearing value against that doc's cited context — the
  // multi-doc verification loop. (The collection name isn't in the result, but
  // each row carries its doc_id, so drill into a specific document.)
  if (normalized === 'collections extract') {
    const firstDocId = findStringByKey(result, ['doc_id', 'docId', 'document_id', 'documentId']);
    return firstDocId
      ? [
        {
          cmd: `okra context get "<extracted field> context" --source-id ${quoteArg(firstDocId)}`,
          why: 'Verify a load-bearing value from a row against that document\'s cited context.',
        },
      ]
      : [];
  }

  if (normalized === 'workflows steps') {
    return [
      {
        cmd: 'okra workflows example parsebench_chart_numeric_eval > workflow.json',
        why: 'Start from a checked-in OCR/gate/code/VLM step graph before customizing.',
      },
      {
        cmd: 'okra workflows build workflow.json --json',
        why: 'Validate and compile the step graph into hosted workflow source.',
      },
    ];
  }

  if (normalized === 'workflows build') {
    const sourcePath = findStringByKey(result, ['source_path', 'sourcePath']);
    return sourcePath
      ? [
        {
          cmd: `okra workflows run ${quoteArg(sourcePath)} --dry-run --json`,
          why: 'Send the compiled workflow to the API for a no-execution validation plan.',
        },
      ]
      : [];
  }

  return [];
}

/** True when an extract/collections result already carries grounded citations
 *  (the `citations` array is present only when --cite produced matches). */
function hasCitations(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const citations = (result as Record<string, unknown>).citations;
  return Array.isArray(citations) && citations.length > 0;
}

function findStringByKey(value: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 8 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKey(item, keys, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }

  for (const nested of Object.values(record)) {
    const found = findStringByKey(nested, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function findNumberByKey(value: unknown, keys: string[], depth = 0): number | undefined {
  if (depth > 8 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNumberByKey(item, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }

  for (const nested of Object.values(record)) {
    const found = findNumberByKey(nested, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function quoteArg(value: string): string {
  return /^[A-Za-z0-9._:/=@-]+$/.test(value) ? value : JSON.stringify(value);
}
