import { normalizeDocumentAssets } from './assets';
import { OkraRuntimeError, StructuredOutputError } from './errors';
import { DocumentEventStream, type DocumentEventStreamOptions } from './events';
import { normalizeStructuredSchema } from './structured-schema';
import { createHttpContextClient, type OkraContextClient } from './context';
import { defineDynamicWorkflow, dynamicWorkflowToAgentWorkflowSource } from './workflows';
import type {
  DocumentAsset,
  ApiAction,
  ApiResource,
  ApiResourceCatalog,
  OkraClientOptions,
  OkraFile,
  JobListOptions,
  JobListResponse,
  OkraJob,
  ParseOptions,
  ParseJob,
  Collection,
  CollectionExportFormat,
  CollectionExportOptions,
  CollectionExportEvent,
  CollectionMarkdownExport,
  CollectionQueryEvent,
  CollectionQueryOptions,
  CollectionQueryResult,
  CollectionQueryStream,
  CollectionSummary,
  CompletionEvent,
  CompletionOptions,
  CreateJobOptions,
  DeleteFileResult,
  DeleteDocumentResult,
  DocumentAnswer,
  DocumentConfigResult,
  DocumentConfigUpdate,
  DocumentListItem,
  DocumentListResponse,
  DocumentMarkdownExport,
  DocumentStatus,
  EntitiesResponse,
  FileListOptions,
  FileUploadOptions,
  GenerateOptions,
  GenerateResult,
  InvoiceExtractionException,
  InvoiceExtractionExceptionList,
  InvoiceExtractionExceptionResolution,
  InvoiceExtractionResolveExceptionOptions,
  InvoiceExtractionRun,
  InvoiceExtractionRunList,
  InvoiceExtractionRunListOptions,
  InvoiceExtractionRunOptions,
  LogEntry,
  LogsOptions,
  MarkdownPage,
  OkraFiles,
  OkraFileListResponse,
  Page,
  PublishResult,
  QueryResult,
  ReadDocumentOptions,
  ReadDocumentResult,
  ReparseOptions,
  ReparseResult,
  RuntimeErrorCode,
  ShareLinkOptions,
  ShareLinkResult,
  SessionAttachOptions,
  SessionCreateOptions,
  DocumentSpec,
  DocumentSpecRecord,
  SessionState,
  OkraSession,
  StructuredOutputErrorCode,
  StructuredOutputMeta,
  StructuredSchema,
  ApiKeyWorkflowConfigResponse,
  ApplyWorkflowOptions,
  ApplyWorkflowResult,
  UploadInput,
  UploadOptions,
  VerifyParams,
  VerifyResult,
  WaitOptions,
} from './types';
import type {
  DynamicWorkflowDatasetRef,
  DynamicWorkflowDefinition,
  DynamicWorkflowRun,
  DynamicWorkflowRunList,
  DynamicWorkflowRunListOptions,
  DynamicWorkflowRunOptions,
} from './workflows';

const DEFAULT_BASE_URL = 'https://api.okrapdf.com';
const DEFAULT_WAIT_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_WAIT_POLL_MS = 1_500;
const DEFAULT_FILE_DIRECT_UPLOAD_THRESHOLD_BYTES = 16 * 1024 * 1024;
const COMPLETE_PHASES = new Set(['complete', 'awaiting_review']);
const TERMINAL_ERROR_PHASES = new Set(['error']);
const STRUCTURED_CODES = new Set<StructuredOutputErrorCode>([
  'SCHEMA_VALIDATION_FAILED',
  'EXTRACTION_FAILED',
  'TIMEOUT',
  'DOCUMENT_NOT_FOUND',
]);
const NODE_FS_PROMISES_SPECIFIER = `node:${'fs/promises'}`;
const NODE_PATH_SPECIFIER = `node:${'path'}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isDocumentId(value: string): boolean {
  return /^(?:ocr|doc)-[A-Za-z0-9_-]+$/.test(value);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function makeDocId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `doc-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  }
  const rand = Math.random().toString(36).slice(2, 22);
  return `doc-${rand}`;
}

function normalizeInvoiceWorkflowInputs(
  inputs: InvoiceExtractionRunOptions['inputs'],
): Array<{ file_id: string }> {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new OkraRuntimeError(
      'INVALID_REQUEST',
      'invoice extraction requires at least one file input',
      400,
    );
  }

  return inputs.map((input) => {
    const fileId =
      typeof input === 'string'
        ? input
        : input.file_id ?? input.fileId ?? '';
    if (!fileId.trim()) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        'invoice extraction inputs must include a file id',
        400,
      );
    }
    return { file_id: fileId };
  });
}

type InvoiceExtractionRunApiResponse = {
  id: string;
  run_id: string;
  status: string;
  workflow_name: 'invoice-extraction';
  workflow_label: string;
  workflow_version: number;
  quality: InvoiceExtractionRun['quality'];
  table_id: string;
  agent_id?: string | null;
  inputs: Array<{ file_id: string }>;
  events_url: string;
  stream_url: string;
  rows_url: string;
  exports: {
    csv_url: string;
    json_url: string;
    xml_url?: string;
    xlsx_url?: string;
    [key: string]: unknown;
  };
  created_at: string;
};

type InvoiceExtractionExceptionApiResponse = {
  id: string;
  run_id: string;
  table_id: string;
  row_id?: string | null;
  file_id?: string | null;
  field?: string | null;
  code: InvoiceExtractionException['code'];
  severity: InvoiceExtractionException['severity'];
  status: InvoiceExtractionException['status'];
  message: string;
  value?: unknown;
  source_page?: number | null;
  source_bbox?: string | null;
  created_at: string;
};

type WorkflowResourceRunResponse = {
  object?: string;
  id?: string;
  run_id?: string;
  workflow_id?: string;
  workflow_version_id?: string;
  status?: string;
  status_url?: string;
  controller_output?: unknown;
  output?: unknown;
  stats?: unknown;
  error?: unknown;
  created_at?: string;
  updated_at?: string;
  manifest?: {
    created_at?: string;
    updated_at?: string;
  };
};

type WorkflowResourceCreateResponse = {
  object?: string;
  id: string;
  workflow_id?: string;
  name?: string | null;
  run?: WorkflowResourceRunResponse | null;
  created_at?: string;
};

type WorkflowRunListResourceResponse = {
  object?: 'list';
  data?: WorkflowResourceRunResponse[];
  has_more?: boolean;
  next_cursor?: string | null;
};

function normalizeDynamicWorkflowStatus(status: unknown): DynamicWorkflowRun['status'] {
  switch (typeof status === 'string' ? status : '') {
    case 'planned':
      return 'planned';
    case 'queued':
      return 'queued';
    case 'running':
      return 'running';
    case 'completed':
    case 'complete':
    case 'done':
    case 'succeeded':
      return 'succeeded';
    case 'failed':
    case 'error':
      return 'failed';
    case 'cancelled':
    case 'canceled':
      return 'canceled';
    default:
      return 'queued';
  }
}

function mapWorkflowResourceRun(
  run: WorkflowResourceRunResponse,
  fallbackWorkflowId?: string,
  dataset?: DynamicWorkflowDatasetRef,
): DynamicWorkflowRun {
  const runId = run.run_id ?? run.id ?? '';
  const workflowId = run.workflow_id ?? fallbackWorkflowId ?? '';
  return {
    id: runId,
    object: 'workflow_eval_run',
    status: normalizeDynamicWorkflowStatus(run.status),
    workflowId,
    ...(dataset ? { dataset } : {}),
    ...(run.status_url ? { eventsUrl: run.status_url, resultsUrl: run.status_url } : {}),
    summary: {
      controller_output: run.controller_output ?? null,
      output: run.output ?? null,
      stats: run.stats ?? null,
      error: run.error ?? null,
    },
    createdAt: run.created_at ?? run.manifest?.created_at,
    updatedAt: run.updated_at ?? run.manifest?.updated_at,
  };
}

function mapInvoiceExtractionRun(
  result: InvoiceExtractionRunApiResponse,
): InvoiceExtractionRun {
  return {
    id: result.id,
    runId: result.run_id,
    status: result.status,
    workflowName: result.workflow_name,
    workflowLabel: result.workflow_label,
    workflowVersion: result.workflow_version,
    quality: result.quality,
    tableId: result.table_id,
    agentId: result.agent_id,
    inputs: result.inputs.map((input) => ({ fileId: input.file_id })),
    eventsUrl: result.events_url,
    streamUrl: result.stream_url,
    rowsUrl: result.rows_url,
    exports: {
      csvUrl: result.exports.csv_url,
      jsonUrl: result.exports.json_url,
      ...(result.exports.xml_url ? { xmlUrl: result.exports.xml_url } : {}),
      ...(result.exports.xlsx_url ? { xlsxUrl: result.exports.xlsx_url } : {}),
      ...result.exports,
    },
    createdAt: result.created_at,
  };
}

