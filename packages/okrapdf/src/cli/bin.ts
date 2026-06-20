#!/usr/bin/env node
/**
 * okra CLI — Agent-friendly PDF extraction and collection queries.
 *
 * Global flags:
 *   -j, --json       Structured JSON output
 *   -q, --quiet      Suppress progress (just data to stdout)
 *   -o, --output     Output format (json|table) or file path (CSV/JSON/ZIP)
 *
 * Action commands (agent-grade):
 *   okra upload <source>                            # Upload + wait
 *   okra extract <source> --schema schema.json      # Upload + structured extract
 *   okra extract <docId> --schema schema.json       # Extract from existing doc
 *   okra list                                       # List documents
 *   okra read <id> [--pages 1-5]                    # Full markdown
 *   okra delete <id>                                # Delete document
 *   okra chat "<question>" --doc <id>               # Ask a question
 *   okra collections list                           # List collections
 *   okra collections query <name> "<question>"      # Fan-out -> CSV
 *   okra collections extract <name> --schema s.json # Experimental structured extract -> CSV
 *
 * Review commands:
 *   okra tree / find / page / search / tables / history / toc
 *
 * Exit codes: 0=success, 1=client error, 2=server error
 */

import { Command, CommanderError } from 'commander';
import {
  isParserProfileExecutable,
  listExecutableParserProfiles,
  resolveParserProfile,
  resolveParserProfileByModelPrompt,
  type ParserProfile,
} from '@okrapdf/schemas/job';
import { realpathSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import packageJson from '../../package.json';
import { OkraClient } from '../client';
import { getContentType, listContentTypes } from '../content-types/registry';
import { OkraRuntimeError } from '../errors';
import {
  buildDynamicWorkflowDefinition,
  createDynamicWorkflowBuildStepsGuide,
  dynamicWorkflowToCapabilities,
  getDynamicWorkflowExample,
  listDynamicWorkflowExamples,
  validateDynamicWorkflow,
  type DynamicWorkflowDatasetRef,
  type DynamicWorkflowDefinition,
} from '../workflows';
import {
  deployFacet,
  deployLens,
  listFacets,
  listLenses,
  getFacetInfo,
  getLensInfo,
  invokeFacet,
  applyLens,
  getLensState,
  listRuns as listFacetRuns,
  listLensRuns,
  deleteFacet as deleteFacetCmd,
  deleteLens as deleteLensCmd,
  formatFacetList,
  formatLensApply,
  formatRunList,
  LENS_STARTER_SOURCE,
  type FacetCliCtx,
} from './commands/facet';
import {
  find,
  formatFindOutput,
  formatStats,
  search,
  formatSearchOutput,
  authLogin,
  authSetKey,
  authStatus,
  authToken,
  authLogout,
  maskApiKey,
  verifyApiKey,
  profileAdd,
  profileUse,
  profileCurrent,
  profileList,
  profileRemove,
  validateSelfHostBundle,
  formatSelfHostValidationResult,
  createSelfHostDeploymentPlan,
  formatSelfHostDeploymentPlanResult,
  createSelfHostEnvArtifact,
  formatSelfHostEnvArtifactResult,
  createSelfHostComposeArtifact,
  formatSelfHostComposeArtifactResult,
  createSelfHostDockerNetworkHandoffArtifact,
  formatSelfHostDockerNetworkHandoffArtifactResult,
  createSelfHostRailwayConfigArtifact,
  formatSelfHostRailwayConfigArtifactResult,
  createSelfHostRailwayTemplateArtifact,
  formatSelfHostRailwayTemplateArtifactResult,
  createSelfHostRailwayTemplateListingArtifact,
  formatSelfHostRailwayTemplateListingArtifactResult,
  createSelfHostRailwayTemplatePublicationEvidenceArtifact,
  formatSelfHostRailwayTemplatePublicationEvidenceArtifactResult,
  createSelfHostCapabilityImplementationsArtifact,
  formatSelfHostCapabilityImplementationsArtifactResult,
  createSelfHostCapabilityPromotionEvidenceArtifact,
  formatSelfHostCapabilityPromotionEvidenceArtifactResult,
  createSelfHostRailwayPublishEvidenceBundleArtifact,
  formatSelfHostRailwayPublishEvidenceBundleArtifactResult,
  createSelfHostRailwayPublishReadinessArtifact,
  formatSelfHostRailwayPublishReadinessArtifactResult,
  createSelfHostRailwayPublishPackArtifact,
  formatSelfHostRailwayPublishPackArtifactResult,
  materializeSelfHostPublishArtifacts,
  formatSelfHostMaterializeArtifactsResult,
  createSelfHostDraftProof,
  formatSelfHostDraftProof,
  writeSelfHostDraftProof,
  startSelfHostRuntimeServer,
  startCapabilityServiceServer,
  upload,
  render,
  formatDocumentWorkflowRun,
  parsePolicyJson,
  runDocumentWorkflow,
  formatSelfHostSmokeResult,
  createSelfHostSmokeEvidence,
  runSelfHostSmoke,
  type DocumentWorkflowKind,
  type SelfHostSmokeWorkflow,
  listDocuments,
  formatDocumentList,
  deleteDocument,
  listApiResources,
  getApiResource,
  formatApiResourceCatalog,
  formatApiResourceItem,
  collectionList,
  collectionCreate,
  collectionShow,
  collectionDelete,
  collectionAddDocs,
  collectionRemoveDocs,
  collectionSetVisibility,
  collectionQueryRaw,
  collectionExport,
  formatCollectionList,
  formatCollectionDetail,
  formatCollectionCsv,
  formatCollectionTable,
  formatCollectionExportFlat,
  formatExtractCsv,
  formatExtractTable,
  formatExtractJson,
} from './commands';
import { registerContextCommand, runContextAsk } from './commands/context';
import {
  getActiveProfile,
  getApiKey,
  getApiKeySource,
  getBaseUrl,
  normalizeBaseUrl as normalizeConfigBaseUrl,
  readGlobalConfig,
} from './config';
import {
  handleError,
  inferCommandFromArgv,
  normalizeGlobalFlags,
  progress,
  setOutputContext,
  writeOutput,
} from './output';
import type { GlobalFlags, MachineFailureEnvelope, NextAction } from './output';

export const CLI_VERSION = packageJson.version;
export const PRIMARY_COMMANDS = [
  'auth',
  'doctor',
  'profile',
  'resources',
  'content-types',
  'documents',
  'files',
  'jobs',
  'agents',
  'workflows',
  'collections',
  'upload',
  'parse',
  'audit',
  'redact',
  'extract',
  'render',
  'ask',
  'chat',
  'read',
  'list',
  'open',
  'delete',
  'context',
  'self-host',
  'serve',
  'capability',
  ...listContentTypes().map((contentType) => contentType.cli_noun),
] as const;
export const ADVANCED_COMMANDS = ['status', 'find', 'search', 'facet', 'lens'] as const;
export const PRIMARY_COLLECTION_SUBCOMMANDS = ['list', 'query'] as const;
export const ADVANCED_COLLECTION_SUBCOMMANDS = ['create', 'show', 'delete', 'add', 'remove', 'publish', 'unpublish', 'export'] as const;
export const ROOT_HELP_FOOTER = [
  '',
  'Primary workflows:',
  '  okra auth login',
  '  okra upload ./report.pdf                  # add --no-wait to queue; resume with okra jobs wait',
  '  okra documents read doc-abc123 --pages 1-3',
  '  okra chat "Summarize this document" --doc doc-abc123',
  '',
  'Grounded context (agent loop):',
  '  okra context structure doc-abc123',
  '  okra context get "termination clause" --source-id doc-abc123',
  '  okra context ask "What is the guaranteed fee?" --source-id doc-abc123',
  '  okra parse doc-abc123 --model gemini-3-flash --prompt layout-bbox-gemini-multipage@1 # then: okra jobs wait doc-abc123',
  '',
  'More:',
  '  okra extract ./report.pdf --schema ./schema.json',
  '  okra render ./report.py --out report.pdf',
  '  okra audit doc-abc123 --standard wcag',
  '  okra redact doc-abc123 --model local',
  '  okra open doc-abc123 --view review',
  '  okra collections query earnings "What changed quarter over quarter?" -o earnings.csv',
  '  okra doctor --json',
  '  okra workflows steps',
  '  okra workflows build ./workflow.json --json',
  '  okra resources list                       # discover every API noun and verb',
  '  okra documents list',
  '',
  'Self-hosting:',
  '  okra profile add local --base-url https://my-okra.up.railway.app',
  '  okra self-host --help                     # validate → materialize → proof → railway → smoke',
  '  okra serve ./runtime --port 8787',
  '',
  'Advanced inspection and local-only commands are intentionally hidden from',
  'default help during the v0.14 clean-house release candidate.',
].join('\n');
export const SELF_HOST_HELP_FOOTER = [
  '',
  'Bundle pipeline (in order):',
  '  okra self-host validate ./runtime',
  '  okra self-host materialize ./runtime',
  '  okra self-host plan ./runtime',
  '  okra self-host env ./runtime',
  '  okra self-host compose ./runtime',
  '  okra self-host proof ./runtime --evidence-out self-host-draft.proof.json',
  '',
  'Railway publishing:',
  '  okra self-host railway ./runtime',
  '  okra self-host network-plan ./runtime',
  '  okra self-host template ./runtime',
  '  okra self-host template-listing ./runtime',
  '  okra self-host template-evidence ./runtime',
  '  okra self-host implementations ./runtime',
  '  okra self-host capability-evidence ./runtime',
  '  okra self-host evidence-bundle ./runtime',
  '  okra self-host publish-pack ./runtime',
  '  okra self-host readiness ./runtime',
  '',
  'Verify a deployed runtime:',
  '  okra self-host smoke https://my-okra.up.railway.app --workflow both --evidence-out railway-smoke.evidence.json',
  '  okra serve ./runtime --port 8787',
  '  okra capability serve parser.mineru --port 8080',
].join('\n');
export const COLLECTION_HELP_FOOTER = [
  '',
  'Stable v0.14 collection workflow:',
  '  okra collections query <name> "<question>"',
  '',
  'Experimental structured fan-out remains available via:',
  '  okra collections query <name> "<question>" --schema ./schema.json',
  '  okra collections extract <name> --schema ./schema.json',
  '',
  'Advanced collection management commands remain available but are',
  'intentionally hidden from default help during the clean-house release',
  'candidate.',
].join('\n');

export const program = new Command();
program.showHelpAfterError();
program.showSuggestionAfterError();

program
  .name('okra')
  .description('okraPDF CLI — upload PDFs, chat with documents, and extract structured data')
  .version(CLI_VERSION)
  .option('-j, --json', 'Output JSON (structured, machine-readable)')
  .option('-q, --quiet', 'Suppress progress and human-readable frills')
  .option('-o, --output <format-or-file>', 'Output format (json|table) or write output to file');
program.addHelpText(
  'after',
  ROOT_HELP_FOOTER,
);

/** Read global flags from program.opts(). */
function globals(): GlobalFlags {
  const command = inferCommandFromArgv(process.argv.slice(2));
  const g = normalizeGlobalFlags(program.opts(), process.stdout.isTTY === true, command);
  setOutputContext({
    json: g.json === true,
    command,
  });
  return g;
}

export function getMissingApiKeyMessage(): string {
  return [
    'No API key found.',
    '',
    'Set one up with:',
    '  okra auth login',
    '  export OKRA_API_KEY="okra_xxx"',
    '',
    'Get your API key at:',
    '  https://app.okrapdf.com/settings',
    '',
    'CLI docs:',
    '  https://docs.okrapdf.com/api-reference/cli',
  ].join('\n');
}

/**
 * Terminal "no API key" failure — the most common agent error. In JSON mode emit
 * the {ok:false} failure envelope on STDOUT (so `okra … --json | jq` parses it,
 * with recovery next_actions); in human mode keep the rich multi-line setup
 * message on stderr. Exits non-zero. Replaces three inlined copies that wrote
 * `{ error, code }` to stderr and broke the JSON contract.
 */
function failMissingApiKey(jsonMode: boolean): never {
  if (jsonMode) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        command: inferCommandFromArgv(process.argv.slice(2)),
        error: 'no_api_key',
        message: 'No API key found. Set OKRA_API_KEY=okra_… or run `okra auth login`.',
        code: 401,
        next_actions: [
          { cmd: 'okra auth login', why: 'Authenticate interactively.' },
          { cmd: 'export OKRA_API_KEY="okra_…"', why: 'Use your paid-tier API key (https://app.okrapdf.com/settings).' },
        ],
      }) + '\n',
    );
  } else {
    process.stderr.write(getMissingApiKeyMessage() + '\n');
  }
  process.exit(1);
}

function formatDocumentReadyMessage(docId: string, pages?: number): string {
  return [
    `Ready: ${docId}${typeof pages === 'number' ? ` (${pages} pages)` : ''}`,
    '',
    'Next:',
    `  okra chat "Summarize this document" --doc ${docId}`,
    `  okra read ${docId}`,
    `  okra extract ${docId} --schema ./schema.json`,
  ].join('\n');
}

function formatQueuedDocumentMessage(docId: string, jobId?: string): string {
  return [
    `Queued: ${docId}`,
    '',
    'Next:',
    jobId ? `  okra jobs wait ${jobId}` : `  okra jobs wait ${docId}`,
    `  okra status ${docId}`,
    '',
    'Once processing finishes:',
    `  okra chat "Summarize this document" --doc ${docId}`,
    `  okra read ${docId}`,
  ].join('\n');
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(resolve(entry))).href;
  } catch {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  }
}

// Create client with proper config priority:
// 1. Environment variable (OKRA_API_KEY)
// 2. Project config (.okrarc, .okra.json)
// 3. Global config (~/.okra/config.json)
function getClient(): OkraClient {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  if (!apiKey) {
    failMissingApiKey(Boolean(globals().json));
  }

  return new OkraClient({ apiKey, baseUrl });
}

function parsePort(raw: string | number | undefined): number {
  const value = typeof raw === 'number' ? raw : Number.parseInt(raw ?? '8787', 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('--port must be an integer between 1 and 65535');
  }
  return value;
}

function parsePositiveInt(raw: string | number | undefined, flagName: string, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number.parseInt(raw ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return value;
}

function parseSmokeWorkflow(raw: string | undefined): SelfHostSmokeWorkflow {
  const value = raw ?? 'audit';
  if (value === 'audit' || value === 'redact' || value === 'both') return value;
  throw new Error('--workflow must be one of: audit, redact, both');
}

async function runSelfHostServeCommand(
  bundleDir = process.env.OKRA_SELF_HOST_BUNDLE ?? '.',
  options: { host?: string; port?: string; publicDir?: string } = {},
): Promise<void> {
  const g = globals();
  try {
    const validation = validateSelfHostBundle(bundleDir);
    if (!validation.ok) {
      writeOutput(formatSelfHostValidationResult(validation, g.json), g.output);
      process.exitCode = 1;
      return;
    }

    // Fail closed: without OKRA_API_KEY the mutating routes (upload / workflows)
    // would be UNAUTHENTICATED. Refuse to boot rather than expose an open server.
    // Opt out only for a trusted local-only box with OKRA_ALLOW_NO_AUTH=1.
    const hasApiKey = Boolean(process.env.OKRA_API_KEY?.trim());
    const allowNoAuth = process.env.OKRA_ALLOW_NO_AUTH === '1';
    if (!hasApiKey && !allowNoAuth) {
      process.stderr.write(
        [
          'Refusing to start: OKRA_API_KEY is not set.',
          'Without it, upload and workflow routes would accept unauthenticated writes.',
          '',
          '  export OKRA_API_KEY=$(openssl rand -hex 24)',
          '',
          'For a trusted local-only box you can opt out explicitly with OKRA_ALLOW_NO_AUTH=1',
          '',
        ].join('\n'),
      );
      process.exitCode = 1;
      return;
    }

    const started = await startSelfHostRuntimeServer({
      bundleDir,
      host: options.host ?? process.env.HOST ?? '0.0.0.0',
      port: parsePort(options.port ?? process.env.PORT),
      ...(options.publicDir ? { publicDir: options.publicDir } : {}),
    });

    const startup = {
      object: 'self_host_server',
      ok: true,
      url: started.url,
      root: validation.root,
      health: `${started.url}/health`,
      status: `${started.url}/v1/self-host/status`,
    };

    if (g.json) {
      writeOutput(JSON.stringify(startup), g.output);
    } else {
      process.stderr.write(
        [
          `okra self-host runtime listening on ${started.url}`,
          `Bundle: ${validation.root}`,
          `Health: ${startup.health}`,
          '',
        ].join('\n'),
      );
    }

    const shutdown = async () => {
      await started.close();
    };
    process.once('SIGINT', () => {
      void shutdown();
    });
    process.once('SIGTERM', () => {
      void shutdown();
    });
    await new Promise<void>((resolveClose) => {
      started.server.once('close', resolveClose);
    });
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runCapabilityServeCommand(
  capabilityId: string,
  options: { host?: string; port?: string } = {},
): Promise<void> {
  const g = globals();
  try {
    const started = await startCapabilityServiceServer({
      capabilityId,
      host: options.host ?? process.env.HOST ?? '0.0.0.0',
      port: parsePort(options.port ?? process.env.OKRA_CAPABILITY_HTTP_PORT ?? process.env.PORT ?? '8080'),
    });

    const startup = {
      object: 'capability_service_server',
      ok: true,
      protocol: 'okra-capability-http/v1',
      capability_id: capabilityId,
      url: started.url,
      health: `${started.url}/health`,
      endpoint: `${started.url}/v1/capability-runs`,
    };

    if (g.json) {
      writeOutput(JSON.stringify(startup), g.output);
    } else {
      process.stderr.write(
        [
          `okra capability service listening on ${started.url}`,
          `Capability: ${capabilityId}`,
          `Protocol: ${startup.protocol}`,
          `Endpoint: ${startup.endpoint}`,
          '',
        ].join('\n'),
      );
    }

    const shutdown = async () => {
      await started.close();
    };
    process.once('SIGINT', () => {
      void shutdown();
    });
    process.once('SIGTERM', () => {
      void shutdown();
    });
    await new Promise<void>((resolveClose) => {
      started.server.once('close', resolveClose);
    });
  } catch (error) {
    handleError(error, g.json);
  }
}

// ============================================================================
// upload command
// ============================================================================
async function readStdinUploadBytes(): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : new Uint8Array(chunk));
  }
  return Buffer.concat(chunks);
}

