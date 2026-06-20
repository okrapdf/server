/**
 * okra facet — manage user-deployed facets (dynamic Workers).
 *
 *   okra facet deploy <slug> <file>     deploy/update code from a JS file
 *   okra facet list                     list deployed facets
 *   okra facet info <slug>              show facet metadata
 *   okra facet invoke <slug> [-p json]  invoke with JSON payload
 *   okra facet runs <slug>              recent invocation runs
 *   okra facet rm <slug>                delete a facet
 */

import { existsSync, readFileSync } from 'fs';

import { OkraRuntimeError } from '../../errors';

export interface FacetCliCtx {
  apiKey: string;
  baseUrl: string;
}

export interface DeployResult {
  slug: string;
  sha: string;
  size_bytes: number;
  kind?: 'facet' | 'lens';
}

export interface FacetMeta {
  slug: string;
  user_id: string;
  kind?: 'facet' | 'lens';
  latest_sha: string;
  latest_size_bytes: number;
  latest_r2_key: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvokeResult {
  run_id: string;
  status: 'ok' | 'error';
  duration_ms: number;
  output?: unknown;
  error?: string;
  logs: string[];
}

export interface FacetRun {
  id: string;
  facet_slug: string;
  facet_sha: string;
  status: 'ok' | 'error';
  duration_ms: number;
  input_json: string | null;
  output_json: string | null;
  error_message: string | null;
  logs_json: string | null;
  created_at: string;
}

export interface LensApplyResult extends InvokeResult {
  object: 'lens.apply';
  lens_slug: string;
  document_id: string;
  annotations: unknown[];
  view: unknown;
  state: unknown;
  cursor: unknown;
  done: boolean;
}

export const LENS_STARTER_SOURCE = `export default {
  async fetch(request, env) {
    const { document, payload, state, cursor } = await request.json();
    const pages = Array.isArray(payload?.pages) ? payload.pages : [];
    const annotations = [];

    for (const page of pages) {
      const pageNumber = Number(page.page ?? page.pageNumber ?? 1);
      const blocks = Array.isArray(page.blocks) ? page.blocks : [];
      for (const block of blocks) {
        const text = String(block.text ?? block.value ?? "");
        if (!text) continue;
        const score = Math.min(1, text.length / 240);
        annotations.push({
          id: \`p\${pageNumber}-\${annotations.length + 1}\`,
          page: pageNumber,
          bbox: block.bbox ?? null,
          label: score > 0.65 ? "dense" : "light",
          color: score > 0.65 ? "#d97706" : "#2563eb",
          score,
          data: { text_preview: text.slice(0, 160) }
        });
      }
    }

    return Response.json({
      view: {
        title: "Document density lens",
        summary: \`\${annotations.length} annotations for \${document.id}\`
      },
      annotations,
      state: {
        ...(state && typeof state === "object" ? state : {}),
        last_document_id: document.id,
        runs: Number(state?.runs ?? 0) + 1
      },
      cursor: null,
      done: true
    });
  }
};
`;

async function api<T>(ctx: FacetCliCtx, path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, ctx.baseUrl).toString();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${ctx.apiKey}`);
  if (init?.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const r = await fetch(url, { ...init, headers });
  const text = await r.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!r.ok) {
    if (
      body &&
      typeof body === 'object' &&
      typeof (body as { run_id?: unknown }).run_id === 'string' &&
      (body as { status?: unknown }).status === 'error'
    ) {
      return body as T;
    }
    const msg = typeof body === 'string'
      ? body
      : (body as { error?: string; message?: string } | null)?.message
        ?? (body as { error?: string } | null)?.error
        ?? r.statusText;
    // Mirror OkraClient.requestJson: throw an OkraRuntimeError carrying the real
    // HTTP status + structured body so handleError emits the canonical envelope
    // (`code` = status, 401 → `unauthorized`, server body in `details`). A plain
    // Error here collapsed every facet/lens failure to `code:1, error:"error"`,
    // unlike every other command.
    const runtimeCode = r.status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR';
    throw new OkraRuntimeError(runtimeCode, msg, r.status, body ?? text);
  }
  return body as T;
}

export async function deployFacet(
  ctx: FacetCliCtx,
  slug: string,
  filePath: string,
  description?: string,
): Promise<DeployResult> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const code = readFileSync(filePath, 'utf8');
  return api<DeployResult>(ctx, '/v1/facets', {
    method: 'POST',
    body: JSON.stringify({ slug, code, description }),
  });
}

export async function deployLens(
  ctx: FacetCliCtx,
  slug: string,
  filePath: string,
  description?: string,
): Promise<DeployResult> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const code = readFileSync(filePath, 'utf8');
  return api<DeployResult>(ctx, '/v1/lenses', {
    method: 'POST',
    body: JSON.stringify({ slug, code, description }),
  });
}

export async function listFacets(ctx: FacetCliCtx): Promise<FacetMeta[]> {
  const r = await api<{ data: FacetMeta[] }>(ctx, '/v1/facets');
  return r.data;
}

export async function listLenses(ctx: FacetCliCtx): Promise<FacetMeta[]> {
  const r = await api<{ data: FacetMeta[] }>(ctx, '/v1/lenses');
  return r.data;
}

export async function getFacetInfo(ctx: FacetCliCtx, slug: string): Promise<FacetMeta> {
  return api<FacetMeta>(ctx, `/v1/facets/${encodeURIComponent(slug)}`);
}

export async function getLensInfo(ctx: FacetCliCtx, slug: string): Promise<FacetMeta> {
  return api<FacetMeta>(ctx, `/v1/lenses/${encodeURIComponent(slug)}`);
}

export async function invokeFacet(
  ctx: FacetCliCtx,
  slug: string,
  payload: unknown,
): Promise<InvokeResult> {
  return api<InvokeResult>(ctx, `/v1/facets/${encodeURIComponent(slug)}/invoke`, {
    method: 'POST',
    body: JSON.stringify(payload ?? null),
  });
}

export async function listRuns(
  ctx: FacetCliCtx,
  slug: string,
  limit = 20,
): Promise<FacetRun[]> {
  const r = await api<{ data: FacetRun[] }>(
    ctx,
    `/v1/facets/${encodeURIComponent(slug)}/runs?limit=${encodeURIComponent(String(limit))}`,
  );
  return r.data;
}

export async function listLensRuns(
  ctx: FacetCliCtx,
  slug: string,
  limit = 20,
): Promise<FacetRun[]> {
  const r = await api<{ data: FacetRun[] }>(
    ctx,
    `/v1/lenses/${encodeURIComponent(slug)}/runs?limit=${encodeURIComponent(String(limit))}`,
  );
  return r.data;
}

export async function applyLens(
  ctx: FacetCliCtx,
  slug: string,
  input: { documentId: string; payload?: unknown; cursor?: unknown; state?: unknown; reset?: boolean },
): Promise<LensApplyResult> {
  return api<LensApplyResult>(ctx, `/v1/lenses/${encodeURIComponent(slug)}/apply`, {
    method: 'POST',
    body: JSON.stringify({
      document_id: input.documentId,
      payload: input.payload ?? null,
      cursor: input.cursor ?? undefined,
      state: input.state ?? undefined,
      reset: input.reset === true,
    }),
  });
}

export async function getLensState(
  ctx: FacetCliCtx,
  slug: string,
  documentId: string,
): Promise<unknown> {
  const r = await api<{ state: unknown }>(
    ctx,
    `/v1/lenses/${encodeURIComponent(slug)}/state?document_id=${encodeURIComponent(documentId)}`,
  );
  return r.state;
}

export async function deleteFacet(
  ctx: FacetCliCtx,
  slug: string,
): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(ctx, `/v1/facets/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  });
}

