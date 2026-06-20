import { createHash, timingSafeEqual } from 'crypto';
import { type Server } from 'http';
import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, resolve, sep } from 'path';
import { validateSelfHostBundle, type SelfHostValidationResult } from './self-host';
import { localAudit, localParse, localRedact } from './local-capabilities.js';

export interface SelfHostRuntimeRecipeSummary {
  id: string;
  name: string;
  version?: string;
  sourcePath: string;
  capabilityRefs: string[];
  graphReads: string[];
  graphWrites: string[];
  steps: SelfHostRuntimeRecipeStepSummary[];
}

export interface SelfHostRuntimeRecipeStepSummary {
  id: string;
  name: string;
  uses: string;
  reads: string[];
  writes: string[];
  requiresReview: boolean;
}

export interface SelfHostRuntimeCapabilitySummary {
  id: string;
  kind: string;
  name: string;
  sourcePath: string;
  namespace: string;
  networkNamespace: string;
}

export interface SelfHostRuntimeWorkflowExportSummary {
  name: string;
  sourcePath: string;
  recipeId?: string;
  requiredEnv: string[];
}

export interface SelfHostRuntimeServiceSummary {
  id: string;
  name: string;
  kind: string;
  runtime: string;
  public: boolean;
  required: boolean;
  networkRefs: string[];
  capabilityRef?: string;
  recipeCatalogRef?: string;
}

export interface SelfHostRuntimeDockerNetworkSummary {
  id: string;
  name: string;
  kind: string;
  dockerName: string;
  internal: boolean;
  external: boolean;
  attachable: boolean;
  capabilityRefs: string[];
}

export interface SelfHostRuntimeStatus {
  object: 'self_host_runtime_status';
  ok: boolean;
  root: string;
  schemaVersion?: string;
  uiRuntime?: string;
  apiRuntime?: string;
  auth: SelfHostRuntimeAuthStatus;
  deploymentTargets: string[];
  validation: SelfHostValidationResult;
  services: SelfHostRuntimeServiceSummary[];
  dockerNetworks: SelfHostRuntimeDockerNetworkSummary[];
  recipes: SelfHostRuntimeRecipeSummary[];
  capabilities: SelfHostRuntimeCapabilitySummary[];
  n8nWorkflows: SelfHostRuntimeWorkflowExportSummary[];
  endpoints: string[];
}

export interface SelfHostRuntimeRequestOptions {
  bundleDir: string;
  dataDir?: string;
  env?: Record<string, string | undefined>;
  publicDir?: string;
  capabilityFetch?: typeof fetch;
}

export interface SelfHostRuntimeServerOptions extends SelfHostRuntimeRequestOptions {
  host?: string;
  port?: number;
}

export interface StartedSelfHostRuntimeServer {
  server: Server;
  url: string;
  close: () => Promise<void>;
}

interface StarterSourceRef {
  object: 'source_ref';
  id: string;
  kind: 'local_upload' | 'url' | 'n8n_webhook';
  status: 'accepted';
  received_at: string;
  filename?: string;
  uri?: string;
  content_type?: string;
  size_bytes?: number;
  sha256?: string;
  payload_keys?: string[];
}

interface StarterDocumentGraph {
  schema_version: 'okra-document-graph/v1';
  source: Record<string, unknown>;
  document: {
    id: string;
    source_id: string;
    sha256?: string;
    filename?: string;
    mime_type: string;
    lifecycle_state: 'ready';
    permissions: { access: 'private' };
  };
  pages: Array<Record<string, unknown>>;
  blocks: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
  redactions: Array<Record<string, unknown>>;
  reviews: Array<Record<string, unknown>>;
  lineage: Array<Record<string, unknown>>;
}

interface StarterWorkflowRun {
  object: 'workflow_run';
  id: string;
  status: 'succeeded';
  mode: 'self_host_starter' | 'external_http';
  recipe_id: string;
  source_id: string | null;
  document_id: string;
  graph_writes: string[];
  graph_url: string;
  review_url: string;
  message: string;
  capability_runs: StarterCapabilityRun[];
}

interface StarterCapabilityRun {
  object: 'capability_run';
  id: string;
  workflow_run_id: string;
  recipe_id: string;
  step_id: string;
  capability_id: string;
  status: 'succeeded';
  mode: 'self_host_starter' | 'external_http';
  graph_writes: string[];
  started_at: string;
  completed_at: string;
  output: Record<string, unknown>;
  endpoint_url?: string;
}

interface SelfHostRuntimeAuthConfig {
  authMode: string;
  registrationMode: string;
  apiKey?: string;
}

interface SelfHostRuntimeAuthBootstrapStatus {
  mode: string;
  owner_email_env: string;
  owner_email_configured: boolean;
  api_key_env: string;
  registration_mode: string;
  protected_routes: string[];
  notes?: string;
}

interface SelfHostRuntimeAuthStatus {
  auth_mode: string;
  registration_mode: string;
  api_key_configured: boolean;
  first_owner_configured: boolean;
  bootstrap: SelfHostRuntimeAuthBootstrapStatus;
  protected_routes: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) return listJsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  });
}

function catalogPaths(runtime: Record<string, unknown>, key: 'recipe_catalogs' | 'capability_catalogs'): string[] {
  const catalogs = Array.isArray(runtime[key]) ? runtime[key] : [];
  return catalogs.flatMap((catalog) => {
    if (!isRecord(catalog) || typeof catalog.path !== 'string') return [];
    return [catalog.path];
  });
}

function loadRuntimeManifest(root: string): Record<string, unknown> | null {
  const path = join(root, 'runtime.manifest.json');
  if (!existsSync(path)) return null;
  const manifest = readJson(path);
  return isRecord(manifest) ? manifest : null;
}

function recipeSteps(value: unknown): SelfHostRuntimeRecipeStepSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((step) => {
    if (!isRecord(step) || typeof step.id !== 'string' || typeof step.uses !== 'string') {
      return [];
    }
    return [{
      id: step.id,
      name: typeof step.name === 'string' ? step.name : step.id,
      uses: step.uses,
      reads: stringArray(step.reads),
      writes: stringArray(step.writes),
      requiresReview: step.requires_review === true,
    }];
  });
}

function loadRecipeSummaries(root: string, runtime: Record<string, unknown> | null): SelfHostRuntimeRecipeSummary[] {
  const paths = runtime ? catalogPaths(runtime, 'recipe_catalogs') : ['./recipes'];
  const recipes: SelfHostRuntimeRecipeSummary[] = [];

  for (const path of paths) {
    const catalogPath = resolve(root, path);
    if (!existsSync(catalogPath)) continue;
    const files = statSync(catalogPath).isDirectory() ? listJsonFiles(catalogPath) : [catalogPath];
    for (const file of files.filter((item) => item.endsWith('.recipe.json'))) {
      const recipe = readJson(file);
      if (!isRecord(recipe) || typeof recipe.id !== 'string') continue;
      const graphContract = isRecord(recipe.graph_contract) ? recipe.graph_contract : {};
      const graphReads = stringArray(recipe.graph_reads);
      const graphWrites = stringArray(recipe.graph_writes);
      const steps = recipeSteps(recipe.steps);
      recipes.push({
        id: recipe.id,
        name: typeof recipe.name === 'string' ? recipe.name : recipe.id,
        ...(typeof recipe.version === 'string' ? { version: recipe.version } : {}),
        sourcePath: file,
        capabilityRefs: stringArray(recipe.capability_refs),
        graphReads: graphReads.length ? graphReads : stringArray(graphContract.reads),
        graphWrites: graphWrites.length ? graphWrites : stringArray(graphContract.writes),
        steps,
      });
    }
  }

  return recipes.sort((a, b) => a.id.localeCompare(b.id));
}