async function runUploadCommand(
  source: string,
  options: { wait?: boolean; vendorOptions?: string; waitTimeout?: string },
): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    let vendorOptions: Record<string, unknown> | undefined;
    if (options.vendorOptions) {
      try {
        vendorOptions = JSON.parse(options.vendorOptions);
      } catch {
        throw new OkraRuntimeError('INVALID_REQUEST', '--vendor-options must be valid JSON.', 400, {
          error: 'invalid_request',
          message: '--vendor-options must be valid JSON.',
          next_actions: [{ cmd: 'okra upload <file> --vendor-options \'{"key":"value"}\'', why: 'Pass a valid JSON object.' }],
        });
      }
    }
    const waitTimeoutMs = parsePositiveSecondsOption(options.waitTimeout, '--wait-timeout');
    const uploadSource = source === '-' ? await readStdinUploadBytes() : source;

    const result = await upload(client, uploadSource, {
      ...g,
      noWait: options.wait === false,
      vendorOptions,
      waitTimeoutMs,
      ...(source === '-' ? { fileName: 'stdin.pdf' } : {}),
    });

    if (g.json) {
      writeOutput(JSON.stringify(result), g.output);
    } else {
      writeOutput(
        options.wait === false
          ? formatQueuedDocumentMessage(result.id, result.job_id ?? undefined)
          : formatDocumentReadyMessage(result.id, result.pages),
        g.output,
      );
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

function writeJsonOrPretty(value: unknown, asJson: boolean | undefined, output?: string): void {
  writeOutput(JSON.stringify(value, null, asJson ? 0 : 2), output);
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9._:/=@-]+$/.test(value) ? value : JSON.stringify(value);
}

function createFailureEnvelope(
  command: string,
  error: string,
  message: string,
  nextActions: Array<{ cmd: string; why: string }>,
  extra: Record<string, unknown> = {},
): MachineFailureEnvelope {
  return {
    ok: false,
    command,
    error,
    message,
    // Every failure envelope carries a numeric `code` like the handleError path
    // (the skill documents it). CLI-constructed failures (confirmation/human-
    // review gates, not_supported_on_cloud) are client-side request rejections,
    // so 400 by default; a call site can override via `extra.code`.
    code: 400,
    cost: { usd: null },
    citations: [],
    next_actions: nextActions,
    ...extra,
  };
}

type DoctorCheckStatus = 'ok' | 'warn' | 'fail' | 'unknown';

interface DoctorCheck {
  id: 'config' | 'auth' | 'api_reachability' | 'cli_version';
  status: DoctorCheckStatus;
  title: string;
  detail: string;
  data: Record<string, unknown>;
  next_actions: NextAction[];
}

interface DoctorReport {
  object: 'doctor_report';
  ok: boolean;
  command: 'doctor';
  base_url: string;
  checks: DoctorCheck[];
  next_actions: NextAction[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDoctorBaseUrl(rawBaseUrl: string): { baseUrl: string; error?: string } {
  try {
    return { baseUrl: normalizeConfigBaseUrl(rawBaseUrl) };
  } catch (error) {
    return {
      baseUrl: rawBaseUrl.trim(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 3_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Compare two semver-ish versions. Returns -1 if a<b, 0 if equal, 1 if a>b.
 * Compares MAJOR.MINOR.PATCH numerically; a prerelease (x.y.z-foo) sorts BEFORE
 * its release (x.y.z) per semver. Used so `okra doctor` doesn't call a NEWER
 * local build "behind" an older npm `latest` (a bare `installed === latest`
 * mislabels any difference — including ahead — as behind).
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string) => {
    const [core, pre] = v.trim().replace(/^v/, '').split('-', 2);
    const nums = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
    return { nums, pre: pre ?? null };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i += 1) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1; // a is a release, b is a prerelease → a > b
  if (pb.pre === null) return -1;
  return pa.pre < pb.pre ? -1 : 1;
}

async function checkCliVersion(): Promise<DoctorCheck> {
  const installed = packageJson.version;
  try {
    const response = await fetchWithTimeout('https://registry.npmjs.org/@okrapdf/cli/latest', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }, 2_000);
    if (!response.ok) {
      return {
        id: 'cli_version',
        status: 'unknown',
        title: 'CLI version',
        detail: `Could not read latest @okrapdf/cli version from npm (${response.status}).`,
        data: { installed, latest: null, up_to_date: null, status: response.status },
        next_actions: [],
      };
    }
    const payload = await response.json() as Record<string, unknown>;
    const latest = typeof payload.version === 'string' ? payload.version : null;
    if (!latest) {
      return {
        id: 'cli_version',
        status: 'unknown',
        title: 'CLI version',
        detail: 'npm returned an unexpected latest-version response.',
        data: { installed, latest: null, up_to_date: null },
        next_actions: [],
      };
    }
    // Order-aware: only an installed version that is strictly OLDER than npm
    // `latest` is "behind" (warn + upgrade). Equal is current; NEWER (a dev/
    // unpublished build, e.g. local 0.16.2 vs npm 0.16.1) is ahead — not a
    // problem, so don't warn or prompt an "upgrade" that would downgrade.
    const cmp = compareSemver(installed, latest);
    const behind = cmp < 0;
    const ahead = cmp > 0;
    return {
      id: 'cli_version',
      status: behind ? 'warn' : 'ok',
      title: 'CLI version',
      detail: behind
        ? `Installed CLI version ${installed} is behind latest ${latest}.`
        : ahead
          ? `Installed CLI version ${installed} is ahead of the latest published ${latest} (dev build).`
          : `Installed CLI version ${installed} is current.`,
      data: { installed, latest, up_to_date: cmp === 0, ahead },
      next_actions: behind
        ? [{ cmd: 'npm install -g @okrapdf/cli@latest', why: 'Upgrade to the latest published CLI.' }]
        : [],
    };
  } catch (error) {
    return {
      id: 'cli_version',
      status: 'unknown',
      title: 'CLI version',
      detail: `Could not check npm for the latest CLI version: ${error instanceof Error ? error.message : String(error)}`,
      data: { installed, latest: null, up_to_date: null },
      next_actions: [],
    };
  }
}

async function checkApiReachability(baseUrl: string, baseUrlError?: string): Promise<DoctorCheck> {
  if (baseUrlError) {
    return {
      id: 'api_reachability',
      status: 'fail',
      title: 'API reachability',
      detail: `Cannot check /health because the base URL is invalid: ${baseUrlError}`,
      data: { base_url: baseUrl, status: null, latency_ms: null },
      next_actions: [{ cmd: 'okra doctor --base-url https://api.okrapdf.com', why: 'Run diagnostics against a valid HTTP(S) API endpoint.' }],
    };
  }

  const healthUrl = `${baseUrl}/health`;
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(healthUrl, { method: 'GET' }, 3_000);
    const latencyMs = Date.now() - startedAt;
    return {
      id: 'api_reachability',
      status: response.ok ? 'ok' : 'fail',
      title: 'API reachability',
      detail: response.ok
        ? `Reached ${healthUrl} in ${latencyMs}ms.`
        : `${healthUrl} returned HTTP ${response.status}.`,
      data: { url: healthUrl, status: response.status, latency_ms: latencyMs },
      next_actions: response.ok
        ? []
        : [{ cmd: `okra doctor --base-url ${shellQuote(baseUrl)}`, why: 'Re-run diagnostics after checking the API health endpoint.' }],
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    return {
      id: 'api_reachability',
      status: 'fail',
      title: 'API reachability',
      detail: `Could not reach ${healthUrl}: ${error instanceof Error ? error.message : String(error)}`,
      data: { url: healthUrl, status: null, latency_ms: latencyMs },
      next_actions: [{ cmd: `okra doctor --base-url ${shellQuote(baseUrl)}`, why: 'Verify the configured API host and network path.' }],
    };
  }
}

async function runDoctorCommand(options: { baseUrl?: string } = {}): Promise<void> {
  const g = globals();
  const rawBaseUrl = options.baseUrl || getBaseUrl() || 'https://api.okrapdf.com';
  const { baseUrl, error: baseUrlError } = normalizeDoctorBaseUrl(rawBaseUrl);
  const apiKey = getApiKey();
  const apiKeySource = getApiKeySource();
  const globalConfig = readGlobalConfig();
  const activeProfile = getActiveProfile(globalConfig);
  const checks: DoctorCheck[] = [];

  checks.push({
    id: 'config',
    status: baseUrlError ? 'fail' : apiKey ? 'ok' : 'warn',
    title: 'Configuration',
    detail: baseUrlError
      ? `Base URL is invalid: ${baseUrlError}`
      : apiKey
        ? `Using API key from ${apiKeySource}.`
        : 'No API key is configured.',
    data: {
      api_key_source: apiKeySource,
      api_key_masked: apiKey ? maskApiKey(apiKey) : null,
      base_url: baseUrl,
      base_url_source: options.baseUrl ? 'flag (--base-url)' : 'configuration',
      active_profile: activeProfile?.name ?? null,
    },
    next_actions: apiKey
      ? []
      : [
          { cmd: 'okra auth login', why: 'Save an API key for authenticated requests.' },
          { cmd: 'export OKRA_API_KEY="okra_xxx"', why: 'Use an API key for this shell session.' },
        ],
  });

  if (!apiKey) {
    checks.push({
      id: 'auth',
      status: 'fail',
      title: 'Authentication',
      detail: 'No API key is configured, so live authentication cannot be verified.',
      data: { authenticated: false, source: apiKeySource },
      next_actions: [
        { cmd: 'okra auth login', why: 'Save an API key before running authenticated CLI workflows.' },
        { cmd: 'export OKRA_API_KEY="okra_xxx"', why: 'Provide an API key without writing config.' },
      ],
    });
  } else if (baseUrlError) {
    checks.push({
      id: 'auth',
      status: 'fail',
      title: 'Authentication',
      detail: `Cannot verify API key because the base URL is invalid: ${baseUrlError}`,
      data: { authenticated: false, source: apiKeySource },
      next_actions: [{ cmd: 'okra doctor --base-url https://api.okrapdf.com', why: 'Run auth verification against a valid API endpoint.' }],
    });
  } else {
    try {
      const verified = await verifyApiKey(apiKey, { baseUrl });
      checks.push({
        id: 'auth',
        status: 'ok',
        title: 'Authentication',
        detail: `Authenticated as ${verified.user_id}.`,
        data: {
          authenticated: true,
          user_id: verified.user_id,
          key_id: verified.key_id,
          key_name: verified.key_name ?? null,
          key_type: verified.key_type ?? null,
          scope: verified.scope ?? null,
          scoped_orgs: verified.scoped_orgs ?? [],
          scoped_projects: verified.scoped_projects ?? [],
        },
        next_actions: [],
      });
    } catch (error) {
      const status = error instanceof OkraRuntimeError ? error.status : null;
      checks.push({
        id: 'auth',
        status: 'fail',
        title: 'Authentication',
        detail: error instanceof Error ? error.message : String(error),
        data: {
          authenticated: false,
          status,
          source: apiKeySource,
        },
        next_actions: [
          { cmd: 'okra auth login', why: 'Replace the configured API key.' },
          { cmd: `okra doctor --base-url ${shellQuote(baseUrl)}`, why: 'Re-run diagnostics after updating credentials or endpoint settings.' },
        ],
      });
    }
  }

  checks.push(await checkApiReachability(baseUrl, baseUrlError));
  checks.push(await checkCliVersion());

  const nextActions = checks
    .filter((check) => check.status === 'fail')
    .flatMap((check) => check.next_actions);
  const report: DoctorReport = {
    object: 'doctor_report',
    ok: checks.every((check) => check.status !== 'fail'),
    command: 'doctor',
    base_url: baseUrl,
    checks,
    next_actions: nextActions,
  };

  if (!report.ok) {
    process.exitCode = 1;
  }

  if (g.json) {
    writeOutput(JSON.stringify(report), g.output);
  } else {
    writeOutput(formatDoctorReport(report), g.output);
  }
}

function formatDoctorReport(report: DoctorReport): string {
  const statusLabel: Record<DoctorCheckStatus, string> = {
    ok: 'OK',
    warn: 'WARN',
    fail: 'FAIL',
    unknown: 'UNKNOWN',
  };
  const lines = [
    'Okra doctor',
    `Base URL: ${report.base_url}`,
    '',
    ...report.checks.map((check) => `${statusLabel[check.status]} ${check.title}: ${check.detail}`),
  ];

  if (report.next_actions.length > 0) {
    lines.push('', 'Next:');
    for (const action of report.next_actions) {
      lines.push(`  ${action.cmd}  # ${action.why}`);
    }
  }

  return lines.join('\n');
}

async function promptForYes(question: string): Promise<boolean> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolvePrompt) => {
    rl.question(question, (answer) => {
      rl.close();
      resolvePrompt(/^(y|yes)$/i.test(answer.trim()));
    });
  });
}

async function requirePublicPublishRightsConfirmation(
  command: string,
  target: string,
  flags: GlobalFlags,
  confirmed: boolean | undefined,
): Promise<boolean> {
  if (confirmed) return true;

  const message = 'Public publish asserts that you own or are licensed to publish this content.';
  const nextCommand = `okra ${command} ${shellQuote(target)} --confirm-rights`;
  const gate = {
    id: 'public_publish_rights',
    kind: 'public_publish',
    confirm_flag: '--confirm-rights',
  };

  if (flags.json || !process.stdin.isTTY || !process.stdout.isTTY) {
    writeOutput(JSON.stringify(createFailureEnvelope(
      command,
      'confirmation_required',
      message,
      [
        {
          cmd: nextCommand,
          why: 'Confirm the public publish rights gate explicitly.',
        },
      ],
      { gate },
    )), flags.output);
    process.exitCode = 1;
    return false;
  }

  const ok = await promptForYes(`${message}\nProceed? [y/N] `);
  if (!ok) {
    writeOutput('Cancelled: public publish rights were not confirmed.', flags.output);
    process.exitCode = 1;
  }
  return ok;
}

function writeHumanReviewRequired(
  command: string,
  documentId: string,
  flags: GlobalFlags,
): void {
  const message = 'Machine audit results remain Audited; Attested requires the live human review gate.';
  const envelope = createFailureEnvelope(
    command,
    'human_review_required',
    message,
    [
      {
        cmd: `okra open ${shellQuote(documentId)} --view audit`,
        why: 'Resolve the Audited -> Attested gate in the live report.',
      },
    ],
    {
      state: 'audited',
      gate: {
        id: 'audit_attestation',
        kind: 'human_attestation',
        required_view: 'audit',
      },
    },
  );

  if (flags.json || !process.stdout.isTTY) {
    writeOutput(JSON.stringify(envelope), flags.output);
  } else {
    writeOutput(
      [
        `Refused: ${message}`,
        '',
        'Next:',
        `  okra open ${documentId} --view audit`,
      ].join('\n'),
      flags.output,
    );
  }
  process.exitCode = 1;
}