export async function deleteLens(
  ctx: FacetCliCtx,
  slug: string,
): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(ctx, `/v1/lenses/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  });
}

export function formatFacetList(items: FacetMeta[]): string {
  if (items.length === 0) return 'No facets deployed.\n\nDeploy one: okra facet deploy <slug> <file.js>';
  const rows = items.map((f) => {
    const kb = (f.latest_size_bytes / 1024).toFixed(1);
    const sha = f.latest_sha.slice(0, 12);
    return `${f.slug.padEnd(28)} ${sha}  ${kb.padStart(6)} KiB  ${f.updated_at}`;
  });
  return [
    'SLUG                         SHA            SIZE      UPDATED',
    ...rows,
  ].join('\n');
}

export function formatLensApply(result: LensApplyResult): string {
  const lines = [
    `${result.run_id}  ${result.status}  ${result.duration_ms}ms`,
    `document: ${result.document_id}`,
    `annotations: ${result.annotations.length}`,
    `done: ${result.done ? 'yes' : 'no'}`,
  ];
  if (result.cursor != null) {
    lines.push(`cursor: ${JSON.stringify(result.cursor)}`);
  }
  if (result.view != null) {
    lines.push('', 'View:', JSON.stringify(result.view, null, 2));
  }
  if (result.error) {
    lines.push('', `Error: ${result.error}`);
  }
  return lines.join('\n');
}

export function formatRunList(runs: FacetRun[]): string {
  if (runs.length === 0) return 'No runs yet.';
  const rows = runs.map((r) => {
    const status = r.status === 'ok' ? 'ok ' : 'err';
    const ms = `${r.duration_ms}ms`.padStart(8);
    return `${r.id}  ${status}  ${ms}  ${r.created_at}`;
  });
  return rows.join('\n');
}