function loadCapabilitySummaries(
  root: string,
  runtime: Record<string, unknown> | null,
): SelfHostRuntimeCapabilitySummary[] {
  const paths = runtime ? catalogPaths(runtime, 'capability_catalogs') : ['./capabilities'];
  const capabilities: SelfHostRuntimeCapabilitySummary[] = [];

  for (const path of paths) {
    const catalogPath = resolve(root, path);
    if (!existsSync(catalogPath)) continue;
    const files = statSync(catalogPath).isDirectory() ? listJsonFiles(catalogPath) : [catalogPath];
    for (const file of files.filter((item) => item.endsWith('.engine.json'))) {
      const capability = readJson(file);
      if (!isRecord(capability) || typeof capability.id !== 'string') continue;
      const isolation = isRecord(capability.isolation) ? capability.isolation : {};
      capabilities.push({
        id: capability.id,
        kind: typeof capability.kind === 'string' ? capability.kind : 'unknown',
        name: typeof capability.name === 'string' ? capability.name : capability.id,
        sourcePath: file,
        namespace: typeof isolation.namespace === 'string' ? isolation.namespace : '',
        networkNamespace:
          typeof isolation.network_namespace === 'string' ? isolation.network_namespace : '',
      });
    }
  }

  return capabilities.sort((a, b) => a.id.localeCompare(b.id));
}

function loadN8nWorkflowSummaries(
  root: string,
  runtime: Record<string, unknown> | null,
): SelfHostRuntimeWorkflowExportSummary[] {
  const catalogs = runtime && Array.isArray(runtime.recipe_catalogs) ? runtime.recipe_catalogs : [];
  const paths = catalogs.flatMap((catalog) => {
    if (!isRecord(catalog) || catalog.kind !== 'n8n_export' || typeof catalog.path !== 'string') {
      return [];
    }
    return [catalog.path];
  });
  const workflows: SelfHostRuntimeWorkflowExportSummary[] = [];

  for (const path of paths) {
    const catalogPath = resolve(root, path);
    if (!existsSync(catalogPath)) continue;
    const files = statSync(catalogPath).isDirectory() ? listJsonFiles(catalogPath) : [catalogPath];
    for (const file of files.filter((item) => item.endsWith('.workflow.json'))) {
      const workflow = readJson(file);
      if (!isRecord(workflow)) continue;
      const meta = isRecord(workflow.meta) ? workflow.meta : {};
      const okrapdf = isRecord(meta.okrapdf) ? meta.okrapdf : {};
      workflows.push({
        name: typeof workflow.name === 'string' ? workflow.name : file,
        sourcePath: file,
        ...(typeof okrapdf.recipe_id === 'string' ? { recipeId: okrapdf.recipe_id } : {}),
        requiredEnv: stringArray(okrapdf.required_env),
      });
    }
  }

  return workflows.sort((a, b) => a.name.localeCompare(b.name));
}

function loadRuntimeServiceSummaries(runtime: Record<string, unknown> | null): SelfHostRuntimeServiceSummary[] {
  const services = Array.isArray(runtime?.services) ? runtime.services : [];
  return services.flatMap((service) => {
    if (!isRecord(service) || typeof service.id !== 'string') return [];
    return [{
      id: service.id,
      name: typeof service.name === 'string' ? service.name : service.id,
      kind: typeof service.kind === 'string' ? service.kind : '',
      runtime: typeof service.runtime === 'string' ? service.runtime : '',
      public: service.public === true,
      required: service.required !== false,
      networkRefs: stringArray(service.network_refs),
      ...(typeof service.capability_ref === 'string' ? { capabilityRef: service.capability_ref } : {}),
      ...(typeof service.recipe_catalog_ref === 'string' ? { recipeCatalogRef: service.recipe_catalog_ref } : {}),
    }];
  });
}

function loadRuntimeDockerNetworkSummaries(
  runtime: Record<string, unknown> | null,
): SelfHostRuntimeDockerNetworkSummary[] {
  const networks = Array.isArray(runtime?.docker_networks) ? runtime.docker_networks : [];
  return networks.flatMap((network) => {
    if (!isRecord(network) || typeof network.id !== 'string') return [];
    const docker = isRecord(network.docker) ? network.docker : {};
    return [{
      id: network.id,
      name: typeof network.name === 'string' ? network.name : network.id,
      kind: typeof network.kind === 'string' ? network.kind : '',
      dockerName: typeof docker.name === 'string' ? docker.name : network.id,
      internal: docker.internal === true,
      external: docker.external === true,
      attachable: docker.attachable === true,
      capabilityRefs: stringArray(network.capability_refs),
    }];
  });
}

function runtimeEnv(options?: Pick<SelfHostRuntimeRequestOptions, 'env'>): Record<string, string | undefined> {
  return options?.env ?? process.env;
}

function stringEnv(
  env: Record<string, string | undefined>,
  name: string,
  fallback: string,
): string {
  const value = env[name]?.trim();
  return value ? value : fallback;
}

function authConfigFromEnv(env: Record<string, string | undefined>): SelfHostRuntimeAuthConfig {
  const apiKey = env.OKRA_API_KEY?.trim();
  return {
    authMode: stringEnv(env, 'OKRA_AUTH_MODE', 'single_owner'),
    registrationMode: stringEnv(env, 'OKRA_REGISTRATION_MODE', 'invite_only'),
    ...(apiKey ? { apiKey } : {}),
  };
}

function protectedRouteList(): string[] {
  return [
    'POST /document/:id/upload',
    'POST /document/:id/upload-url',
    'POST /v1/sources/n8n',
    'POST /v1/workflows',
  ];
}

function authBootstrapFromRuntime(
  runtime: Record<string, unknown> | null,
  config: SelfHostRuntimeAuthConfig,
  env: Record<string, string | undefined>,
): SelfHostRuntimeAuthBootstrapStatus {
  const bootstrap = isRecord(runtime?.auth_bootstrap) ? runtime.auth_bootstrap : {};
  const ownerEmailEnv = typeof bootstrap.owner_email_env === 'string'
    ? bootstrap.owner_email_env
    : 'OKRA_FIRST_OWNER_EMAIL';
  const apiKeyEnv = typeof bootstrap.api_key_env === 'string' ? bootstrap.api_key_env : 'OKRA_API_KEY';
  const protectedRoutes = stringArray(bootstrap.protected_routes);
  return {
    mode: typeof bootstrap.mode === 'string' ? bootstrap.mode : 'single_owner_api_key',
    owner_email_env: ownerEmailEnv,
    owner_email_configured: Boolean(env[ownerEmailEnv]?.trim()),
    api_key_env: apiKeyEnv,
    registration_mode:
      typeof bootstrap.registration_mode === 'string'
        ? bootstrap.registration_mode
        : config.registrationMode,
    protected_routes: protectedRoutes.length ? protectedRoutes : protectedRouteList(),
    ...(typeof bootstrap.notes === 'string' ? { notes: bootstrap.notes } : {}),
  };
}

function authStatusFromConfig(
  config: SelfHostRuntimeAuthConfig,
  runtime: Record<string, unknown> | null,
  env: Record<string, string | undefined>,
): SelfHostRuntimeAuthStatus {
  const bootstrap = authBootstrapFromRuntime(runtime, config, env);
  return {
    auth_mode: config.authMode,
    registration_mode: config.registrationMode,
    api_key_configured: Boolean(config.apiKey),
    first_owner_configured: bootstrap.owner_email_configured,
    bootstrap,
    protected_routes: protectedRouteList(),
  };
}

