import type { OkraClient } from '../../client';
import { runDocumentWorkflow, type DocumentWorkflowRun } from './workflow-verbs';

export type SelfHostSmokeWorkflow = 'audit' | 'redact' | 'both';

export interface SelfHostSmokeOptions {
  baseUrl: string;
  documentId?: string;
  workflow?: SelfHostSmokeWorkflow;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface SelfHostSmokeCheck {
  name: string;
  status: 'passed' | 'failed';
  detail?: string;
}

export interface SelfHostSmokeResult {
  object: 'self_host_smoke';
  ok: boolean;
  base_url: string;
  document_id: string;
  workflow: SelfHostSmokeWorkflow;
  checks: SelfHostSmokeCheck[];
  parse_run?: DocumentWorkflowRun;
  audit_run?: DocumentWorkflowRun;
  redact_run?: DocumentWorkflowRun;
  graph_url?: string;
  review_url?: string;
  open_url?: string;
}

export interface SelfHostSmokeEvidence {
  object: 'self_host_smoke_evidence';
  schema_version: 'okra-self-host-smoke-evidence/v1';
  status: 'passed' | 'failed';
  generated_at: string;
  base_url: string;
  document_id: string;
  workflow: SelfHostSmokeWorkflow;
  readiness: {
    eligible: boolean;
    reason: string;
    required_checks: string[];
    passed_checks: string[];
    failed_checks: string[];
  };
  smoke: SelfHostSmokeResult;
}

const SMOKE_PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF');
const LIVE_SMOKE_REQUIRED_CHECKS = ['health', 'status', 'upload', 'parse', 'audit', 'redact', 'graph', 'open'];

function smokeDocumentId(): string {
  return `doc-smoke-${Date.now().toString(36)}`;
}

function openUrl(baseUrl: string, documentId: string): string {
  const url = new URL(baseUrl);
  url.pathname = '/';
  url.search = '';
  url.searchParams.set('doc', documentId);
  url.searchParams.set('view', 'review');
  return url.toString();
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runSelfHostSmoke(
  client: OkraClient,
  options: SelfHostSmokeOptions,
): Promise<SelfHostSmokeResult> {
  const workflow = options.workflow ?? 'audit';
  const documentId = options.documentId ?? smokeDocumentId();
  const checks: SelfHostSmokeCheck[] = [];
  const result: SelfHostSmokeResult = {
    object: 'self_host_smoke',
    ok: false,
    base_url: options.baseUrl.replace(/\/+$/, ''),
    document_id: documentId,
    workflow,
    checks,
  };

  const pass = (name: string, detail?: string): void => {
    checks.push({ name, status: 'passed', ...(detail ? { detail } : {}) });
  };
  const fail = (name: string, error: unknown): SelfHostSmokeResult => {
    checks.push({ name, status: 'failed', detail: errorDetail(error) });
    result.ok = false;
    return result;
  };

  try {
    await client.request('/health', { method: 'GET' });
    pass('health', '/health');
  } catch (error) {
    return fail('health', error);
  }

  try {
    await client.request('/v1/self-host/status', { method: 'GET' });
    pass('status', '/v1/self-host/status');
  } catch (error) {
    return fail('status', error);
  }

  try {
    const session = await client.upload(SMOKE_PDF, {
      documentId,
      fileName: 'self-host-smoke.pdf',
    });
    await session.wait({
      timeoutMs: options.timeoutMs ?? 5_000,
      pollIntervalMs: options.pollIntervalMs ?? 250,
    });
    pass('upload', documentId);
  } catch (error) {
    return fail('upload', error);
  }

  try {
    const parseRun = await runDocumentWorkflow(client, 'parse', {
      documentId,
      engine: 'mineru',
    });
    result.parse_run = parseRun;
    if (parseRun.graph_url) result.graph_url = parseRun.graph_url;
    pass('parse', parseRun.id);
  } catch (error) {
    return fail('parse', error);
  }

  if (workflow === 'audit' || workflow === 'both') {
    try {
      const auditRun = await runDocumentWorkflow(client, 'audit', {
        documentId,
        standard: 'wcag',
      });
      result.audit_run = auditRun;
      result.graph_url = auditRun.graph_url ?? result.graph_url;
      result.review_url = auditRun.review_url ?? result.review_url;
      pass('audit', auditRun.id);
    } catch (error) {
      return fail('audit', error);
    }
  }

  if (workflow === 'redact' || workflow === 'both') {
    try {
      const redactRun = await runDocumentWorkflow(client, 'redact', {
        documentId,
        model: 'local',
        policy: { preset: 'self-host-smoke' },
      });
      result.redact_run = redactRun;
      result.graph_url = redactRun.graph_url ?? result.graph_url;
      result.review_url = redactRun.review_url ?? result.review_url;
      pass('redact', redactRun.id);
    } catch (error) {
      return fail('redact', error);
    }
  }

  try {
    const graphUrl = result.graph_url ?? `/v1/documents/${encodeURIComponent(documentId)}/graph`;
    await client.request(graphUrl, { method: 'GET' });
    result.graph_url = graphUrl;
    pass('graph', graphUrl);
  } catch (error) {
    return fail('graph', error);
  }

  result.open_url = openUrl(options.baseUrl, documentId);
  pass('open', result.open_url);
  result.ok = true;
  return result;
}

export function formatSelfHostSmokeResult(result: SelfHostSmokeResult): string {
  const lines = [
    result.ok ? 'Self-host smoke passed' : 'Self-host smoke failed',
    `Base URL: ${result.base_url}`,
    `Document: ${result.document_id}`,
    `Workflow: ${result.workflow}`,
    '',
    'Checks:',
    ...result.checks.map((check) =>
      `  ${check.status === 'passed' ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`),
  ];

  if (result.graph_url) lines.push('', `Graph: ${result.graph_url}`);
  if (result.review_url) lines.push(`Review: ${result.review_url}`);
  if (result.open_url) lines.push(`Open: ${result.open_url}`);

  return lines.join('\n');
}

export function createSelfHostSmokeEvidence(
  smoke: SelfHostSmokeResult,
  generatedAt = new Date().toISOString(),
): SelfHostSmokeEvidence {
  const passedChecks = smoke.checks
    .filter((check) => check.status === 'passed')
    .map((check) => check.name);
  const failedChecks = smoke.checks
    .filter((check) => check.status === 'failed')
    .map((check) => check.name);
  const missingChecks = LIVE_SMOKE_REQUIRED_CHECKS.filter((check) => !passedChecks.includes(check));
  const eligible = smoke.ok && smoke.workflow === 'both' && missingChecks.length === 0;
  const reason = eligible
    ? 'Smoke covers upload, parse, audit, redact, graph retrieval, and review URL checks.'
    : smoke.workflow !== 'both'
      ? 'Readiness requires --workflow both so audit and redact paths are both exercised.'
      : missingChecks.length > 0
        ? `Missing required checks: ${missingChecks.join(', ')}`
        : 'Smoke result did not pass.';

  return {
    object: 'self_host_smoke_evidence',
    schema_version: 'okra-self-host-smoke-evidence/v1',
    status: eligible ? 'passed' : 'failed',
    generated_at: generatedAt,
    base_url: smoke.base_url,
    document_id: smoke.document_id,
    workflow: smoke.workflow,
    readiness: {
      eligible,
      reason,
      required_checks: LIVE_SMOKE_REQUIRED_CHECKS,
      passed_checks: passedChecks,
      failed_checks: failedChecks,
    },
    smoke,
  };
}
