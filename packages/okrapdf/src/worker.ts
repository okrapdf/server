/**
 * @okrapdf/runtime/worker — self-host subpath export.
 *
 * Re-export the DocumentAgent DO class and a request handler
 * for self-hosted deployments.
 *
 * Usage:
 * ```ts
 * // worker.ts
 * import { handleRequest } from '@okrapdf/runtime/worker';
 * import { DocumentAgent } from './document-agent';
 *
 * export { DocumentAgent };
 * export default { fetch: handleRequest({ DOCUMENT_AGENT: env.DOCUMENT_AGENT }) };
 * ```
 *
 * ```toml
 * # wrangler.toml
 * [durable_objects]
 * bindings = [{ name = "DOCUMENT_AGENT", class_name = "DocumentAgent" }]
 * ```
 */

export interface DurableObjectBinding {
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): { fetch(request: Request): Promise<Response> };
}

export interface WorkerEnv {
  DOCUMENT_AGENT: DurableObjectBinding;
  DOCUMENT_AGENT_SHARED_SECRET?: string;
  [key: string]: unknown;
}

// Strip trailing artifact filenames from URLs (e.g. /report.png, /document.md).
// Matches both plain format and legacy suffix format for backward compat.
const DATA_URL_ALIAS_RE = /\/[a-z0-9][a-z0-9._-]*\.(json|html|md|markdown|pdf|png|csv|txt)$/i;
const DATA_URL_MARKER_ALIAS_RE = /\/_\/[^/]*\.(json|html|md|markdown|pdf|png|csv|txt)$/i;
const CANONICAL_PAGE_IMAGE_EXT_RE = /\/pages\/(\d+)\/image\.(png|jpg|jpeg|webp)$/i;
const CANONICAL_PAGE_MARKDOWN_EXT_RE = /\/pages\/(\d+)\/markdown\.(md|markdown)$/i;
const PAGE_IMAGE_ALIAS_RE = /\/pages\/(\d+)\/[^/]+\.(png|jpg|jpeg|webp)$/i;
const PAGE_MARKDOWN_ALIAS_RE = /\/pages\/(\d+)\/[^/]+\.(md|markdown)$/i;
const PAGE_MARKDOWN_NESTED_ALIAS_RE = /\/pages\/(\d+)\/markdown\/(?:_\/)?[^/]+\.(md|markdown)$/i;
const PROVIDER_SEGMENT_RE = /^t_[a-z0-9][a-z0-9._-]*$/i;
const DEFAULT_IMAGE_SEGMENT_RE = /^d_[a-z0-9][a-z0-9._:-]*$/i;

function normalizeDataAliasPath(pathname: string, method: string): string {
  if (method !== 'GET' && method !== 'HEAD') return pathname;
  if (PAGE_IMAGE_ALIAS_RE.test(pathname)) {
    return pathname.replace(PAGE_IMAGE_ALIAS_RE, '/pages/$1/image');
  }
  if (CANONICAL_PAGE_IMAGE_EXT_RE.test(pathname)) {
    return pathname.replace(CANONICAL_PAGE_IMAGE_EXT_RE, '/pages/$1/image');
  }
  if (PAGE_MARKDOWN_NESTED_ALIAS_RE.test(pathname)) {
    return pathname.replace(PAGE_MARKDOWN_NESTED_ALIAS_RE, '/pages/$1/markdown');
  }
  if (CANONICAL_PAGE_MARKDOWN_EXT_RE.test(pathname)) {
    return pathname.replace(CANONICAL_PAGE_MARKDOWN_EXT_RE, '/pages/$1/markdown');
  }
  if (PAGE_MARKDOWN_ALIAS_RE.test(pathname)) {
    return pathname.replace(PAGE_MARKDOWN_ALIAS_RE, '/pages/$1/markdown');
  }
  if (DATA_URL_MARKER_ALIAS_RE.test(pathname)) {
    return pathname.replace(DATA_URL_MARKER_ALIAS_RE, '');
  }
  if (!DATA_URL_ALIAS_RE.test(pathname)) return pathname;
  return pathname.replace(DATA_URL_ALIAS_RE, '');
}

function normalizeTransformSegments(subpath: string): { subpath: string; defaultImage?: string } {
  const parts = subpath.split('/');
  let defaultImage: string | undefined;

  // Strip t_ (provider) and d_ (default image) segments from the path
  const filtered: string[] = [parts[0]]; // keep leading empty string
  for (let i = 1; i < parts.length; i++) {
    if (PROVIDER_SEGMENT_RE.test(parts[i])) continue;
    if (DEFAULT_IMAGE_SEGMENT_RE.test(parts[i])) {
      defaultImage = parts[i].slice(2); // strip "d_" prefix
      continue;
    }
    filtered.push(parts[i]);
  }

  const normalized = filtered.join('/');
  return {
    subpath: normalized === '/' ? '' : normalized,
    defaultImage,
  };
}

/**
 * Minimal request router that forwards /document/:id/* and /v1/documents/:id/*
 * to the corresponding Durable Object.
 */
export function handleRequest(env: WorkerEnv): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const normalizedUrl = new URL(request.url);
    normalizedUrl.pathname = normalizeDataAliasPath(normalizedUrl.pathname, request.method);
    const url = normalizedUrl;
    const path = url.pathname;

    // Match /document/:id/* or /v1/documents/:id/*
    const docMatch = path.match(/^\/(?:document|v1\/documents)\/([^/]+)(\/.*)?$/);
    if (!docMatch) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const documentId = decodeURIComponent(docMatch[1]);
    const rawSubpath = docMatch[2] || '';
    const { subpath: cleanSubpath, defaultImage } = normalizeTransformSegments(rawSubpath);
    const subpath = cleanSubpath || '/status';

    const doId = env.DOCUMENT_AGENT.idFromName(documentId);
    const stub = env.DOCUMENT_AGENT.get(doId);

    // Forward to DO with the subpath
    const doUrl = new URL(url.toString());
    doUrl.pathname = `/document/${documentId}${subpath}`;

    // Pass d_ value as header so DO can serve placeholder on R2 miss
    const headers = defaultImage ? new Headers(request.headers) : undefined;
    if (headers && defaultImage) headers.set('X-Okra-Default', defaultImage);
    const doRequest = headers
      ? new Request(doUrl.toString(), { method: request.method, headers, body: request.body })
      : new Request(doUrl.toString(), request);

    return stub.fetch(doRequest);
  };
}