function protectedByApiKey(method: string, pathname: string): boolean {
  if (method !== 'POST') return false;
  if (pathname === '/v1/sources/n8n' || pathname === '/v1/workflows') return true;
  return /^\/document\/[^/]+\/(?:upload|upload-url)$/.test(pathname);
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function secretsEqual(candidate: string | null | undefined, expected: string): boolean {
  if (!candidate) return false;
  const left = createHash('sha256').update(candidate).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

function hasRuntimeApiKey(request: Request, config: SelfHostRuntimeAuthConfig): boolean {
  if (!config.apiKey) return true;
  return (
    secretsEqual(bearerToken(request.headers.get('authorization')), config.apiKey) ||
    secretsEqual(request.headers.get('x-okra-api-key'), config.apiKey)
  );
}

function unauthorizedResponse(): Response {
  const response = jsonResponse({
    object: 'error',
    code: 'UNAUTHORIZED',
    error: 'unauthorized',
    message: 'Missing or invalid OKRA_API_KEY credential.',
  }, 401);
  response.headers.set('www-authenticate', 'Bearer realm="okra-self-host"');
  return response;
}

export function createSelfHostRuntimeStatus(
  bundleDir: string,
  env: Record<string, string | undefined> = process.env,
): SelfHostRuntimeStatus {
  const root = resolve(bundleDir);
  const runtime = loadRuntimeManifest(root);
  const validation = validateSelfHostBundle(root);
  const auth = authConfigFromEnv(env);

  return {
    object: 'self_host_runtime_status',
    ok: validation.ok,
    root,
    ...(typeof runtime?.schema_version === 'string' ? { schemaVersion: runtime.schema_version } : {}),
    ...(typeof runtime?.ui_runtime === 'string' ? { uiRuntime: runtime.ui_runtime } : {}),
    ...(typeof runtime?.api_runtime === 'string' ? { apiRuntime: runtime.api_runtime } : {}),
    auth: authStatusFromConfig(auth, runtime, env),
    deploymentTargets: stringArray(runtime?.deployment_targets),
    validation,
    services: loadRuntimeServiceSummaries(runtime),
    dockerNetworks: loadRuntimeDockerNetworkSummaries(runtime),
    recipes: loadRecipeSummaries(root, runtime),
    capabilities: loadCapabilitySummaries(root, runtime),
    n8nWorkflows: loadN8nWorkflowSummaries(root, runtime),
    endpoints: [
      'GET /health',
      'GET /v1/self-host/status',
      'GET /v1/runtime/manifest',
      'GET /v1/workflows/catalog',
      'GET /v1/capabilities',
      'GET /v1/runs/:id',
      'GET /v1/capability-runs/:id',
      'POST /document/:id/upload',
      'POST /document/:id/upload-url',
      'GET /document/:id/status',
      'GET /document/:id/full.md',
      'GET /document/:id/pages',
      'GET /document/:id/nodes',
      'GET /v1/documents/:id/graph',
      'GET /v1/documents/:id/reviews',
      'POST /v1/sources/n8n',
      'POST /v1/workflows',
    ],
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function textResponse(value: string, status = 200, contentType = 'text/plain; charset=utf-8'): Response {
  return new Response(value, {
    status,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store',
    },
  });
}

function binaryResponse(bytes: Uint8Array, contentType = 'application/octet-stream'): Response {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store',
    },
  });
}

function mimeType(path: string): string {
  switch (extname(path)) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function resolveStaticPath(root: string, pathname: string): string | null {
  const publicRoot = resolve(root);
  const decoded = decodeURIComponent(pathname);
  const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = resolve(publicRoot, relativePath);
  const insideRoot = candidate === publicRoot || candidate.startsWith(`${publicRoot}${sep}`);
  if (!insideRoot || !existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return candidate;
}

function fallbackIndex(status: SelfHostRuntimeStatus): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <title>okraPDF Self-Host</title>',
    '  <style>body{font-family:system-ui,sans-serif;margin:2rem;line-height:1.45}code{background:#f4f4f5;padding:.1rem .25rem;border-radius:.25rem}</style>',
    '</head>',
    '<body>',
    '  <main>',
    '    <h1>okraPDF Self-Host</h1>',
    `    <p>Runtime status: <strong>${status.ok ? 'valid' : 'invalid'}</strong></p>`,
    `    <p>Recipes: ${status.recipes.length} · Capabilities: ${status.capabilities.length} · n8n workflows: ${status.n8nWorkflows.length}</p>`,
    '    <p><code>/v1/self-host/status</code></p>',
    '  </main>',
    '</body>',
    '</html>',
  ].join('\n');
}

async function readRequestJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function stableId(prefix: string, value: unknown): string {
  const hash = createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
  return `${prefix}_${hash}`;
}

function sha256Hex(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function runtimeDataDir(root: string, options: SelfHostRuntimeRequestOptions): string {
  const env = runtimeEnv(options);
  return resolve(options.dataDir ?? env.OKRA_DATA_DIR ?? join(root, '.runtime-data'));
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function sourcePath(dataDir: string, sourceId: string): string {
  return join(dataDir, 'sources', `${sourceId}.json`);
}

function graphPath(dataDir: string, documentId: string): string {
  return join(dataDir, 'documents', documentId, 'graph.json');
}

function originalPath(dataDir: string, documentId: string): string {
  return join(dataDir, 'documents', documentId, 'original.pdf');
}

function runPath(dataDir: string, runId: string): string {
  return join(dataDir, 'runs', `${runId}.json`);
}

function capabilityRunPath(dataDir: string, runId: string): string {
  return join(dataDir, 'capability-runs', `${runId}.json`);
}

function writeJson(path: string, value: unknown): void {
  ensureDir(resolve(path, '..'));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readSource(dataDir: string, sourceId: string): StarterSourceRef | null {
  const path = sourcePath(dataDir, sourceId);
  if (!existsSync(path)) return null;
  const source = readJson(path);
  return isRecord(source) && source.object === 'source_ref'
    ? source as unknown as StarterSourceRef
    : null;
}

function writeSource(dataDir: string, source: StarterSourceRef): StarterSourceRef {
  writeJson(sourcePath(dataDir, source.id), source);
  return source;
}

function readGraph(dataDir: string, documentId: string): StarterDocumentGraph | null {
  const path = graphPath(dataDir, documentId);
  if (!existsSync(path)) return null;
  const graph = readJson(path);
  return isRecord(graph) && graph.schema_version === 'okra-document-graph/v1'
    ? graph as unknown as StarterDocumentGraph
    : null;
}

function writeGraph(dataDir: string, graph: StarterDocumentGraph): StarterDocumentGraph {
  writeJson(graphPath(dataDir, graph.document.id), graph);
  return graph;
}

function readWorkflowRun(dataDir: string, runId: string): StarterWorkflowRun | null {
  const path = runPath(dataDir, runId);
  if (!existsSync(path)) return null;
  const run = readJson(path);
  return isRecord(run) && run.object === 'workflow_run'
    ? run as unknown as StarterWorkflowRun
    : null;
}

function readCapabilityRun(dataDir: string, runId: string): StarterCapabilityRun | null {
  const path = capabilityRunPath(dataDir, runId);
  if (!existsSync(path)) return null;
  const run = readJson(path);
  return isRecord(run) && run.object === 'capability_run'
    ? run as unknown as StarterCapabilityRun
    : null;
}

function capabilityEnvName(capabilityId: string): string {
  return `OKRA_CAPABILITY_${capabilityId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_URL`;
}

function capabilityEndpointMap(env: Record<string, string | undefined>): Map<string, string> {
  const endpoints = new Map<string, string>();
  const raw = env.OKRA_CAPABILITY_ENDPOINTS?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isRecord(parsed)) {
        for (const [capabilityId, endpoint] of Object.entries(parsed)) {
          if (typeof endpoint === 'string' && endpoint.trim()) {
            endpoints.set(capabilityId, endpoint.trim());
          }
        }
      }
    } catch {
      // Invalid endpoint maps are ignored here; deployment validation surfaces
      // static manifest issues, while runtime health should not leak secrets.
    }
  }
  return endpoints;
}

