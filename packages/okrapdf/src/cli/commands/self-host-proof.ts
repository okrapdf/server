import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { OkraClient } from '../../client';
import { handleCapabilityServiceRequest } from './capability-service';
import { runSelfHostSmoke, type SelfHostSmokeResult } from './self-host-smoke';
import { createSelfHostRuntimeStatus, handleSelfHostRuntimeRequest } from './serve';

export interface SelfHostDraftProofCheck {
  name: string;
  status: 'passed' | 'failed';
  detail: string;
}

export interface SelfHostDraftProofWorkflowSummary {
  id: string;
  recipeId: string;
  mode: string | null;
  capabilityRuns: Array<{
    id: string | null;
    capabilityId: string | null;
    mode: string | null;
    endpointUrl?: string;
  }>;
}

export interface SelfHostDraftProof {
  object: 'self_host_draft_proof';
  schema_version: 'okra-self-host-draft-proof/v1';
  status: 'passed' | 'failed';
  generated_at: string;
  root: string;
  data_scope: 'temporary';
  summary: {
    checks: number;
    passed: number;
    failed: number;
    recipes: number;
    capabilities: number;
    n8nWorkflows: number;
    externalCapabilityRequests: number;
  };
  checks: SelfHostDraftProofCheck[];
  runtime: {
    uiRuntime?: string;
    apiRuntime?: string;
    deploymentTargets: string[];
    services: string[];
    dockerNetworks: string[];
    recipes: string[];
    capabilities: string[];
    n8nWorkflows: string[];
  };
  smoke: {
    ok: boolean;
    baseUrl: string;
    documentId: string;
    workflow: string;
    passedChecks: string[];
    failedChecks: string[];
    parseRun?: SelfHostDraftProofWorkflowSummary;
    auditRun?: SelfHostDraftProofWorkflowSummary;
    redactRun?: SelfHostDraftProofWorkflowSummary;
    graphUrl?: string;
    reviewUrl?: string;
    openUrl?: string;
  };
  graph: {
    pages: number;
    blocks: number;
    findings: number;
    redactions: number;
    reviews: number;
    lineage: string[];
  };
  externalCapabilityDispatch: {
    enabled: boolean;
    requests: Array<{
      capabilityId: string | null;
      protocol: string | null;
      documentId: string | null;
      recipeId: string | null;
    }>;
  };
  publication: {
    publishedTemplateRequired: false;
    satisfiesLiveDeploySmokeGate: false;
    note: string;
  };
}

export interface SelfHostDraftProofOptions {
  generatedAt?: string;
  documentId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json();
  return isRecord(value) ? value : {};
}

function workflowSummary(value: unknown): SelfHostDraftProofWorkflowSummary | undefined {
  if (!isRecord(value)) return undefined;
  const capabilityRuns = Array.isArray(value.capability_runs) ? value.capability_runs.filter(isRecord) : [];
  return {
    id: stringValue(value.id) ?? '',
    recipeId: stringValue(value.recipe_id) ?? '',
    mode: stringValue(value.mode),
    capabilityRuns: capabilityRuns.map((run) => ({
      id: stringValue(run.id),
      capabilityId: stringValue(run.capability_id),
      mode: stringValue(run.mode),
      ...(stringValue(run.endpoint_url) ? { endpointUrl: stringValue(run.endpoint_url)! } : {}),
    })),
  };
}