function mapInvoiceExtractionException(
  result: InvoiceExtractionExceptionApiResponse,
): InvoiceExtractionException {
  return {
    id: result.id,
    runId: result.run_id,
    tableId: result.table_id,
    rowId: result.row_id,
    fileId: result.file_id,
    field: result.field,
    code: result.code,
    severity: result.severity,
    status: result.status,
    message: result.message,
    value: result.value,
    sourcePage: result.source_page,
    sourceBbox: result.source_bbox,
    createdAt: result.created_at,
  };
}

function normalizeDocumentStatus(status: DocumentStatus): DocumentStatus {
  const totalPages =
    typeof status.pagesTotal === 'number'
      ? status.pagesTotal
      : typeof status.totalPages === 'number'
        ? status.totalPages
        : undefined;

  if (typeof totalPages !== 'number' || totalPages === status.pagesTotal) {
    return status;
  }

  return {
    ...status,
    pagesTotal: totalPages,
  };
}

function mergeCapabilitiesIntoDocumentSpec(
  spec: DocumentSpec,
  capabilities: ApplyWorkflowOptions['capabilities'],
): DocumentSpec {
  const next: DocumentSpec = {
    ...spec,
    extract: { ...spec.extract },
    features: { ...spec.features },
  };

  if (typeof capabilities.vlm_qwen === 'boolean') {
    next.features.vlm_qwen = capabilities.vlm_qwen;
  }
  if (typeof capabilities.structural_check === 'boolean') {
    next.features.structural_check = capabilities.structural_check;
  }
  if (typeof capabilities.sandbox_verify === 'boolean') {
    next.features.sandbox_verify = capabilities.sandbox_verify;
  }
  if (typeof capabilities.search === 'boolean') {
    next.features.search = capabilities.search;
  }

  const ocrPhase = capabilities.phases?.ocr;
  if (ocrPhase?.vendor) {
    next.extract.provider = ocrPhase.vendor;
  } else if (ocrPhase?.enabled === false) {
    next.extract.provider = null;
  }

  return next;
}

function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

interface NodeFsModule {
  readFile(path: string): Promise<ArrayBuffer | Uint8Array>;
}

interface NodePathModule {
  basename(path: string): string;
}

interface NamedBlob extends Blob {
  name?: string;
}

function isBlobLike(input: unknown): input is Blob {
  if (typeof Blob !== 'undefined' && input instanceof Blob) return true;
  return (
    !!input &&
    typeof input === 'object' &&
    typeof (input as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  );
}

function inferBlobName(input: Blob, fallback: string): string {
  const named = input as NamedBlob;
  if (typeof named.name === 'string' && named.name.trim() !== '') {
    return named.name;
  }
  return fallback;
}

function toHeaderSafeFileName(fileName: string): string {
  const leaf = fileName.split(/[\\/]/).pop() || fileName;
  const cleaned = leaf.replace(/[\r\n]/g, ' ').trim();

  if (/^[\x20-\x7E]+$/.test(cleaned)) {
    return cleaned;
  }

  const extMatch = cleaned.match(/(\.[A-Za-z0-9]{1,10})$/);
  const extension = extMatch?.[1].toLowerCase() ?? '';
  const base = extension ? cleaned.slice(0, -extension.length) : cleaned;

  const asciiBase = base
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');

  return `${asciiBase || 'document'}${extension || '.pdf'}`;
}

function normalizePdfFileName(fileName: string): string {
  const safe = toHeaderSafeFileName(fileName || 'document.pdf');
  if (safe.toLowerCase().endsWith('.pdf')) {
    return safe;
  }
  const stripped = safe.replace(/\.[A-Za-z0-9]{1,10}$/u, '');
  return `${stripped || 'document'}.pdf`;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Build a binary string in chunks to avoid `String.fromCharCode(...bytes)`
  // exceeding the JS argument-list limit on large PDFs.
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  if (typeof btoa === 'function') return btoa(binary);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bufferCtor = (globalThis as any).Buffer;
  if (bufferCtor) return bufferCtor.from(bytes).toString('base64');
  throw new Error('No base64 encoder available in this runtime');
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function sha256HexFromBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', uint8ArrayToArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function readLocalFileFromNode(
  inputPath: string,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  try {
    const [fsModule, pathModule] = await Promise.all([
      import(/* @vite-ignore */ NODE_FS_PROMISES_SPECIFIER) as Promise<NodeFsModule>,
      import(/* @vite-ignore */ NODE_PATH_SPECIFIER) as Promise<NodePathModule>,
    ]);
    const raw = await fsModule.readFile(inputPath);
    return {
      bytes: toUint8Array(raw),
      fileName: pathModule.basename(inputPath),
    };
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: unknown }).code)
        : undefined;
    const msg = error instanceof Error ? error.message : String(error);

    if (code === 'ENOENT') {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        `Local file not found: ${inputPath}`,
        400,
        error,
      );
    }

    if (code === 'EACCES' || code === 'EPERM') {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        `Cannot read local file (${code}): ${inputPath}`,
        400,
        error,
      );
    }

    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'ERR_UNKNOWN_BUILTIN_MODULE') {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        'Local file path uploads are only supported in Node.js. In browser runtimes, pass File/Blob, ArrayBuffer, Uint8Array, or URL.',
        400,
        error,
      );
    }

    throw new OkraRuntimeError(
      'INVALID_REQUEST',
      `Failed to read local file "${inputPath}": ${msg}`,
      400,
      error,
    );
  }
}

interface StructuredErrorEnvelope {
  code?: string;
  message?: string;
  details?: unknown;
  error?: string | { message?: string; code?: string; details?: unknown; type?: string };
}

interface OkraFileUploadSession {
  id: string;
  file_id: string;
  object: 'file_upload';
  file_name: string;
  r2_key: string;
  upload_url: string;
  upload_method: 'PUT';
  upload_headers: Record<string, string>;
  finalize_url: string;
  expires_in: number;
  max_bytes: number;
  workflow_bound: false;
}

function isStructuredCode(code: string | undefined): code is StructuredOutputErrorCode {
  return !!code && STRUCTURED_CODES.has(code as StructuredOutputErrorCode);
}

function getErrorMessage(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value;
  return undefined;
}

// ─── Session Handle ──────────────────────────────────────────────────────────

class OkraSessionHandle implements OkraSession {
  readonly id: string;
  readonly modelEndpoint: string;
  #model?: string;
  #client: OkraClient;

  constructor(client: OkraClient, documentId: string, model?: string) {
    this.#client = client;
    this.id = documentId;
    this.modelEndpoint = client.modelEndpoint(documentId);
    this.#model = model;
  }

  get model(): string | undefined {
    return this.#model;
  }

  state(): SessionState {
    return {
      id: this.id,
      model: this.#model,
      modelEndpoint: this.modelEndpoint,
    };
  }