function capabilityEndpointFor(
  capabilityId: string,
  env: Record<string, string | undefined>,
): string | null {
  const perCapability = env[capabilityEnvName(capabilityId)]?.trim();
  if (perCapability) return perCapability;
  return capabilityEndpointMap(env).get(capabilityId) ?? null;
}

function capabilityProtocolUrl(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/v1/capability-runs';
  }
  return url.toString();
}

function mergeGraphArrayById(
  target: Array<Record<string, unknown>>,
  patch: unknown,
  runId: string,
  key: string,
): void {
  if (!Array.isArray(patch)) return;
  for (const item of patch) {
    if (!isRecord(item)) continue;
    const normalized: Record<string, unknown> = {
      ...item,
      ...(typeof item.created_by_run_id === 'string' ? {} : { created_by_run_id: runId }),
    };
    const identity = normalized[key];
    const index = target.findIndex((entry) => entry[key] === identity);
    if (typeof identity !== 'undefined' && index >= 0) {
      target[index] = { ...target[index], ...normalized };
    } else {
      target.push(normalized);
    }
  }
}

function applyGraphPatch(
  graph: StarterDocumentGraph,
  patch: unknown,
  runId: string,
): void {
  if (!isRecord(patch)) return;
  if (isRecord(patch.source)) graph.source = { ...graph.source, ...patch.source };
  if (isRecord(patch.document)) graph.document = { ...graph.document, ...patch.document };
  mergeGraphArrayById(graph.pages, patch.pages, runId, 'page_number');
  mergeGraphArrayById(graph.blocks, patch.blocks, runId, 'id');
  mergeGraphArrayById(graph.artifacts, patch.artifacts, runId, 'id');
  mergeGraphArrayById(graph.findings, patch.findings, runId, 'id');
  mergeGraphArrayById(graph.redactions, patch.redactions, runId, 'id');
  mergeGraphArrayById(graph.reviews, patch.reviews, runId, 'id');
}

function pageCountFromPdf(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString('latin1');
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return Math.max(1, matches?.length ?? 1);
}

function sourceToDocumentId(sourceId: string): string {
  return `doc-${sha256Hex(sourceId).slice(0, 20)}`;
}

function createStarterGraph(
  source: StarterSourceRef,
  documentId = sourceToDocumentId(source.id),
  options: { pageCount?: number; runId?: string } = {},
): StarterDocumentGraph {
  const now = new Date().toISOString();
  const pageCount = Math.max(1, options.pageCount ?? 1);
  const runId = options.runId ?? stableId('run_graph', { sourceId: source.id, documentId });
  const pages = Array.from({ length: pageCount }, (_, index) => ({
    page_number: index + 1,
    width: 612,
    height: 792,
    rendered_assets: [],
    text_state: source.kind === 'url' ? 'pending_ocr' : 'uploaded',
  }));
  const blocks = [
    {
      id: 'blk_source_summary',
      kind: 'paragraph',
      page_number: 1,
      text: [
        source.filename ? `File: ${source.filename}` : null,
        source.uri ? `Source: ${source.uri}` : null,
        `Ingested through ${source.kind}.`,
      ].filter(Boolean).join(' '),
      bbox: { x: 0.08, y: 0.08, w: 0.84, h: 0.08 },
      confidence: 1,
      created_by_run_id: runId,
    },
  ];
  const graph: StarterDocumentGraph = {
    schema_version: 'okra-document-graph/v1',
    source: {
      id: source.id,
      kind: source.kind,
      ...(source.uri ? { uri: source.uri } : {}),
      ...(source.filename ? { filename: source.filename } : {}),
      ...(source.content_type ? { content_type: source.content_type } : {}),
      ...(typeof source.size_bytes === 'number' ? { size_bytes: source.size_bytes } : {}),
      ...(source.sha256 ? { sha256: source.sha256 } : {}),
    },
    document: {
      id: documentId,
      source_id: source.id,
      ...(source.sha256 ? { sha256: source.sha256 } : {}),
      ...(source.filename ? { filename: source.filename } : {}),
      mime_type: source.content_type ?? 'application/pdf',
      lifecycle_state: 'ready',
      permissions: { access: 'private' },
    },
    pages,
    blocks,
    artifacts: [
      {
        id: 'art_document_graph',
        kind: 'json',
        path: `/v1/documents/${encodeURIComponent(documentId)}/graph`,
        media_type: 'application/json',
        created_by_run_id: runId,
      },
      ...(source.kind === 'local_upload'
        ? [{
            id: 'art_original_pdf',
            kind: 'original_pdf',
            path: `/document/${encodeURIComponent(documentId)}/download`,
            media_type: 'application/pdf',
            created_by_run_id: runId,
          }]
        : []),
    ],
    findings: [],
    redactions: [],
    reviews: [],
    lineage: [
      {
        run_id: runId,
        engine_id: 'sourcer.local-upload',
        engine_version: '0.1.0',
        runtime: 'self_host_starter',
        params_hash: `sha256:${sha256Hex(JSON.stringify({ sourceId: source.id }))}`,
        input_hash: source.sha256 ? `sha256:${source.sha256}` : `sha256:${sha256Hex(source.id)}`,
        output_hash: `sha256:${sha256Hex(`${documentId}:${runId}`)}`,
        duration_ms: 0,
        cost: { amount: 0, currency: 'USD' },
        status: 'succeeded',
        created_at: now,
      },
    ],
  };

  return graph;
}

class CapabilityDispatchError extends Error {
  readonly capabilityId: string;
  readonly status: number;

  constructor(capabilityId: string, message: string, status = 502) {
    super(message);
    this.name = 'CapabilityDispatchError';
    this.capabilityId = capabilityId;
    this.status = status;
  }
}

function createCapabilityRunId(
  workflowRunId: string,
  recipeId: string,
  stepId: string,
  capabilityId: string,
): string {
  return stableId('caprun', {
    workflowRunId,
    recipeId,
    stepId,
    capabilityId,
  });
}

function appendLineage(
  graph: StarterDocumentGraph,
  run: StarterCapabilityRun,
  inputHash: string,
): void {
  // Idempotent: re-running the same verb on the same document reuses the stable
  // run id, so replace any existing lineage entry instead of duplicating it.
  const entry = {
    run_id: run.id,
    engine_id: run.capability_id,
    engine_version: '0.1.0',
    runtime: run.mode,
    params_hash: `sha256:${sha256Hex(JSON.stringify({ recipeId: run.recipe_id, stepId: run.step_id }))}`,
    input_hash: inputHash,
    output_hash: `sha256:${sha256Hex(JSON.stringify(run.output))}`,
    duration_ms: 0,
    cost: { amount: 0, currency: 'USD' },
    status: run.status,
    created_at: run.completed_at,
  };
  const existing = graph.lineage.findIndex((item) => item.run_id === entry.run_id);
  if (existing >= 0) graph.lineage[existing] = entry;
  else graph.lineage.push(entry);
}

