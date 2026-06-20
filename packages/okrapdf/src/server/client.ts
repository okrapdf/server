import { OkraRuntimeError } from '../errors.js';
import type { DocumentSpec, OkraFile, ProcessingCapabilities, UploadInput } from '../types.js';
import { signDocumentAgentToken } from './sign.js';

const DEFAULT_BASE_URL = 'https://api.okrapdf.com';
const SDK_USER_AGENT = 'okrapdf-sdk-server/0.14.4';

export type DocumentAutoAction = 'render' | 'parse';

export interface OkraServerClientOptions {
  apiKey: string;
  signingKey?: string;
  host?: string;
  fetch?: typeof globalThis.fetch;
}

export interface CreateOkraDocumentFileOptions {
  file: UploadInput;
  fileName?: string;
  auto?: DocumentAutoAction[];
  capabilities?: ProcessingCapabilities;
  processor?: string;
  vendorOptions?: Record<string, unknown>;
  config?: DocumentSpec;
  intent?: string;
  signal?: AbortSignal;
}

export interface CreatedOkraDocument extends Record<string, unknown> {
  id: string;
  documentId: string;
}

export interface CreateDocumentAgentTokenOptions {
  ttlSeconds?: number;
  signal?: AbortSignal;
}

export interface DocumentAgentToken {
  token: string;
  documentId: string;
  expiresIn: number | null;
  expiresAt: string | null;
}