function parseLimitOption(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const limit = Number.parseInt(raw, 10);
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error('--limit must be a positive integer');
  }
  return limit;
}

function parsePositiveSecondsOption(raw: string | undefined, flagName: string): number | undefined {
  if (raw == null) return undefined;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`${flagName} must be a positive number of seconds`);
  }
  return Math.ceil(seconds * 1000);
}

function parseFileTransport(raw: string | undefined): 'auto' | 'multipart' | 'direct' | undefined {
  if (!raw) return undefined;
  if (raw === 'auto' || raw === 'multipart' || raw === 'direct') return raw;
  throw new Error('--transport must be one of: auto, multipart, direct');
}

function formatBytes(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function extractListItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  for (const key of ['data', 'documents', 'collections', 'agents', 'items', 'runs', 'workflows']) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function formatGenericList(value: unknown, json?: boolean): string {
  if (json) return JSON.stringify(value);
  const rows = extractListItems(value);
  if (rows.length === 0) return 'No items found.';
  return rows.map((item) => {
    if (!item || typeof item !== 'object') return String(item);
    const record = item as Record<string, unknown>;
    return [
      record.id ?? record.name ?? record.slug ?? '(unknown)',
      record.name ?? record.type ?? record.status ?? '',
      record.status ?? record.phase ?? '',
      record.created_at ?? record.created ?? '',
    ].filter((part) => part !== '').join('\t');
  }).join('\n');
}

function formatDocumentStatus(docId: string, status: Record<string, unknown>, json?: boolean): string {
  if (json) return JSON.stringify(status);
  const lines = [
    `Document: ${docId}`,
    `Phase: ${status.phase ?? '-'}`,
  ];
  const pagesCompleted = status.pagesCompleted ?? status.pages_completed;
  const pagesTotal = status.pagesTotal ?? status.pages_total ?? status.totalPages;
  if (pagesCompleted != null || pagesTotal != null) {
    lines.push(`Pages: ${pagesCompleted ?? '?'} / ${pagesTotal ?? '?'}`);
  }
  return lines.join('\n');
}

function documentUrls(client: OkraClient, docId: string): Record<string, unknown> {
  const encoded = encodeURIComponent(docId);
  const base = `${client.url}/v1/documents/${encoded}`;
  return {
    object: 'document_urls',
    id: docId,
    urls: {
      self: base,
      status: base,
      markdown: `${base}/full.md`,
      pages: `${base}/pages`,
      page_markdown_template: `${base}/pg_{N}.md`,
      page_image_template: `${base}/d_shimmer/pg_{N}.png`,
      original_pdf: `${base}/original.pdf`,
      download: client.downloadUrl(docId),
      chat_completions: `${base}/chat/completions`,
      legacy_model_endpoint: client.modelEndpoint(docId),
    },
  };
}

function documentShellUrl(docId: string, options: { view?: string } = {}): string {
  const baseUrl = (getBaseUrl() || 'https://api.okrapdf.com').replace(/\/+$/, '');
  const view = options.view?.trim() || 'document';
  const params = new URLSearchParams({ doc: docId, view });
  return `${baseUrl}/?${params.toString()}`;
}

function formatFileList(value: { data?: Array<Record<string, unknown>> }, json?: boolean): string {
  if (json) return JSON.stringify(value);
  const files = value.data ?? [];
  if (files.length === 0) return 'No files found.';
  const lines = ['ID\tName\tSize\tCreated'];
  for (const file of files) {
    lines.push([
      file.id ?? file.file_id ?? '-',
      file.name ?? '-',
      formatBytes(file.bytes ?? file.size),
      file.created_at ?? '-',
    ].join('\t'));
  }
  return lines.join('\n');
}

function formatJobList(value: { data?: Array<Record<string, unknown>> }, json?: boolean): string {
  if (json) return JSON.stringify(value);
  const jobs = value.data ?? [];
  if (jobs.length === 0) return 'No jobs found.';
  const lines = ['ID\tType\tStatus\tCreated'];
  for (const job of jobs) {
    lines.push([
      job.id ?? '-',
      job.type ?? '-',
      job.status ?? '-',
      job.created ?? '-',
    ].join('\t'));
  }
  return lines.join('\n');
}

async function runResourceListCommand(): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const catalog = await listApiResources(client);
    writeOutput(formatApiResourceCatalog(catalog, g.json), g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runResourceShowCommand(name: string): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const resource = await getApiResource(client, name);
    writeOutput(formatApiResourceItem(resource, g.json), g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

// content-types — discover the typed extraction contracts (#330/#331). Local
// registry, no network; the manifest grammar lives in src/content-types/.
function runContentTypesListCommand(): void {
  const g = globals();
  try {
    writeOutput(JSON.stringify({ content_types: listContentTypes() }), g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

function runContentTypesShowCommand(id: string): void {
  const g = globals();
  try {
    const manifest = getContentType(id);
    if (!manifest) {
      throw new OkraRuntimeError('NOT_FOUND', `No content type "${id}"`, 404, {
        error: 'not_found',
        message: `No content type "${id}". Run \`okra content-types list\` to see available content types.`,
        next_actions: [{ cmd: 'okra content-types list', why: 'List the registered content types.' }],
      });
    }
    writeOutput(JSON.stringify(manifest), g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runDocumentListCommand(): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const { documents } = await listDocuments(client, g);
    writeOutput(formatDocumentList(documents, g.json), g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runDocumentDeleteCommand(docId: string): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const result = await deleteDocument(client, docId, g);
    if (g.json) {
      writeOutput(JSON.stringify(result), g.output);
    } else {
      writeOutput(`Deleted ${docId}`, g.output);
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runDocumentStatusCommand(docId: string): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const status = await client.status(docId) as unknown as Record<string, unknown>;
    writeOutput(formatDocumentStatus(docId, status, g.json), g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runDocumentReadCommand(docId: string, options: { pages?: string } = {}): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const result = await client.read(docId, { pages: options.pages });
    if (g.json) {
      writeOutput(JSON.stringify(result), g.output);
    } else {
      writeOutput(result.markdown, g.output);
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runDocumentUrlsCommand(docId: string): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const urls = documentUrls(client, docId);
    if (g.json) {
      writeOutput(JSON.stringify(urls), g.output);
    } else {
      const urlMap = (urls.urls ?? {}) as Record<string, unknown>;
      writeOutput(
        Object.entries(urlMap)
          .map(([key, value]) => `${key}\t${String(value)}`)
          .join('\n'),
        g.output,
      );
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runFileListCommand(options: { limit?: string; cursor?: string } = {}): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const files = await client.listFiles({
      limit: parseLimitOption(options.limit),
      cursor: options.cursor,
    });
    writeOutput(formatFileList(files as unknown as { data?: Array<Record<string, unknown>> }, g.json), g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runFileGetCommand(fileId: string): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const file = await client.getFile(fileId) as unknown as Record<string, unknown>;
    writeJsonOrPretty(file, g.json, g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runFileUploadCommand(
  source: string,
  options: { fileName?: string; transport?: string } = {},
): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const file = await client.files.upload(source, {
      fileName: options.fileName,
      transport: parseFileTransport(options.transport),
    }) as unknown as Record<string, unknown>;
    if (g.json) {
      writeOutput(JSON.stringify(file), g.output);
      return;
    }
    writeOutput(
      [
        `File: ${file.id ?? file.file_id ?? '-'}`,
        `Name: ${file.name ?? '-'}`,
        `Size: ${formatBytes(file.bytes ?? file.size)}`,
        `Bytes: ${client.fileDownloadUrl(String(file.id ?? file.file_id ?? ''))}`,
      ].join('\n'),
      g.output,
    );
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runFileDeleteCommand(fileId: string): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const result = await client.deleteFile(fileId);
    if (g.json) {
      writeOutput(JSON.stringify(result), g.output);
    } else {
      writeOutput(`Deleted ${fileId}`, g.output);
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runFileUrlCommand(fileId: string): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const url = client.fileDownloadUrl(fileId);
    if (g.json) {
      writeOutput(JSON.stringify({ object: 'file_url', id: fileId, url }), g.output);
    } else {
      writeOutput(url, g.output);
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runJobListCommand(
  options: { limit?: string; type?: string; status?: string; doc?: string; documentId?: string } = {},
): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const jobs = await client.listJobs({
      limit: parseLimitOption(options.limit),
      type: options.type,
      status: options.status as never,
      documentId: options.doc ?? options.documentId,
    });
    writeOutput(formatJobList(jobs as unknown as { data?: Array<Record<string, unknown>> }, g.json), g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runJobGetCommand(jobId: string): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const job = await client.getJob(jobId);
    writeJsonOrPretty(job, g.json, g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

const JOB_TERMINAL_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled', 'succeeded']);

function isDocumentIdLike(value: string): boolean {
  return /^doc[-_][A-Za-z0-9_-]+$/.test(value);
}

async function resolveWaitJobId(client: OkraClient, id: string): Promise<string> {
  if (!isDocumentIdLike(id)) return id;
  const jobs = await client.listJobs({
    documentId: id,
    type: 'document.parse',
    limit: 1,
  });
  const job = jobs.data[0];
  if (!job?.id) {
    throw new OkraRuntimeError(
      'INVALID_REQUEST',
      `No document.parse job found for ${id}`,
      404,
      { document_id: id },
    );
  }
  return job.id;
}

async function runJobWaitCommand(id: string, options: { timeout?: string } = {}): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const jobId = await resolveWaitJobId(client, id);
    const timeoutMs = parsePositiveSecondsOption(options.timeout, '--timeout') ?? 300_000;
    const startedAt = Date.now();

    while (true) {
      const job = await client.getJob(jobId);
      const status = String(job.status);
      if (JOB_TERMINAL_STATUSES.has(status)) {
        if (status === 'failed' || status === 'cancelled') {
          // Surface the job's actual failure reason in the message (#465): a bare
          // "ended with status failed" hid the provider error down in `details`,
          // so a human/agent saw no WHY. Prefer the human-readable user_message,
          // then the raw error fields. Truncate so a multi-KB provider blob doesn't
          // swamp the line — the full job stays in details for `--json` and
          // `okra jobs get`. Also attach concrete recovery next_actions (the job's
          // own recovery_hint can loop you back into the same failure).
          const rawReason =
            job.user_message || job.error || job.latest_error || job.last_error?.message || job.error_code || null;
          const reason = rawReason && rawReason.length > 300 ? `${rawReason.slice(0, 297)}…` : rawReason;
          const message = reason
            ? `Job ${jobId} ${status}: ${reason}`
            : `Job ${jobId} ended with status ${status}`;
          const docId = job.document_id ?? (isDocumentIdLike(id) ? id : undefined);
          const nextActions = [
            { cmd: `okra jobs get ${jobId}`, why: 'Inspect the full job payload — error, error_code, recovery_hint.' },
            ...(docId
              ? [{ cmd: `okra parse ${docId}`, why: 'Reparse the document; add --engine <name> to try a different OCR vendor.' }]
              : []),
          ];
          throw new OkraRuntimeError(
            'EXTRACTION_FAILED',
            message,
            500,
            { ...job, next_actions: nextActions },
          );
        }
        writeJsonOrPretty(job, g.json, g.output);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        throw new OkraRuntimeError(
          'TIMEOUT',
          `Timed out waiting for job ${jobId} after ${timeoutMs}ms`,
          504,
          {
            job_id: jobId,
            document_id: job.document_id ?? (isDocumentIdLike(id) ? id : undefined),
            status,
            status_url: job.status_url ?? `/v1/jobs/${encodeURIComponent(jobId)}`,
          },
        );
      }

      progress(`Job ${jobId}: ${status}`, g.quiet);
      await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

type DocumentWaitForOptions = {
  match?: string;
  timeout?: string;
  literal?: boolean;
};

type DocumentWaitForMatch = {
  node_id: string;
  page: number | null;
  value_excerpt: string;
  bbox?: { x: number; y: number; w: number; h: number };
  bbox_source?: string;
};

type DocumentSubscriptionCreateResponse = {
  subscription_id?: string;
};

type DocumentSubscriptionWaitResponse = {
  status?: string;
  matched?: boolean;
  matches?: DocumentWaitForMatch[];
};

function documentWaitForNextActions(documentId: string, matches: DocumentWaitForMatch[]): Array<{ cmd: string; why: string }> {
  const firstPage = matches.find((match) => typeof match.page === 'number' && Number.isFinite(match.page))?.page;
  return [
    ...(firstPage !== undefined
      ? [{
          cmd: `okra documents read ${shellQuote(documentId)} --pages ${firstPage}`,
          why: 'Inspect the page containing the first matched node.',
        }]
      : []),
    {
      cmd: `okra context get "<target context>" --source-id ${shellQuote(documentId)}`,
      why: 'Retrieve bounded cited context around the matched term.',
    },
  ];
}

async function runDocumentWaitForCommand(
  documentId: string,
  options: DocumentWaitForOptions = {},
): Promise<void> {
  const g = globals();
  try {
    const match = options.match?.trim();
    if (!match) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        '--match is required',
        400,
        { document_id: documentId },
      );
    }

    const client = getClient();
    const timeoutMs = parsePositiveSecondsOption(options.timeout, '--timeout') ?? 120_000;
    const kind = options.literal ? 'literal' : 'fts';
    const created = await client.request<DocumentSubscriptionCreateResponse>(
      `/v1/documents/${encodeURIComponent(documentId)}/subscriptions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match, kind }),
      },
    );
    const subscriptionId = created.subscription_id;
    if (!subscriptionId) {
      throw new OkraRuntimeError(
        'INVALID_RESPONSE',
        'Subscription create response did not include subscription_id',
        502,
        created,
      );
    }

    const startedAt = Date.now();
    while (true) {
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = timeoutMs - elapsedMs;
      if (remainingMs <= 0) {
        throw new OkraRuntimeError(
          'TIMEOUT',
          `Timed out waiting for document ${documentId} subscription ${subscriptionId} after ${timeoutMs}ms`,
          504,
          {
            document_id: documentId,
            subscription_id: subscriptionId,
            match,
            kind,
            status: 'timeout',
            status_url: `/v1/documents/${encodeURIComponent(documentId)}/subscriptions/${encodeURIComponent(subscriptionId)}/wait`,
          },
        );
      }

      const requestTimeoutSeconds = Math.min(120, Math.max(1, Math.ceil(remainingMs / 1000)));
      const wait = await client.request<DocumentSubscriptionWaitResponse>(
        `/v1/documents/${encodeURIComponent(documentId)}/subscriptions/${encodeURIComponent(subscriptionId)}/wait?timeout=${requestTimeoutSeconds}`,
        { method: 'GET' },
      );
      const matches = Array.isArray(wait.matches) ? wait.matches : [];
      if (wait.status === 'matched' || wait.matched === true || matches.length > 0) {
        const result = {
          object: 'document_subscription_match',
          document_id: documentId,
          subscription_id: subscriptionId,
          match,
          kind,
          status: 'matched',
          matched_nodes: matches,
        };
        const envelope = {
          ok: true,
          command: 'documents wait-for',
          result,
          cost: { usd: null },
          citations: [],
          next_actions: documentWaitForNextActions(documentId, matches),
        };
        writeOutput(JSON.stringify(envelope, null, g.json ? 0 : 2), g.output);
        return;
      }

      progress(`Subscription ${subscriptionId}: waiting for ${JSON.stringify(match)}`, g.quiet);
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

type DocumentParseJobOptions = {
  engine?: string;
  model?: string;
  prompt?: string;
  strategy?: string;
  wait?: boolean;
  waitTimeout?: string;
};

type DocumentVerifyOptions = {
  page?: string;
  bbox?: string;
};

function parserProfileRequest(profile: ParserProfile): ParserProfile {
  return {
    ...profile,
    ...(profile.params ? { params: { ...profile.params } } : {}),
    ...(profile.cost_hints ? { cost_hints: { ...profile.cost_hints } } : {}),
  };
}

function requireExecutableProfile(profile: ParserProfile): void {
  if (isParserProfileExecutable(profile)) return;
  // Stamped event properties must describe the executed prompt; a profile the
  // worker can't honor must refuse, not run a different prompt under its name.
  throw new OkraRuntimeError(
    'NOT_IMPLEMENTED',
    `Parser profile ${profile.id} is registered but not executable yet (no execution path honors prompt ${profile.prompt_id}@${profile.prompt_version}). Executable profiles: ${listExecutableParserProfiles().map((profile_) => profile_.id).join(', ')}`,
    501,
    { parser_profile: profile.id, prompt_id: profile.prompt_id },
  );
}

function parseJobParserFields(
  options: DocumentParseJobOptions,
  documentId: string,
): Record<string, unknown> {
  if (options.model || options.prompt) {
    if (!options.model || !options.prompt) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        '`--model` and `--prompt` must be provided together',
        400,
      );
    }
    const profile = resolveParserProfileByModelPrompt(options.model, options.prompt);
    if (!profile) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        `No built-in parser profile matches model ${options.model} with prompt ${options.prompt}`,
        400,
        { model: options.model, prompt: options.prompt },
      );
    }
    requireExecutableProfile(profile);
    return {
      parser: {
        id: profile.id,
        options: {
          model: options.model,
          prompt: options.prompt,
        },
      },
      parser_profile: parserProfileRequest(profile),
    };
  }

  if (options.engine) {
    const profile = resolveParserProfile(options.engine);
    if (profile) {
      requireExecutableProfile(profile);
      return {
        parser: { id: profile.id },
        parser_profile: parserProfileRequest(profile),
      };
    }
    // The skill promises an invalid --engine returns `available_engines` + a
    // recovery path. The CLI validates the engine itself (so the request never
    // reaches the server's list), so enumerate the executable profiles here —
    // otherwise the agent gets a dead-end error with no way to pick a valid one.
    const available = listExecutableParserProfiles().map((p) => p.id);
    const message = `engine '${options.engine}' is not available`;
    throw new OkraRuntimeError(
      'INVALID_REQUEST',
      message,
      400,
      {
        error: 'engine_not_available',
        message,
        engine: options.engine,
        available_engines: available,
        next_actions: [
          ...(available[0]
            ? [{ cmd: `okra parse ${documentId} --engine ${available[0]}`, why: 'Re-run with a supported engine (see available_engines).' }]
            : []),
          { cmd: `okra parse ${documentId}`, why: 'Omit --engine for default routing — scanned docs auto-OCR.' },
        ],
      },
    );
  }

  return {};
}

async function runDocumentParseJobCommand(
  documentId: string,
  options: DocumentParseJobOptions = {},
): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const parserFields = parseJobParserFields(options, documentId);
    const job = await client.createJob({
      type: 'document.parse',
      document_id: documentId,
      ...(options.strategy ? { strategy: options.strategy } : {}),
      ...parserFields,
    });
    if (options.wait) {
      await runJobWaitCommand(job.id, { timeout: options.waitTimeout });
      return;
    }
    if (g.json) {
      writeOutput(JSON.stringify(job), g.output);
    } else {
      writeOutput(
        [
          `Queued: ${job.id}`,
          `Document: ${job.document_id ?? documentId}`,
          '',
          'Next:',
          `  okra jobs wait ${job.id}`,
          `  okra documents get ${job.document_id ?? documentId}`,
        ].join('\n'),
        g.output,
      );
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runDocumentVerifyCommand(
  documentId: string,
  claim: string,
  options: DocumentVerifyOptions = {},
): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const page = parseVerifyPageOption(options.page);
    const bbox = parseVerifyBboxOption(options.bbox);
    const result = await client.verify(documentId, { claim, page, ...(bbox ? { bbox } : {}) });
    const printable = { ...result, document_id: documentId, claim };
    if (g.json) {
      writeOutput(JSON.stringify(printable), g.output);
    } else {
      writeOutput(
        [
          `Verdict: ${result.verdict}`,
          `Document: ${documentId}`,
          `Page: ${result.page}`,
          `Evidence: ${result.evidence_snippet || '(none)'}`,
          `Confidence: ${result.confidence}`,
          `Model: ${result.model}`,
        ].join('\n'),
        g.output,
      );
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

function parseVerifyPageOption(raw: string | undefined): number {
  const value = String(raw ?? '').trim();
  if (!/^[1-9]\d*$/.test(value)) {
    throw invalidVerifyRequest('--page must be a positive integer', { option: 'page', value: raw ?? null });
  }
  return Number(value);
}

function parseVerifyBboxOption(raw: string | undefined): { x: number; y: number; w: number; h: number } | undefined {
  if (raw === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalidVerifyRequest('--bbox must be valid JSON', { option: 'bbox', value: raw });
  }

  if (!isRecord(parsed)) {
    throw invalidVerifyRequest('--bbox must be an object with x, y, w, h', { option: 'bbox', value: raw });
  }

  const { x, y, w, h } = parsed;
  if (
    typeof x === 'number' && Number.isFinite(x) && x >= 0 &&
    typeof y === 'number' && Number.isFinite(y) && y >= 0 &&
    typeof w === 'number' && Number.isFinite(w) && w > 0 &&
    typeof h === 'number' && Number.isFinite(h) && h > 0
  ) {
    return { x, y, w, h };
  }

  throw invalidVerifyRequest('--bbox must be { "x": number, "y": number, "w": number, "h": number } with w/h > 0', {
    option: 'bbox',
    value: raw,
  });
}

function invalidVerifyRequest(message: string, details: Record<string, unknown>): OkraRuntimeError {
  return new OkraRuntimeError('INVALID_REQUEST', message, 400, {
    error: 'invalid_request',
    message,
    details,
  });
}

async function runJobEventsCommand(jobId: string): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const url = `${client.url}/v1/jobs/${encodeURIComponent(jobId)}/events`;
    if (g.json) {
      writeOutput(JSON.stringify({ object: 'job_events_url', id: jobId, url }), g.output);
    } else {
      writeOutput(url, g.output);
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runJobMutationCommand(jobId: string, action: 'cancel' | 'retry' | 'resume'): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const result = await client.request<unknown>(`/v1/jobs/${encodeURIComponent(jobId)}/${action}`, {
      method: 'POST',
    });
    if (g.json) {
      writeOutput(JSON.stringify(result), g.output);
    } else {
      writeOutput(`${action}: ${jobId}`, g.output);
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runAgentsListCommand(): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const agents = await client.request<unknown>('/v1/agents', { method: 'GET' });
    writeOutput(formatGenericList(agents, g.json), g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runAgentGetCommand(agentId: string): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const agent = await client.request<unknown>(`/v1/agents/${encodeURIComponent(agentId)}`, { method: 'GET' });
    writeJsonOrPretty(agent, g.json, g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runAgentProfilesCommand(): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const profiles = await client.request<unknown>('/v1/agents/profiles', { method: 'GET' });
    writeOutput(formatGenericList(profiles, g.json), g.output);
  } catch (error) {
    handleError(error, g.json);
  }
}

async function runWorkflowCatalogCommand(): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const catalog = await client.request<unknown>('/v1/workflows/catalog', { method: 'GET' });
    if (g.json) {
      writeOutput(JSON.stringify(catalog), g.output);
    } else {
      writeOutput(formatGenericList(catalog, g.json), g.output);
    }
  } catch (error) {
    handleError(error, g.json);
  }
}

function registerUploadCommand(commandName: string, description: string): void {
  program
    .command(`${commandName} <source>`)
    .description(description)
    .summary('Upload a PDF and wait for processing')
    .option('--no-wait', 'Fire-and-forget (don\'t wait for processing)')
    .option('--wait-timeout <seconds>', 'Maximum seconds to wait for processing')
    .option('--vendor-options <json>', 'JSON vendor-specific options (e.g., \'{"model":"gemini-3.1-pro","parse_mode":"parse_page_with_agent"}\')')
    .action(async (source, options) => {
      await runUploadCommand(source, options);
    });
}

registerUploadCommand('upload', "Upload a PDF (file path, URL, or '-' for stdin), wait for processing");

// ============================================================================
// doctor command — structured CLI/environment diagnostics
// ============================================================================
program
  .command('doctor')
  .description('Run CLI, config, auth, and API diagnostics')
  .summary('Diagnose CLI setup')
  .option('--base-url <url>', 'Override API base URL for diagnostic probes')
  .action(async (options: { baseUrl?: string }) => {
    try {
      await runDoctorCommand(options);
    } catch (error) {
      handleError(error, globals().json);
    }
  });

// ============================================================================
// resources command — discover top-level API nouns and action verbs
// ============================================================================
const resourcesCmd = program
  .command('resources')
  .alias('resource')
  .description('Discover Okra API resources and actions')
  .summary('List API resources')
  .action(runResourceListCommand);

resourcesCmd
  .command('list')
  .alias('ls')
  .description('List top-level API resources and action verbs')
  .action(runResourceListCommand);

resourcesCmd
  .command('show <name>')
  .alias('get')
  .description('Show a resource or action contract')
  .action(runResourceShowCommand);

// ============================================================================
// content-types command — typed extraction contracts (#330/#331)
// ============================================================================
const contentTypesCmd = program
  .command('content-types')
  .alias('content-type')
  .alias('ct')
  .description('Discover typed extraction content types (schema + evidence + lifecycle)')
  .summary('List content types')
  .action(runContentTypesListCommand);

contentTypesCmd
  .command('list')
  .alias('ls')
  .description('List registered content types')
  .action(runContentTypesListCommand);

contentTypesCmd
  .command('show <id>')
  .alias('get')
  .description('Show a content-type manifest (schema, fields, evidence policy)')
  .action(runContentTypesShowCommand);

for (const ct of listContentTypes()) {
  const manifest = getContentType(ct.id);
  if (!manifest) {
    throw new Error(`Registered content type "${ct.id}" could not be resolved.`);
  }

  const noun = program
    .command(ct.cli_noun)
    .description(`${ct.label} extraction commands for content type "${ct.id}"`)
    .summary(`Extract ${ct.label.toLowerCase()} data`)
    .action(() => {
      noun.help();
    });

  for (const alias of manifest.cli.aliases ?? []) {
    noun.alias(alias);
  }

  noun
    .command('extract <source>')
    .description(`Equivalent to "extract <source> --content-type ${ct.id}"`)
    .option('--no-wait', 'Fire-and-forget')
    .option('--prompt <query>', 'Extraction prompt')
    .option('--cite', 'Return per-field source citations (page + bbox)')
    .action((source: string, options: {
      wait?: boolean;
      prompt?: string;
      cite?: boolean;
    }) => runExtractCommand(source, { ...options, contentType: ct.id }));
}

// ============================================================================
// documents command — processed document resource
// ============================================================================
const documentsCmd = program
  .command('documents')
  .alias('document')
  .alias('docs')
  .description('Document resource operations')
  .summary('Work with processed documents')
  .action(runDocumentListCommand);

documentsCmd
  .command('list')
  .alias('ls')
  .description('List processed documents')
  .action(runDocumentListCommand);

documentsCmd
  .command('upload <source>')
  .description('Upload a PDF into the document lifecycle')
  .option('--no-wait', 'Fire-and-forget (don\'t wait for processing)')
  .option('--wait-timeout <seconds>', 'Maximum seconds to wait for processing')
  .option('--vendor-options <json>', 'JSON vendor-specific options')
  .action(async (source, options) => {
    await runUploadCommand(source, options);
  });

documentsCmd
  .command('get <docId>')
  .alias('status')
  .description('Get document status and metadata')
  .action(runDocumentStatusCommand);

documentsCmd
  .command('read <docId>')
  .description('Read processed document markdown')
  .option('--pages <range>', 'Page range, e.g. 1-5')
  .action(runDocumentReadCommand);

documentsCmd
  .command('wait-for <docId>')
  .description('Wait until a matching document node is ingested')
  .requiredOption('--match <term>', 'Term or FTS expression to wait for')
  .option('--timeout <seconds>', 'Maximum seconds to wait', '120')
  .option('--literal', 'Use literal substring matching instead of FTS')
  .action(runDocumentWaitForCommand);

documentsCmd
  .command('urls <docId>')
  .alias('url')
  .description('Print deterministic document API URLs')
  .action(runDocumentUrlsCommand);

documentsCmd
  .command('reparse <docId>')
  .description('Create a document.parse job for an existing document')
  .option('--model <model>', 'Parser model id')
  .option('--prompt <prompt>', 'Parser prompt id or id@version')
  .option('--engine <engine>', 'Deprecated parser engine alias; use --model/--prompt')
  .option('--strategy <strategy>', 'Parser strategy/vendor alias')
  .option('--wait', 'Wait for the parse job to finish')
  .option('--wait-timeout <seconds>', 'Maximum seconds to wait when --wait is set')
  .action(runDocumentParseJobCommand);

documentsCmd
  .command('verify <docId> <claim>')
  .description('Verify a claim against a page using the vision model')
  .requiredOption('--page <n>', 'Page number (1-based) to verify against')
  .option('--bbox <json>', 'Optional region {"x":..,"y":..,"w":..,"h":..} to focus on')
  .action(runDocumentVerifyCommand);

documentsCmd
  .command('delete <docId>')
  .alias('rm')
  .description('Delete a document')
  .action(runDocumentDeleteCommand);

// ============================================================================
// files command — passive file resource
// ============================================================================
const filesCmd = program
  .command('files')
  .alias('file')
  .description('Passive file resource operations')
  .summary('Work with uploaded file assets')
  .action(runFileListCommand);

filesCmd
  .command('list')
  .alias('ls')
  .description('List passive file assets')
  .option('--limit <n>', 'Max files to return')
  .option('--cursor <cursor>', 'Pagination cursor')
  .action(runFileListCommand);

filesCmd
  .command('upload <source>')
  .description('Upload a passive file asset without creating a document')
  .option('--file-name <name>', 'Override file name')
  .option('--transport <mode>', 'auto | multipart | direct', 'auto')
  .action(runFileUploadCommand);

filesCmd
  .command('get <fileId>')
  .description('Get file metadata')
  .action(runFileGetCommand);

filesCmd
  .command('url <fileId>')
  .description('Print the file bytes URL')
  .action(runFileUrlCommand);

filesCmd
  .command('delete <fileId>')
  .alias('rm')
  .description('Delete a passive file asset')
  .action(runFileDeleteCommand);

// ============================================================================
// jobs command — long-running work resource
// ============================================================================
const jobsCmd = program
  .command('jobs')
  .alias('job')
  .description('Job resource operations')
  .summary('Inspect parse/render/workflow jobs')
  .action(runJobListCommand);

jobsCmd
  .command('list')
  .alias('ls')
  .description('List jobs')
  .option('--limit <n>', 'Max jobs to return')
  .option('--type <type>', 'Filter by job type')
  .option('--status <status>', 'Filter by job status')
  .option('--doc <docId>', 'Filter by document ID')
  .action(runJobListCommand);

jobsCmd
  .command('get <jobId>')
  .alias('show')
  .description('Get job status and result')
  .action(runJobGetCommand);

jobsCmd
  .command('wait <jobOrDocId>')
  .description('Wait for a job, or for the latest document.parse job for a document ID')
  .option('--timeout <seconds>', 'Maximum seconds to wait', '300')
  .action(runJobWaitCommand);

jobsCmd
  .command('events <jobId>')
  .description('Print the job event stream URL')
  .action(runJobEventsCommand);

jobsCmd
  .command('cancel <jobId>')
  .description('Cancel a queued or running job')
  .action((jobId: string) => runJobMutationCommand(jobId, 'cancel'));

jobsCmd
  .command('retry <jobId>')
  .description('Retry a failed job')
  .action((jobId: string) => runJobMutationCommand(jobId, 'retry'));

jobsCmd
  .command('resume <jobId>')
  .description('Resume a paused job')
  .action((jobId: string) => runJobMutationCommand(jobId, 'resume'));

// ============================================================================
// agents command — registered agent resource
// ============================================================================
const agentsCmd = program
  .command('agents')
  .alias('agent')
  .description('Agent resource operations')
  .summary('Inspect registered agents')
  .action(runAgentsListCommand);

agentsCmd
  .command('list')
  .alias('ls')
  .description('List registered agents')
  .action(runAgentsListCommand);

agentsCmd
  .command('get <agentId>')
  .description('Get agent details')
  .action(runAgentGetCommand);

agentsCmd
  .command('profiles')
  .description('List built-in runtime profiles')
  .action(runAgentProfilesCommand);

const contextDeps = { globals, getClient };
registerContextCommand(program, contextDeps);

// ============================================================================
// workflows command — research/eval workflow contracts
// ============================================================================
function loadWorkflowDefinition(source: string): DynamicWorkflowDefinition {
  const trimmed = source.trim();
  const raw = trimmed.startsWith('{') ? trimmed : readFileSync(trimmed, 'utf8');
  return JSON.parse(raw) as DynamicWorkflowDefinition;
}

function parseWorkflowDatasetRef(raw: string | undefined): DynamicWorkflowDatasetRef | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;

  if (value.startsWith('hf://')) {
    const withoutScheme = value.slice('hf://'.length);
    const [id, query = ''] = withoutScheme.split('?');
    const params = new URLSearchParams(query);
    return {
      provider: 'huggingface',
      id,
      split: params.get('split') || undefined,
      revision: params.get('revision') || undefined,
    };
  }

  if (value.startsWith('okra://')) {
    return { provider: 'okra', id: value.slice('okra://'.length) };
  }

  if (/^https?:\/\//i.test(value)) {
    return { provider: 'url', id: value, sourceUrl: value };
  }

  return { provider: 'local', id: value };
}

/**
 * Parse an inline JSON CLI argument into a structured envelope on failure. A bare
 * JSON.parse on a user-supplied `--flag '<json>'` throws a SyntaxError that
 * handleError renders as the generic error:"error", code:1 dead-end (no stable
 * code, no recovery) — same class as the redact --policy / workflows-validate
 * fixes. Returns the parsed value (any JSON type).
 */
export function parseInlineJsonArg(raw: string, flagName: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = `${flagName} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`;
    throw new OkraRuntimeError('INVALID_REQUEST', message, 400, {
      error: 'invalid_json_argument',
      message,
      next_actions: [{ cmd: `${flagName} '{"key":"value"}'`, why: `Pass ${flagName} as valid JSON.` }],
    });
  }
}

export function parseOptionalJsonObject(raw: string | undefined, flagName: string): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const parsed = parseInlineJsonArg(raw, flagName);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const message = `${flagName} must be a JSON object`;
    throw new OkraRuntimeError('INVALID_REQUEST', message, 400, {
      error: 'invalid_json_argument',
      message,
      next_actions: [{ cmd: `${flagName} '{"key":"value"}'`, why: `Pass ${flagName} as a JSON object.` }],
    });
  }
  return parsed as Record<string, unknown>;
}

function formatWorkflowValidation(definition: DynamicWorkflowDefinition, asJson: boolean): string {
  const validation = validateDynamicWorkflow(definition);
  const capabilities = validation.ok ? dynamicWorkflowToCapabilities(definition) : null;
  if (asJson) {
    return JSON.stringify({ validation, capabilities }, null, 2);
  }

  const lines = [
    `Workflow: ${definition.id || '(missing id)'}`,
    `Status: ${validation.ok ? 'valid' : 'invalid'}`,
    `Steps: ocr=${validation.stepKinds.ocr}, gate=${validation.stepKinds.gate}, code=${validation.stepKinds.code}, vlm=${validation.stepKinds.vlm}`,
  ];
  if (definition.eval?.dataset) {
    lines.push(`Dataset: ${definition.eval.dataset.provider}:${definition.eval.dataset.id}`);
  }
  if (validation.errors.length) {
    lines.push('', 'Errors:', ...validation.errors.map((error) => `  - ${error}`));
  }
  if (validation.warnings.length) {
    lines.push('', 'Warnings:', ...validation.warnings.map((warning) => `  - ${warning}`));
  }
  return lines.join('\n');
}

function formatWorkflowStepsGuide(asJson: boolean): string {
  const guide = createDynamicWorkflowBuildStepsGuide();
  if (asJson) return JSON.stringify(guide, null, 2);

  const lines = [
    'Dynamic workflow build steps',
    '',
    `Execution: ${guide.execution_model.unit}`,
    `Order: ${guide.execution_model.step_order}`,
    `Runtime: ${guide.execution_model.hosted_runtime}`,
    `Versioning: ${guide.execution_model.versioning}`,
    '',
    'Primitives:',
  ];

  for (const primitive of guide.primitives) {
    lines.push(`  ${primitive.kind}: ${primitive.purpose}`);
    lines.push(`    required: ${primitive.required.join(', ')}`);
    lines.push(`    optional: ${primitive.optional.join(', ')}`);
  }

  lines.push('', 'Usage:', ...guide.usage.map((cmd) => `  ${cmd}`));
  return lines.join('\n');
}

function formatWorkflowBuild(
  build: ReturnType<typeof buildDynamicWorkflowDefinition>,
  asJson: boolean,
  sourceOnly = false,
): string {
  if (sourceOnly) {
    return build.agent_workflow_source ?? build.validation.errors.join('\n');
  }
  if (asJson) return JSON.stringify(build, null, 2);

  const lines = [
    `Workflow: ${build.name || build.workflow_id || '(missing id)'}`,
    `Status: ${build.validation.ok ? 'valid' : 'invalid'}`,
    `Steps: ${build.step_graph.map((step) => `${step.id}:${step.kind}`).join(', ') || '(none)'}`,
    `Build: ${build.agent_workflow_source ? 'agent_workflow_source' : 'not emitted'}`,
  ];
  if (build.validation.errors.length) {
    lines.push('', 'Errors:', ...build.validation.errors.map((error) => `  - ${error}`));
  }
  if (build.validation.warnings.length) {
    lines.push('', 'Warnings:', ...build.validation.warnings.map((warning) => `  - ${warning}`));
  }
  if (build.agent_workflow_source) {
    lines.push('', 'Next:', `  okra workflows run ${build.source_path ?? './workflow.json'} --dry-run --json`);
  }
  return lines.join('\n');
}

const workflowCmd = program
  .command('workflows')
  .alias('workflow')
  .description('Validate and run composable OCR/gate/code/VLM eval workflows');
workflowCmd.summary('Run dataset-backed workflow evals');

workflowCmd
  .command('catalog')
  .alias('list')
  .description('List hosted workflow templates and capabilities')
  .action(runWorkflowCatalogCommand);

workflowCmd
  .command('steps')
  .description('Show the OCR/gate/code/VLM step primitives used to build workflows')
  .action(() => {
    const g = globals();
    try {
      writeOutput(formatWorkflowStepsGuide(!!g.json), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

workflowCmd
  .command('examples')
  .description('List built-in research workflow examples')
  .action(() => {
    const g = globals();
    const examples = listDynamicWorkflowExamples();
    if (g.json) {
      writeOutput(JSON.stringify(examples.map(({ definition, ...example }) => ({
        ...example,
        workflowId: definition.id,
      }))), g.output);
      return;
    }
    writeOutput(
      examples
        .map((example) => `${example.id}\t${example.title}`)
        .join('\n'),
      g.output,
    );
  });

workflowCmd
  .command('example <id>')
  .description('Print a built-in research workflow definition as JSON')
  .action((id: string) => {
    const g = globals();
    const example = getDynamicWorkflowExample(id);
    if (!example) {
      handleError(
        new OkraRuntimeError('INVALID_REQUEST', `Unknown workflow example "${id}".`, 400, {
          error: 'not_found',
          message: `Unknown workflow example "${id}".`,
          next_actions: [{ cmd: 'okra workflow examples', why: 'List the available workflow example ids.' }],
        }),
        g.json,
      );
    }
    writeOutput(JSON.stringify(example.definition, null, 2), g.output);
  });

workflowCmd
  .command('validate <file>')
  .description('Validate a workflow definition JSON file')
  .action((file: string) => {
    const g = globals();
    try {
      const definition = loadWorkflowDefinition(file);
      const validation = validateDynamicWorkflow(definition);
      writeOutput(formatWorkflowValidation(definition, !!g.json), g.output);
      if (!validation.ok) process.exitCode = 1;
    } catch (error) {
      handleError(error, g.json);
    }
  });

workflowCmd
  .command('build <file>')
  .description('Validate and compile a step workflow into hosted agent-workflow source')
  .option('--source-only', 'Print only the compiled hosted workflow source')
  .action((file: string, options: { sourceOnly?: boolean }) => {
    const g = globals();
    try {
      const definition = loadWorkflowDefinition(file);
      const build = buildDynamicWorkflowDefinition(definition, { sourcePath: file });
      const output = formatWorkflowBuild(build, !!g.json, options.sourceOnly === true);
      writeOutput(output, g.output);
      if (!build.validation.ok) process.exitCode = 1;
    } catch (error) {
      handleError(error, g.json);
    }
  });

workflowCmd
  .command('run <file>')
  .description('Create a hosted workflow/eval run from a workflow definition')
  .option('--dataset <ref>', 'Override eval dataset ref (hf://org/name?split=train, okra://id, URL, or local id)')
  .option('--dry-run', 'Ask the API to validate/plan without executing')
  .option('--metadata <json>', 'Attach run metadata JSON object')
  .action(async (file: string, options: {
    dataset?: string;
    dryRun?: boolean;
    metadata?: string;
  }) => {
    const g = globals();
    try {
      const client = getClient();
      const definition = loadWorkflowDefinition(file);
      const result = await client.workflows.run(definition, {
        dataset: parseWorkflowDatasetRef(options.dataset),
        dryRun: options.dryRun,
        metadata: parseOptionalJsonObject(options.metadata, '--metadata'),
      });

      if (g.json) {
        writeOutput(JSON.stringify(result), g.output);
        return;
      }

      writeOutput(
        [
          `Run: ${result.id}`,
          `Status: ${result.status}`,
          `Workflow: ${result.workflowId}`,
          result.evalRunId ? `Eval run: ${result.evalRunId}` : null,
          result.eventsUrl ? `Events: ${result.eventsUrl}` : null,
          result.resultsUrl ? `Results: ${result.resultsUrl}` : null,
        ].filter(Boolean).join('\n'),
        g.output,
      );
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// parse/audit/redact commands — product workflow verbs over /v1/workflows
// ============================================================================
async function runDocumentWorkflowCommand(
  kind: DocumentWorkflowKind,
  documentId: string,
  options: {
    recipe?: string;
    engine?: string;
    standard?: string;
    model?: string;
    policy?: string;
  },
): Promise<void> {
  const g = globals();
  try {
    const client = getClient();
    const result = await runDocumentWorkflow(client, kind, {
      documentId,
      recipeId: options.recipe,
      engine: options.engine,
      standard: options.standard,
      model: options.model,
      policy: parsePolicyJson(options.policy),
    });

    writeOutput(g.json ? JSON.stringify(result) : formatDocumentWorkflowRun(result), g.output);
  } catch (error) {
    // The cloud /v1/workflows endpoint only accepts dynamic-workflow JS modules
    // today; recipe runs (audit/redact) execute on the self-host runtime.
    // Translate the baffling upstream 400 into an honest, actionable envelope
    // instead of leaking "code must be a non-empty JavaScript module string".
    if (error instanceof Error && error.message.includes('JavaScript module string')) {
      writeOutput(
        JSON.stringify(createFailureEnvelope(
          kind,
          'not_supported_on_cloud',
          `okra ${kind} runs recipe workflows on the self-host runtime; the cloud API does not execute workflow recipes yet.`,
          [
            { cmd: 'okra serve', why: 'Start the self-host runtime, which executes recipe workflows.' },
            { cmd: `okra profile use <self-host-profile> && okra ${kind} ${shellQuote(documentId)}`, why: 'Re-run against a self-host profile.' },
            ...(kind === 'redact'
              ? [{ cmd: `okra resources show documents`, why: 'Cloud alternative: POST /v1/documents/{id}/redact applies bbox region redactions directly.' }]
              : []),
          ],
        )),
        g.output,
      );
      process.exitCode = 1;
      return;
    }
    handleError(error, g.json);
  }
}

program
  .command('parse <documentId>')
  .description('Create a document.parse job for an existing document')
  .summary('Create document parse job')
  .option('--model <model>', 'Parser model id')
  .option('--prompt <prompt>', 'Parser prompt id or id@version')
  .option('--engine <engine>', 'Deprecated parser engine alias; use --model/--prompt')
  .option('--strategy <strategy>', 'Parser strategy/vendor alias')
  .option('--wait', 'Wait for the parse job to finish')
  .option('--wait-timeout <seconds>', 'Maximum seconds to wait when --wait is set')
  .action((documentId: string, options: DocumentParseJobOptions) =>
    runDocumentParseJobCommand(documentId, options));

program
  .command('audit <documentId>')
  .description('Run an audit workflow against an existing document')
  .summary('Run audit workflow')
  .option('--standard <standard>', 'Audit standard', 'wcag')
  .option('--recipe <recipeId>', 'Workflow recipe id to run')
  .option('--attest', 'Request an attestation flip; always requires the live human review gate')
  .action((documentId: string, options: { standard?: string; recipe?: string; attest?: boolean }) => {
    if (options.attest) {
      const g = globals();
      writeHumanReviewRequired('audit', documentId, g);
      return;
    }
    return runDocumentWorkflowCommand('audit', documentId, options);
  });

program
  .command('redact <documentId>')
  .description('Run a redaction workflow against an existing document')
  .summary('Run redaction workflow')
  .option('--model <model>', 'Redaction model or policy capability preference', 'local')
  .option('--policy <json>', 'Redaction policy JSON object')
  .option('--recipe <recipeId>', 'Workflow recipe id to run')
  .action((documentId: string, options: { model?: string; policy?: string; recipe?: string }) =>
    runDocumentWorkflowCommand('redact', documentId, options));

// ── Shared extraction-schema resolution (single-doc `extract` + `collections
//    extract`) so both surfaces handle --content-type and bad schemas identically.

/**
 * Resolve `--content-type <id>` into a schema + grounding flag, mutating
 * `options.schema`/`options.cite` in place. A content type supplies its own
 * schema, so `--content-type` + `--schema` together is a conflict, and an
 * unknown id is `not_found`. No-op when `--content-type` is absent.
 */
function applyContentTypeToOptions(options: { schema?: string; contentType?: string; cite?: boolean }): void {
  if (!options.contentType) return;
  if (options.schema) {
    throw new OkraRuntimeError('INVALID_REQUEST', 'Pass either --content-type or --schema, not both.', 400, {
      error: 'invalid_request',
      message: 'Pass either --content-type or --schema, not both — a content type already supplies its schema.',
      next_actions: [{ cmd: 'okra content-types show ' + options.contentType, why: "Inspect the content type's schema." }],
    });
  }
  const manifest = getContentType(options.contentType);
  if (!manifest) {
    throw new OkraRuntimeError('NOT_FOUND', `No content type "${options.contentType}"`, 404, {
      error: 'not_found',
      message: `No content type "${options.contentType}". Run \`okra content-types list\` to see available content types.`,
      next_actions: [{ cmd: 'okra content-types list', why: 'List the registered content types.' }],
    });
  }
  options.schema = JSON.stringify(manifest.schema);
  if (manifest.evidence.citation_required) options.cite = true;
}

/**
 * Parse a `--schema` arg (file path or inline JSON) into an object, surfacing a
 * stable `invalid_schema` envelope (code 400) on a missing file or bad JSON
 * rather than letting a raw `ENOENT`/`SyntaxError` leak as `error: "error"`.
 */
function loadExtractionSchema(schemaArg: string, cmdHint: string): Record<string, unknown> {
  const inlineSchema = schemaArg.trim().startsWith('{');
  try {
    return JSON.parse(inlineSchema ? schemaArg : readFileSync(schemaArg, 'utf8'));
  } catch (schemaErr) {
    const enoent = (schemaErr as NodeJS.ErrnoException)?.code === 'ENOENT';
    const reason = enoent
      ? `Schema file not found: ${schemaArg}`
      : `Invalid JSON Schema (${inlineSchema ? 'inline' : schemaArg}): ${(schemaErr as Error).message}`;
    throw new OkraRuntimeError('INVALID_REQUEST', reason, 400, {
      error: 'invalid_schema',
      message: reason,
      next_actions: [{ cmd: cmdHint, why: 'Pass a readable JSON Schema file path or an inline JSON object.' }],
    });
  }
}

// ============================================================================
// extract command — structured extraction from existing doc or upload + extract
// ============================================================================
async function runExtractCommand(source: string | undefined, options: {
  wait?: boolean;
  schema?: string;
  contentType?: string;
  prompt?: string;
  cite?: boolean;
}): Promise<void> {
    const g = globals();
    // Generated content-type nouns (`okra invoice extract …`) invoke this too;
    // globals() infers the command from argv (→ "invoice"), which would label the
    // envelope wrong and skip the `extract` next_actions. Force "extract" so the
    // generated noun is fully equivalent to `extract --content-type <id>`.
    setOutputContext({ json: g.json === true, command: 'extract' });
    try {
      const client = getClient();
      const { readFileSync } = await import('fs');
      const resolvedSource = source;

      // `--content-type <id>` supplies this content type's schema + evidence
      // policy (forces grounding when required); the rest of the flow is unchanged.
      applyContentTypeToOptions(options);

      if (!resolvedSource) {
        throw new OkraRuntimeError(
          'INVALID_REQUEST',
          'Provide a document source: a doc ID, URL, or file path.',
          400,
          {
            error: 'source_required',
            message: 'Provide a document source: a doc ID, URL, or file path.',
            next_actions: [{ cmd: 'okra extract <doc-id> --schema schema.json', why: 'Extract from an existing document.' }],
          },
        );
      }

      // Resolve doc ID: if source looks like an existing doc, skip upload
      const isExistingDoc = /^(?:ocr|doc)-[A-Za-z0-9_-]+$/.test(resolvedSource);
      let docId: string;

      if (isExistingDoc) {
        docId = resolvedSource;
      } else {
        // Upload first
        const result = await upload(client, resolvedSource, {
          ...g,
          noWait: options.wait === false,
        });
        docId = result.id;

        // If no schema and no-wait, just show upload result
        if (!options.schema || options.wait === false) {
          if (g.json) {
            writeOutput(JSON.stringify(result), g.output);
          } else {
            writeOutput(
              options.wait === false
                ? formatQueuedDocumentMessage(docId)
                : formatDocumentReadyMessage(docId, result.pages),
              g.output,
            );
          }
          return;
        }
      }

      // Schema is required for existing docs, optional for uploads
      if (!options.schema) {
        if (isExistingDoc) {
          throw new OkraRuntimeError(
            'INVALID_REQUEST',
            '--schema is required when extracting from an existing document.',
            400,
            {
              error: 'schema_required',
              message: '--schema is required when extracting from an existing document.',
              next_actions: [{ cmd: 'okra extract <doc-id> --schema schema.json', why: 'Provide a JSON Schema (file path or inline) to extract structured data.' }],
            },
          );
        }
        return;
      }

      const schemaJson = loadExtractionSchema(options.schema, 'okra extract <doc-id> --schema ./schema.json --cite');

      const prompt = options.prompt || 'Extract all data from this document according to the schema.';

      progress(`Extracting from ${docId}…`, g.quiet);
      const extraction = await client.generate(docId, prompt, {
        schema: schemaJson,
        ...(options.cite ? { cite: true } : {}),
      });

      if (g.json) {
        // `--cite` → the server returns the Anthropic-shaped grounded citation
        // array in meta.citations; surface it verbatim. Default → lean { data }.
        const citations = extraction.meta?.citations ?? [];
        writeOutput(JSON.stringify({
          // `document_id` is the canonical id field across the envelope (upload,
          // facet, render, …); `doc_id` stays as a back-compat alias so the
          // `upload → extract` chain reads the same id field name (#592).
          document_id: docId,
          doc_id: docId,
          data: extraction.data ?? extraction.answer,
          ...(citations.length > 0 ? { citations } : {}),
        }), g.output);
      } else if (g.output && g.output.endsWith('.csv')) {
        // CSV output for single doc — one header row + one data row
        const data = (extraction.data ?? {}) as Record<string, unknown>;
        const keys = Object.keys(data);
        const header = ['doc_id', ...keys].join(',');
        const values = keys.map((k) => {
          const v = data[k];
          if (v == null) return '';
          if (typeof v === 'string') return `"${String(v).replace(/"/g, '""')}"`;
          return String(v);
        });
        writeOutput([header, [docId, ...values].join(',')].join('\n'), g.output);
      } else {
        writeOutput(JSON.stringify(extraction.data ?? extraction.answer, null, 2), g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
}

program
  .command('extract [source]')
  .description('Extract structured data from a document (doc ID, URL, or file path)')
  .summary('Upload a PDF and extract structured data')
  .option('--no-wait', "Fire-and-forget (don't wait for processing)")
  .option('--schema <file>', 'JSON Schema file or inline JSON for structured extraction')
  .option('--content-type <id>', 'Extract using a registered content type (e.g. invoice) — supplies the schema and grounding')
  .option('--prompt <query>', 'Extraction prompt (default: "Extract all data according to the schema")')
  .option('--cite', 'Return per-field source citations (page + bbox) for each extracted value')
  .action(runExtractCommand);

// ============================================================================
// render command — A.4.19
// ============================================================================
program
  .command('render <source>')
  .description('Generate a PDF via /v1/renders (ReportLab Python, codemode JS, designed spec, or HTML)')
  .summary('Render a PDF from a script, spec, or HTML')
  .option('-o, --out <file>', 'Output PDF path (use - for stdout)', 'output.pdf')
  .option('--mode <mode>', 'Override auto-detected mode: reportlab | exec | designed | html')
  .option('--input <file>', 'Attach a single input file (basename becomes the script path)')
  .option('--file <name=path>', 'Additional input file (repeatable)', (val: string, acc: string[]) => [...(acc || []), val], [] as string[])
  .option('--save', 'Persist into your account as a created document')
  .option('--file-name <name>', 'Override output PDF filename (default: derived from -o)')
  .action(async (source: string, options: {
    out: string;
    mode?: 'reportlab' | 'exec' | 'designed' | 'html';
    input?: string;
    file?: string[];
    save?: boolean;
    fileName?: string;
  }) => {
    const g = globals();
    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        failMissingApiKey(Boolean(g.json));
      }
      const result = await render(source, options.out, {
        ...g,
        apiKey,
        baseUrl: getBaseUrl(),
        mode: options.mode,
        input: options.input,
        file: options.file,
        save: options.save,
        fileName: options.fileName,
      });
      if (g.json) {
        writeOutput(JSON.stringify(result), g.output);
      } else {
        const lines = [
          `Rendered: ${result.output_path}`,
          `  mode:       ${result.mode}`,
          `  size:       ${result.size.toLocaleString()} bytes`,
          `  render_id:  ${result.render_id}`,
          `  sha256:     ${result.sha256}`,
        ];
        if (result.document_id) {
          lines.push(`  document:   ${result.document_id}`);
          lines.push(`  download:   ${result.download_url}`);
        }
        writeOutput(lines.join('\n'), g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// status command
// ============================================================================
program
  .command('status <docId>', { hidden: true })
  .description('Get document processing status')
  .action(async (docId) => {
    const g = globals();
    try {
      const client = getClient();
      const status = await client.status(docId);
      if (g.json) {
        writeOutput(JSON.stringify(status), g.output);
      } else {
        const lines = [
          `Document: ${docId}`,
          `Phase: ${status.phase}`,
        ];
        if (typeof status.pagesCompleted === 'number' || typeof status.pagesTotal === 'number') {
          lines.push(`Pages: ${status.pagesCompleted ?? '?'} / ${status.pagesTotal ?? '?'}`);
        }
        writeOutput(lines.join('\n'), g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// ask command
// ============================================================================
program
  .command('ask <sourceOrQuestion> [question...]')
  .description('Ask a question from bounded context; legacy --doc asks a processed document (canonical: okra context ask)')
  .summary('Ask about a document')
  .option('--doc <id>', 'Document ID for legacy document chat')
  .option('--model <name>', 'Override model for legacy document chat')
  .option('--stream', 'Stream response tokens as they arrive for legacy document chat')
  .option('--offline <fixture>', 'Use a built-in offline context fixture')
  .option('--source-id <id>', 'Context source id')
  .option('--section <id>', 'Repeatable context section id', (value: string, acc: string[]) => [...acc, value], [] as string[])
  .action(async (sourceOrQuestion: string, questionParts: string[] = [], options: {
    doc?: string;
    model?: string;
    stream?: boolean;
    offline?: string;
    sourceId?: string;
    section?: string[];
  }) => {
    const g = globals();
    try {
      if (!options.doc) {
        if (options.model || options.stream) {
          throw new OkraRuntimeError(
            'INVALID_REQUEST',
            '--model and --stream require --doc <id> (legacy document chat).',
            400,
            {
              error: 'invalid_request',
              message: '--model and --stream require --doc <id> (legacy document chat).',
              next_actions: [{ cmd: 'okra ask <source-id> "<question>"', why: 'Use the context ask surface (no --model/--stream).' }],
            },
          );
        }

        const hasContextSourceOption = !!options.sourceId || !!options.offline;
        const explicitSourceId = questionParts.length ? sourceOrQuestion : undefined;
        const contextQuestionParts = questionParts.length
          ? questionParts
          : hasContextSourceOption
            ? [sourceOrQuestion]
            : [];

        if (!contextQuestionParts.length) {
          throw new OkraRuntimeError(
            'INVALID_REQUEST',
            'Provide a source and a question, or use --doc <id> for legacy document chat.',
            400,
            {
              error: 'invalid_request',
              message: 'Provide a source and a question, or use --doc <id> for legacy document chat.',
              next_actions: [{ cmd: 'okra ask <source-id> "<question>"', why: 'Ask a cited question about a source.' }],
            },
          );
        }

        await runContextAsk(contextQuestionParts, options, contextDeps, explicitSourceId);
        return;
      }

      const client = getClient();
      const docId = options.doc;
      const question = [sourceOrQuestion, ...questionParts].join(' ');
      const prompt = question;

      if (options.stream) {
        let fullText = '';
        for await (const event of client.stream(docId, prompt, {
          model: options.model,
        })) {
          if (event.type === 'text_delta') {
            fullText += event.text;
            if (!g.json) process.stdout.write(event.text);
          } else if (event.type === 'done') {
            if (!g.json) process.stdout.write('\n');
            if (g.json) {
              writeOutput(
                JSON.stringify({ docId, question, answer: fullText }),
                g.output,
              );
            }
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
        return;
      }

      const result = await client.generate(docId, prompt, options.model ? { model: options.model } : undefined);

      if (g.json) {
        writeOutput(JSON.stringify({ docId, question, ...result }), g.output);
      } else {
        writeOutput(result.answer, g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// chat command
// ============================================================================
program
  .command('chat <question>')
  .description('Ask a question about a processed document (canonical: okra context ask)')
  .summary('Ask a question about one document')
  .requiredOption('--doc <id>', 'Document ID')
  .option('--model <name>', 'Override model')
  .option('--stream', 'Stream response tokens as they arrive')
  .action(async (question, options) => {
    const g = globals();
    try {
      const client = getClient();

      if (options.stream) {
        let fullText = '';
        for await (const event of client.stream(options.doc, question, {
          model: options.model,
        })) {
          if (event.type === 'text_delta') {
            fullText += event.text;
            if (!g.json) process.stdout.write(event.text);
          } else if (event.type === 'done') {
            if (!g.json) process.stdout.write('\n');
            if (g.json) {
              writeOutput(
                JSON.stringify({ docId: options.doc, question, answer: fullText }),
                g.output,
              );
            }
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
        return;
      }

      const result = await client.generate(options.doc, question, options.model ? { model: options.model } : undefined);

      if (g.json) {
        writeOutput(JSON.stringify({ docId: options.doc, question, ...result }), g.output);
      } else {
        writeOutput(result.answer, g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// list command
// ============================================================================
program
  .command('list')
  .alias('ls')
  .description('List all documents')
  .summary('List your documents')
  .action(runDocumentListCommand);

// ============================================================================
// read command
// ============================================================================
program
  .command('read <docId>')
  .description('Read processed document markdown')
  .summary('Read document markdown')
  .option('--pages <range>', 'Page range, e.g. 1-5')
  .action(runDocumentReadCommand);

// ============================================================================
// open command
// ============================================================================
program
  .command('open <docId>')
  .description('Print the active profile web-shell URL for a document')
  .summary('Open document shell')
  .option('--view <view>', 'Initial view: document | graph | parser | audit | redact | review', 'document')
  .action((docId, options: { view?: string }) => {
    const g = globals();
    try {
      const url = documentShellUrl(docId, options);
      if (g.json) {
        writeOutput(JSON.stringify({
          object: 'document_open_url',
          document_id: docId,
          view: options.view ?? 'document',
          url,
        }), g.output);
      } else {
        writeOutput(url, g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// delete command
// ============================================================================
program
  .command('delete <docId>')
  .alias('rm')
  .description('Delete a document')
  .summary('Delete one document')
  .action(runDocumentDeleteCommand);

// ============================================================================
// collections command
// ============================================================================
const collectionCmd = program
  .command('collections')
  .alias('collection')
  .alias('col')
  .description('Collection operations');
collectionCmd.summary('Query across collections');
collectionCmd.addHelpText(
  'after',
  COLLECTION_HELP_FOOTER,
);

collectionCmd
  .command('list')
  .alias('ls')
  .description('List available collections')
  .summary('List collections')
  .action(async () => {
    const g = globals();
    try {
      const client = getClient();
      const rows = await collectionList(client, g);
      writeOutput(formatCollectionList(rows, g.json), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('create <name>', { hidden: true })
  .description('Create a new collection')
  .option('--description <text>', 'Collection description')
  .option('--docs <ids>', 'Comma-separated document IDs to seed')
  .action(async (name, options) => {
    const g = globals();
    try {
      const client = getClient();
      const result = await collectionCreate(client, name, { ...g, ...options });
      if (g.json) {
        writeOutput(JSON.stringify(result), g.output);
      } else {
        writeOutput(`Created collection "${result.name}" (${result.id})`, g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('show <nameOrId>', { hidden: true })
  .description('Show collection details and documents')
  .action(async (nameOrId) => {
    const g = globals();
    try {
      const client = getClient();
      const detail = await collectionShow(client, nameOrId);
      writeOutput(formatCollectionDetail(detail, g.json), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('delete <nameOrId>', { hidden: true })
  .alias('rm')
  .description('Delete a collection (documents are preserved)')
  .action(async (nameOrId) => {
    const g = globals();
    try {
      const client = getClient();
      await collectionDelete(client, nameOrId);
      if (g.json) {
        writeOutput(JSON.stringify({ ok: true, deleted: nameOrId }), g.output);
      } else {
        writeOutput(`Deleted collection "${nameOrId}"`, g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('add <nameOrId> <docIds...>', { hidden: true })
  .description('Add documents to a collection')
  .action(async (nameOrId, docIds) => {
    const g = globals();
    try {
      const client = getClient();
      const result = await collectionAddDocs(client, nameOrId, docIds);
      if (g.json) {
        writeOutput(JSON.stringify(result), g.output);
      } else {
        writeOutput(`Added ${docIds.length} document(s) to "${nameOrId}"`, g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('remove <nameOrId> <docIds...>', { hidden: true })
  .description('Remove documents from a collection')
  .action(async (nameOrId, docIds) => {
    const g = globals();
    try {
      const client = getClient();
      const result = await collectionRemoveDocs(client, nameOrId, docIds);
      if (g.json) {
        writeOutput(JSON.stringify(result), g.output);
      } else {
        writeOutput(`Removed ${docIds.length} document(s) from "${nameOrId}"`, g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('query <nameOrId> <question>')
  .description('Fan-out query across collection documents')
  .summary('Ask the same question across a collection')
  .option('--schema <file>', 'Experimental: JSON Schema file for structured extraction')
  .action(async (nameOrId, question, options) => {
    const g = globals();
    try {
      const client = getClient();
      const { results, summary } = await collectionQueryRaw(
        client,
        nameOrId,
        question,
        { ...g, schema: options.schema },
      );

      if (g.json) {
        writeOutput(JSON.stringify({ results, summary }), g.output);
      } else if (g.output && g.output.endsWith('.csv')) {
        // -o file.csv → CSV
        writeOutput(formatCollectionCsv(results), g.output);
      } else if (g.output) {
        // -o file.json or other → JSON
        writeOutput(JSON.stringify({ results, summary }), g.output);
      } else {
        // Default: compact table to stdout
        writeOutput(formatCollectionTable(results));
      }

      progress(
        `${summary.completed} completed, ${summary.failed} failed — $${summary.total_cost_usd.toFixed(4)}`,
        g.quiet,
      );
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('extract <nameOrId>', { hidden: true })
  .description('Experimental: extract structured data from all documents in a collection')
  .summary('Experimental structured extraction')
  .option('--schema <file>', 'Experimental: JSON Schema file or inline JSON for structured extraction')
  .option('--content-type <id>', 'Extract the whole corpus using a registered content type (e.g. invoice) — supplies the schema and grounding')
  .option('--prompt <query>', 'Extraction prompt (default: auto-generated from schema)')
  .option('--cite', 'Per-field source citations (Anthropic page_location)')
  .action(async (nameOrId, options) => {
    const g = globals();
    try {
      const client = getClient();

      // Parity with single-doc extract: --content-type supplies the schema +
      // grounding; require one of --schema/--content-type; clean schema errors.
      applyContentTypeToOptions(options);
      if (!options.schema) {
        throw new OkraRuntimeError('INVALID_REQUEST', 'Provide --schema or --content-type.', 400, {
          error: 'schema_required',
          message: 'Provide --schema (a JSON Schema file/inline) or --content-type (a registered content type).',
          next_actions: [{ cmd: 'okra content-types list', why: 'See the available content types.' }],
        });
      }
      const schemaJson = loadExtractionSchema(options.schema, 'okra collections extract <name> --schema ./schema.json --cite');

      const prompt = options.prompt || 'Extract all data from this document according to the schema.';

      const { results, summary } = await collectionQueryRaw(
        client,
        nameOrId,
        prompt,
        { ...g, schema: schemaJson, cite: options.cite },
      );

      // Use structured formatters that flatten data keys into columns
      if (g.json) {
        writeOutput(JSON.stringify({ results, summary }), g.output);
      } else if (g.output && g.output.endsWith('.csv')) {
        writeOutput(formatExtractCsv(results), g.output);
      } else if (g.output) {
        // Non-csv file output → JSON
        writeOutput(formatExtractJson(results), g.output);
      } else {
        // Default: table to stdout with flattened data columns
        writeOutput(formatExtractTable(results));
      }

      progress(
        `\n${summary.completed} documents — $${summary.total_cost_usd.toFixed(4)} total`,
        g.quiet,
      );
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('publish <nameOrId>', { hidden: true })
  .description('Make a collection publicly queryable')
  .option('--confirm-rights', 'Confirm you own or are licensed to publish this collection publicly')
  .action(async (nameOrId, options: { confirmRights?: boolean }) => {
    const g = globals();
    try {
      const confirmed = await requirePublicPublishRightsConfirmation(
        'collections publish',
        nameOrId,
        g,
        options.confirmRights,
      );
      if (!confirmed) return;

      const client = getClient();
      await collectionSetVisibility(client, nameOrId, 'public');
      if (g.json) {
        writeOutput(JSON.stringify({ ok: true, visibility: 'public', collection: nameOrId }), g.output);
      } else {
        writeOutput(
          `Published "${nameOrId}"\n` +
          `Share with: okra collections query ${nameOrId} "your question"`,
          g.output,
        );
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('unpublish <nameOrId>', { hidden: true })
  .description('Make a collection private (owner-only)')
  .action(async (nameOrId) => {
    const g = globals();
    try {
      const client = getClient();
      await collectionSetVisibility(client, nameOrId, 'private');
      if (g.json) {
        writeOutput(JSON.stringify({ ok: true, visibility: 'private', collection: nameOrId }), g.output);
      } else {
        writeOutput(`Unpublished "${nameOrId}" — now private`, g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

collectionCmd
  .command('export <nameOrId>', { hidden: true })
  .description('Export pre-computed markdown for all documents in a collection')
  .option('--flat', 'Concatenated markdown with # headers + === separators')
  .option('--zip', 'One markdown file per document in a .zip archive')
  .action(async (nameOrId, options) => {
    const g = globals();
    try {
      const client = getClient();

      if (options.flat && options.zip) {
        throw new Error('Use either --flat or --zip, not both');
      }

      if (options.zip) {
        const bytes = await collectionExport(client, nameOrId, { ...g, zip: true });
        const safeBase = String(nameOrId)
          .trim()
          .replace(/[^A-Za-z0-9._-]+/g, '-')
          .replace(/-{2,}/g, '-')
          .replace(/^[-_.]+|[-_.]+$/g, '') || 'collection-export';
        const outputPath = g.output || `${safeBase}.zip`;
        writeFileSync(outputPath, bytes);
        progress(`Wrote → ${outputPath}`, g.quiet);

        if (g.json) {
          writeOutput(JSON.stringify({
            format: 'zip',
            file: outputPath,
            bytes: bytes.byteLength,
          }));
        }
        return;
      }

      const result = await collectionExport(client, nameOrId, { ...g, flat: options.flat });

      if (options.flat) {
        writeOutput(formatCollectionExportFlat(result), g.output);
      } else if (g.json) {
        writeOutput(JSON.stringify(result), g.output);
      } else {
        // Default: structured JSON
        writeOutput(JSON.stringify(result, null, 2), g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// auth command - Authentication management
// ============================================================================
const authCmd = program.command('auth').description('Manage authentication');

authCmd
  .command('login')
  .description('Save API key to global config')
  .option('-k, --key <apiKey>', 'Set API key non-interactively')
  .action(async (options) => {
    try {
      await authLogin(options.key);
    } catch (error) {
      handleError(error, globals().json);
    }
  });

authCmd
  .command('set-key <apiKey>')
  .description('Save API key to global config (non-interactive)')
  .action(async (apiKey) => {
    try {
      await authSetKey(apiKey);
    } catch (error) {
      handleError(error, globals().json);
    }
  });

authCmd
  .command('status')
  .description('Show authentication status')
  .option('--validate', 'Verify the configured API key with the API')
  .action(async (options: { validate?: boolean }) => {
    try {
      const g = globals();
      await authStatus({ validate: options.validate === true, json: g.json, output: g.output });
    } catch (error) {
      handleError(error, globals().json);
    }
  });

authCmd
  .command('whoami')
  .description('Show current auth identity (alias for status)')
  .action(async () => {
    try {
      const g = globals();
      await authStatus({ validate: true, json: g.json, output: g.output });
    } catch (error) {
      handleError(error, globals().json);
    }
  });

authCmd
  .command('token')
  .description('Print active API key to stdout')
  .action(async () => {
    try {
      await authToken();
    } catch (error) {
      handleError(error, globals().json);
    }
  });

authCmd
  .command('logout')
  .description('Remove API key from global config')
  .action(async () => {
    try {
      await authLogout();
    } catch (error) {
      handleError(error, globals().json);
    }
  });

// ============================================================================
// profile command - Self-host/cloud endpoint profiles
// ============================================================================
const profileCmd = program.command('profile').description('Manage cloud and self-host API profiles');

profileCmd
  .command('add <name>')
  .description('Save a cloud or self-host API profile')
  .requiredOption('--base-url <url>', 'API base URL, for example https://my-okra.up.railway.app')
  .option('--api-key <apiKey>', 'Optional API key scoped to this profile')
  .option('--use', 'Immediately make this the active profile')
  .action((name, options) => {
    try {
      profileAdd(name, options);
    } catch (error) {
      handleError(error, globals().json);
    }
  });

profileCmd
  .command('use <name>')
  .description('Switch the active API profile')
  .action((name) => {
    try {
      profileUse(name);
    } catch (error) {
      handleError(error, globals().json);
    }
  });

profileCmd
  .command('current')
  .description('Show the active API profile')
  .action(() => {
    try {
      profileCurrent();
    } catch (error) {
      handleError(error, globals().json);
    }
  });

profileCmd
  .command('list')
  .description('List configured API profiles')
  .action(() => {
    try {
      profileList();
    } catch (error) {
      handleError(error, globals().json);
    }
  });

profileCmd
  .command('remove <name>')
  .description('Remove an API profile')
  .action((name) => {
    try {
      profileRemove(name);
    } catch (error) {
      handleError(error, globals().json);
    }
  });

// ============================================================================
// serve command - Lightweight self-host runtime entrypoint
// ============================================================================
program
  .command('serve [bundleDir]')
  .description('Serve a lightweight self-host runtime shell and API')
  .option('--host <host>', 'Host interface to bind', process.env.HOST ?? '0.0.0.0')
  .option('--port <port>', 'Port to bind', process.env.PORT ?? '8787')
  .option('--public-dir <dir>', 'Override static asset directory')
  .action(async (bundleDir, options) => {
    await runSelfHostServeCommand(bundleDir, options);
  });

// ============================================================================
// capability command - Isolated self-host capability service entrypoint
// ============================================================================
const capabilityCmd = program
  .command('capability')
  .description('Run isolated self-host capability services');

capabilityCmd
  .command('serve <capabilityId>')
  .description('Serve an okra-capability-http/v1 adapter for one capability')
  .option('--host <host>', 'Host interface to bind', process.env.HOST ?? '0.0.0.0')
  .option('--port <port>', 'Port to bind', process.env.OKRA_CAPABILITY_HTTP_PORT ?? process.env.PORT ?? '8080')
  .action(async (capabilityId, options) => {
    await runCapabilityServeCommand(capabilityId, options);
  });

// ============================================================================
// self-host command - Local self-host bundle validation
// ============================================================================
const selfHostCmd = program
  .command('self-host')
  .description('Validate self-host runtime, recipe, and capability bundles');
selfHostCmd.addHelpText('after', SELF_HOST_HELP_FOOTER);

selfHostCmd
  .command('validate <bundleDir>')
  .description('Validate a self-host runtime bundle without starting a server')
  .action((bundleDir) => {
    const g = globals();
    try {
      const result = validateSelfHostBundle(bundleDir);
      writeOutput(formatSelfHostValidationResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('materialize <bundleDir>')
  .description('Write deterministic Railway/Docker publish artifacts into the bundle')
  .action((bundleDir) => {
    const g = globals();
    try {
      const result = materializeSelfHostPublishArtifacts(bundleDir);
      writeOutput(formatSelfHostMaterializeArtifactsResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('proof <bundleDir>')
  .description('Run no-server draft proof checks against the self-host runtime bundle')
  .option('--evidence-out <path>', 'Write proof JSON to a file')
  .option('--generated-at <value>', 'Override generated_at for deterministic proof artifacts')
  .option('--document-id <documentId>', 'Document id to use for proof workflow runs', 'doc-draft-proof')
  .action(async (bundleDir, options: {
    evidenceOut?: string;
    generatedAt?: string;
    documentId?: string;
  }) => {
    const g = globals();
    try {
      const proof = await createSelfHostDraftProof(bundleDir, {
        generatedAt: options.generatedAt,
        documentId: options.documentId,
      });
      if (options.evidenceOut) {
        writeSelfHostDraftProof(options.evidenceOut, proof);
      }
      writeOutput(g.json ? JSON.stringify(proof) : formatSelfHostDraftProof(proof), g.output);
      if (proof.status !== 'passed') process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('plan <bundleDir>')
  .description('Render a self-host deploy preflight plan without deploying')
  .option('--target <target>', 'Deploy target to plan for', 'railway')
  .action((bundleDir, options) => {
    const g = globals();
    try {
      const result = createSelfHostDeploymentPlan(bundleDir, options.target);
      writeOutput(formatSelfHostDeploymentPlanResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('env <bundleDir>')
  .description('Render a self-host .env template without deploying')
  .option('--target <target>', 'Environment target to render for', 'railway')
  .action((bundleDir, options) => {
    const g = globals();
    try {
      const result = createSelfHostEnvArtifact(bundleDir, options.target);
      writeOutput(formatSelfHostEnvArtifactResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('compose <bundleDir>')
  .description('Render Docker Compose artifacts without starting services')
  .option('--mode <mode>', 'Compose artifact mode: networks, stack, capabilities, or integrations', 'networks')
  .action((bundleDir, options) => {
    const g = globals();
    try {
      const result = createSelfHostComposeArtifact(bundleDir, options.mode);
      writeOutput(formatSelfHostComposeArtifactResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('railway <bundleDir>')
  .description('Render Railway config-as-code for the public app service or a named service')
  .option('--service <serviceId>', 'Railway service id to render config for')
  .action((bundleDir, options: { service?: string }) => {
    const g = globals();
    try {
      const serviceOptionProvided = process.argv.some((arg) =>
        arg === '--service' || arg.startsWith('--service='),
      );
      const result = createSelfHostRailwayConfigArtifact(
        bundleDir,
        serviceOptionProvided ? options.service : undefined,
      );
      writeOutput(formatSelfHostRailwayConfigArtifactResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('template <bundleDir>')
  .description('Render Railway template composer handoff without publishing')
  .action((bundleDir) => {
    const g = globals();
    try {
      const result = createSelfHostRailwayTemplateArtifact(bundleDir);
      writeOutput(formatSelfHostRailwayTemplateArtifactResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('template-listing <bundleDir>')
  .description('Render Railway template listing metadata for publication')
  .action((bundleDir) => {
    const g = globals();
    try {
      const result = createSelfHostRailwayTemplateListingArtifact(bundleDir);
      writeOutput(formatSelfHostRailwayTemplateListingArtifactResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('network-plan <bundleDir>')
  .description('Render Docker network handoff for separated services')
  .action((bundleDir) => {
    const g = globals();
    try {
      const result = createSelfHostDockerNetworkHandoffArtifact(bundleDir);
      writeOutput(formatSelfHostDockerNetworkHandoffArtifactResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('template-evidence <bundleDir>')
  .description('Render Railway template publication evidence scaffold')
  .action((bundleDir) => {
    const g = globals();
    try {
      const result = createSelfHostRailwayTemplatePublicationEvidenceArtifact(bundleDir);
      writeOutput(formatSelfHostRailwayTemplatePublicationEvidenceArtifactResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('implementations <bundleDir>')
  .description('Render capability implementation handoff without publishing images')
  .action((bundleDir) => {
    const g = globals();
    try {
      const result = createSelfHostCapabilityImplementationsArtifact(bundleDir);
      writeOutput(formatSelfHostCapabilityImplementationsArtifactResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('capability-evidence <bundleDir>')
  .description('Render capability promotion evidence scaffold for production image handoff')
  .action((bundleDir) => {
    const g = globals();
    try {
      const result = createSelfHostCapabilityPromotionEvidenceArtifact(bundleDir);
      writeOutput(formatSelfHostCapabilityPromotionEvidenceArtifactResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('evidence-bundle <bundleDir>')
  .description('Render Railway publish evidence bundle scaffold')
  .option('--template-evidence <path>', 'Path to Railway template publication evidence')
  .option('--capability-evidence <path>', 'Path to capability promotion evidence')
  .option('--smoke-evidence <path>', 'Path to live deploy smoke evidence')
  .option('--readiness <path>', 'Path to Railway publish readiness artifact')
  .option('--publish-pack <path>', 'Path to Railway publish pack artifact')
  .action((bundleDir, options: {
    templateEvidence?: string;
    capabilityEvidence?: string;
    smokeEvidence?: string;
    readiness?: string;
    publishPack?: string;
  }) => {
    const g = globals();
    try {
      const result = createSelfHostRailwayPublishEvidenceBundleArtifact(bundleDir, {
        templateEvidencePath: options.templateEvidence,
        capabilityEvidencePath: options.capabilityEvidence,
        smokeEvidencePath: options.smokeEvidence,
        readinessPath: options.readiness,
        publishPackPath: options.publishPack,
      });
      writeOutput(formatSelfHostRailwayPublishEvidenceBundleArtifactResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('publish-pack <bundleDir>')
  .description('Render Railway template publication pack with Docker/network separation')
  .option('--template-url <url>', 'Published Railway template URL, when available')
  .option('--evidence-bundle <path>', 'JSON publish evidence bundle from `okra self-host evidence-bundle`')
  .option('--template-evidence <path>', 'JSON Railway template publication evidence from `okra self-host template-evidence`')
  .option('--base-url <url>', 'Deployed self-host base URL, when available')
  .option('--model-backed <capabilityRefs>', 'Comma-separated model-backed capability refs')
  .option('--capability-evidence <path>', 'JSON capability promotion evidence from `okra self-host capability-evidence`')
  .option('--smoke-evidence <path>', 'JSON smoke evidence from `okra self-host smoke --evidence-out`')
  .option('--smoke-passed', 'Mark live self-host smoke as passed for the supplied base URL')
  .action((bundleDir, options: {
    templateUrl?: string;
    evidenceBundle?: string;
    templateEvidence?: string;
    baseUrl?: string;
    modelBacked?: string;
    capabilityEvidence?: string;
    smokeEvidence?: string;
    smokePassed?: boolean;
  }) => {
    const g = globals();
    try {
      const result = createSelfHostRailwayPublishPackArtifact(bundleDir, {
        templateUrl: options.templateUrl,
        evidenceBundlePath: options.evidenceBundle,
        templateEvidencePath: options.templateEvidence,
        deploymentBaseUrl: options.baseUrl,
        modelBackedCapabilities: options.modelBacked
          ?.split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        capabilityEvidencePath: options.capabilityEvidence,
        smokeEvidencePath: options.smokeEvidence,
        smokePassed: options.smokePassed === true,
      });
      writeOutput(formatSelfHostRailwayPublishPackArtifactResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('readiness <bundleDir>')
  .description('Render Railway publish-readiness gates without publishing')
  .option('--template-url <url>', 'Published Railway template URL, when available')
  .option('--evidence-bundle <path>', 'JSON publish evidence bundle from `okra self-host evidence-bundle`')
  .option('--template-evidence <path>', 'JSON Railway template publication evidence from `okra self-host template-evidence`')
  .option('--base-url <url>', 'Deployed self-host base URL, when available')
  .option('--model-backed <capabilityRefs>', 'Comma-separated model-backed capability refs')
  .option('--capability-evidence <path>', 'JSON capability promotion evidence from `okra self-host capability-evidence`')
  .option('--smoke-evidence <path>', 'JSON smoke evidence from `okra self-host smoke --evidence-out`')
  .option('--smoke-passed', 'Mark live self-host smoke as passed for the supplied base URL')
  .action((bundleDir, options: {
    templateUrl?: string;
    evidenceBundle?: string;
    templateEvidence?: string;
    baseUrl?: string;
    modelBacked?: string;
    capabilityEvidence?: string;
    smokeEvidence?: string;
    smokePassed?: boolean;
  }) => {
    const g = globals();
    try {
      const result = createSelfHostRailwayPublishReadinessArtifact(bundleDir, {
        templateUrl: options.templateUrl,
        evidenceBundlePath: options.evidenceBundle,
        templateEvidencePath: options.templateEvidence,
        deploymentBaseUrl: options.baseUrl,
        modelBackedCapabilities: options.modelBacked
          ?.split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        capabilityEvidencePath: options.capabilityEvidence,
        smokeEvidencePath: options.smokeEvidence,
        smokePassed: options.smokePassed === true,
      });
      writeOutput(formatSelfHostRailwayPublishReadinessArtifactResult(result, g.json), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('smoke [baseUrl]')
  .description('Run upload, parse, review workflow smoke checks against a self-host base URL')
  .option('--api-key <apiKey>', 'API key for the target self-host instance')
  .option('--document-id <documentId>', 'Document id to use for the smoke upload')
  .option('--workflow <workflow>', 'Workflow branch to smoke: audit, redact, or both', 'audit')
  .option('--timeout-ms <ms>', 'Upload wait timeout in milliseconds', '5000')
  .option('--evidence-out <path>', 'Write smoke evidence JSON for readiness gates')
  .action(async (baseUrl: string | undefined, options: {
    apiKey?: string;
    documentId?: string;
    workflow?: string;
    timeoutMs?: string;
    evidenceOut?: string;
  }) => {
    const g = globals();
    try {
      const apiKey = options.apiKey ?? getApiKey();
      if (!apiKey) {
        failMissingApiKey(Boolean(g.json));
      }

      const targetBaseUrl = baseUrl ?? getBaseUrl() ?? 'https://api.okrapdf.com';
      const client = new OkraClient({ apiKey, baseUrl: targetBaseUrl });
      const result = await runSelfHostSmoke(client, {
        baseUrl: targetBaseUrl,
        workflow: parseSmokeWorkflow(options.workflow),
        timeoutMs: parsePositiveInt(options.timeoutMs, '--timeout-ms', 5_000),
        ...(options.documentId ? { documentId: options.documentId } : {}),
      });

      if (options.evidenceOut) {
        writeFileSync(options.evidenceOut, `${JSON.stringify(createSelfHostSmokeEvidence(result), null, 2)}\n`);
      }

      writeOutput(g.json ? JSON.stringify(result) : formatSelfHostSmokeResult(result), g.output);
      if (!result.ok) process.exit(1);
    } catch (error) {
      handleError(error, g.json);
    }
  });

selfHostCmd
  .command('serve [bundleDir]')
  .description('Serve a lightweight self-host runtime shell and API')
  .option('--host <host>', 'Host interface to bind', process.env.HOST ?? '0.0.0.0')
  .option('--port <port>', 'Port to bind', process.env.PORT ?? '8787')
  .option('--public-dir <dir>', 'Override static asset directory')
  .action(async (bundleDir, options) => {
    await runSelfHostServeCommand(bundleDir, options);
  });

// ============================================================================
// find command - jQuery-like entity search
// ============================================================================
program
  .command('find <jobId> <selector>', { hidden: true })
  .description('Find entities using jQuery-like selectors')
  .option('-k, --top-k <n>', 'Limit results', parseInt)
  .option('-c, --min-confidence <n>', 'Minimum confidence (0-1)', parseFloat)
  .option('-p, --pages <range>', 'Page range (e.g., 1-10)')
  .option('--sort <by>', 'Sort by (confidence|page|type)')
  .option('--stats', 'Show aggregate statistics')
  .option('-f, --format <format>', 'Output format (text|json|entities|ids)', 'text')
  .action(async (jobId, selector, options) => {
    const g = globals();
    try {
      const client = getClient();
      const fmt = g.json ? 'json' : options.format;
      const pageRange = options.pages
        ? options.pages.split('-').map(Number) as [number, number]
        : undefined;

      const result = await find(client, jobId, selector, {
        topK: options.topK,
        minConfidence: options.minConfidence,
        pageRange,
        sortBy: options.sort,
      });

      if (options.stats && fmt === 'text') {
        writeOutput(formatStats(result.stats), g.output);
      } else {
        writeOutput(formatFindOutput(result, fmt, options.stats), g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// search command - Full-text search
// ============================================================================
program
  .command('search <jobId> <query>', { hidden: true })
  .description('Search page content')
  .option('-f, --format <format>', 'Output format (text|json)', 'text')
  .action(async (jobId, query, options) => {
    const g = globals();
    try {
      const client = getClient();
      const fmt = g.json ? 'json' : options.format;
      const result = await search(client, jobId, query);
      writeOutput(formatSearchOutput(result, fmt), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// facet command - User-deployed facets (dynamic Workers via Worker Loader)
// ============================================================================
function getFacetCtx(): FacetCliCtx {
  const apiKey = getApiKey();
  if (!apiKey) {
    process.stderr.write(getMissingApiKeyMessage() + '\n');
    process.exit(1);
  }
  const baseUrl = getBaseUrl() ?? 'https://api.okrapdf.com';
  return { apiKey, baseUrl };
}

const facetCmd = program
  .command('facet', { hidden: true })
  .description('Deploy and invoke user facets (dynamic Workers pushed via API)');

facetCmd
  .command('deploy <slug> <file>')
  .description('Deploy or update a facet from a JS file')
  .option('-d, --description <text>', 'Description')
  .action(async (slug: string, file: string, options: { description?: string }) => {
    const g = globals();
    try {
      const result = await deployFacet(getFacetCtx(), slug, file, options.description);
      if (g.json) {
        writeOutput(JSON.stringify(result), g.output);
      } else {
        writeOutput(
          `Deployed: ${result.slug}\n  sha:  ${result.sha}\n  size: ${result.size_bytes} bytes\n\nNext:\n  okra facet invoke ${result.slug} -p '{}'\n`,
          g.output,
        );
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

facetCmd
  .command('list')
  .description('List deployed facets')
  .action(async () => {
    const g = globals();
    try {
      const items = await listFacets(getFacetCtx());
      if (g.json) {
        writeOutput(JSON.stringify(items), g.output);
      } else {
        writeOutput(formatFacetList(items), g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

facetCmd
  .command('info <slug>')
  .description('Show facet metadata')
  .action(async (slug: string) => {
    const g = globals();
    try {
      const info = await getFacetInfo(getFacetCtx(), slug);
      writeOutput(JSON.stringify(info, null, 2), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

facetCmd
  .command('invoke <slug>')
  .description('Invoke a facet with a JSON payload')
  .option('-p, --payload <json>', 'Inline JSON payload', '{}')
  .option('-f, --payload-file <path>', 'Read payload from a JSON file')
  .action(async (slug: string, options: { payload: string; payloadFile?: string }) => {
    const g = globals();
    try {
      const payload = options.payloadFile
        ? parseInlineJsonArg(readFileSync(options.payloadFile, 'utf8'), '--payload-file')
        : parseInlineJsonArg(options.payload, '--payload');
      const result = await invokeFacet(getFacetCtx(), slug, payload);
      if (g.json) {
        writeOutput(JSON.stringify(result), g.output);
      } else {
        const lines = [
          `${result.run_id}  ${result.status}  ${result.duration_ms}ms`,
          '',
          'Output:',
          JSON.stringify(result.output, null, 2),
        ];
        if (result.error) {
          lines.push('', `Error: ${result.error}`);
        }
        writeOutput(lines.join('\n'), g.output);
      }
      if (result.status === 'error') process.exit(2);
    } catch (error) {
      handleError(error, g.json);
    }
  });

facetCmd
  .command('runs <slug>')
  .description('List recent invocations of a facet')
  .option('-n, --limit <num>', 'Max runs to list', '20')
  .action(async (slug: string, options: { limit: string }) => {
    const g = globals();
    try {
      const limit = Number.parseInt(options.limit, 10);
      const runs = await listFacetRuns(getFacetCtx(), slug, Number.isFinite(limit) ? limit : 20);
      if (g.json) {
        writeOutput(JSON.stringify(runs), g.output);
      } else {
        writeOutput(formatRunList(runs), g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

facetCmd
  .command('rm <slug>')
  .description('Delete a facet')
  .action(async (slug: string) => {
    const g = globals();
    try {
      const result = await deleteFacetCmd(getFacetCtx(), slug);
      writeOutput(JSON.stringify(result), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

// ============================================================================
// lens command - Document app lenses (dynamic Workers with persisted state)
// ============================================================================
const lensCmd = program
  .command('lens', { hidden: true })
  .description('Deploy and apply document lenses (stateful dynamic document apps)');

lensCmd
  .command('init <file>')
  .description('Write a starter document lens JS file')
  .action(async (file: string) => {
    const g = globals();
    try {
      writeFileSync(file, LENS_STARTER_SOURCE);
      if (g.json) {
        writeOutput(JSON.stringify({ file }), g.output);
      } else {
        writeOutput(`Wrote lens starter: ${file}`, g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

lensCmd
  .command('deploy <slug> <file>')
  .description('Deploy or update a document lens from a JS file')
  .option('-d, --description <text>', 'Description')
  .action(async (slug: string, file: string, options: { description?: string }) => {
    const g = globals();
    try {
      const result = await deployLens(getFacetCtx(), slug, file, options.description);
      if (g.json) {
        writeOutput(JSON.stringify(result), g.output);
      } else {
        writeOutput(
          `Deployed lens: ${result.slug}\n  sha:  ${result.sha}\n  size: ${result.size_bytes} bytes\n\nNext:\n  okra lens apply ${result.slug} --doc <document_id> -p '{}'\n`,
          g.output,
        );
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

lensCmd
  .command('list')
  .description('List deployed document lenses')
  .action(async () => {
    const g = globals();
    try {
      const items = await listLenses(getFacetCtx());
      if (g.json) {
        writeOutput(JSON.stringify(items), g.output);
      } else {
        writeOutput(formatFacetList(items), g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

lensCmd
  .command('info <slug>')
  .description('Show lens metadata')
  .action(async (slug: string) => {
    const g = globals();
    try {
      const info = await getLensInfo(getFacetCtx(), slug);
      writeOutput(JSON.stringify(info, null, 2), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

lensCmd
  .command('apply <slug>')
  .description('Apply a lens to a document and persist lens state')
  .requiredOption('--doc <documentId>', 'Document id')
  .option('-p, --payload <json>', 'Inline JSON payload', '{}')
  .option('-f, --payload-file <path>', 'Read payload from a JSON file')
  .option('--cursor <json>', 'Override incremental cursor')
  .option('--state <json>', 'Override previous lens state')
  .option('--reset', 'Clear previous state before applying')
  .action(async (slug: string, options: {
    doc: string;
    payload: string;
    payloadFile?: string;
    cursor?: string;
    state?: string;
    reset?: boolean;
  }) => {
    const g = globals();
    try {
      const payload = options.payloadFile
        ? parseInlineJsonArg(readFileSync(options.payloadFile, 'utf8'), '--payload-file')
        : parseInlineJsonArg(options.payload, '--payload');
      const result = await applyLens(getFacetCtx(), slug, {
        documentId: options.doc,
        payload,
        cursor: options.cursor ? parseInlineJsonArg(options.cursor, '--cursor') : undefined,
        state: options.state ? parseInlineJsonArg(options.state, '--state') : undefined,
        reset: options.reset === true,
      });
      if (g.json) {
        writeOutput(JSON.stringify(result), g.output);
      } else {
        writeOutput(formatLensApply(result), g.output);
      }
      if (result.status === 'error') process.exit(2);
    } catch (error) {
      handleError(error, g.json);
    }
  });

lensCmd
  .command('state <slug>')
  .description('Show persisted lens state for a document')
  .requiredOption('--doc <documentId>', 'Document id')
  .action(async (slug: string, options: { doc: string }) => {
    const g = globals();
    try {
      const state = await getLensState(getFacetCtx(), slug, options.doc);
      writeOutput(JSON.stringify(state, null, 2), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

lensCmd
  .command('runs <slug>')
  .description('List recent lens invocations')
  .option('-n, --limit <num>', 'Max runs to list', '20')
  .action(async (slug: string, options: { limit: string }) => {
    const g = globals();
    try {
      const limit = Number.parseInt(options.limit, 10);
      const runs = await listLensRuns(getFacetCtx(), slug, Number.isFinite(limit) ? limit : 20);
      if (g.json) {
        writeOutput(JSON.stringify(runs), g.output);
      } else {
        writeOutput(formatRunList(runs), g.output);
      }
    } catch (error) {
      handleError(error, g.json);
    }
  });

lensCmd
  .command('rm <slug>')
  .description('Delete a lens')
  .action(async (slug: string) => {
    const g = globals();
    try {
      const result = await deleteLensCmd(getFacetCtx(), slug);
      writeOutput(JSON.stringify(result), g.output);
    } catch (error) {
      handleError(error, g.json);
    }
  });

/**
 * Detect JSON-output intent from the raw user args (used at the top-level error
 * boundary, before a command's own globals() runs). Mirrors
 * normalizeGlobalFlags: explicit -j/--json or -o json, else piped stdout.
 */
/** A command and all its descendants (exitOverride is per-command). */
function collectCommandsDeep(cmd: Command): Command[] {
  const out: Command[] = [cmd];
  for (const sub of cmd.commands) out.push(...collectCommandsDeep(sub));
  return out;
}

type ExitCallbackHolder = { _exitCallback?: unknown };

/** Commander "errors" that are actually informational output, not failures. */
const INFORMATIONAL_COMMANDER_CODES = new Set([
  'commander.help',
  'commander.helpDisplayed',
  'commander.version',
]);

function isCommanderError(error: unknown): error is CommanderError {
  return (
    !!error &&
    typeof error === 'object' &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('commander.') &&
    typeof (error as { exitCode?: unknown }).exitCode === 'number'
  );
}

function wantsJsonOutput(userArgs: string[]): boolean {
  if (userArgs.includes('-j') || userArgs.includes('--json')) return true;
  const oi = userArgs.findIndex((a) => a === '-o' || a === '--output');
  if (oi >= 0 && userArgs[oi + 1] === 'json') return true;
  return process.stdout.isTTY !== true;
}

/**
 * Run the CLI, routing Commander's own usage errors (missing argument, unknown
 * option/command, invalid choice, excess args) through the same JSON envelope
 * the rest of the CLI uses. Without this, a mis-invocation under `--json` writes
 * only a human message to stderr and exits 1, leaving an agent parsing stdout
 * with empty output instead of the documented { ok:false, error, code,
 * next_actions } contract. Help/version are informational (exitCode 0) and pass
 * through untouched. Used by both the direct-execution entry and the published
 * `okra` bin (via index.ts runCli).
 */
export async function runProgram(argv?: string[]): Promise<void> {
  const userArgs = (argv ?? process.argv).slice(2);
  // exitOverride only affects the command it's set on, so apply it to every
  // command (a subcommand's missing-arg would otherwise bypass this catch).
  // Save/restore _exitCallback so runProgram doesn't leak the override onto the
  // shared `program` singleton that other call sites and tests reuse (commander
  // exposes no public unset).
  const commands = collectCommandsDeep(program);
  const savedCallbacks = commands.map((c) => (c as unknown as ExitCallbackHolder)._exitCallback);
  for (const c of commands) c.exitOverride();
  try {
    await program.parseAsync(argv ?? process.argv);
  } catch (error) {
    // Duck-type rather than `instanceof CommanderError`: commander is CJS and
    // the thrown error's class identity can differ from the imported symbol
    // across bundler/test boundaries. Commander errors carry a string `code`
    // ("commander.*") and a numeric `exitCode`. (Explicit `return`s after each
    // process.exit keep the control flow correct when exit is stubbed in tests.)
    if (isCommanderError(error)) {
      // Help/version are informational, not failures — commander has already
      // written the text (to stdout for --help/--version, stderr for bare
      // `okra`). Preserve its native exit code and don't emit an error envelope.
      // Note `commander.help` (bare-command help) has exitCode 1, so key off the
      // code, not the exit code.
      if (INFORMATIONAL_COMMANDER_CODES.has(error.code)) {
        process.exit(error.exitCode);
        return;
      }
      const command = inferCommandFromArgv(userArgs);
      if (wantsJsonOutput(userArgs)) {
        setOutputContext({ json: true, command });
        const helpCmd = command ? `okra ${command} --help` : 'okra --help';
        handleError(
          new OkraRuntimeError('INVALID_REQUEST', error.message, 400, {
            error: 'invalid_usage',
            message: error.message,
            next_actions: [
              { cmd: helpCmd, why: 'Show the usage and accepted arguments for this command.' },
            ],
          }),
          true,
        );
        return;
      }
      // Non-JSON: Commander already wrote the message + help to stderr.
      process.exit(error.exitCode || 1);
      return;
    }
    throw error;
  } finally {
    commands.forEach((c, i) => {
      (c as unknown as ExitCallbackHolder)._exitCallback = savedCallbacks[i];
    });
  }
}

if (isDirectExecution()) {
  void runProgram();
}
