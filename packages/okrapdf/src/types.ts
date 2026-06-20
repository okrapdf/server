import type { ZodType } from 'zod';

export type JsonSchema = Record<string, unknown>;

export type StructuredOutputErrorCode =
  | 'SCHEMA_VALIDATION_FAILED'
  | 'EXTRACTION_FAILED'
  | 'TIMEOUT'
  | 'DOCUMENT_NOT_FOUND';

export type RuntimeErrorCode =
  | StructuredOutputErrorCode
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'HTTP_ERROR'
  | 'NOT_IMPLEMENTED'
  | 'INVALID_RESPONSE';

export interface OkraClientOptions {
  /** Hosted default points at api.okrapdf.com. */
  baseUrl?: string;
  /** Bearer API key (okra_...). */
  apiKey?: string;
  /** Alternative auth header (e.g. worker-to-worker shared secret). */
  sharedSecret?: string;
  /** Inject custom fetch implementation for tests or runtime overrides. */
  fetch?: typeof globalThis.fetch;
}

export interface UploadRedactPiiOptions {
  preset?: string;
  patterns?: string[];
  includeNames?: boolean;
  includeAddresses?: boolean;
  customPatterns?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface UploadRedactOptions {
  pii?: UploadRedactPiiOptions;
  publicFieldAllowlist?: string[];
  [key: string]: unknown;
}

export interface UploadOptions {
  /** Provide your own document ID. Default: auto-generated `doc-*`. */
  documentId?: string;
  /** Optional filename hint for binary uploads. */
  fileName?: string;
  /** Initial document spec seeded at upload/create time. */
  config?: DocumentSpec;
  /** Free-text parsing goal used to build the upload-time parse plan. */
  intent?: string;
  /** Processing capability hints forwarded to the worker. */
  capabilities?: ProcessingCapabilities;
  /** Document visibility. 'private' (default) requires auth; 'public' auto-publishes on completion. */
  visibility?: 'public' | 'private';
  /** BYOK vendor keys passed through to extraction (e.g. { llamaparse: 'llx-...' }). Stateless — never stored. */
  vendorKeys?: Record<string, string>;
  /** OpenRedact policy forwarded to upload and enforced at read/query/completion surfaces. */
  redact?: UploadRedactOptions;
  /**
   * Vendor-specific options passed through to the parsing vendor API.
   * Follows the AI SDK providerOptions pattern — keys are vendor API fields.
   * @example { model: 'gemini-3.1-pro', parse_mode: 'parse_page_with_agent' }
   */
  vendorOptions?: Record<string, unknown>;
  /** Real-time progress callback — receives lifecycle events via WebSocket. */
  onProgress?: (event: import('./events').DocumentEvent) => void;
}

export type WorkflowPhase = 'ocr' | 'enhance' | 'metadata' | 'verify';

export type WorkflowTier = 'fast' | 'standard' | 'premium';

export type InvoiceExtractionQuality = 'fast' | 'balanced' | 'high';

export type InvoiceExtractionInput =
  | string
  | {
      fileId?: string;
      file_id?: string;
    };

export interface InvoiceExtractionRunOptions {
  inputs: InvoiceExtractionInput[];
  tableId?: string;
  quality?: InvoiceExtractionQuality;
  signal?: AbortSignal;
}

export interface InvoiceExtractionRunListOptions {
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
}

export interface InvoiceExtractionRun {
  id: string;
  runId: string;
  status: string;
  workflowName: 'invoice-extraction';
  workflowLabel: string;
  workflowVersion: number;
  quality: InvoiceExtractionQuality;
  tableId: string;
  agentId?: string | null;
  inputs: Array<{ fileId: string }>;
  eventsUrl: string;
  streamUrl: string;
  rowsUrl: string;
  exports: {
    csvUrl: string;
    jsonUrl: string;
    xmlUrl?: string;
    xlsxUrl?: string;
    [key: string]: unknown;
  };
  createdAt: string;
}

export interface InvoiceExtractionRunList {
  data: InvoiceExtractionRun[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface InvoiceExtractionException {
  id: string;
  runId: string;
  tableId: string;
  rowId?: string | null;
  fileId?: string | null;
  field?: string | null;
  code:
    | 'missing_required_field'
    | 'document_parse_failed'
    | 'empty_result'
    | 'run_failed'
    | 'validation_warning';
  severity: 'warning' | 'error';
  status: 'open' | 'resolved';
  message: string;
  value?: unknown;
  sourcePage?: number | null;
  sourceBbox?: string | null;
  createdAt: string;
}

export interface InvoiceExtractionExceptionList {
  data: InvoiceExtractionException[];
  hasMore?: boolean;
  nextCursor?: string | null;
}

export interface InvoiceExtractionResolveExceptionOptions {
  rowId: string;
  field?: string;
  value?: unknown;
  action?: 'approve' | 'correct';
  signal?: AbortSignal;
}

export interface InvoiceExtractionExceptionResolution {
  id: string;
  runId: string;
  tableId: string;
  rowId: string;
  status: 'resolved';
}

export interface WorkflowPhaseConfig {
  vendor?: string;
  tier?: WorkflowTier;
  enabled?: boolean;
}

/**
 * Processing capability shape used by upload/config/key-workflow surfaces.
 * Includes well-known flags and allows forward-compatible custom keys.
 */
export interface ProcessingCapabilities {
  vlm_qwen?: boolean;
  structural_check?: boolean;
  sandbox_verify?: boolean;
  search?: boolean;
  phases?: Partial<Record<WorkflowPhase, WorkflowPhaseConfig>>;
  middleware?: Array<{ name: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export type DocumentAction =
  | 'admin'
  | 'read_meta'
  | 'read_content'
  | 'query'
  | 'download_pdf'
  | 'update_config'
  | 'trigger_extract'
  | 'create_link'
  | 'list_links'
  | 'publish';

export type PrincipalRef =
  | { type: 'owner' }
  | { type: 'public' }
  | { type: 'user'; id: string }
  | { type: 'org'; id: string }
  | { type: 'project'; id: string };

export interface DocumentGrantConstraints {
  redaction_role?: 'admin' | 'viewer' | 'public';
  expires_at?: string;
  not_before?: string;
  output_allowlist?: string[];
}

export interface DocumentGrant {
  grant_id?: string;
  principal: PrincipalRef;
  actions: DocumentAction[];
  constraints?: DocumentGrantConstraints;
}

export interface DocumentAccessRoleProfile {
  pii?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DocumentAccess {
  default_effect: 'deny';
  grants: DocumentGrant[];
  redaction_roles?: {
    viewer?: DocumentAccessRoleProfile;
    public?: DocumentAccessRoleProfile;
  };
}

export type PageImageStrategy = 'none' | 'cover' | 'eager' | 'lazy';

export interface DocumentExtract {
  page_image_strategy: PageImageStrategy;
  provider: string | null;
  provider_options?: Record<string, unknown>;
}

export interface DocumentFeatureFlags {
  vlm_qwen: boolean;
  structural_check: boolean;
  sandbox_verify: boolean;
  search: boolean;
}

export interface DocumentRuntime {
  self_heal: boolean;
  workflow_watchdog_timeout_ms: number;
  max_auto_reparse: number;
}

export interface DocumentPluginSpec {
  name: string;
  provider?: string;
  model?: string;
  providerOptions?: Record<string, unknown>;
}

export interface DocumentAgentModelEndpoint {
  provider?: string;
  model?: string;
}

export interface DocumentAgentModelConfig {
  chat?: DocumentAgentModelEndpoint;
  query?: DocumentAgentModelEndpoint;
}

export interface DocumentAgentToolPolicies {
  get_job_metadata?: string;
  get_live_status?: string;
  query_sql?: string;
  query_document?: string;
  view_page_region?: string;
}

export interface DocumentAgentToolsConfig {
  builtinAllowlist?: string[];
  builtinToolPolicies?: DocumentAgentToolPolicies;
  completionToolMode?: string;
  userToolPolicy?: string;
}

export interface DocumentAgentContextConfig {
  mode?: string;
}

export interface DocumentAgentSecurityConfig {
  redactionRole?: 'admin' | 'viewer' | 'public';
  sqlReadOnly?: boolean;
  allowReparseTool?: boolean;
}

export interface DocumentAgentRuntimeConfig {
  maxToolRounds?: number;
  cacheDefault?: boolean;
  stream?: boolean;
}

export interface DocumentAgentConfig {
  agent_id: string;
  instructions?: string;
  model?: DocumentAgentModelConfig;
  tools?: DocumentAgentToolsConfig;
  context?: DocumentAgentContextConfig;
  security?: DocumentAgentSecurityConfig;
  runtime?: DocumentAgentRuntimeConfig;
  eval?: Record<string, unknown>;
}

export interface DocumentSpec {
  version: 1;
  access: DocumentAccess;
  extract: DocumentExtract;
  features: DocumentFeatureFlags;
  runtime: DocumentRuntime;
  agent: DocumentAgentConfig;
  plugins: DocumentPluginSpec[];
}

export interface DocumentSpecRecord {
  document_id: string | null;
  spec_version: number;
  spec: DocumentSpec;
}

export interface DocumentSpecDiff {
  accessChanged: boolean;
  extractChanged: boolean;
  agentChanged: boolean;
  pluginChanged: boolean;
  changed: boolean;
}

export type DocumentConfigUpdate = DocumentSpec;

export interface DocumentConfigResult extends DocumentSpecRecord {
  diff?: DocumentSpecDiff;
  phase?: string;
  maxPass?: number;
  workflowId?: string;
  reparsed?: boolean;
}

export interface ReparseOptions {
  strategy?: 'auto' | 'textlayer';
  signal?: AbortSignal;
}

export interface ReparseResult extends DocumentStatus {
  message?: string;
  workflowId?: string;
  strategy?: string;
}

export type VerifyVerdict = 'supported' | 'contradicted' | 'not_visible';

export interface VerifyBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VerifyParams {
  claim: string;
  page: number;
  bbox?: VerifyBbox;
  signal?: AbortSignal;
}

export interface VerifyResult {
  verdict: VerifyVerdict;
  page: number;
  bbox: VerifyBbox | null;
  evidence_snippet: string;
  page_image_url: string;
  confidence: number;
  model: string;
}

export interface ApplyWorkflowOptions {
  capabilities: ProcessingCapabilities;
  reparse?: boolean;
  strategy?: ReparseOptions['strategy'];
  signal?: AbortSignal;
}

export interface ApplyWorkflowResult {
  config: DocumentConfigResult;
  reparse?: ReparseResult;
}

export interface ApiKeyWorkflowConfigResponse {
  key_id: string;
  user_id: string;
  default_capabilities: ProcessingCapabilities | null;
  created_at: string | null;
  updated_at: string | null;
}

export type UploadInput = string | ArrayBuffer | Uint8Array | Blob;

// ─── Stateless parse (POST /v1/parse) ───────────────────────────────────────

export type ParsePageSelection =
  | string
  | number[]
  | {
      from?: number;
      to?: number;
    };

export interface ParseParserConfig {
  /** Parser id. See `GET /v1/vendors`. */
  id: string;
  /** Parser preset/model variant, forwarded to provider options when supported. */
  variant?: string;
  /** Parser-local options. */
  options?: Record<string, unknown>;
  /** AI-SDK-style provider options. */
  vendorOptions?: Record<string, unknown>;
  /** Snake-case alias accepted for raw API parity. */
  vendor_options?: Record<string, unknown>;
}

export interface ParseOptions {
  /** PDF bytes, local path (Node), Blob, or ArrayBuffer/Uint8Array. */
  file?: UploadInput;
  /** Reuse a previously-uploaded file by id (skip re-encoding). */
  fileId?: string;
  /** Parser id or parser config. See `GET /v1/vendors`. Defaults to `textlayer` if omitted. */
  parser?: string | ParseParserConfig;
  /** Parser preset/model variant, forwarded to provider options when supported. */
  variant?: string;
  /** Page selection, e.g. `1-3`, `[1, 3]`, or `{ from: 1, to: 3 }`. */
  pages?: ParsePageSelection;
  /** Requested output projections, e.g. `{ html: true, markdown: true }`. */
  outputs?: string[] | Record<string, unknown>;
  /** Publish/export options for derived assets. */
  publish?: boolean | Record<string, unknown>;
  /** Vendor-specific options forwarded as `VendorInput.parameters`. */
  options?: Record<string, unknown>;
  /** AI-SDK-style providerOptions forwarded as `VendorInput.vendorOptions`. */
  vendorOptions?: Record<string, unknown>;
  /** Request metadata copied onto the resulting job. */
  metadata?: Record<string, unknown>;
  /** Optional JSON schema for structured extraction (Gemini-style `responseSchema`). */
  schema?: JsonSchema;
  /** Optional file name hint, surfaces in vendor logs. */
  fileName?: string;
  signal?: AbortSignal;
}

export type JobStatus =
  | 'queued'
  | 'running'
  | 'rendering'
  | 'publishing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'idle'
  | 'awaiting_user_input'
  | 'completed'
  | 'completed_with_errors';

export interface JobError {
  message: string;
  code?: string;
}

export interface JobProgress {
  phase: string;
  current: number;
  total: number;
  pages_done: number;
  pages_completed: number;
  pages_failed: number;
  pages_running: number;
  pages_pending: number;
  pages_total: number;
  chunks_completed: number;
  chunks_total: number;
  percent: number | null;
  [key: string]: unknown;
}

export type JobErrorCode =
  | 'quota_exceeded'
  | 'invalid_file'
  | 'parse_timeout'
  | 'provider_failure'
  | 'auth_failure'
  | 'job_failed'
  | string;

export interface JobListOptions {
  type?: string;
  status?: JobStatus;
  documentId?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface CreateJobOptions {
  type: 'document.parse' | 'document.reparse' | string;
  documentId?: string;
  document_id?: string;
  document?: string;
  strategy?: string;
  engine?: string;
  processor?: string;
  parser?: Record<string, unknown> | string;
  parser_profile?: Record<string, unknown> | string;
  signal?: AbortSignal;
  [key: string]: unknown;
}

export interface OkraJob<Result = unknown> {
  id: string;
  object: 'job';
  type: string;
  status: JobStatus;
  internal_status?: string;
  terminal?: boolean;
  next_poll_after_ms?: number | null;
  retryable?: boolean;
  created?: number;
  completed?: number | null;
  created_at?: number;
  updated_at?: number;
  completed_at?: number | null;
  livemode?: boolean;
  url?: string;
  status_url?: string;
  job_id?: string;
  job_type?: string;
  job_label?: string | null;
  document_id?: string | null;
  file_name?: string | null;
  run_id?: string | null;
  workflow_name?: string | null;
  workflow_id?: string | null;
  engine_id?: string | null;
  provider?: string | null;
  model?: string | null;
  prompt_id?: string | null;
  prompt_version?: string | number | null;
  confidence_kind?: string | null;
  cost_usd?: number | null;
  progress_current?: number;
  progress_total?: number;
  progress?: JobProgress | null;
  pages_completed?: number;
  pages_failed?: number;
  pages_running?: number;
  pages_pending?: number;
  pages_total?: number;
  chunks_completed?: number;
  chunks_total?: number;
  duration_ms?: number | null;
  error_code?: JobErrorCode | null;
  user_message?: string | null;
  error?: string | null;
  latest_error?: string | null;
  usage?: Record<string, unknown> | null;
  request?: unknown;
  result: Result | null;
  metadata?: Record<string, unknown>;
  last_error: JobError | null;
}

export interface JobListResponse {
  object: 'list';
  data: OkraJob[];
  has_more: boolean;
  next_cursor?: string | null;
}

export interface ParseUsage {
  pages: number;
  duration_ms?: number | null;
}

export interface ParseExtraction {
  data: unknown;
  schema_valid: boolean;
}

export interface ParseArtifact {
  object: 'artifact';
  type: string;
  url: string;
  format?: ParseOutputFormat;
  hash?: string;
  [key: string]: unknown;
}

export type ParseProvider =
  | 'okrapdf'
  | 'textlayer'
  | 'llamaparse'
  | 'unstructured'
  | 'reducto'
  | 'docling'
  | 'google_document_ai'
  | 'azure_document_intelligence'
  | 'aws_textract'
  | 'mistral_ocr'
  | 'custom';

export type ParseOutputFormat = 'nodes' | 'markdown' | 'text' | 'html' | 'json';

export type ParseNodeRole =
  | 'text'
  | 'heading'
  | 'section_heading'
  | 'table'
  | 'row'
  | 'cell'
  | 'figure'
  | 'header'
  | 'footer'
  | 'key_value'
  | 'list'
  | 'unknown';

export interface ParseNode {
  id: string;
  page: number;
  role: ParseNodeRole;
  text: string;
  bbox?: { x: number; y: number; w: number; h: number };
  confidence?: number;
  label?: string;
  type?: string;
  parent_id?: string;
  vendor_payload_ref?: {
    sha256: string;
    uri?: string;
  };
  children?: ParseNode[];
}

export interface ParseNodesFormat {
  object: 'parse_format';
  format: 'nodes';
  pages: Array<{
    page: number;
    width?: number;
    height?: number;
    nodes: ParseNode[];
  }>;
}

export interface ParseMarkdownFormat {
  object: 'parse_format';
  format: 'markdown';
  content: string;
  pages: Array<{ page: number; content: string }>;
}

export interface ParseTextFormat {
  object: 'parse_format';
  format: 'text';
  content: string;
  pages: Array<{ page: number; content: string }>;
}

export interface ParseJsonFormat {
  object: 'parse_format';
  format: 'json';
  page_count: number;
  pages: Array<Record<string, unknown>>;
}

export interface ParseResultFormats {
  nodes?: ParseNodesFormat;
  markdown?: ParseMarkdownFormat;
  text?: ParseTextFormat;
  html?: ParseArtifact;
  json?: ParseJsonFormat;
}

export interface CanonicalParseBlock {
  type: string;
  label?: string;
  value?: string;
  bbox?: { x: number; y: number; w: number; h: number };
  confidence?: number;
  children?: CanonicalParseBlock[];
}

export interface CanonicalParsePage {
  pageNumber: number;
  width?: number;
  height?: number;
  blocks: CanonicalParseBlock[];
}

export interface CanonicalParseOutput {
  pages: CanonicalParsePage[];
  metadata: {
    vendor: string;
    model?: string;
    durationMs: number;
    confidence: number | null;
    pageCount: number;
  };
}

export interface ParseResult {
  object: 'parse_result';
  job: string;
  file?: {
    name?: string | null;
    source?: 'inline' | 'file_id' | null;
  };
  usage: ParseUsage;
  formats?: ParseResultFormats;
  extracted?: ParseExtraction | null;
  extraction_error?: string | null;
  artifacts?: Record<string, ParseArtifact> | null;
  artifact_error?: string | null;
}

export type ParseJob = OkraJob<ParseResult>;

export type FileUploadTransport = 'auto' | 'multipart' | 'direct';

export interface FileUploadOptions {
  /** Optional filename hint for binary uploads. Defaults to `document.pdf`. */
  fileName?: string;
  /** Optional document spec to seed before first parse. */
  config?: DocumentSpec;
  /** Transport hint. `auto` uses multipart for small PDFs and direct-to-R2 for larger ones. */
  transport?: FileUploadTransport;
  signal?: AbortSignal;
}

export interface FileListOptions {
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
}

export interface OkraFileUrls {
  bytes: string;
  document: string;
}

export interface OkraFile {
  id: string;
  file_id: string;
  object: 'file';
  name: string;
  mime: string;
  size: number;
  bytes: number;
  sha256: string;
  upload_mode: 'multipart' | 'presigned';
  created_at: string;
  updated_at: string;
  workflow_bound: false;
  urls: OkraFileUrls;
}

export interface OkraFileListResponse {
  object: 'list';
  data: OkraFile[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface DeleteFileResult {
  deleted: boolean;
  fileId: string;
}

export interface OkraFiles {
  /** Upload a passive PDF asset. Does not start parsing or bind to a workflow. */
  upload(input: UploadInput, options?: FileUploadOptions): Promise<OkraFile>;
  /** Fetch a passive PDF asset by id. */
  get(fileId: string, signal?: AbortSignal): Promise<OkraFile>;
  /** List passive PDF assets for the authenticated user. */
  list(options?: FileListOptions): Promise<OkraFileListResponse>;
  /** Delete a passive PDF asset if it has not been materialized as a document surface. */
  delete(fileId: string, signal?: AbortSignal): Promise<DeleteFileResult>;
  /** Deterministic PDF bytes URL for the passive file asset. */
  downloadUrl(fileId: string): string;
}

export type ApiResourceAuthMode = 'required' | 'optional' | 'public';

export interface ApiResourceOperation {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  action: string;
  description: string;
  auth: ApiResourceAuthMode;
  returns?: string;
}

export interface ApiResource {
  object: 'api_resource';
  name: string;
  path: string;
  description: string;
  aliases: string[];
  related_actions: string[];
  operations: ApiResourceOperation[];
}

export interface ApiAction {
  object: 'api_action';
  name: string;
  path: string;
  description: string;
  primary_resource: string;
  returns: string;
  operations: ApiResourceOperation[];
}

export interface ApiResourceCatalog {
  object: 'api_resource_catalog';
  version: string;
  data: ApiResource[];
  actions: ApiAction[];
  usage_hint: string;
}

export interface DocumentStatus {
  phase: string;
  pagesTotal?: number;
  pagesCompleted?: number;
  totalNodes?: number;
  verifiedNodes?: number;
  failedNodes?: number;
  pendingNodes?: number;
  plugins?: DocumentPluginState[];
  [key: string]: unknown;
}

export interface WaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  /** Use WebSocket for real-time progress instead of polling. Default: false. */
  realtime?: boolean;
  /** Progress callback (fires for each lifecycle event when realtime: true). */
  onProgress?: (event: import('./events').DocumentEvent) => void;
}

export interface CitationBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Standalone SDK mirror of the server's Anthropic page_location citation contract. */
export interface PageLocationCitation {
  type: 'page_location';
  cited_text: string;
  start_page_number: number;
  end_page_number: number;
  document_index?: number;
  document_title?: string;
  citation_url: string;
  match: 'exact' | 'fuzzy';
  field?: string;
  bbox?: CitationBbox;
  /** 'node' = real element box from the parse; 'page' = page-level fallback (#507). */
  bbox_source?: 'node' | 'page';
  block_id?: string;
}

/** One grounded citation in the opt-in Anthropic-shaped form (#505). */
export interface ExtractCitation extends PageLocationCitation {
  field: string;
  block_id: string;
}

export interface StructuredOutputMeta {
  confidence: number;
  model: string;
  durationMs: number;
  /**
   * Default = regex page citations `{ page, text }`. When the request opts in
   * with `cite: true`, this is instead the Anthropic-shaped grounded citation
   * array (#505): one `ExtractCitation` per grounded field with `cited_text`,
   * `start/end_page_number`, plus okra `bbox` + `field` + `match`.
   */
  citations?: Array<{ page: number; text: string } | ExtractCitation>;
}

export type StructuredSchema<T> = JsonSchema | ZodType<T>;

// ─── Pages / Entities / Query ────────────────────────────────────────────────

export interface PageBlock {
  text: string;
  bbox?: { x: number; y: number; width: number; height: number };
  confidence?: number;
}

export interface PageEntity {
  id: string;
  type: string;
  label: string | null;
}

export interface Page {
  page: number;
  content: string;
  blocks: PageBlock[];
  entities: PageEntity[];
}

export interface Entity {
  id: string;
  type: string;
  label: string | null;
  value: string | null;
  page_number: number | null;
  status: string;
  bbox_x?: number | null;
  bbox_y?: number | null;
  bbox_w?: number | null;
  bbox_h?: number | null;
  metadata?: string | null;
}

export interface EntitiesResponse {
  nodes: Entity[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  columns: string[];
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export interface LogEntry {
  seq: number;
  event: string;
  actor_type: string;
  actor_id: string;
  target_id: string | null;
  detail: string;
  created_at: number;
  prev_hash: string;
  chain_hash: string;
}

export interface LogsOptions {
  limit?: number;
  signal?: AbortSignal;
}

// ─── Completion / Chat (OpenAI SSE format) ───────────────────────────────────

/** A single SSE chunk from the OpenAI streaming response. */
export interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Events yielded by `session.stream()` / `client.stream()`. */
export type CompletionEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'done'; answer: string; costUsd?: number; sources?: Array<{ page: number; snippet: string }> }
  | { type: 'error'; message: string };

export interface CompletionOptions {
  stream?: boolean;
  model?: string;
  /** Maximum server-side tool round-trips before forcing a final answer. */
  maxSteps?: number;
  signal?: AbortSignal;
}

// ─── Generate (non-streaming AI) ─────────────────────────────────────────────

export interface GenerateOptions {
  schema?: StructuredSchema<unknown>;
  model?: string;
  /** Maximum server-side tool round-trips before forcing a final answer. */
  maxSteps?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Opt-in source grounding (#505): when true, `meta.citations` is the
   *  Anthropic-shaped grounded array (each field → source page + bbox). */
  cite?: boolean;
}

export interface GenerateResult<T = undefined> {
  answer: string;
  sources?: Array<{ page: number; snippet: string }>;
  costUsd?: number;
  /** Present when schema is provided. */
  data?: T;
  /** Present when schema is provided. */
  meta?: StructuredOutputMeta;
}

// ─── Sessions (document handles) ────────────────────────────────────────────

export interface SessionCreateOptions {
  /** Wait for extraction to complete before returning the session handle. Default: true */
  wait?: boolean;
  /** Default model used by prompt()/stream() unless overridden per call. */
  model?: string;
  /** Upload options used when source is URL/path/file (not an existing doc ID). */
  upload?: UploadOptions;
  /** Wait options used when `wait` is enabled. */
  waitOptions?: WaitOptions;
}

export interface SessionAttachOptions {
  /** Default model used by prompt()/stream() unless overridden per call. */
  model?: string;
}

export interface SessionState {
  id: string;
  model?: string;
  modelEndpoint: string;
}

export interface DocumentPluginState {
  plugin_name: string;
  desired_spec_version: number;
  desired_fingerprint: string | null;
  applied_spec_version: number | null;
  applied_fingerprint: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  trigger: 'ready' | 'config_changed' | 'delete' | null;
  workflow_id: string | null;
  output: Record<string, unknown> | null;
  error: string | null;
  last_run_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

export type DocumentAssetStatus = DocumentPluginState['status'];

export interface TocItem {
  id: string;
  title: string;
  page: number;
  level: number;
}

export interface TocAssetData {
  items: TocItem[];
  pageCount: number;
  generatedAt: number;
}

export interface DocumentAsset<T = Record<string, unknown>> {
  assetId: string;
  status: DocumentAssetStatus;
  data: T | null;
  error: string | null;
  updatedAt: number;
  raw: DocumentPluginState;
}

export interface OkraSession {
  readonly id: string;
  readonly modelEndpoint: string;
  readonly model?: string;
  state(): SessionState;
  setModel(model: string): Promise<void>;
  status(signal?: AbortSignal): Promise<DocumentStatus>;
  wait(options?: WaitOptions): Promise<DocumentStatus>;
  pages(options?: { range?: string; signal?: AbortSignal }): Promise<Page[]>;
  page(pageNumber: number, signal?: AbortSignal): Promise<Page>;
  entities(options?: { type?: string; limit?: number; offset?: number; signal?: AbortSignal }): Promise<EntitiesResponse>;
  downloadUrl(): string;
  query(sql: string, signal?: AbortSignal): Promise<QueryResult>;
  logs(options?: LogsOptions): Promise<LogEntry[]>;
  publish(signal?: AbortSignal): Promise<PublishResult>;
  shareLink(options?: ShareLinkOptions): Promise<ShareLinkResult>;
  assets(signal?: AbortSignal): Promise<DocumentAsset[]>;
  asset<T = Record<string, unknown>>(
    assetId: string,
    signal?: AbortSignal,
  ): Promise<DocumentAsset<T> | null>;
  prompt(
    query: string,
    options?: GenerateOptions & { schema?: undefined },
  ): Promise<GenerateResult>;
  prompt<T>(
    query: string,
    options: GenerateOptions & { schema: StructuredSchema<T> },
  ): Promise<GenerateResult<T>>;
  stream(
    query: string,
    options?: CompletionOptions,
  ): AsyncGenerator<CompletionEvent>;
}

// ─── Publish / Share ─────────────────────────────────────────────────────────

export interface PublishResult {
  published: boolean;
  documentId: string;
  version: string;
  publicUrl: string;
  /** Immutable public URL: https://api.okrapdf.com/v1/documents/{id} */
  url: string;
  hash: string;
  slug: string;
  canonicalPath: string;
}

export interface ShareLinkOptions {
  /** Link role: 'viewer' (redacted/PDF access), 'admin' (full access), or 'ask' (public completion). */
  role?: 'viewer' | 'ask' | 'admin';
  label?: string;
  expiresInMs?: number;
  maxViews?: number;
  signal?: AbortSignal;
}

export interface ShareLinkLinks {
  markdown: string | null;
  pdf: string | null;
  completion: string | null;
}

export interface ShareLinkCapabilities {
  canViewPdf: boolean;
}

export interface ShareLinkResult {
  documentId: string;
  token: string;
  tokenHint: string;
  links: ShareLinkLinks;
  capabilities: ShareLinkCapabilities;
  role: string;
  expiresAt: number;
  maxViews: number | null;
}

// ─── Collections (map-reduce query + ai-sdk completions) ─────────────────────
//
// Canonical Zod schemas: @okrapdf/schemas/collection-query + @okrapdf/schemas/collection
// These plain TS types mirror the schema shapes for the published SDK.

/** NDJSON events emitted by `client.collections.query()`.
 *  Mirrors `CollectionQueryEvent` in `@okrapdf/schemas`. */
export type CollectionQueryEvent =
  | { type: 'start'; query_id: string; prompt: string; doc_count: number }
  | { type: 'text_delta'; query_id: string; doc_id: string; text: string }
  | { type: 'result'; query_id: string; doc_id: string; status: 'fulfilled' | 'failed' | 'timeout'; answer: string; error?: string; data?: Record<string, unknown>; citations?: PageLocationCitation[]; usage: { cost_usd: number }; duration_ms: number }
  | { type: 'done'; query_id: string; completed: number; failed: number; total_cost_usd: number }
  | { type: 'error'; query_id: string; error: string };

/** Options for `client.collections.query()` — the map-reduce fan-out path. */
export interface CollectionQueryOptions<T = undefined> {
  /** Experimental: JSON Schema or Zod schema for structured extraction per document.
   *  When provided, each result includes a typed `data` field.
   *  Structured collection fan-out is not part of the stable v0.14 surface. */
  schema?: StructuredSchema<T>;
  /** Opt-in per-field source citations for structured collection extraction. */
  cite?: boolean;
  /** Subset of document IDs to query. Omit to query all docs in collection. */
  docIds?: string[];
  signal?: AbortSignal;
}

/** Per-document answer in a gathered collection query result. */
export interface DocumentAnswer<T = undefined> {
  docId: string;
  status: 'fulfilled' | 'failed' | 'timeout';
  /** Free-text answer (empty string for structured-only queries). */
  answer: string;
  /** Structured extraction output — present when query included a schema. */
  data?: T;
  /** Anthropic page_location citations returned when query included `cite: true`. */
  citations?: PageLocationCitation[];
  costUsd: number;
  durationMs: number;
  error?: string;
}

/** Aggregated result from `CollectionQueryStream.gather()`. */
export interface CollectionQueryResult<T = undefined> {
  queryId: string;
  prompt: string;
  answers: Map<string, DocumentAnswer<T>>;
  totalCostUsd: number;
  durationMs: number;
  completed: number;
  failed: number;
}

/**
 * Lazy stream handle returned by `client.collections.query()`.
 *
 * Two consumption modes:
 *   - Iterate for real-time per-doc events (spreadsheet UIs)
 *   - `.gather()` to await all results (scripts, pipelines)
 */
export interface CollectionQueryStream<T = undefined> extends AsyncIterable<CollectionQueryEvent> {
  /** Wait for all documents to complete and return the aggregated result. */
  gather(): Promise<CollectionQueryResult<T>>;
  /** Cancel the in-flight query. */
  abort(): void;
  /** Expose the underlying NDJSON body as a ReadableStream (for proxying). */
  toReadableStream(): ReadableStream<Uint8Array>;
}

// ─── Collection metadata ─────────────────────────────────────────────────────

/** A document summary inside a collection listing. */
export interface CollectionDocument {
  id: string;
  file_name: string;
  phase: string;
  pages_total: number;
  total_nodes: number;
  added_at: string;
  source: string;
}

/** Full collection metadata returned by `client.collections.get()`. */
export interface Collection {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
  visibility: 'public' | 'private';
  user_id: string;
  created_at: string;
  documents: CollectionDocument[];
}

/** Summary row returned by `client.collections.list()`. */
export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
}

// ─── Collection Export (markdown) ─────────────────────────────────────────────

export interface MarkdownPage {
  pageNumber: number;
  content: string;
  vendor: string;
}

export interface DocumentMarkdownExport {
  docId: string;
  fileName: string | null;
  pageCount: number;
  pages: MarkdownPage[];
}

export type CollectionExportEvent =
  | { type: 'start'; doc_count: number; format: string }
  | { type: 'result'; doc_id: string; file_name: string; page_count: number; pages: MarkdownPage[] }
  | { type: 'done'; completed: number; failed: number; total_pages: number }
  | { type: 'error'; error: string };

export type CollectionExportFormat = 'markdown' | 'zip';

export interface CollectionExportOptions {
  format?: CollectionExportFormat;
  signal?: AbortSignal;
}

export interface CollectionMarkdownExport {
  collectionId: string;
  collectionName: string;
  documents: DocumentMarkdownExport[];
  totalDocuments: number;
  totalPages: number;
  exportedAt: string;
}

// ─── Collections namespace (client.collections) ─────────────────────────────

export interface OkraCollections {
  // ── CRUD ──

  /** List all collections for the authenticated user. */
  list(signal?: AbortSignal): Promise<CollectionSummary[]>;

  /** Get a single collection with its documents. */
  get(collectionId: string, signal?: AbortSignal): Promise<Collection>;

  // ── map-reduce: fan-out prompt → N docs → N independent answers ──

  /** Unstructured fan-out — each doc answers independently via NDJSON stream. */
  query(
    collectionId: string,
    prompt: string,
    options?: CollectionQueryOptions,
  ): CollectionQueryStream;
  /** Experimental structured fan-out — each doc extracts typed data matching the schema.
   *  This schema-based collection path is not part of the stable v0.14 surface. */
  query<T>(
    collectionId: string,
    prompt: string,
    options: CollectionQueryOptions<T> & { schema: StructuredSchema<T> },
  ): CollectionQueryStream<T>;

  // ── ai-sdk completions: collection-as-model → 1 synthesized answer ──

  /** Streaming completion — collection acts as a single model endpoint.
   *  Returns the same `CompletionEvent` stream as `session.stream()`,
   *  so it plugs directly into AI SDK providers. */
  stream(
    collectionId: string,
    query: string,
    options?: CompletionOptions,
  ): AsyncGenerator<CompletionEvent>;

  /** Non-streaming completion — returns a single synthesized answer. */
  prompt(
    collectionId: string,
    query: string,
    options?: GenerateOptions & { schema?: undefined },
  ): Promise<GenerateResult>;
  /** Non-streaming structured completion — returns typed data. */
  prompt<T>(
    collectionId: string,
    query: string,
    options: GenerateOptions & { schema: StructuredSchema<T> },
  ): Promise<GenerateResult<T>>;

  // ── export: pre-computed markdown from R2 (no DO wake) ──

  /** Export pre-computed markdown for all documents in the collection (NDJSON parsed to JSON). */
  exportMarkdown(collectionId: string, signal?: AbortSignal): Promise<CollectionMarkdownExport>;
  /** Export with declarative format options (`markdown` or `zip`). */
  exportMarkdown(
    collectionId: string,
    options: CollectionExportOptions & { format: 'zip' },
  ): Promise<Uint8Array>;
  exportMarkdown(
    collectionId: string,
    options: CollectionExportOptions & { format?: 'markdown' },
  ): Promise<CollectionMarkdownExport>;
}

// ─── Delivery Transforms ─────────────────────────────────────────────────────

/** Delivery transform options for image resizing/processing (maps to CF Image Resizing). */
export interface DeliveryTransform {
  w?: number;
  h?: number;
  dpr?: number;
  q?: number;
  f?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
  md?: 'copyright' | 'keep' | 'none';
  c?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad' | 'squeeze';
  g?: 'auto' | 'face' | 'left' | 'right' | 'top' | 'bottom' | 'center';
  zm?: number;
  bl?: number;
  sh?: number;
  br?: number;
  co?: number;
  sa?: number;
  r?: number;
  fl?: 'h' | 'v' | 'hv';
  bg?: string;
  anim?: boolean;
  seg?: 'foreground';
}

// ─── URL Builder ─────────────────────────────────────────────────────────────

export interface UrlBuilderOptions {
  format?: 'json' | 'csv' | 'html' | 'markdown' | 'png';
  include?: string[];
  /** Provider transformation — changes extraction source, e.g. 'llamaparse', 'googleocr'. */
  provider?: string;
  /** Delivery transform for image resizing/processing. */
  transform?: DeliveryTransform;
}

// ─── List / Delete / Read ────────────────────────────────────────────────────

/** A document summary returned by `client.listDocuments()`. */
export interface DocumentListItem {
  id: string;
  file_name: string | null;
  phase: string;
  pages_total: number | null;
  total_nodes: number | null;
  visibility: 'public' | 'private';
  created_at: string;
}

export interface DocumentListResponse {
  documents: DocumentListItem[];
}

export interface ReadDocumentOptions {
  /** Page range in "1-5" format. Omit for full document. */
  pages?: string;
  signal?: AbortSignal;
}

export interface ReadDocumentResult {
  documentId: string;
  markdown: string;
}

export interface DeleteDocumentResult {
  deleted: boolean;
  documentId: string;
}

export interface DocUrlOptions {
  /**
   * Original source filename used to build friendly artifact URLs, e.g.
   * /.../invoice.json
   */
  fileName?: string;
  /**
   * Default provider transformation applied to all URLs from this builder,
   * e.g. `/t_llamaparse/pages/1.md` vs `/t_googleocr/pages/1.json`.
   */
  provider?: string;
  /**
   * Default image placeholder type when page image is not yet available.
   * Inserts `/d_{type}/` segment. e.g. 'shimmer' → `/d_shimmer/pages/1/image.png`
   */
  defaultImage?: string;
  /**
   * Friendly alias for `defaultImage`. Placeholder for images not yet rendered.
   * 'shimmer' | 'auto' | 'color:hex'. Inserts `/d_{placeholder}/` segment.
   */
  placeholder?: string;
  /** Output schema name — inserts `/o_{schema}/` segment. */
  output?: string;
  /**
   * Switches the origin path from `/document/:id/` (session-cookie auth)
   * to `/v1/documents/:id/` (public). Required for `<img>` tags and any
   * browser request that won't carry an auth cookie. Default: `false`.
   */
  public?: boolean;
  /**
   * @deprecated Use `pdfSha` + `renderer` to emit `imagedelivery.net` URLs instead.
   * When `true`, image URLs are wrapped with `<zone>/cdn-cgi/image/<opts>/<source>`.
   * Will be removed in v0.16.x once all consumers migrate.
   */
  cdnImage?: boolean;

  // ─── Cloudflare Images (v0.15.x primary path) ──────────────────────────

  /**
   * PDF sha256 (full 64-hex). When provided together with `renderer`, image
   * URLs target `imagedelivery.net/<accountHash>/okra-{env}-{pdfSha12}-p{N}-r{V}-{renderer}/{variant}`
   * — content-addressed, dedup'd, cache-immutable per ID.
   *
   * Without `pdfSha`, image URLs fall back to the origin path (legacy).
   * Fetch `pdfSha` from the existing `/status` endpoint or use `resolveDoc(id)`.
   */
  pdfSha?: string;
  /**
   * Render backend that produced the bytes: `mupdf150` (MuPDF container @ 150 DPI)
   * or `pdfjs2x` (pdf.js via Browser Rendering @ scale=2). Encoded in the image ID
   * so backend-divergent bytes cannot collide under one ID.
   */
  renderer?: 'mupdf150' | 'pdfjs2x' | (string & {});
  /**
   * Environment prefix for CF Images IDs — prevents cross-env collisions when
   * prod/staging/dev share a CF account. Default: `'prod'`.
   */
  env?: 'prod' | 'staging' | 'dev' | (string & {});
  /**
   * CF Images account hash — the path prefix on `imagedelivery.net/<hash>/...`.
   * Public value, safe to bake into client bundles. When omitted, image URLs
   * fall back to the origin path.
   */
  accountHash?: string;
  /**
   * Base URL for `imagedelivery.net`. Override for self-hosted CF Images or
   * custom delivery domains. Default: `'https://imagedelivery.net'`.
   */
  imagesBaseUrl?: string;
  /**
   * Render schema version encoded in the ID (`-r{V}`). Bumps when render
   * params change (pdf.js version, DPI, anti-aliasing). Default: `1`.
   */
  renderVersion?: number;
  /**
   * Sha-prefix width in hex chars. Default: `12` (48 bits, ~10⁻⁵ collision p at 100K).
   * Auto-escalates to `16` on observed collision; bump account-wide at 1M-PDF milestone.
   */
  pdfShaLength?: number;
}