function applyStarterCapabilityStep(
  graph: StarterDocumentGraph,
  recipe: SelfHostRuntimeRecipeSummary,
  step: SelfHostRuntimeRecipeStepSummary,
  workflowRunId: string,
  dataDir: string,
): StarterCapabilityRun {
  const startedAt = new Date().toISOString();
  const capabilityRunId = createCapabilityRunId(workflowRunId, recipe.id, step.id, step.uses);
  const beforeHash = `sha256:${sha256Hex(JSON.stringify({
    document: graph.document,
    pages: graph.pages.length,
    blocks: graph.blocks.length,
    findings: graph.findings.length,
    redactions: graph.redactions.length,
    reviews: graph.reviews.length,
  }))}`;
  const output: Record<string, unknown> = {
    writes: step.writes,
    capability_id: step.uses,
  };

  if (step.uses.startsWith('parser.')) {
    const parsed = localParse(dataDir, graph.document.id, capabilityRunId, `blk_${step.id}_local`);
    if (parsed.ok && parsed.blocks.length) {
      for (const block of parsed.blocks) {
        if (!graph.blocks.some((existing) => existing.id === block.id)) {
          graph.blocks.push(block);
        }
      }
      const textPages = new Set(parsed.blocks.map((block) => block.page_number as number));
      for (const page of graph.pages) {
        if (textPages.has(page.page_number as number)) {
          page.text_state = parsed.ocrUsed ? 'ocr' : 'text';
        }
      }
      output.blocks_written = parsed.blocks.length;
      output.mode = parsed.ocrUsed ? 'local_ocr' : 'local_text';
    } else {
      const blockId = `blk_${step.id}_starter`;
      if (!graph.blocks.some((block) => block.id === blockId)) {
        graph.blocks.push({
          id: blockId,
          kind: 'paragraph',
          page_number: 1,
          text: `Local PDF extraction unavailable (${parsed.reason ?? 'unknown'}). Install poppler-utils + tesseract-ocr, or set ${capabilityEnvName(step.uses)} to a parser service.`,
          bbox: { x: 0.08, y: 0.22, w: 0.84, h: 0.08 },
          confidence: 0.2,
          created_by_run_id: capabilityRunId,
        });
      }
      output.blocks_written = 1;
      output.mode = 'unavailable';
      output.reason = parsed.reason;
    }
  } else if (step.uses === 'auditor.wcag.basic') {
    const findings = localAudit(graph as unknown as Record<string, unknown>, capabilityRunId, `finding_${step.id}_starter`);
    for (const finding of findings) {
      const existing = graph.findings.findIndex((entry) => entry.id === finding.id);
      if (existing >= 0) graph.findings[existing] = finding;
      else graph.findings.push(finding);
    }
    output.findings_written = findings.length;
  } else if (step.uses === 'redactor.policy.basic') {
    const redactions = localRedact(graph as unknown as Record<string, unknown>, capabilityRunId, `redaction_${step.id}_starter`);
    for (const redaction of redactions) {
      const existing = graph.redactions.findIndex((entry) => entry.id === redaction.id);
      if (existing >= 0) graph.redactions[existing] = redaction;
      else graph.redactions.push(redaction);
    }
    output.redactions_written = redactions.length;
  } else if (step.uses === 'review.a11y.findings' || step.uses === 'review.redactions') {
    const reviewId = `review_${step.id}_starter`;
    if (!graph.reviews.some((review) => review.id === reviewId)) {
      graph.reviews.push({
        id: reviewId,
        kind: step.uses === 'review.redactions' ? 'redaction' : 'audit',
        status: 'pending',
        subject_type: step.uses === 'review.redactions' ? 'redaction' : 'finding',
        subject_id:
          step.uses === 'review.redactions'
            ? graph.redactions[0]?.id ?? 'document'
            : graph.findings[0]?.id ?? 'document',
        reviewer_notes: `Starter review gate opened by ${step.uses}.`,
        final_claim_level: 'machine_only',
        created_by_run_id: capabilityRunId,
      });
    }
    output.reviews_written = 1;
  } else if (step.uses === 'viewer.document-graph') {
    output.viewer_url = `/?doc=${encodeURIComponent(graph.document.id)}&view=review`;
  } else if (step.uses === 'bridge.n8n.webhook') {
    output.source_id = graph.document.source_id;
  } else if (step.uses === 'sourcer.local-upload') {
    output.source_id = graph.document.source_id;
  }

  const run: StarterCapabilityRun = {
    object: 'capability_run',
    id: capabilityRunId,
    workflow_run_id: workflowRunId,
    recipe_id: recipe.id,
    step_id: step.id,
    capability_id: step.uses,
    status: 'succeeded',
    mode: 'self_host_starter',
    graph_writes: step.writes,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    output,
  };
  appendLineage(graph, run, beforeHash);
  return run;
}