export interface RenderFile {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

export type RenderPublishOptions =
  | boolean
  | {
      enabled?: boolean;
      publicId?: string;
      slug?: string;
      fileName?: string;
      cacheControl?: string;
      metadata?: Record<string, string>;
      source?:
        | boolean
        | {
            enabled?: boolean;
            includeInput?: boolean;
            includeModules?: boolean;
            llm?: string;
            readme?: string;
          };
      llm?: string;
      readme?: string;
    };

export interface RenderDesignedSpec {
  title: string;
  type: string;
  author?: string;
  date?: string;
  subtitle?: string;
  abstract?: string;
  accent?: string;
  cover_bg?: string;
  cover_image?: string;
  skipCover?: boolean;
  content: Array<{ type: string; [key: string]: unknown }>;
}

export interface RenderReportLabOptions {
  script: string;
  files?: Record<string, string> | RenderFile[];
  fileName?: string;
  persist?: boolean;
  publish?: RenderPublishOptions;
  signal?: AbortSignal;
}

export interface RenderExecOptions {
  code: string;
  input?: unknown;
  modules?: Record<string, string>;
  fileName?: string;
  persist?: boolean;
  publish?: RenderPublishOptions;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RenderDesignedOptions {
  spec: RenderDesignedSpec;
  fileName?: string;
  publish?: RenderPublishOptions;
  signal?: AbortSignal;
}

export interface RenderHtmlOptions {
  /** HTML string to render to PDF via Browser Rendering. */
  html: string;
  /** Page dimensions in CSS px. Default A4 @ 96dpi (794×1123). */
  width?: number;
  height?: number;
  /** Block until this selector appears (async charts/fonts) before printing. */
  waitForSelector?: string;
  waitForTimeoutMs?: number;
  fileName?: string;
  persist?: boolean;
  publish?: RenderPublishOptions;
  signal?: AbortSignal;
}

export type RenderInput =
  | ({ mode: 'reportlab' } & RenderReportLabOptions)
  | ({ mode: 'exec' } & RenderExecOptions)
  | ({ mode: 'designed' } & RenderDesignedOptions)
  | ({ mode: 'html' } & RenderHtmlOptions);

export interface RenderResult {
  pdfBytes: Uint8Array;
  renderId: string;
  sha256: string;
  size: number;
  documentId: string | null;
  downloadUrl: string | null;
  publicUrl: string | null;
  publishedUrl: string | null;
  publishBaseUrl: string | null;
  sourceUrl: string | null;
  fileName: string;
}

export interface OkraServerClient {
  files: {
    create(params: CreateOkraDocumentFileOptions): Promise<CreatedOkraDocument>;
    upload(input: UploadInput, options?: Omit<CreateOkraDocumentFileOptions, 'file'>): Promise<CreatedOkraDocument>;
  };
  documents: {
    createAgentToken(docId: string, opts?: CreateDocumentAgentTokenOptions): Promise<DocumentAgentToken>;
  };
  renders: {
    create(input: RenderInput): Promise<RenderResult>;
    reportlab(opts: RenderReportLabOptions): Promise<RenderResult>;
    exec(opts: RenderExecOptions): Promise<RenderResult>;
    designed(opts: RenderDesignedOptions): Promise<RenderResult>;
    html(opts: RenderHtmlOptions): Promise<RenderResult>;
  };
  sign: {
    documentAgentToken(docId: string, opts?: { ttlSeconds?: number }): Promise<string>;
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function isBlobLike(value: unknown): value is Blob {
  return (
    typeof Blob !== 'undefined' &&
    value instanceof Blob
  ) || (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  );
}

function inferFileName(file: UploadInput, fallback?: string): string {
  if (fallback) return fallback;
  if (isBlobLike(file) && typeof (file as { name?: unknown }).name === 'string') {
    return String((file as unknown as { name: string }).name);
  }
  return 'document.pdf';
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function appendUploadFile(formData: FormData, input: UploadInput, fileName?: string): void {
  const name = inferFileName(input, fileName);
  if (isBlobLike(input)) {
    formData.append('file', input, name);
    return;
  }
  if (input instanceof Uint8Array) {
    formData.append('file', new Blob([uint8ArrayToArrayBuffer(input)], { type: 'application/pdf' }), name);
    return;
  }
  if (input instanceof ArrayBuffer) {
    formData.append('file', new Blob([input], { type: 'application/pdf' }), name);
    return;
  }
  throw new OkraRuntimeError(
    'INVALID_REQUEST',
    'files.create accepts File/Blob, ArrayBuffer, or Uint8Array. Remote URL ingestion is not supported by this server helper yet.',
    400,
  );
}

function appendJsonField(formData: FormData, key: string, value: unknown): void {
  if (value !== undefined) formData.append(key, JSON.stringify(value));
}

export function createOkraServerClient(options: OkraServerClientOptions): OkraServerClient {
  const baseUrl = normalizeBaseUrl(options.host || DEFAULT_BASE_URL);
  const fetchImpl = options.fetch || globalThis.fetch.bind(globalThis);
  if (!options.apiKey) {
    throw new OkraRuntimeError('UNAUTHORIZED', 'createOkraServerClient requires apiKey', 401);
  }

  const create = async (params: CreateOkraDocumentFileOptions): Promise<CreatedOkraDocument> => {
    const formData = new FormData();
    appendUploadFile(formData, params.file, params.fileName);
    appendJsonField(formData, 'auto', params.auto);
    appendJsonField(formData, 'capabilities', params.capabilities);
    appendJsonField(formData, 'vendor_options', params.vendorOptions);
    appendJsonField(formData, 'config', params.config);
    if (params.processor) formData.append('processor', params.processor);
    if (params.intent) formData.append('intent', params.intent);

    const response = await fetchImpl(`${baseUrl}/v1/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}` },
      body: formData,
      signal: params.signal,
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) as Record<string, unknown> : {};

    if (!response.ok) {
      const message =
        typeof parsed.error === 'string'
          ? parsed.error
          : `Document upload failed with status ${response.status}`;
      throw new OkraRuntimeError('HTTP_ERROR', message, response.status, parsed);
    }

    const documentId = String(parsed.documentId || parsed.id || '');
    if (!documentId) {
      throw new OkraRuntimeError('INVALID_RESPONSE', 'Document upload response did not include documentId', 502, parsed);
    }

    return {
      ...parsed,
      id: documentId,
      documentId,
    } as CreatedOkraDocument;
  };

  const createAgentToken = async (
    docId: string,
    opts: CreateDocumentAgentTokenOptions = {},
  ): Promise<DocumentAgentToken> => {
    const documentId = docId.trim();
    if (!documentId) {
      throw new OkraRuntimeError('INVALID_REQUEST', 'documents.createAgentToken requires docId', 400);
    }

    const response = await fetchImpl(`${baseUrl}/v1/documents/${encodeURIComponent(documentId)}/agent-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(opts.ttlSeconds !== undefined ? { ttlSeconds: opts.ttlSeconds } : {}),
      }),
      signal: opts.signal,
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) as Record<string, unknown> : {};

    if (!response.ok) {
      const message =
        typeof parsed.error === 'string'
          ? parsed.error
          : `Document agent token creation failed with status ${response.status}`;
      throw new OkraRuntimeError('HTTP_ERROR', message, response.status, parsed);
    }

    if (typeof parsed.token !== 'string' || !parsed.token) {
      throw new OkraRuntimeError('INVALID_RESPONSE', 'Agent token response did not include token', 502, parsed);
    }

    return {
      token: parsed.token,
      documentId: typeof parsed.documentId === 'string' ? parsed.documentId : documentId,
      expiresIn: typeof parsed.expires_in === 'number' ? parsed.expires_in : null,
      expiresAt: typeof parsed.expires_at === 'string' ? parsed.expires_at : null,
    };
  };

  const renderCreate = async (input: RenderInput): Promise<RenderResult> => {
    const { signal, ...rest } = input as RenderInput & { signal?: AbortSignal };
    const response = await fetchImpl(`${baseUrl}/v1/renders?format=pdf`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/pdf',
        'User-Agent': SDK_USER_AGENT,
      },
      body: JSON.stringify(rest),
      signal,
    });
    if (!response.ok) {
      let detail: unknown = null;
      const text = await response.text().catch(() => '');
      try {
        detail = text ? JSON.parse(text) : null;
      } catch {
        detail = text;
      }
      const message =
        detail && typeof detail === 'object' && typeof (detail as { error?: unknown }).error === 'string'
          ? (detail as { error: string }).error
          : `Render failed with status ${response.status}`;
      throw new OkraRuntimeError('HTTP_ERROR', message, response.status, detail);
    }

    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('application/pdf')) {
      const text = await response.text().catch(() => '');
      throw new OkraRuntimeError('INVALID_RESPONSE', 'Render did not return application/pdf', 502, text.slice(0, 2000));
    }

    const renderId = response.headers.get('X-Okra-Render-Id') ?? '';
    const sha256 = response.headers.get('X-Okra-Pdf-Sha256') ?? '';
    const size = Number(response.headers.get('X-Okra-Pdf-Size') || '0');
    const documentId = response.headers.get('X-Okra-Document-Id');
    const downloadUrl = response.headers.get('X-Okra-Download-Url');
    const publicUrl = response.headers.get('X-Okra-Publish-Url');
    const publishBaseUrl = response.headers.get('X-Okra-Publish-Base-Url');
    const sourceUrl = response.headers.get('X-Okra-Publish-Source-Url');
    const fileName =
      response.headers.get('X-Okra-File-Name') || input.fileName || 'output.pdf';
    const pdfBytes = new Uint8Array(await response.arrayBuffer());
    return {
      pdfBytes,
      renderId,
      sha256,
      size: size || pdfBytes.byteLength,
      documentId: documentId || null,
      downloadUrl: downloadUrl || null,
      publicUrl: publicUrl || null,
      publishedUrl: publicUrl || null,
      publishBaseUrl: publishBaseUrl || null,
      sourceUrl: sourceUrl || null,
      fileName,
    };
  };

  return {
    files: {
      create,
      upload: (file, uploadOptions = {}) => create({ ...uploadOptions, file }),
    },
    documents: {
      createAgentToken,
    },
    renders: {
      create: renderCreate,
      reportlab: (opts) => renderCreate({ mode: 'reportlab', ...opts }),
      exec: (opts) => renderCreate({ mode: 'exec', ...opts }),
      designed: (opts) => renderCreate({ mode: 'designed', ...opts }),
      html: (opts) => renderCreate({ mode: 'html', ...opts }),
    },
    sign: {
      documentAgentToken: (docId, opts) => {
        if (!options.signingKey) {
          throw new OkraRuntimeError('UNAUTHORIZED', 'sign.documentAgentToken requires signingKey', 401);
        }
        return signDocumentAgentToken(options.signingKey, {
          docId,
          ttlSeconds: opts?.ttlSeconds,
        });
      },
    },
  };
}

export type { OkraFile };