  async setModel(model: string): Promise<void> {
    const normalized = model.trim();
    if (!normalized) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        'session.setModel requires a non-empty model',
        400,
      );
    }
    this.#model = normalized;
  }

  status(signal?: AbortSignal): Promise<DocumentStatus> {
    return this.#client.status(this.id, signal);
  }

  wait(options?: WaitOptions): Promise<DocumentStatus> {
    return this.#client.wait(this.id, options);
  }

  pages(options?: { range?: string; signal?: AbortSignal }): Promise<Page[]> {
    return this.#client.pages(this.id, options);
  }

  page(pageNumber: number, signal?: AbortSignal): Promise<Page> {
    return this.#client.page(this.id, pageNumber, signal);
  }

  entities(options?: {
    type?: string;
    limit?: number;
    offset?: number;
    signal?: AbortSignal;
  }): Promise<EntitiesResponse> {
    return this.#client.entities(this.id, options);
  }

  downloadUrl(): string {
    return this.#client.downloadUrl(this.id);
  }

  query(sql: string, signal?: AbortSignal): Promise<QueryResult> {
    return this.#client.query(this.id, sql, signal);
  }

  logs(options?: LogsOptions): Promise<LogEntry[]> {
    return this.#client.logs(this.id, options);
  }

  publish(signal?: AbortSignal): Promise<PublishResult> {
    return this.#client.publish(this.id, signal);
  }

  shareLink(options?: ShareLinkOptions): Promise<ShareLinkResult> {
    return this.#client.shareLink(this.id, options);
  }

  assets(signal?: AbortSignal): Promise<DocumentAsset[]> {
    return this.#client.assets(this.id, signal);
  }

  asset<T = Record<string, unknown>>(
    assetId: string,
    signal?: AbortSignal,
  ): Promise<DocumentAsset<T> | null> {
    return this.#client.asset<T>(this.id, assetId, signal);
  }

  prompt(
    query: string,
    options?: GenerateOptions & { schema?: undefined },
  ): Promise<GenerateResult>;
  prompt<T>(
    query: string,
    options: GenerateOptions & { schema: StructuredSchema<T> },
  ): Promise<GenerateResult<T>>;
  prompt<T = undefined>(query: string, options?: GenerateOptions): Promise<GenerateResult<T>> {
    const model = options?.model ?? this.#model;
    const merged = model ? { ...options, model } : options;
    if (merged?.schema !== undefined) {
      return this.#client.generate(
        this.id,
        query,
        merged as GenerateOptions & { schema: StructuredSchema<unknown> },
      ) as Promise<GenerateResult<T>>;
    }
    return this.#client.generate(
      this.id,
      query,
      merged as GenerateOptions & { schema?: undefined },
    ) as Promise<GenerateResult<T>>;
  }

  stream(query: string, options?: CompletionOptions): AsyncGenerator<CompletionEvent> {
    const model = options?.model ?? this.#model;
    const merged = model ? { ...options, model } : options;
    return this.#client.stream(this.id, query, merged);
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class OkraClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly sharedSecret?: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private documentStatusRoute: 'v1' | 'document' = 'v1';
  readonly sessions: {
    create: (sourceOrDocId: UploadInput, options?: SessionCreateOptions) => Promise<OkraSession>;
    from: (documentId: string, options?: SessionAttachOptions) => OkraSession;
  };
  readonly collections: {
    list: (signal?: AbortSignal) => Promise<CollectionSummary[]>;
    get: (collectionId: string, signal?: AbortSignal) => Promise<Collection>;
    query: <T = undefined>(
      collectionId: string,
      prompt: string,
      options?: CollectionQueryOptions<T>,
    ) => CollectionQueryStream<T>;
    exportMarkdown: (
      collectionId: string,
      options?: AbortSignal | CollectionExportOptions,
    ) => Promise<CollectionMarkdownExport | Uint8Array>;
  };
  readonly files: OkraFiles;
  readonly resources: {
    list: (signal?: AbortSignal) => Promise<ApiResourceCatalog>;
    get: (name: string, signal?: AbortSignal) => Promise<ApiResource | ApiAction>;
  };
  readonly context: OkraContextClient;
  readonly workflows: {
    run: (
      definition: DynamicWorkflowDefinition,
      options?: DynamicWorkflowRunOptions,
    ) => Promise<DynamicWorkflowRun>;
    getRun: (runId: string, signal?: AbortSignal) => Promise<DynamicWorkflowRun>;
    listRuns: (options?: DynamicWorkflowRunListOptions) => Promise<DynamicWorkflowRunList>;
  };
  constructor(options: OkraClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
    this.apiKey = options.apiKey;
    this.sharedSecret = options.sharedSecret;
    this.fetchImpl = options.fetch || globalThis.fetch.bind(globalThis);

    if (!this.apiKey && !this.sharedSecret) {
      throw new OkraRuntimeError(
        'UNAUTHORIZED',
        'OkraClient requires either apiKey or sharedSecret',
        401,
      );
    }

    if (
      typeof globalThis !== 'undefined' &&
      'window' in globalThis &&
      this.apiKey &&
      !this.apiKey.startsWith('okra_pk_')
    ) {
      console.warn(
        '[okraPDF] Secret API key detected in browser. Avoid exposing secret keys in client-side code. ' +
          'Use a server-side proxy or another trusted backend boundary for browser apps.',
      );
    }

    this.sessions = {
      create: async (sourceOrDocId, sessionOptions = {}) => {
        let documentId: string;
        if (typeof sourceOrDocId === 'string' && isDocumentId(sourceOrDocId.trim())) {
          documentId = sourceOrDocId.trim();
        } else {
          const session = await this.upload(sourceOrDocId, sessionOptions.upload);
          documentId = session.id;
        }

        const session = this.sessions.from(documentId, { model: sessionOptions.model });
        if (sessionOptions.wait ?? true) {
          await session.wait(sessionOptions.waitOptions);
        }
        return session;
      },
      from: (documentId, sessionOptions = {}) => {
        const normalized = documentId.trim();
        if (!normalized) {
          throw new OkraRuntimeError(
            'INVALID_REQUEST',
            'sessions.from requires a non-empty documentId',
            400,
          );
        }

        return new OkraSessionHandle(this, normalized, sessionOptions.model?.trim() || undefined);
      },
    };

    this.collections = {
      list: (signal) => this.collectionList(signal),
      get: (collectionId, signal) => this.collectionGet(collectionId, signal),
      query: <T = undefined>(
        collectionId: string,
        prompt: string,
        options?: CollectionQueryOptions<T>,
      ) => this.collectionQuery<T>(collectionId, prompt, options),
      exportMarkdown: (collectionId, options?) =>
        this.collectionExportMarkdown(collectionId, options),
    };

    this.files = {
      upload: (input, uploadOptions) => this.fileUpload(input, uploadOptions),
      get: (fileId, signal) => this.getFile(fileId, signal),
      list: (listOptions) => this.listFiles(listOptions),
      delete: (fileId, signal) => this.deleteFile(fileId, signal),
      downloadUrl: (fileId) => this.fileDownloadUrl(fileId),
    };

    this.resources = {
      list: (signal) => this.listResources(signal),
      get: (name, signal) => this.getResource(name, signal),
    };

    this.context = createHttpContextClient({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      sharedSecret: this.sharedSecret,
      fetch: this.fetchImpl,
    });

    this.workflows = {
      run: (definition, runOptions) => this.runDynamicWorkflow(definition, runOptions),
      getRun: (runId, signal) => this.getDynamicWorkflowRun(runId, signal),
      listRuns: (listOptions) => this.listDynamicWorkflowRuns(listOptions),
    };
  }

  // ─── API Resources ──────────────────────────────────────────────────────

  async listResources(signal?: AbortSignal): Promise<ApiResourceCatalog> {
    return this.requestJson<ApiResourceCatalog>('/v1/resources', {
      method: 'GET',
      signal,
    });
  }

  async getResource(name: string, signal?: AbortSignal): Promise<ApiResource | ApiAction> {
    const normalized = name.trim();
    if (!normalized) {
      throw new OkraRuntimeError('INVALID_REQUEST', 'resources.get requires a non-empty resource name', 400);
    }
    return this.requestJson<ApiResource | ApiAction>(`/v1/resources/${encodeURIComponent(normalized)}`, {
      method: 'GET',
      signal,
    });
  }

  // ─── Collections ────────────────────────────────────────────────────────

  private async collectionList(signal?: AbortSignal): Promise<CollectionSummary[]> {
    const res = await this.requestJson<{ collections: CollectionSummary[] }>('/v1/collections', {
      method: 'GET',
      signal,
    });
    return res.collections;
  }

  private async collectionGet(collectionId: string, signal?: AbortSignal): Promise<Collection> {
    return this.requestJson<Collection>(`/v1/collections/${encodeURIComponent(collectionId)}`, {
      method: 'GET',
      signal,
    });
  }

  private collectionQuery<T = undefined>(
    collectionId: string,
    prompt: string,
    options?: CollectionQueryOptions<T>,
  ): CollectionQueryStream<T> {
    const ac = new AbortController();
    if (options?.signal) {
      options.signal.addEventListener('abort', () => ac.abort(), { once: true });
    }

    const body: Record<string, unknown> = { prompt, stream: true };
    if (options?.schema) {
      const normalized = normalizeStructuredSchema(options.schema);
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'result', schema: normalized.jsonSchema },
      };
    }
    if (options?.cite) {
      body.cite = true;
    }
    if (options?.docIds) {
      body.doc_ids = options.docIds;
    }

    const responsePromise = this.rawRequest(
      `/v1/collections/${encodeURIComponent(collectionId)}/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      },
    );

    async function* iterateNdjson(): AsyncGenerator<CollectionQueryEvent> {
      const response = await responsePromise;
      if (!response.ok) {
        const text = await response.text();
        throw new OkraRuntimeError(
          'HTTP_ERROR',
          `Collection query failed: ${text}`,
          response.status,
        );
      }
      if (!response.body) {
        throw new OkraRuntimeError(
          'INVALID_RESPONSE',
          'No response body for collection query',
          500,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              yield JSON.parse(trimmed) as CollectionQueryEvent;
            } catch {
              // skip malformed lines
            }
          }
        }

        // flush remaining buffer
        const remaining = buffer.trim();
        if (remaining) {
          try {
            yield JSON.parse(remaining) as CollectionQueryEvent;
          } catch {
            // skip
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Tee the generator so gather() and iteration don't conflict
    let iteratorInstance: AsyncGenerator<CollectionQueryEvent> | null = null;
    function getIterator(): AsyncGenerator<CollectionQueryEvent> {
      if (!iteratorInstance) iteratorInstance = iterateNdjson();
      return iteratorInstance;
    }

    const stream: CollectionQueryStream<T> = {
      [Symbol.asyncIterator]() {
        return getIterator();
      },

      async gather(): Promise<CollectionQueryResult<T>> {
        const startTime = Date.now();
        const answers = new Map<string, DocumentAnswer<T>>();
        let queryId = '';
        let queryPrompt = prompt;
        let totalCostUsd = 0;
        let completed = 0;
        let failed = 0;

        for await (const event of getIterator()) {
          if (event.type === 'start') {
            queryId = event.query_id;
            queryPrompt = event.prompt;
          } else if (event.type === 'result') {
            answers.set(event.doc_id, {
              docId: event.doc_id,
              status: event.status,
              answer: event.answer,
              data: event.data as T | undefined,
              ...(event.citations ? { citations: event.citations } : {}),
              costUsd: event.usage?.cost_usd ?? 0,
              durationMs: event.duration_ms,
              error: event.error,
            });
          } else if (event.type === 'done') {
            totalCostUsd = event.total_cost_usd;
            completed = event.completed;
            failed = event.failed;
          } else if (event.type === 'error') {
            throw new OkraRuntimeError('HTTP_ERROR', event.error, 500);
          }
        }

        return {
          queryId,
          prompt: queryPrompt,
          answers,
          totalCostUsd,
          durationMs: Date.now() - startTime,
          completed,
          failed,
        };
      },

      abort() {
        ac.abort();
      },

      toReadableStream(): ReadableStream<Uint8Array> {
        // Return raw body — lazy, only fetched if called before iteration
        const encoder = new TextEncoder();
        const iter = getIterator();
        return new ReadableStream({
          async pull(controller) {
            const { done, value } = await iter.next();
            if (done) {
              controller.close();
            } else {
              controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
            }
          },
          cancel() {
            ac.abort();
          },
        });
      },
    };

    return stream;
  }

  // ─── Collection Export (markdown from R2) ────────────────────────────────

  private collectionExportPath(collectionId: string, format: CollectionExportFormat): string {
    return `/v1/collections/${encodeURIComponent(collectionId)}/export?format=${encodeURIComponent(format)}`;
  }

  private async collectionExportMarkdown(
    collectionId: string,
    options?: AbortSignal | CollectionExportOptions,
  ): Promise<CollectionMarkdownExport | Uint8Array> {
    let format: CollectionExportFormat = 'markdown';
    let signal: AbortSignal | undefined;

    if (options && typeof options === 'object' && 'aborted' in options) {
      signal = options as AbortSignal;
    } else if (options) {
      format = options.format ?? 'markdown';
      signal = options.signal;
    }

    const response = await this.rawRequest(this.collectionExportPath(collectionId, format), {
      method: 'GET',
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new OkraRuntimeError(
        'HTTP_ERROR',
        `Collection export failed: ${text}`,
        response.status,
      );
    }

    if (format === 'zip') {
      const body = await response.arrayBuffer();
      return new Uint8Array(body);
    }

    if (!response.body) {
      throw new OkraRuntimeError('INVALID_RESPONSE', 'No response body for collection export', 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const documents: DocumentMarkdownExport[] = [];
    let totalPages = 0;
    let collectionName = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed) as CollectionExportEvent;
            if (event.type === 'result') {
              documents.push({
                docId: event.doc_id,
                fileName: event.file_name,
                pageCount: event.page_count,
                pages: event.pages,
              });
              totalPages += event.page_count;
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      // flush remaining buffer
      const remaining = buffer.trim();
      if (remaining) {
        try {
          const event = JSON.parse(remaining) as CollectionExportEvent;
          if (event.type === 'result') {
            documents.push({
              docId: event.doc_id,
              fileName: event.file_name,
              pageCount: event.page_count,
              pages: event.pages,
            });
            totalPages += event.page_count;
          }
        } catch {
          // skip
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Try to get collection name from metadata
    try {
      const col = await this.collectionGet(collectionId);
      collectionName = col.name;
    } catch {
      collectionName = collectionId;
    }

    return {
      collectionId,
      collectionName,
      documents,
      totalDocuments: documents.length,
      totalPages,
      exportedAt: new Date().toISOString(),
    };
  }

  // ─── Upload ──────────────────────────────────────────────────────────────

  async upload(input: UploadInput, options: UploadOptions = {}): Promise<OkraSession> {
    const documentId = options.documentId || makeDocId();
    const path = `/document/${encodeURIComponent(documentId)}`;
    const visibility = options.visibility || 'private';

    // Open event stream before upload if progress callback provided
    let eventStream: DocumentEventStream | null = null;
    if (options.onProgress) {
      eventStream = this.events(documentId);
      eventStream.on('*', options.onProgress);
      eventStream.connect();
    }

    if (typeof input === 'string' && isHttpUrl(input)) {
      const urlHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options.vendorKeys) {
        urlHeaders['X-Vendor-Keys'] = JSON.stringify(options.vendorKeys);
      }
      await this.requestJson<{ phase?: string }>(`${path}/upload-url`, {
        method: 'POST',
        headers: urlHeaders,
        body: JSON.stringify({
          url: input,
          capabilities: options.capabilities,
          visibility,
          redact: options.redact,
          ...(options.intent ? { intent: options.intent } : {}),
          ...(options.config ? { config: options.config } : {}),
          ...(options.vendorOptions ? { vendor_options: options.vendorOptions } : {}),
        }),
      });
      const session = this.sessions.from(documentId);
      if (eventStream) (session as any).__eventStream = eventStream;
      return session;
    }

    const resolved = await this.resolveBinaryUpload(input, options.fileName);
    const bytes = resolved.bytes;
    const fileName = resolved.fileName;

    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
      'X-File-Name': toHeaderSafeFileName(fileName),
    };
    if (options.capabilities) {
      headers['X-Capabilities'] = JSON.stringify(options.capabilities);
    }
    if (options.vendorKeys) {
      headers['X-Vendor-Keys'] = JSON.stringify(options.vendorKeys);
    }
    if (options.vendorOptions) {
      headers['X-Vendor-Options'] = JSON.stringify(options.vendorOptions);
    }
    if (options.redact) {
      headers['X-Redact'] = JSON.stringify(options.redact);
    }
    if (options.intent) {
      headers['X-Okra-Parse-Intent'] = options.intent
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (options.config) {
      headers['X-Document-Config'] = JSON.stringify(options.config);
    }
    if (visibility === 'public') {
      headers['X-Visibility'] = 'public';
    }

    await this.requestJson<{ phase?: string }>(`${path}/upload`, {
      method: 'POST',
      headers,
      body: bytes as unknown as BodyInit,
    });

    const session = this.sessions.from(documentId);
    if (eventStream) (session as any).__eventStream = eventStream;
    return session;
  }

  // ─── Passive Files ───────────────────────────────────────────────────────

  private async fileUpload(
    input: UploadInput,
    options: FileUploadOptions = {},
  ): Promise<OkraFile> {
    if (typeof input === 'string' && isHttpUrl(input)) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        'files.upload only accepts local files, File/Blob, ArrayBuffer, or Uint8Array. Remote URL ingestion still belongs to document/session upload.',
        400,
      );
    }

    const resolved = await this.resolveBinaryUpload(input, options.fileName);
    const bytes = resolved.bytes;
    const fileName = normalizePdfFileName(resolved.fileName);
    const transport = this.chooseFileTransport(bytes, options.transport);

    if (transport === 'multipart') {
      return this.fileUploadMultipart(bytes, fileName, options);
    }

    return this.fileUploadDirect(bytes, fileName, options);
  }

  private chooseFileTransport(
    bytes: Uint8Array,
    transport: FileUploadOptions['transport'] = 'auto',
  ): Exclude<FileUploadOptions['transport'], 'auto'> {
    if (transport === 'multipart' || transport === 'direct') {
      return transport;
    }
    return bytes.byteLength > DEFAULT_FILE_DIRECT_UPLOAD_THRESHOLD_BYTES ? 'direct' : 'multipart';
  }

  private async fileUploadMultipart(
    bytes: Uint8Array,
    fileName: string,
    options: FileUploadOptions,
  ): Promise<OkraFile> {
    const formData = new FormData();
    formData.append('file', new Blob([uint8ArrayToArrayBuffer(bytes)], { type: 'application/pdf' }), fileName);
    if (options.config) {
      formData.append('config', JSON.stringify(options.config));
    }

    return this.requestJson<OkraFile>('/v1/files', {
      method: 'POST',
      body: formData,
      signal: options.signal,
    });
  }

  private async fileUploadDirect(
    bytes: Uint8Array,
    fileName: string,
    options: FileUploadOptions,
  ): Promise<OkraFile> {
    const sha256 = await sha256HexFromBytes(bytes);
    const presign = await this.requestJson<OkraFile | OkraFileUploadSession>('/v1/files/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        fileSize: bytes.byteLength,
        sha256,
      }),
      signal: options.signal,
    });

    if ((presign as { object?: string }).object === 'file') {
      return presign as OkraFile;
    }

    const uploadSession = presign as OkraFileUploadSession;
    const uploadResponse = await this.fetchAbsolute(uploadSession.upload_url, {
      method: uploadSession.upload_method,
      headers: uploadSession.upload_headers,
      body: bytes as unknown as BodyInit,
      signal: options.signal,
    });
    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text().catch(() => '');
      throw new OkraRuntimeError(
        'HTTP_ERROR',
        detail || `Direct file upload failed with status ${uploadResponse.status}`,
        uploadResponse.status,
      );
    }

    return this.requestJson<OkraFile>('/v1/files/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: uploadSession.id,
        fileName,
        r2Key: uploadSession.r2_key,
        sha256,
        ...(options.config ? { config: JSON.stringify(options.config) } : {}),
      }),
      signal: options.signal,
    });
  }

  // ─── Stateless parse (POST /v1/parse) ────────────────────────────────────

  async parse(opts: ParseOptions): Promise<ParseJob> {
    if (!opts || (opts.file === undefined && !opts.fileId)) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        'parse requires either `file` (bytes/path/Blob) or `fileId` (existing /v1/files entry)',
        400,
      );
    }
    if (opts.file !== undefined && opts.fileId) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        'parse accepts either `file` or `fileId`, not both',
        400,
      );
    }

    const parser =
      opts.parser && typeof opts.parser === 'object'
        ? {
            id: opts.parser.id,
            ...(opts.parser.variant ? { variant: opts.parser.variant } : {}),
            ...(opts.parser.options ? { options: opts.parser.options } : {}),
            ...(opts.parser.vendorOptions || opts.parser.vendor_options
              ? { vendor_options: opts.parser.vendor_options ?? opts.parser.vendorOptions }
              : {}),
          }
        : opts.parser ?? 'textlayer';

    const body: Record<string, unknown> = { parser };
    if (opts.variant) body.variant = opts.variant;
    if (opts.pages !== undefined) body.pages = opts.pages;
    if (opts.outputs !== undefined) body.outputs = opts.outputs;
    if (opts.publish !== undefined) body.publish = opts.publish;
    if (opts.options) body.options = opts.options;
    if (opts.vendorOptions) body.vendor_options = opts.vendorOptions;
    if (opts.metadata) body.metadata = opts.metadata;
    if (opts.schema !== undefined) body.schema = opts.schema;

    if (opts.fileId) {
      body.file = { id: opts.fileId };
      if (opts.fileName) body.file_name = opts.fileName;
    } else {
      const resolved = await this.resolveBinaryUpload(opts.file as UploadInput, opts.fileName);
      body.file = { data: bytesToBase64(resolved.bytes) };
      body.file_name = opts.fileName ?? resolved.fileName;
    }

    return this.requestJson<ParseJob>('/v1/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  }

  async getJob(jobId: string, signal?: AbortSignal): Promise<OkraJob> {
    const normalized = jobId.trim();
    if (!normalized) {
      throw new OkraRuntimeError('INVALID_REQUEST', 'jobs.get requires a non-empty jobId', 400);
    }
    return this.requestJson<OkraJob>(`/v1/jobs/${encodeURIComponent(normalized)}`, {
      method: 'GET',
      signal,
    });
  }

  async createJob(options: CreateJobOptions): Promise<OkraJob> {
    if (!options || typeof options !== 'object') {
      throw new OkraRuntimeError('INVALID_REQUEST', 'jobs.create requires an options object', 400);
    }
    return this.requestJson<OkraJob>('/v1/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
      signal: options.signal,
    });
  }

  async listJobs(options: JobListOptions = {}): Promise<JobListResponse> {
    const params = new URLSearchParams();
    if (options.type) params.set('type', options.type);
    if (options.status) params.set('status', options.status);
    if (options.documentId) params.set('document_id', options.documentId);
    if (typeof options.limit === 'number') params.set('limit', String(options.limit));
    const query = params.toString();
    return this.requestJson<JobListResponse>(`/v1/jobs${query ? `?${query}` : ''}`, {
      method: 'GET',
      signal: options.signal,
    });
  }

  async getFile(fileId: string, signal?: AbortSignal): Promise<OkraFile> {
    const normalized = fileId.trim();
    if (!normalized) {
      throw new OkraRuntimeError('INVALID_REQUEST', 'files.get requires a non-empty fileId', 400);
    }
    return this.requestJson<OkraFile>(`/v1/files/${encodeURIComponent(normalized)}`, {
      method: 'GET',
      signal,
    });
  }

  async listFiles(options: FileListOptions = {}): Promise<OkraFileListResponse> {
    const params = new URLSearchParams();
    if (typeof options.limit === 'number') params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.requestJson<OkraFileListResponse>(`/v1/files${query ? `?${query}` : ''}`, {
      method: 'GET',
      signal: options.signal,
    });
  }

  async deleteFile(fileId: string, signal?: AbortSignal): Promise<DeleteFileResult> {
    const normalized = fileId.trim();
    if (!normalized) {
      throw new OkraRuntimeError('INVALID_REQUEST', 'files.delete requires a non-empty fileId', 400);
    }
    const response = await this.rawRequest(`/v1/files/${encodeURIComponent(normalized)}`, {
      method: 'DELETE',
      signal,
    });
    if (!response.ok) {
      const text = await response.text();
      const parsed = this.parseBody(text);
      const message =
        getErrorMessage(
          parsed && typeof parsed === 'object' && parsed !== null && 'error' in parsed
            ? (parsed as { error?: unknown }).error
            : undefined,
        ) || `Request failed with status ${response.status}`;
      throw new OkraRuntimeError('HTTP_ERROR', message, response.status, parsed ?? text);
    }
    return { deleted: true, fileId: normalized };
  }

  fileDownloadUrl(fileId: string): string {
    return `${this.baseUrl}/v1/files/${encodeURIComponent(fileId)}/bytes`;
  }

  // ─── Workflow Config / Reparse ───────────────────────────────────────────

  async getConfig(documentId: string, signal?: AbortSignal): Promise<DocumentSpecRecord> {
    if (!documentId.trim()) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        'getConfig requires a non-empty documentId',
        400,
      );
    }
    return this.requestJson<DocumentSpecRecord>(
      `/document/${encodeURIComponent(documentId)}/config`,
      {
        method: 'GET',
        signal,
      },
    );
  }

  async updateConfig(
    documentId: string,
    update: DocumentConfigUpdate,
    signal?: AbortSignal,
  ): Promise<DocumentConfigResult> {
    if (!documentId.trim()) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        'updateConfig requires a non-empty documentId',
        400,
      );
    }
    return this.requestJson<DocumentConfigResult>(
      `/document/${encodeURIComponent(documentId)}/config`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
        signal,
      },
    );
  }

  async reparse(documentId: string, options: ReparseOptions = {}): Promise<ReparseResult> {
    if (!documentId.trim()) {
      throw new OkraRuntimeError('INVALID_REQUEST', 'reparse requires a non-empty documentId', 400);
    }
    const strategy =
      options.strategy && options.strategy !== 'auto'
        ? `?strategy=${encodeURIComponent(options.strategy)}`
        : '';
    return this.requestJson<ReparseResult>(
      `/document/${encodeURIComponent(documentId)}/reparse${strategy}`,
      { method: 'POST', signal: options.signal },
    );
  }

  async verify(documentId: string, params: VerifyParams): Promise<VerifyResult> {
    if (!documentId.trim()) {
      throw new OkraRuntimeError('INVALID_REQUEST', 'verify requires a non-empty documentId', 400);
    }
    return this.requestJson<VerifyResult>(
      `/v1/documents/${encodeURIComponent(documentId)}/verify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim: params.claim,
          page: params.page,
          ...(params.bbox ? { bbox: params.bbox } : {}),
        }),
        signal: params.signal,
      },
    );
  }

  async applyWorkflow(
    documentId: string,
    options: ApplyWorkflowOptions,
  ): Promise<ApplyWorkflowResult> {
    if (!options?.capabilities) {
      throw new OkraRuntimeError('INVALID_REQUEST', 'applyWorkflow requires capabilities', 400);
    }

    const current = await this.getConfig(documentId, options.signal);
    const config = await this.updateConfig(
      documentId,
      mergeCapabilitiesIntoDocumentSpec(current.spec, options.capabilities),
      options.signal,
    );

    if (options.reparse === false) {
      return { config };
    }

    const reparse = await this.reparse(documentId, {
      strategy: options.strategy,
      signal: options.signal,
    });
    return { config, reparse };
  }

  async getKeyWorkflow(signal?: AbortSignal): Promise<ApiKeyWorkflowConfigResponse> {
    return this.requestJson<ApiKeyWorkflowConfigResponse>('/v1/key-workflow', {
      method: 'GET',
      signal,
    });
  }

  async setKeyWorkflow(
    defaultCapabilities: ApiKeyWorkflowConfigResponse['default_capabilities'],
    signal?: AbortSignal,
  ): Promise<ApiKeyWorkflowConfigResponse> {
    return this.requestJson<ApiKeyWorkflowConfigResponse>('/v1/key-workflow', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_capabilities: defaultCapabilities }),
      signal,
    });
  }

  // ─── Dynamic Workflow Eval Runs ─────────────────────────────────────────

  async runDynamicWorkflow(
    definition: DynamicWorkflowDefinition,
    options: DynamicWorkflowRunOptions = {},
  ): Promise<DynamicWorkflowRun> {
    let workflow: DynamicWorkflowDefinition;
    try {
      workflow = defineDynamicWorkflow(definition);
    } catch (error) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        error instanceof Error ? error.message : String(error),
        400,
        error,
      );
    }

    const dataset = options.dataset ?? workflow.eval?.dataset;
    const runPayload = {
      workflow,
      dataset,
      inputs: options.inputs ?? {},
      metadata: options.metadata ?? {},
      dry_run: Boolean(options.dryRun),
    };
    const body: Record<string, unknown> = {
      name: workflow.name,
      definition: {
        code: dynamicWorkflowToAgentWorkflowSource(workflow),
      },
    };

    if (options.dryRun) {
      body.run = false;
      body.inputs = runPayload;
    } else {
      body.run = true;
      body.params = runPayload;
    }

    const created = await this.requestJson<WorkflowResourceCreateResponse>('/v1/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (created.run) {
      return mapWorkflowResourceRun(created.run, created.workflow_id ?? created.id, dataset);
    }

    return {
      id: created.workflow_id ?? created.id,
      object: 'workflow_plan',
      status: 'planned',
      workflowId: created.workflow_id ?? created.id,
      ...(dataset ? { dataset } : {}),
      summary: {
        dryRun: Boolean(options.dryRun),
        workflow: created,
      },
      createdAt: created.created_at,
    };
  }

  async getDynamicWorkflowRun(runId: string, signal?: AbortSignal): Promise<DynamicWorkflowRun> {
    const normalized = runId.trim();
    if (!normalized) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        'getDynamicWorkflowRun requires a non-empty runId',
        400,
      );
    }
    const run = await this.requestJson<WorkflowResourceRunResponse>(
      `/v1/runs/${encodeURIComponent(normalized)}`,
      { method: 'GET', signal },
    );
    return mapWorkflowResourceRun(run);
  }

  async listDynamicWorkflowRuns(
    options: DynamicWorkflowRunListOptions = {},
  ): Promise<DynamicWorkflowRunList> {
    const query = new URLSearchParams();
    if (options.workflowId) query.set('workflow_id', options.workflowId);
    if (options.datasetId) query.set('dataset_id', options.datasetId);
    if (options.status) query.set('status', options.status);
    if (typeof options.limit === 'number') query.set('limit', String(options.limit));
    if (options.cursor) query.set('cursor', options.cursor);

    const suffix = query.toString();
    const response = await this.requestJson<WorkflowRunListResourceResponse>(
      `/v1/runs${suffix ? `?${suffix}` : ''}`,
      { method: 'GET', signal: options.signal },
    );

    return {
      object: 'list',
      data: (response.data ?? []).map((run) => mapWorkflowResourceRun(run, options.workflowId)),
      hasMore: Boolean(response.has_more),
      nextCursor: response.next_cursor ?? null,
    };
  }

  async assets(documentId: string, signal?: AbortSignal): Promise<DocumentAsset[]> {
    const status = await this.status(documentId, signal);
    return normalizeDocumentAssets(status.plugins ?? []);
  }

  async asset<T = Record<string, unknown>>(
    documentId: string,
    assetId: string,
    signal?: AbortSignal,
  ): Promise<DocumentAsset<T> | null> {
    const assets = await this.assets(documentId, signal);
    const asset = assets.find((candidate) => candidate.assetId === assetId);
    return (asset as DocumentAsset<T> | undefined) ?? null;
  }

  // ─── Status / Wait ───────────────────────────────────────────────────────

  async status(documentId: string, signal?: AbortSignal): Promise<DocumentStatus> {
    const encodedId = encodeURIComponent(documentId);
    const legacyPath = `/document/${encodedId}/status`;

    if (this.documentStatusRoute === 'document') {
      const status = await this.requestJson<DocumentStatus>(legacyPath, {
        method: 'GET',
        signal,
      });
      return normalizeDocumentStatus(status);
    }

    try {
      const status = await this.requestJson<DocumentStatus>(`/document/${encodedId}/status`, {
        method: 'GET',
        signal,
      });
      return normalizeDocumentStatus(status);
    } catch (error) {
      if (!(error instanceof OkraRuntimeError) || error.status !== 404) {
        throw error;
      }

      this.documentStatusRoute = 'document';
      const status = await this.requestJson<DocumentStatus>(legacyPath, {
        method: 'GET',
        signal,
      });
      return normalizeDocumentStatus(status);
    }
  }

  async wait(documentId: string, options: WaitOptions = {}): Promise<DocumentStatus> {
    if (options.realtime) {
      return this.waitRealtime(documentId, options);
    }
    return this.waitPoll(documentId, options);
  }

  private async waitPoll(documentId: string, options: WaitOptions = {}): Promise<DocumentStatus> {
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_WAIT_POLL_MS;

    while (true) {
      if (options.signal?.aborted) {
        throw new OkraRuntimeError('TIMEOUT', 'Wait aborted', 499);
      }

      const current = await this.status(documentId, options.signal);
      if (COMPLETE_PHASES.has(current.phase)) {
        return current;
      }
      if (TERMINAL_ERROR_PHASES.has(current.phase)) {
        throw new OkraRuntimeError(
          'EXTRACTION_FAILED',
          `Document entered terminal error phase (${current.phase})`,
          500,
          current,
        );
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed >= timeoutMs) {
        throw new OkraRuntimeError(
          'TIMEOUT',
          `Timed out waiting for document ${documentId} after ${timeoutMs}ms`,
          504,
          current,
        );
      }

      await sleep(pollIntervalMs);
    }
  }

  private waitRealtime(documentId: string, options: WaitOptions): Promise<DocumentStatus> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;

    return new Promise<DocumentStatus>((resolve, reject) => {
      const stream = this.events(documentId);
      let settled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        stream.close();
        clearTimeout(timer);
      };

      // Timeout — fall back to polling
      const timer = setTimeout(() => {
        if (settled) return;
        stream.close();
        settled = true;
        this.waitPoll(documentId, { ...options, realtime: false }).then(resolve, reject);
      }, timeoutMs);

      // Abort signal
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          cleanup();
          reject(new OkraRuntimeError('TIMEOUT', 'Wait aborted', 499));
        }, { once: true });
      }

      // Progress callback
      if (options.onProgress) {
        stream.on('*', options.onProgress);
      }

      stream.on('document.ready', (evt) => {
        cleanup();
        // Fetch final status via HTTP for the full DocumentStatus shape
        this.status(documentId).then(resolve).catch(() => {
          // If HTTP fails, construct a minimal status from the event
          resolve({ phase: 'complete', ...evt.data } as DocumentStatus);
        });
      });

      stream.on('document.error', (evt) => {
        cleanup();
        reject(
          new OkraRuntimeError(
            'EXTRACTION_FAILED',
            (evt.data.error as string) || 'Document entered error phase',
            500,
          ),
        );
      });

      stream.connect();
    });
  }

  /** Build a WebSocket URL for the document event protocol. */
  private buildWsUrl(documentId: string): string {
    const base = this.baseUrl.replace(/^http/, 'ws');
    const params = new URLSearchParams({ protocol: 'v1' });
    if (this.apiKey) params.set('apiKey', this.apiKey);
    if (this.sharedSecret) params.set('secret', this.sharedSecret);
    return `${base}/document/${encodeURIComponent(documentId)}?${params.toString()}`;
  }

  /** Open a real-time event stream for a document. */
  events(documentId: string, options?: DocumentEventStreamOptions): DocumentEventStream {
    return new DocumentEventStream(this.buildWsUrl(documentId), options);
  }

  // ─── Pages ───────────────────────────────────────────────────────────────

  async pages(
    documentId: string,
    options?: { range?: string; signal?: AbortSignal },
  ): Promise<Page[]> {
    const params = options?.range ? `?range=${encodeURIComponent(options.range)}` : '';
    return this.requestJson<Page[]>(`/document/${encodeURIComponent(documentId)}/pages${params}`, {
      method: 'GET',
      signal: options?.signal,
    });
  }

  async page(documentId: string, pageNumber: number, signal?: AbortSignal): Promise<Page> {
    return this.requestJson<Page>(
      `/document/${encodeURIComponent(documentId)}/page/${pageNumber}`,
      { method: 'GET', signal },
    );
  }

  // ─── Download ──────────────────────────────────────────────────────────

  downloadUrl(documentId: string): string {
    return `${this.baseUrl}/document/${encodeURIComponent(documentId)}/download`;
  }

  // ─── Entities ────────────────────────────────────────────────────────────

  async entities(
    documentId: string,
    options?: { type?: string; limit?: number; offset?: number; signal?: AbortSignal },
  ): Promise<EntitiesResponse> {
    const params = new URLSearchParams();
    if (options?.type) params.set('type', options.type);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const qs = params.toString();
    return this.requestJson<EntitiesResponse>(
      `/document/${encodeURIComponent(documentId)}/nodes${qs ? `?${qs}` : ''}`,
      { method: 'GET', signal: options?.signal },
    );
  }

  // ─── Query (SQL) ─────────────────────────────────────────────────────────

  async query(documentId: string, sql: string, signal?: AbortSignal): Promise<QueryResult> {
    return this.requestJson<QueryResult>(
      `/document/${encodeURIComponent(documentId)}/query?select=${encodeURIComponent(sql)}`,
      { method: 'GET', signal },
    );
  }

  // ─── Logs ───────────────────────────────────────────────────────────────

  async logs(documentId: string, options?: LogsOptions): Promise<LogEntry[]> {
    const limit = options?.limit ?? 100;
    const res = await this.requestJson<{ entries: LogEntry[] }>(
      `/document/${encodeURIComponent(documentId)}/log?limit=${limit}`,
      { method: 'GET', signal: options?.signal },
    );
    return res.entries;
  }

  // ─── Stream (streaming completion via OpenAI SSE) ────────────────────────

  async *stream(
    documentId: string,
    query: string,
    options?: CompletionOptions,
  ): AsyncGenerator<CompletionEvent> {
    const response = await this.rawRequest(
      `/document/${encodeURIComponent(documentId)}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: query }],
          stream: options?.stream !== false,
          ...(options?.model ? { model: options.model } : {}),
          ...(typeof options?.maxSteps === 'number' ? { max_steps: options.maxSteps } : {}),
        }),
        signal: options?.signal,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new OkraRuntimeError('HTTP_ERROR', `Completion failed: ${text}`, response.status);
    }

    if (!response.body) {
      throw new OkraRuntimeError('INVALID_RESPONSE', 'No response body for completion stream', 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          const json = trimmed.slice(6);
          try {
            const chunk = JSON.parse(json) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
              error?: { message?: string };
            };

            if (chunk.error) {
              yield { type: 'error', message: chunk.error.message || 'Stream error' };
              continue;
            }

            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              yield { type: 'text_delta', text: delta };
            }

            if (chunk.choices?.[0]?.finish_reason === 'stop') {
              yield { type: 'done', answer: fullText };
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ─── Generate (non-streaming AI) ─────────────────────────────────────────

  async generate(
    documentId: string,
    query: string,
    options?: GenerateOptions & { schema?: undefined },
  ): Promise<GenerateResult>;
  async generate<T>(
    documentId: string,
    query: string,
    options: GenerateOptions & { schema: StructuredSchema<T> },
  ): Promise<GenerateResult<T>>;
  async generate<T = undefined>(
    documentId: string,
    query: string,
    options?: GenerateOptions,
  ): Promise<GenerateResult<T>> {
    if (options?.schema) {
      return this.generateStructured<T>(documentId, query, options);
    }

    const result = await this.requestJson<{
      id: string;
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    }>(`/document/${encodeURIComponent(documentId)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: query }],
        ...(options?.model ? { model: options.model } : {}),
        ...(typeof options?.maxSteps === 'number' ? { max_steps: options.maxSteps } : {}),
      }),
      signal: options?.signal,
    });

    return {
      answer: result.choices?.[0]?.message?.content || '',
    };
  }

  private async generateStructured<T>(
    documentId: string,
    query: string,
    options: GenerateOptions,
  ): Promise<GenerateResult<T>> {
    if (!query || query.trim() === '') {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        'generate with schema requires a non-empty query',
        400,
      );
    }

    const normalized = normalizeStructuredSchema(options.schema as StructuredSchema<T>);
    const path = `/document/${encodeURIComponent(documentId)}/chat/completions`;
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Opt-in source grounding (#505): server returns Anthropic-shaped
        // grounded citations in meta.citations when this is set.
        ...(options.cite ? { 'X-Okra-Cite': 'true' } : {}),
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: query }],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'result', schema: normalized.jsonSchema },
        },
        ...(options.model ? { model: options.model } : {}),
      }),
      signal: options.signal,
    };

    let result: {
      id: string;
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      meta?: StructuredOutputMeta;
    };

    const maxAttempts = 3;
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        result = await this.requestJson(path, init);
        break;
      } catch (error) {
        const isRetriableTimeout =
          error instanceof OkraRuntimeError &&
          error.status === 504 &&
          ((typeof error.details === 'object' &&
            error.details !== null &&
            'timeoutMs' in error.details) ||
            error.message.toLowerCase().includes('timed out'));

        if (!isRetriableTimeout || attempt >= maxAttempts) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
      }
    }

    const raw = result.choices?.[0]?.message?.content;
    if (!raw) {
      throw new OkraRuntimeError(
        'INVALID_RESPONSE',
        'No content in structured output response',
        500,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new OkraRuntimeError(
        'INVALID_RESPONSE',
        'Structured output response is not valid JSON',
        500,
      );
    }

    let data: T;
    if (normalized.parser) {
      const zodResult = normalized.parser.safeParse(parsed);
      if (!zodResult.success) {
        throw new StructuredOutputError(
          'SCHEMA_VALIDATION_FAILED',
          'Client-side schema validation failed for structured output response',
          422,
          zodResult.error.issues,
        );
      }
      data = zodResult.data;
    } else {
      data = parsed as T;
    }

    return {
      answer: '',
      data,
      ...(result.meta ? { meta: result.meta } : {}),
    };
  }

  // ─── List Documents ─────────────────────────────────────────────────────

  async listDocuments(signal?: AbortSignal): Promise<DocumentListItem[]> {
    const res = await this.requestJson<DocumentListResponse>('/v1/documents', {
      method: 'GET',
      signal,
    });
    return res.documents;
  }

  // ─── Delete Document ──────────────────────────────────────────────────

  async deleteDocument(documentId: string, signal?: AbortSignal): Promise<DeleteDocumentResult> {
    if (!documentId.trim()) {
      throw new OkraRuntimeError(
        'INVALID_REQUEST',
        'deleteDocument requires a non-empty documentId',
        400,
      );
    }
    await this.requestJson<{ ok: boolean }>(`/v1/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
      signal,
    });
    return { deleted: true, documentId };
  }

  // ─── Read Document (full markdown) ────────────────────────────────────

  async read(documentId: string, options?: ReadDocumentOptions): Promise<ReadDocumentResult> {
    if (!documentId.trim()) {
      throw new OkraRuntimeError('INVALID_REQUEST', 'read requires a non-empty documentId', 400);
    }
    const params = options?.pages ? `?pages=${encodeURIComponent(options.pages)}` : '';
    const response = await this.rawRequest(
      `/v1/documents/${encodeURIComponent(documentId)}/full.md${params}`,
      { method: 'GET', signal: options?.signal },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new OkraRuntimeError('HTTP_ERROR', `Read failed: ${text}`, response.status);
    }
    const markdown = await response.text();
    return { documentId, markdown };
  }

  // ─── Model Endpoint ──────────────────────────────────────────────────────

  modelEndpoint(documentId: string): string {
    return `${this.baseUrl}/document/${encodeURIComponent(documentId)}`;
  }

  // ─── Publish / Share ────────────────────────────────────────────────────

  async publish(documentId: string, signal?: AbortSignal): Promise<PublishResult> {
    const result = await this.requestJson<Omit<PublishResult, 'url'>>(
      `/document/${encodeURIComponent(documentId)}/publish`,
      { method: 'POST', signal },
    );
    return {
      ...result,
      url: `${this.baseUrl}/document/${encodeURIComponent(documentId)}`,
    };
  }

  async shareLink(documentId: string, options?: ShareLinkOptions): Promise<ShareLinkResult> {
    return this.requestJson<ShareLinkResult>(
      `/document/${encodeURIComponent(documentId)}/share-link`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: options?.role,
          label: options?.label,
          expiresInMs: options?.expiresInMs,
          maxViews: options?.maxViews,
        }),
        signal: options?.signal,
      },
    );
  }

  // ─── Workflows ───────────────────────────────────────────────────────────

  async runInvoiceExtraction(
    options: InvoiceExtractionRunOptions,
  ): Promise<InvoiceExtractionRun> {
    const result = await this.requestJson<InvoiceExtractionRunApiResponse>(
      '/v1/workflows/invoice-extraction/runs',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: normalizeInvoiceWorkflowInputs(options.inputs),
          ...(options.tableId ? { table_id: options.tableId } : {}),
          ...(options.quality ? { quality: options.quality } : {}),
        }),
        signal: options.signal,
      },
    );

    return mapInvoiceExtractionRun(result);
  }

  async listInvoiceExtractionRuns(
    options: InvoiceExtractionRunListOptions = {},
  ): Promise<InvoiceExtractionRunList> {
    const params = new URLSearchParams();
    if (options.limit != null) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const result = await this.requestJson<{
      data: InvoiceExtractionRunApiResponse[];
      has_more: boolean;
      next_cursor: string | null;
    }>(`/v1/workflows/invoice-extraction/runs${suffix}`, {
      signal: options.signal,
    });

    return {
      data: result.data.map(mapInvoiceExtractionRun),
      hasMore: result.has_more,
      nextCursor: result.next_cursor,
    };
  }

  async getInvoiceExtractionRun(
    runId: string,
    signal?: AbortSignal,
  ): Promise<InvoiceExtractionRun> {
    const result = await this.requestJson<InvoiceExtractionRunApiResponse>(
      `/v1/workflows/invoice-extraction/runs/${encodeURIComponent(runId)}`,
      { signal },
    );
    return mapInvoiceExtractionRun(result);
  }

  async retryInvoiceExtractionRun(
    runId: string,
    signal?: AbortSignal,
  ): Promise<InvoiceExtractionRun> {
    const result = await this.requestJson<InvoiceExtractionRunApiResponse>(
      `/v1/workflows/invoice-extraction/runs/${encodeURIComponent(runId)}/retry`,
      { method: 'POST', signal },
    );
    return mapInvoiceExtractionRun(result);
  }

  async listInvoiceExtractionExceptions(
    runId: string,
    signal?: AbortSignal,
  ): Promise<InvoiceExtractionExceptionList> {
    const result = await this.requestJson<{
      data: InvoiceExtractionExceptionApiResponse[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>(
      `/v1/workflows/invoice-extraction/runs/${encodeURIComponent(runId)}/exceptions`,
      { signal },
    );

    return {
      data: result.data.map(mapInvoiceExtractionException),
      hasMore: result.has_more,
      nextCursor: result.next_cursor,
    };
  }

  async resolveInvoiceExtractionException(
    runId: string,
    exceptionId: string,
    options: InvoiceExtractionResolveExceptionOptions,
  ): Promise<InvoiceExtractionExceptionResolution> {
    const result = await this.requestJson<{
      id: string;
      run_id: string;
      table_id: string;
      row_id: string;
      status: 'resolved';
    }>(
      `/v1/workflows/invoice-extraction/runs/${encodeURIComponent(runId)}/exceptions/${encodeURIComponent(exceptionId)}/resolve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row_id: options.rowId,
          ...(options.field ? { field: options.field } : {}),
          ...(options.value !== undefined ? { value: options.value } : {}),
          ...(options.action ? { action: options.action } : {}),
        }),
        signal: options.signal,
      },
    );

    return {
      id: result.id,
      runId: result.run_id,
      tableId: result.table_id,
      rowId: result.row_id,
      status: result.status,
    };
  }

  // ─── Public HTTP ─────────────────────────────────────────────────────────

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.requestJson<T>(path, init);
  }

  get url(): string {
    return this.baseUrl;
  }

  // ─── Internal HTTP ───────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    if (this.apiKey) return { Authorization: `Bearer ${this.apiKey}` };
    if (this.sharedSecret) return { 'x-document-agent-secret': this.sharedSecret };
    return {};
  }

  private async rawRequest(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(this.authHeaders())) {
      if (!headers.has(key)) headers.set(key, value);
    }

    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    } catch (err) {
      throw new OkraRuntimeError(
        'HTTP_ERROR',
        err instanceof Error ? err.message : String(err),
        502,
      );
    }
  }

  private async fetchAbsolute(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, init);
    } catch (err) {
      throw new OkraRuntimeError(
        'HTTP_ERROR',
        err instanceof Error ? err.message : String(err),
        502,
      );
    }
  }

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.rawRequest(path, init);
    const text = await response.text();
    const parsed = this.parseBody(text);

    if (!response.ok) {
      const envelope = parsed as StructuredErrorEnvelope | null;
      const nestedError =
        typeof envelope?.error === 'object' && envelope.error !== null ? envelope.error : undefined;
      const code = envelope?.code || nestedError?.code;
      const message =
        getErrorMessage(envelope?.message) ||
        getErrorMessage(typeof envelope?.error === 'string' ? envelope.error : undefined) ||
        getErrorMessage(nestedError?.message) ||
        `Request failed with status ${response.status}`;
      const details = envelope?.details ?? nestedError?.details ?? parsed ?? text;
      if (isStructuredCode(code)) {
        throw new StructuredOutputError(code, message, response.status, details);
      }
      const runtimeCode: RuntimeErrorCode = response.status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR';
      throw new OkraRuntimeError(runtimeCode, message, response.status, details);
    }

    if (parsed === null) {
      throw new OkraRuntimeError(
        'INVALID_RESPONSE',
        `Expected JSON response for ${path}`,
        response.status,
        text,
      );
    }

    return parsed as T;
  }

  private parseBody(text: string): unknown | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  private async resolveBinaryUpload(
    input: UploadInput,
    preferredFileName?: string,
  ): Promise<{ bytes: Uint8Array; fileName: string }> {
    let bytes: Uint8Array;
    let fileName = preferredFileName || 'document.pdf';

    if (typeof input === 'string') {
      const local = await readLocalFileFromNode(input);
      bytes = local.bytes;
      if (!preferredFileName) fileName = local.fileName;
    } else if (isBlobLike(input)) {
      bytes = toUint8Array(await input.arrayBuffer());
      if (!preferredFileName) {
        fileName = inferBlobName(input, fileName);
      }
    } else {
      bytes = toUint8Array(input);
    }

    return { bytes, fileName };
  }
}