async function callExternalCapabilityStep(
  graph: StarterDocumentGraph,
  recipe: SelfHostRuntimeRecipeSummary,
  step: SelfHostRuntimeRecipeStepSummary,
  workflowRunId: string,
  endpoint: string,
  options: Pick<SelfHostRuntimeRequestOptions, 'capabilityFetch'>,
  parameters: Record<string, unknown>,
): Promise<StarterCapabilityRun> {
  const startedAt = new Date().toISOString();
  const capabilityRunId = createCapabilityRunId(workflowRunId, recipe.id, step.id, step.uses);
  let endpointUrl: string;
  try {
    endpointUrl = capabilityProtocolUrl(endpoint);
  } catch (error) {
    throw new CapabilityDispatchError(
      step.uses,
      `capability "${step.uses}" has an invalid endpoint URL: ${error instanceof Error ? error.message : String(error)}`,
      400,
    );
  }
  const beforeHash = `sha256:${sha256Hex(JSON.stringify({
    document: graph.document,
    pages: graph.pages.length,
    blocks: graph.blocks.length,
    findings: graph.findings.length,
    redactions: graph.redactions.length,
    reviews: graph.reviews.length,
  }))}`;
  const fetchImpl = options.capabilityFetch ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(endpointUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'capability_run_request',
        protocol: 'okra-capability-http/v1',
        run_id: capabilityRunId,
        workflow_run_id: workflowRunId,
        recipe_id: recipe.id,
        document_id: graph.document.id,
        capability_id: step.uses,
        step: {
          id: step.id,
          name: step.name,
          reads: step.reads,
          writes: step.writes,
          requires_review: step.requiresReview,
        },
        parameters,
        graph,
      }),
    });
  } catch (error) {
    throw new CapabilityDispatchError(
      step.uses,
      `capability "${step.uses}" dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new CapabilityDispatchError(
      step.uses,
      `capability "${step.uses}" returned HTTP ${response.status}${message ? `: ${message}` : ''}`,
      response.status >= 500 ? 502 : 400,
    );
  }

  const payload = await response.json().catch(() => null) as unknown;
  if (!isRecord(payload)) {
    throw new CapabilityDispatchError(step.uses, `capability "${step.uses}" returned an invalid JSON payload`);
  }
  if (payload.status === 'failed') {
    throw new CapabilityDispatchError(step.uses, `capability "${step.uses}" reported failure`);
  }

  if (isRecord(payload.graph) && payload.graph.schema_version === 'okra-document-graph/v1') {
    Object.assign(graph, payload.graph);
  } else {
    applyGraphPatch(graph, payload.graph_patch, capabilityRunId);
  }

  const output = isRecord(payload.output)
    ? payload.output
    : { capability_id: step.uses, writes: step.writes };
  const run: StarterCapabilityRun = {
    object: 'capability_run',
    id: capabilityRunId,
    workflow_run_id: workflowRunId,
    recipe_id: recipe.id,
    step_id: step.id,
    capability_id: step.uses,
    status: 'succeeded',
    mode: 'external_http',
    graph_writes: step.writes,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    endpoint_url: endpointUrl,
    output,
  };
  appendLineage(graph, run, beforeHash);
  return run;
}

async function runStarterRecipe(
  graph: StarterDocumentGraph,
  recipe: SelfHostRuntimeRecipeSummary,
  workflowRunId: string,
  options: SelfHostRuntimeRequestOptions,
  parameters: Record<string, unknown>,
  dataDir: string,
): Promise<StarterCapabilityRun[]> {
  const steps = recipe.steps.length
    ? recipe.steps
    : [{
        id: 'starter',
        name: 'Starter graph write',
        uses: recipe.capabilityRefs[0] ?? recipe.id,
        reads: recipe.graphReads,
        writes: recipe.graphWrites,
        requiresReview: false,
      }];
  const env = runtimeEnv(options);
  const runs: StarterCapabilityRun[] = [];
  for (const step of steps) {
    const endpoint = capabilityEndpointFor(step.uses, env);
    runs.push(endpoint
      ? await callExternalCapabilityStep(graph, recipe, step, workflowRunId, endpoint, options, parameters)
      : applyStarterCapabilityStep(graph, recipe, step, workflowRunId, dataDir));
  }
  return runs;
}

function documentStatusFromGraph(graph: StarterDocumentGraph): Record<string, unknown> {
  return {
    phase: 'complete',
    pagesTotal: graph.pages.length,
    pagesCompleted: graph.pages.length,
    totalNodes: graph.blocks.length,
    verifiedNodes: graph.blocks.length,
    failedNodes: 0,
    pendingNodes: 0,
    document_id: graph.document.id,
    source_id: graph.source.id,
    graph_url: `/v1/documents/${encodeURIComponent(graph.document.id)}/graph`,
    plugins: graph.artifacts.map((artifact) => ({
      asset_id: artifact.id,
      kind: artifact.kind,
      status: 'ready',
      url: artifact.path,
    })),
  };
}

function markdownFromGraph(graph: StarterDocumentGraph): string {
  const lines = [
    `# ${graph.document.filename ?? graph.document.id}`,
    '',
    `Document ID: ${graph.document.id}`,
    `Source ID: ${graph.document.source_id}`,
    `Pages: ${graph.pages.length}`,
    '',
    '## Blocks',
    '',
    ...graph.blocks.map((block) => `- ${String(block.text ?? block.id)}`),
  ];

  if (graph.findings.length) {
    lines.push('', '## Findings', '', ...graph.findings.map((finding) => `- ${String(finding.message ?? finding.id)}`));
  }
  if (graph.redactions.length) {
    lines.push('', '## Redactions', '', ...graph.redactions.map((redaction) => `- ${String(redaction.reason ?? redaction.id)}`));
  }
  if (graph.reviews.length) {
    lines.push('', '## Reviews', '', ...graph.reviews.map((review) => `- ${String(review.id)}: ${String(review.status)}`));
  }

  return `${lines.join('\n')}\n`;
}

function pagesFromGraph(graph: StarterDocumentGraph): Array<Record<string, unknown>> {
  return graph.pages.map((page) => ({
    page: page.page_number,
    content: graph.blocks
      .filter((block) => block.page_number === page.page_number)
      .map((block) => String(block.text ?? ''))
      .join('\n\n'),
    blocks: graph.blocks
      .filter((block) => block.page_number === page.page_number)
      .map((block) => ({
        text: block.text ?? '',
        ...(isRecord(block.bbox)
          ? {
              bbox: {
                x: block.bbox.x,
                y: block.bbox.y,
                width: block.bbox.w,
                height: block.bbox.h,
              },
            }
          : {}),
        confidence: block.confidence,
      })),
    entities: [],
  }));
}

function entitiesFromGraph(graph: StarterDocumentGraph): Record<string, unknown> {
  const nodes = [
    ...graph.blocks.map((block) => ({
      id: block.id,
      type: block.kind,
      label: block.kind,
      value: block.text,
      page_number: block.page_number,
      status: 'ready',
      metadata: JSON.stringify({ created_by_run_id: block.created_by_run_id ?? null }),
    })),
    ...graph.findings.map((finding) => ({
      id: finding.id,
      type: 'finding',
      label: finding.severity,
      value: finding.message,
      page_number: 1,
      status: 'ready',
      metadata: JSON.stringify({ standard: finding.standard, rule_id: finding.rule_id }),
    })),
    ...graph.redactions.map((redaction) => ({
      id: redaction.id,
      type: 'redaction',
      label: redaction.state,
      value: redaction.reason,
      page_number: 1,
      status: 'ready',
      metadata: JSON.stringify({ regions: redaction.regions }),
    })),
  ];

  return { nodes, total: nodes.length, limit: nodes.length, offset: 0 };
}