function check(
  checks: SelfHostDraftProofCheck[],
  name: string,
  passed: boolean,
  detail: string,
): void {
  checks.push({ name, status: passed ? 'passed' : 'failed', detail });
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function graphArrayLength(graph: Record<string, unknown>, key: string): number {
  return Array.isArray(graph[key]) ? graph[key].length : 0;
}

export async function createSelfHostDraftProof(
  bundleDir: string,
  options: SelfHostDraftProofOptions = {},
): Promise<SelfHostDraftProof> {
  const root = resolve(bundleDir);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const documentId = options.documentId ?? 'doc-draft-proof';
  const dataDir = mkdtempSync(join(tmpdir(), 'okra-self-host-proof-'));
  const checks: SelfHostDraftProofCheck[] = [];
  const capabilityRequests: Array<Record<string, unknown>> = [];
  const env = {
    OKRA_API_KEY: 'okra_draft_proof_key',
    OKRA_FIRST_OWNER_EMAIL: 'owner@example.com',
    OKRA_CAPABILITY_PARSER_MINERU_URL: 'http://okra-parser-mineru:8080',
    OKRA_CAPABILITY_AUDITOR_WCAG_BASIC_URL: 'http://okra-auditor-wcag:8080',
    OKRA_CAPABILITY_REDACTOR_POLICY_BASIC_URL: 'http://okra-redactor-policy:8080',
  };
  const capabilityIdByHost: Record<string, string> = {
    'okra-parser-mineru': 'parser.mineru',
    'okra-auditor-wcag': 'auditor.wcag.basic',
    'okra-redactor-policy': 'redactor.policy.basic',
  };
  const capabilityFetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const capabilityId = capabilityIdByHost[new URL(request.url).hostname];
    const body = await request.clone().json();
    if (isRecord(body)) capabilityRequests.push(body);
    return handleCapabilityServiceRequest(request, { capabilityId: capabilityId ?? '' });
  };
  const requestOptions = { bundleDir: root, dataDir, env, capabilityFetch };
  const client = new OkraClient({
    apiKey: env.OKRA_API_KEY,
    baseUrl: 'http://self-host-draft.test',
    fetch: (input, init) => handleSelfHostRuntimeRequest(new Request(input, init), requestOptions),
  });
  let smoke: SelfHostSmokeResult | null = null;
  let graph: Record<string, unknown> = {};

  try {
    const status = createSelfHostRuntimeStatus(root, env);
    check(
      checks,
      'bundle_validation',
      status.ok,
      `${status.services.length} services, ${status.recipes.length} recipes, ${status.capabilities.length} capabilities`,
    );

    const shellResponse = await handleSelfHostRuntimeRequest(
      new Request('http://self-host-draft.test/?doc=doc-draft-proof&view=review'),
      requestOptions,
    );
    const shell = await shellResponse.text();
    check(
      checks,
      'static_review_shell',
      shellResponse.status === 200 && shell.includes('id="document-form"') && shell.includes('id="document-view"'),
      `status=${shellResponse.status}`,
    );

    const catalogResponse = await handleSelfHostRuntimeRequest(
      new Request('http://self-host-draft.test/v1/workflows/catalog'),
      requestOptions,
    );
    const capabilityResponse = await handleSelfHostRuntimeRequest(
      new Request('http://self-host-draft.test/v1/capabilities'),
      requestOptions,
    );
    const catalog = await responseJson(catalogResponse);
    const capabilities = await responseJson(capabilityResponse);
    check(
      checks,
      'catalog_routes',
      catalogResponse.status === 200
        && capabilityResponse.status === 200
        && Array.isArray(catalog.data)
        && catalog.data.length === status.recipes.length
        && Array.isArray(capabilities.data)
        && capabilities.data.length === status.capabilities.length,
      `recipes=${Array.isArray(catalog.data) ? catalog.data.length : 0}, capabilities=${Array.isArray(capabilities.data) ? capabilities.data.length : 0}`,
    );

    const unauthenticated = await handleSelfHostRuntimeRequest(
      new Request('http://self-host-draft.test/v1/workflows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipe_id: 'recipe.parse-document', document_id: documentId }),
      }),
      requestOptions,
    );
    check(checks, 'api_key_auth_gate', unauthenticated.status === 401, `status=${unauthenticated.status}`);

    try {
      smoke = await runSelfHostSmoke(client, {
        baseUrl: 'http://self-host-draft.test',
        documentId,
        workflow: 'both',
        timeoutMs: 50,
        pollIntervalMs: 1,
      });
      check(
        checks,
        'starter_workflow_smoke',
        smoke.ok,
        smoke.checks.map((item) => `${item.name}:${item.status}`).join(', '),
      );
    } catch (error) {
      check(checks, 'starter_workflow_smoke', false, errorDetail(error));
    }

    const graphResponse = await client.request<Record<string, unknown>>(
      `/v1/documents/${encodeURIComponent(documentId)}/graph`,
      { method: 'GET' },
    );
    graph = graphResponse;
    check(
      checks,
      'document_graph_contract',
      graph.schema_version === 'okra-document-graph/v1'
        && graphArrayLength(graph, 'pages') > 0
        && graphArrayLength(graph, 'blocks') > 0
        // redactions are only proposed for real PII matches, so a clean doc
        // honestly yields zero — do not require them here.
        && graphArrayLength(graph, 'reviews') > 0,
      `pages=${graphArrayLength(graph, 'pages')}, blocks=${graphArrayLength(graph, 'blocks')}, findings=${graphArrayLength(graph, 'findings')}, redactions=${graphArrayLength(graph, 'redactions')}, reviews=${graphArrayLength(graph, 'reviews')}`,
    );

    const capabilityRunIds = [
      ...(workflowSummary(smoke?.parse_run)?.capabilityRuns ?? []),
      ...(workflowSummary(smoke?.audit_run)?.capabilityRuns ?? []),
      ...(workflowSummary(smoke?.redact_run)?.capabilityRuns ?? []),
    ].flatMap((run) => run.id ? [run.id] : []);
    const capabilityRunResponse = capabilityRunIds[0]
      ? await handleSelfHostRuntimeRequest(
          new Request(`http://self-host-draft.test/v1/capability-runs/${capabilityRunIds[0]}`),
          requestOptions,
        )
      : null;
    check(
      checks,
      'capability_run_inspection',
      capabilityRunResponse?.status === 200,
      capabilityRunIds[0] ? `run=${capabilityRunIds[0]} status=${capabilityRunResponse?.status}` : 'no capability run id',
    );

    const dispatchedCapabilityIds = capabilityRequests.map((request) => stringValue(request.capability_id));
    check(
      checks,
      'external_capability_dispatch',
      ['parser.mineru', 'auditor.wcag.basic', 'redactor.policy.basic'].every((id) =>
        dispatchedCapabilityIds.includes(id),
      ),
      `requests=${dispatchedCapabilityIds.filter(Boolean).join(', ') || 'none'}`,
    );

    const lineage = Array.isArray(graph.lineage)
      ? graph.lineage.filter(isRecord).flatMap((entry) => stringValue(entry.engine_id) ? [stringValue(entry.engine_id)!] : [])
      : [];
    const passed = checks.every((item) => item.status === 'passed');
    return {
      object: 'self_host_draft_proof',
      schema_version: 'okra-self-host-draft-proof/v1',
      status: passed ? 'passed' : 'failed',
      generated_at: generatedAt,
      root,
      data_scope: 'temporary',
      summary: {
        checks: checks.length,
        passed: checks.filter((item) => item.status === 'passed').length,
        failed: checks.filter((item) => item.status === 'failed').length,
        recipes: status.recipes.length,
        capabilities: status.capabilities.length,
        n8nWorkflows: status.n8nWorkflows.length,
        externalCapabilityRequests: capabilityRequests.length,
      },
      checks,
      runtime: {
        ...(status.uiRuntime ? { uiRuntime: status.uiRuntime } : {}),
        ...(status.apiRuntime ? { apiRuntime: status.apiRuntime } : {}),
        deploymentTargets: status.deploymentTargets,
        services: status.services.map((service) => service.id),
        dockerNetworks: status.dockerNetworks.map((network) => network.id),
        recipes: status.recipes.map((recipe) => recipe.id),
        capabilities: status.capabilities.map((capability) => capability.id),
        n8nWorkflows: status.n8nWorkflows.map((workflow) => workflow.name),
      },
      smoke: {
        ok: smoke?.ok ?? false,
        baseUrl: smoke?.base_url ?? 'http://self-host-draft.test',
        documentId,
        workflow: smoke?.workflow ?? 'both',
        passedChecks: smoke?.checks.filter((item) => item.status === 'passed').map((item) => item.name) ?? [],
        failedChecks: smoke?.checks.filter((item) => item.status === 'failed').map((item) => item.name) ?? [],
        ...(workflowSummary(smoke?.parse_run) ? { parseRun: workflowSummary(smoke?.parse_run)! } : {}),
        ...(workflowSummary(smoke?.audit_run) ? { auditRun: workflowSummary(smoke?.audit_run)! } : {}),
        ...(workflowSummary(smoke?.redact_run) ? { redactRun: workflowSummary(smoke?.redact_run)! } : {}),
        ...(smoke?.graph_url ? { graphUrl: smoke.graph_url } : {}),
        ...(smoke?.review_url ? { reviewUrl: smoke.review_url } : {}),
        ...(smoke?.open_url ? { openUrl: smoke.open_url } : {}),
      },
      graph: {
        pages: graphArrayLength(graph, 'pages'),
        blocks: graphArrayLength(graph, 'blocks'),
        findings: graphArrayLength(graph, 'findings'),
        redactions: graphArrayLength(graph, 'redactions'),
        reviews: graphArrayLength(graph, 'reviews'),
        lineage,
      },
      externalCapabilityDispatch: {
        enabled: true,
        requests: capabilityRequests.map((request) => ({
          capabilityId: stringValue(request.capability_id),
          protocol: stringValue(request.protocol),
          documentId: stringValue(request.document_id),
          recipeId: stringValue(request.recipe_id),
        })),
      },
      publication: {
        publishedTemplateRequired: false,
        satisfiesLiveDeploySmokeGate: false,
        note: 'This proof exercises the draft bundle in process without a public Railway URL. It does not replace the later live deploy smoke evidence.',
      },
    };
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

export function formatSelfHostDraftProof(proof: SelfHostDraftProof): string {
  const lines = [
    proof.status === 'passed' ? 'Self-host draft proof passed' : 'Self-host draft proof failed',
    `Root: ${proof.root}`,
    `Checks: ${proof.summary.passed}/${proof.summary.checks} passed`,
    `Runtime: ${proof.summary.recipes} recipes, ${proof.summary.capabilities} capabilities, ${proof.summary.n8nWorkflows} n8n workflows`,
    `External capability requests: ${proof.summary.externalCapabilityRequests}`,
    '',
    'Checks:',
    ...proof.checks.map((item) => `  ${item.status === 'passed' ? 'PASS' : 'FAIL'} ${item.name} - ${item.detail}`),
  ];

  if (proof.smoke.graphUrl) lines.push('', `Graph: ${proof.smoke.graphUrl}`);
  if (proof.smoke.reviewUrl) lines.push(`Review: ${proof.smoke.reviewUrl}`);
  if (proof.smoke.openUrl) lines.push(`Open: ${proof.smoke.openUrl}`);
  return `${lines.join('\n')}\n`;
}

export function writeSelfHostDraftProof(path: string, proof: SelfHostDraftProof): void {
  writeFileSync(path, `${JSON.stringify(proof, null, 2)}\n`);
}
