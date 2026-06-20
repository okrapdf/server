import type { OkraClient } from '../../client';
import { OkraRuntimeError } from '../../errors';

export type DocumentWorkflowKind = 'parse' | 'audit' | 'redact';

export interface DocumentWorkflowOptions {
  documentId: string;
  recipeId?: string;
  engine?: string;
  standard?: string;
  model?: string;
  policy?: Record<string, unknown>;
}

export interface DocumentWorkflowRun {
  object: 'document_workflow_run';
  verb: DocumentWorkflowKind;
  id: string;
  status?: string;
  mode?: string;
  recipe_id: string;
  document_id: string;
  source_id?: string | null;
  graph_url?: string;
  review_url?: string;
  capability_runs: unknown[];
  raw: Record<string, unknown>;
}

function defaultRecipeId(kind: DocumentWorkflowKind): string {
  switch (kind) {
    case 'parse':
      return 'recipe.parse-document';
    case 'audit':
      return 'recipe.audit-review';
    case 'redact':
      return 'recipe.redact-review';
  }
}

function workflowParameters(kind: DocumentWorkflowKind, options: DocumentWorkflowOptions): Record<string, unknown> {
  switch (kind) {
    case 'parse':
      return { engine: options.engine ?? 'mineru' };
    case 'audit':
      return { standard: options.standard ?? 'wcag' };
    case 'redact':
      return {
        model: options.model ?? 'local',
        policy: options.policy ?? { preset: 'starter-redaction-review' },
      };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parsePolicyJson(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  // Both failure modes (malformed JSON, or valid-JSON-that-isn't-an-object) must
  // produce a structured envelope, not a bare SyntaxError/Error that handleError
  // renders as the generic error:"error", code:1 dead-end.
  const invalidPolicy = (message: string): OkraRuntimeError =>
    new OkraRuntimeError('INVALID_REQUEST', message, 400, {
      error: 'invalid_policy_json',
      message,
      next_actions: [
        { cmd: 'okra redact --help', why: '--policy must be a JSON object, e.g. --policy \'{"rules":[]}\'.' },
      ],
    });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw invalidPolicy(`--policy must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidPolicy('--policy must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export async function runDocumentWorkflow(
  client: Pick<OkraClient, 'request'>,
  kind: DocumentWorkflowKind,
  options: DocumentWorkflowOptions,
): Promise<DocumentWorkflowRun> {
  const recipeId = options.recipeId ?? defaultRecipeId(kind);
  const payload = {
    recipe_id: recipeId,
    document_id: options.documentId,
    parameters: workflowParameters(kind, options),
  };
  const raw = asRecord(await client.request('/v1/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));

  return {
    object: 'document_workflow_run',
    verb: kind,
    id: typeof raw.id === 'string' ? raw.id : '',
    recipe_id: typeof raw.recipe_id === 'string' ? raw.recipe_id : recipeId,
    document_id: typeof raw.document_id === 'string' ? raw.document_id : options.documentId,
    ...(typeof raw.status === 'string' ? { status: raw.status } : {}),
    ...(typeof raw.mode === 'string' ? { mode: raw.mode } : {}),
    ...(typeof raw.source_id === 'string' || raw.source_id === null ? { source_id: raw.source_id } : {}),
    ...(typeof raw.graph_url === 'string' ? { graph_url: raw.graph_url } : {}),
    ...(typeof raw.review_url === 'string' ? { review_url: raw.review_url } : {}),
    capability_runs: Array.isArray(raw.capability_runs) ? raw.capability_runs : [],
    raw,
  };
}

export function formatDocumentWorkflowRun(run: DocumentWorkflowRun): string {
  return [
    `${run.verb[0].toUpperCase()}${run.verb.slice(1)} run: ${run.id}`,
    `Status: ${run.status ?? 'unknown'}`,
    `Document: ${run.document_id}`,
    `Recipe: ${run.recipe_id}`,
    `Capabilities: ${run.capability_runs.length}`,
    run.graph_url ? `Graph: ${run.graph_url}` : null,
    run.review_url ? `Review: ${run.review_url}` : null,
  ].filter(Boolean).join('\n');
}