function workflowCatalog(status: SelfHostRuntimeStatus): Record<string, unknown> {
  return {
    object: 'workflow_catalog',
    data: status.recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      version: recipe.version,
      capability_refs: recipe.capabilityRefs,
      graph_reads: recipe.graphReads,
      graph_writes: recipe.graphWrites,
      steps: recipe.steps.map((step) => ({
        id: step.id,
        uses: step.uses,
        reads: step.reads,
        writes: step.writes,
        requires_review: step.requiresReview,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// HTTP server (Hono)
//
// The self-host runtime serves the SAME Web-standard Request/Response surface
// as the hosted cloud Worker (apps/api/packages/server), so route signatures
// stay identical across deployments. Hono is the router: it runs on the
// Workers runtime in the cloud and on Node here via @hono/node-server.
// ---------------------------------------------------------------------------

interface SelfHostRequestContext {
  options: SelfHostRuntimeRequestOptions;
  root: string;
  env: Record<string, string | undefined>;
  status: SelfHostRuntimeStatus;
  dataDir: string;
  auth: SelfHostRuntimeAuthConfig;
}

type SelfHostHonoEnv = { Variables: { rc: SelfHostRequestContext } };

function buildSelfHostContext(options: SelfHostRuntimeRequestOptions): SelfHostRequestContext {
  const root = resolve(options.bundleDir);
  const env = runtimeEnv(options);
  const status = createSelfHostRuntimeStatus(root, env);
  const dataDir = runtimeDataDir(root, options);
  const auth = authConfigFromEnv(env);
  return { options, root, env, status, dataDir, auth };
}

// RFC 8594-style deprecation: a confusing self-host-only alias the cloud does
// not serve is retired with 410 Gone + a machine-readable successor pointer,
// rather than silently shadowing a canonical resource route.
function goneResponse(successor: string, message: string): Response {
  return new Response(
    JSON.stringify({ object: 'error', code: 'GONE', error: 'gone', message, successor }),
    {
      status: 410,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        deprecation: 'true',
        link: `<${successor}>; rel="successor-version"`,
      },
    },
  );
}

function healthResponse(status: SelfHostRuntimeStatus): Response {
  return jsonResponse({
    object: 'self_host_health',
    ok: status.ok,
    schema_version: status.schemaVersion,
    recipes: status.recipes.length,
    capabilities: status.capabilities.length,
    n8n_workflows: status.n8nWorkflows.length,
  }, status.ok ? 200 : 503);
}

function withGraph(
  c: Context<SelfHostHonoEnv>,
  handler: (graph: StarterDocumentGraph, ctx: SelfHostRequestContext) => Response,
): Response {
  const ctx = c.get('rc');
  const documentId = c.req.param('id')!;
  const graph = readGraph(ctx.dataDir, documentId);
  if (!graph) {
    return jsonResponse({ object: 'error', error: `document "${documentId}" not found` }, 404);
  }
  return handler(graph, ctx);
}

async function handleUploadUrl(c: Context<SelfHostHonoEnv>): Promise<Response> {
  const { dataDir } = c.get('rc');
  const documentId = c.req.param('id')!;
  const body = await readRequestJson(c.req.raw);
  const uri = typeof body.url === 'string' ? body.url : undefined;
  if (!uri) {
    return jsonResponse({ object: 'error', error: 'url is required' }, 400);
  }
  const source = writeSource(dataDir, {
    object: 'source_ref',
    id: stableId('src_url', { documentId, uri }),
    kind: 'url',
    status: 'accepted',
    received_at: new Date().toISOString(),
    uri,
    content_type: 'application/pdf',
  });
  const graph = writeGraph(dataDir, createStarterGraph(source, documentId));
  return jsonResponse({
    phase: 'complete',
    document_id: documentId,
    source_id: source.id,
    graph_url: `/v1/documents/${encodeURIComponent(graph.document.id)}/graph`,
  });
}

async function handleUpload(c: Context<SelfHostHonoEnv>): Promise<Response> {
  const { dataDir } = c.get('rc');
  const documentId = c.req.param('id')!;
  const body = new Uint8Array(await c.req.raw.arrayBuffer());
  if (body.byteLength === 0) {
    return jsonResponse({ object: 'error', error: 'upload body is required' }, 400);
  }
  const hash = sha256Hex(body);
  const filename = c.req.header('x-file-name') ?? `${documentId}.pdf`;
  const source = writeSource(dataDir, {
    object: 'source_ref',
    id: stableId('src_upload', { documentId, hash }),
    kind: 'local_upload',
    status: 'accepted',
    received_at: new Date().toISOString(),
    filename,
    content_type: c.req.header('content-type') ?? 'application/pdf',
    size_bytes: body.byteLength,
    sha256: hash,
  });
  ensureDir(join(dataDir, 'documents', documentId));
  writeFileSync(originalPath(dataDir, documentId), body);
  const graph = writeGraph(dataDir, createStarterGraph(source, documentId, {
    pageCount: pageCountFromPdf(body),
  }));
  return jsonResponse({
    phase: 'complete',
    document_id: documentId,
    source_id: source.id,
    pagesTotal: graph.pages.length,
    graph_url: `/v1/documents/${encodeURIComponent(graph.document.id)}/graph`,
  });
}

async function handleN8nSource(c: Context<SelfHostHonoEnv>): Promise<Response> {
  const { dataDir } = c.get('rc');
  const body = await readRequestJson(c.req.raw);
  const source = writeSource(dataDir, {
    object: 'source_ref',
    id: stableId('src_n8n', body),
    kind: 'n8n_webhook',
    status: 'accepted',
    received_at: new Date().toISOString(),
    uri: typeof body.document_url === 'string' ? body.document_url : undefined,
    payload_keys: Object.keys(body).sort(),
  });
  return jsonResponse(source, 202);
}

async function handleWorkflowRun(c: Context<SelfHostHonoEnv>): Promise<Response> {
  const { dataDir, status, options } = c.get('rc');
  const body = await readRequestJson(c.req.raw);
  const recipeId = typeof body.recipe_id === 'string'
    ? body.recipe_id
    : typeof body.recipeId === 'string'
      ? body.recipeId
      : undefined;
  if (!recipeId) {
    return jsonResponse({ object: 'error', error: 'recipe_id is required' }, 400);
  }

  const recipe = status.recipes.find((item) => item.id === recipeId);
  if (!recipe) {
    return jsonResponse({ object: 'error', error: `unknown recipe_id "${recipeId}"` }, 400);
  }

  const sourceId = typeof body.source_id === 'string'
    ? body.source_id
    : typeof body.sourceId === 'string'
      ? body.sourceId
      : undefined;
  const documentIdFromBody = typeof body.document_id === 'string'
    ? body.document_id
    : typeof body.documentId === 'string'
      ? body.documentId
      : undefined;
  const existingGraph = documentIdFromBody ? readGraph(dataDir, documentIdFromBody) : null;
  const source = sourceId ? readSource(dataDir, sourceId) : null;
  const parameters = isRecord(body.parameters) ? body.parameters : {};

  if (!existingGraph && !source) {
    return jsonResponse({
      object: 'error',
      error: 'workflow requires a known source_id or document_id',
    }, 400);
  }

  const documentId = existingGraph?.document.id ?? documentIdFromBody ?? sourceToDocumentId(source!.id);
  const runId = stableId('run', { recipeId: recipe.id, sourceId: source?.id ?? null, documentId });
  // Preserve accumulated state (parsed blocks, findings, redactions, reviews,
  // lineage) across workflow runs so a parse -> audit -> redact sequence audits
  // and redacts the REAL parsed text instead of a freshly-reset graph.
  const resolvedGraph = existingGraph ?? readGraph(dataDir, documentId);
  const graph = resolvedGraph ?? createStarterGraph(source!, documentId, { runId });
  let capabilityRuns: StarterCapabilityRun[];
  try {
    capabilityRuns = await runStarterRecipe(graph, recipe, runId, options, parameters, dataDir);
  } catch (error) {
    if (error instanceof CapabilityDispatchError) {
      return jsonResponse({
        object: 'error',
        code: 'CAPABILITY_DISPATCH_FAILED',
        capability_id: error.capabilityId,
        error: error.message,
      }, error.status);
    }
    throw error;
  }
  writeGraph(dataDir, graph);
  for (const capabilityRun of capabilityRuns) {
    writeJson(capabilityRunPath(dataDir, capabilityRun.id), capabilityRun);
  }

  const run: StarterWorkflowRun = {
    object: 'workflow_run',
    id: runId,
    status: 'succeeded',
    mode: capabilityRuns.some((capabilityRun) => capabilityRun.mode === 'external_http')
      ? 'external_http'
      : 'self_host_starter',
    recipe_id: recipe.id,
    source_id: source?.id ?? existingGraph?.document.source_id ?? null,
    document_id: graph.document.id,
    graph_writes: recipe.graphWrites,
    graph_url: `/v1/documents/${encodeURIComponent(graph.document.id)}/graph`,
    review_url: `/v1/documents/${encodeURIComponent(graph.document.id)}/reviews`,
    message: capabilityRuns.some((capabilityRun) => capabilityRun.mode === 'external_http')
      ? 'Executed by the lightweight self-host dispatcher with one or more external capability services.'
      : 'Executed by the lightweight self-host starter capability dispatcher. Replace these starter runs with isolated runtime services as capability images become real.',
    capability_runs: capabilityRuns,
  };
  writeJson(runPath(dataDir, run.id), run);
  return jsonResponse(run, 202);
}

export function createSelfHostApp(options: SelfHostRuntimeRequestOptions): Hono<SelfHostHonoEnv> {
  const app = new Hono<SelfHostHonoEnv>();

  // Per-request runtime context: re-read the bundle each request so a hot
  // bundle swap (and the test harness's fresh data dirs) are reflected.
  app.use('*', async (c, next) => {
    c.set('rc', buildSelfHostContext(options));
    await next();
  });

  // Single-owner API-key guard. Mirrors the cloud's bearer / x-okra-api-key
  // contract, applied to the write surface only.
  app.use('*', async (c, next) => {
    const { auth } = c.get('rc');
    const pathname = new URL(c.req.url).pathname;
    if (protectedByApiKey(c.req.method.toUpperCase(), pathname) && !hasRuntimeApiKey(c.req.raw, auth)) {
      return unauthorizedResponse();
    }
    return next();
  });

  // -- Operational + runtime introspection (self-host extensions) -----------
  app.get('/health', (c) => healthResponse(c.get('rc').status));
  app.get('/ready', (c) => healthResponse(c.get('rc').status));

  app.get('/v1/self-host/status', (c) => {
    const { status } = c.get('rc');
    return jsonResponse(status, status.ok ? 200 : 503);
  });

  app.get('/v1/runtime/manifest', (c) => {
    const { root } = c.get('rc');
    const manifestPath = join(root, 'runtime.manifest.json');
    if (!existsSync(manifestPath)) {
      return jsonResponse({ object: 'error', error: 'runtime manifest not found' }, 404);
    }
    return textResponse(readFileSync(manifestPath, 'utf8'), 200, 'application/json; charset=utf-8');
  });

  // -- workflows resource (catalog + runs) ----------------------------------
  app.get('/v1/workflows/catalog', (c) => jsonResponse(workflowCatalog(c.get('rc').status)));
  // Deprecated alias — the cloud exposes the workflow catalog only at
  // /v1/workflows/catalog; /v1/recipes was a self-host-only duplicate.
  app.get('/v1/recipes', () =>
    goneResponse('/v1/workflows/catalog', 'Use /v1/workflows/catalog (the cloud-canonical workflows resource).'));
  app.get('/v1/capabilities', (c) =>
    jsonResponse({ object: 'capability_catalog', data: c.get('rc').status.capabilities }));

  app.get('/v1/runs/:id', (c) => {
    const { dataDir } = c.get('rc');
    const run = readWorkflowRun(dataDir, c.req.param('id'));
    return run ? jsonResponse(run) : jsonResponse({ object: 'error', error: 'workflow run not found' }, 404);
  });

  app.get('/v1/capability-runs/:id', (c) => {
    const { dataDir } = c.get('rc');
    const run = readCapabilityRun(dataDir, c.req.param('id'));
    return run ? jsonResponse(run) : jsonResponse({ object: 'error', error: 'capability run not found' }, 404);
  });

  // -- legacy /document/:id/* grammar (pre-v1 read surface) -----------------
  app.get('/document/:id/status', (c) =>
    withGraph(c, (graph) => jsonResponse(documentStatusFromGraph(graph))));
  app.get('/document/:id/full.md', (c) =>
    withGraph(c, (graph) => textResponse(markdownFromGraph(graph), 200, 'text/markdown; charset=utf-8')));
  app.get('/document/:id/pages', (c) =>
    withGraph(c, (graph) => jsonResponse(pagesFromGraph(graph))));
  app.get('/document/:id/page/:page', (c) =>
    withGraph(c, (graph) => {
      const pageNumber = Number.parseInt(c.req.param('page'), 10);
      const page = pagesFromGraph(graph).find((item) => item.page === pageNumber);
      return page ? jsonResponse(page) : jsonResponse({ object: 'error', error: 'page not found' }, 404);
    }));
  app.get('/document/:id/nodes', (c) =>
    withGraph(c, (graph) => jsonResponse(entitiesFromGraph(graph))));
  app.get('/document/:id/download', (c) =>
    withGraph(c, (_graph, ctx) => {
      const path = originalPath(ctx.dataDir, c.req.param('id'));
      if (!existsSync(path)) {
        return jsonResponse({ object: 'error', error: 'original PDF is not stored for this source' }, 404);
      }
      return binaryResponse(new Uint8Array(readFileSync(path)), 'application/pdf');
    }));

  // -- documents resource reads (/v1/documents/:id/*) -----------------------
  app.get('/v1/documents/:id/graph', (c) => withGraph(c, (graph) => jsonResponse(graph)));
  // Cloud read-surface parity: the SDK reads markdown from
  // /v1/documents/{id}/full.md, so the self-host runtime answers the same
  // grammar (#369).
  app.get('/v1/documents/:id/full.md', (c) =>
    withGraph(c, (graph) => textResponse(markdownFromGraph(graph), 200, 'text/markdown; charset=utf-8')));
  app.get('/v1/documents/:id/status', (c) =>
    withGraph(c, (graph) => jsonResponse(documentStatusFromGraph(graph))));
  app.get('/v1/documents/:id/pages', (c) =>
    withGraph(c, (graph) => jsonResponse(pagesFromGraph(graph))));
  app.get('/v1/documents/:id/nodes', (c) =>
    withGraph(c, (graph) => jsonResponse(entitiesFromGraph(graph))));
  app.get('/v1/documents/:id/reviews', (c) =>
    withGraph(c, (graph) =>
      jsonResponse({ object: 'review_list', document_id: c.req.param('id'), data: graph.reviews })));
  app.get('/v1/documents/:id/findings', (c) =>
    withGraph(c, (graph) =>
      jsonResponse({ object: 'finding_list', document_id: c.req.param('id'), data: graph.findings })));
  app.get('/v1/documents/:id/redactions', (c) =>
    withGraph(c, (graph) =>
      jsonResponse({ object: 'redaction_list', document_id: c.req.param('id'), data: graph.redactions })));

  // -- write surface --------------------------------------------------------
  app.post('/document/:id/upload-url', (c) => handleUploadUrl(c));
  app.post('/document/:id/upload', (c) => handleUpload(c));
  app.post('/v1/sources/n8n', (c) => handleN8nSource(c));
  app.post('/v1/workflows', (c) => handleWorkflowRun(c));

  // -- static assets + SPA fallback (GET/HEAD only) -------------------------
  app.get('*', (c) => {
    const { root, status, options: opts } = c.get('rc');
    const pathname = new URL(c.req.url).pathname;
    const publicDir = resolve(opts.publicDir ?? join(root, 'public'));
    const staticPath = resolveStaticPath(publicDir, pathname);
    if (staticPath) {
      return textResponse(readFileSync(staticPath, 'utf8'), 200, mimeType(staticPath));
    }
    if (pathname === '/') {
      return textResponse(fallbackIndex(status), 200, 'text/html; charset=utf-8');
    }
    return jsonResponse({ object: 'error', error: 'not found' }, 404);
  });

  // Unmatched non-GET methods preserve the legacy 405 contract.
  app.notFound(() => jsonResponse({ object: 'error', error: 'method not allowed' }, 405));

  app.onError((error) =>
    jsonResponse({ object: 'error', error: error instanceof Error ? error.message : String(error) }, 500));

  return app;
}

export async function handleSelfHostRuntimeRequest(
  request: Request,
  options: SelfHostRuntimeRequestOptions,
): Promise<Response> {
  return createSelfHostApp(options).fetch(request);
}

export function startSelfHostRuntimeServer(
  options: SelfHostRuntimeServerOptions,
): Promise<StartedSelfHostRuntimeServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  const app = createSelfHostApp(options);

  return new Promise((resolveServer, reject) => {
    let settled = false;
    try {
      const server = serve({ fetch: app.fetch, hostname: host, port }, (info) => {
        settled = true;
        const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
        resolveServer({
          server: server as unknown as Server,
          url: `http://${displayHost}:${info.port}`,
          close: () =>
            new Promise<void>((resolveClose, rejectClose) => {
              (server as unknown as Server).close((error?: Error) => {
                if (error) rejectClose(error);
                else resolveClose();
              });
            }),
        });
      });
      (server as unknown as Server).once('error', (error: Error) => {
        if (!settled) reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}
