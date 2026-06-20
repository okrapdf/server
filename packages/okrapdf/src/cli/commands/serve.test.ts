import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { OkraClient } from '../../client.js';
import { createSelfHostSmokeEvidence, runSelfHostSmoke } from './self-host-smoke.js';
import { runDocumentWorkflow } from './workflow-verbs.js';
import { handleCapabilityServiceRequest } from './capability-service.js';
import {
  createSelfHostRuntimeStatus,
  handleSelfHostRuntimeRequest,
} from './serve.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const selfHostExampleRoot = join(repoRoot, 'runtime');

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function tempDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'okra-self-host-runtime-'));
}

describe('self-host runtime starter', () => {
  it('summarizes the runtime bundle without starting a server', () => {
    const status = createSelfHostRuntimeStatus(selfHostExampleRoot);

    expect(status).toMatchObject({
      object: 'self_host_runtime_status',
      ok: true,
      schemaVersion: 'okra-self-host-runtime/v1',
      uiRuntime: 'cloudflare_worker_static_assets',
      apiRuntime: 'container_http',
    });
    expect(status.services.map((service) => ({
      id: service.id,
      public: service.public,
      networkRefs: service.networkRefs,
    }))).toEqual(expect.arrayContaining([
      {
        id: 'okra-app',
        public: true,
        networkRefs: ['okra-edge', 'okra-core', 'okra-capabilities', 'okra-integrations'],
      },
    ]));
    expect(status.dockerNetworks.map((network) => ({
      id: network.id,
      kind: network.kind,
      internal: network.internal,
      external: network.external,
    }))).toEqual(expect.arrayContaining([
      {
        id: 'okra-edge',
        kind: 'public_ingress',
        internal: false,
        external: false,
      },
      {
        id: 'okra-core',
        kind: 'private_runtime',
        internal: true,
        external: false,
      },
      {
        id: 'okra-integrations',
        kind: 'external_bridge',
        internal: false,
        external: true,
      },
    ]));
    expect(status.recipes.map((recipe) => recipe.id)).toEqual([
      'recipe.audit-review',
      'recipe.hybrid-ocr-a11y-review',
      'recipe.n8n-ingest-audit-review',
      'recipe.parse-document',
      'recipe.redact-review',
    ]);
    expect(status.capabilities).toHaveLength(9);
    expect(status.n8nWorkflows).toHaveLength(1);
    expect(status.endpoints).toContain('POST /v1/workflows');
  });

  it('serves health and status responses from the request handler', async () => {
    const healthResponse = await handleSelfHostRuntimeRequest(
      new Request('http://localhost/health'),
      { bundleDir: selfHostExampleRoot, env: {} },
    );
    const statusResponse = await handleSelfHostRuntimeRequest(
      new Request('http://localhost/v1/self-host/status'),
      { bundleDir: selfHostExampleRoot, env: {} },
    );

    expect(healthResponse.status).toBe(200);
    expect(await json(healthResponse)).toMatchObject({
        object: 'self_host_health',
        ok: true,
        recipes: 5,
        capabilities: 9,
        n8n_workflows: 1,
      });
    expect(statusResponse.status).toBe(200);
    expect(await json(statusResponse)).toMatchObject({
      object: 'self_host_runtime_status',
      ok: true,
      auth: {
        auth_mode: 'single_owner',
        registration_mode: 'invite_only',
        api_key_configured: false,
        first_owner_configured: false,
        bootstrap: {
          mode: 'single_owner_api_key',
          owner_email_env: 'OKRA_FIRST_OWNER_EMAIL',
          owner_email_configured: false,
          api_key_env: 'OKRA_API_KEY',
          registration_mode: 'invite_only',
        },
      },
    });
  });

  it('exposes recipe and capability catalogs through API-shaped routes', async () => {
    const catalogResponse = await handleSelfHostRuntimeRequest(
      new Request('http://localhost/v1/workflows/catalog'),
      { bundleDir: selfHostExampleRoot },
    );
    const capabilitiesResponse = await handleSelfHostRuntimeRequest(
      new Request('http://localhost/v1/capabilities'),
      { bundleDir: selfHostExampleRoot },
    );

    const catalog = await json(catalogResponse);
    const capabilities = await json(capabilitiesResponse);

    expect(catalogResponse.status).toBe(200);
    expect((catalog.data as Array<Record<string, unknown>>).map((recipe) => recipe.id)).toContain(
      'recipe.n8n-ingest-audit-review',
    );
    expect(
      ((catalog.data as Array<Record<string, unknown>>).find((recipe) => recipe.id === 'recipe.hybrid-ocr-a11y-review')
        ?.steps as Array<Record<string, unknown>>).map((step) => step.uses),
    ).toEqual(expect.arrayContaining(['parser.mineru', 'auditor.wcag.basic', 'review.a11y.findings']));
    expect(capabilitiesResponse.status).toBe(200);
    expect((capabilities.data as Array<Record<string, unknown>>).map((capability) => capability.id)).toContain(
      'bridge.n8n.webhook',
    );
  });

  it('serves the static document review shell', async () => {
    const response = await handleSelfHostRuntimeRequest(
      new Request('http://localhost/?doc=doc-self-host-upload&view=review'),
      { bundleDir: selfHostExampleRoot },
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('id="document-form"');
    expect(html).toContain('id="document-view"');
    expect(html).toContain('id="workflow-run-id"');
    expect(html).toContain('id="network-list"');
    expect(html).toContain('id="bootstrap-owner"');
    expect(html).toContain('id="bootstrap-protected-routes"');
    expect(html).toContain('id="lineage-list"');
    expect(html).toContain('id="capability-run-list"');
    expect(html).toContain('/v1/runtime/manifest');
    expect(html).toContain('/v1/capability-runs/${encodeURIComponent(runId)}');
    expect(html).toContain('/v1/documents/${encoded}/graph');
  });

  it('accepts the external n8n source and starter workflow run shape', async () => {
    const dataDir = tempDataDir();
    try {
      const sourceResponse = await handleSelfHostRuntimeRequest(
        new Request('http://localhost/v1/sources/n8n', {
          method: 'POST',
          body: JSON.stringify({ document_url: 'https://example.com/input.pdf' }),
          headers: { 'content-type': 'application/json' },
        }),
        { bundleDir: selfHostExampleRoot, dataDir, env: {} },
      );
      const source = await json(sourceResponse);
      const workflowResponse = await handleSelfHostRuntimeRequest(
        new Request('http://localhost/v1/workflows', {
          method: 'POST',
          body: JSON.stringify({
            recipe_id: 'recipe.n8n-ingest-audit-review',
            source_id: source.id,
          }),
          headers: { 'content-type': 'application/json' },
        }),
        { bundleDir: selfHostExampleRoot, dataDir, env: {} },
      );
      const workflow = await json(workflowResponse);
      const graphResponse = await handleSelfHostRuntimeRequest(
        new Request(`http://localhost${workflow.graph_url}`),
        { bundleDir: selfHostExampleRoot, dataDir, env: {} },
      );
      const graph = await json(graphResponse);
      const storedWorkflowResponse = await handleSelfHostRuntimeRequest(
        new Request(`http://localhost/v1/runs/${workflow.id}`),
        { bundleDir: selfHostExampleRoot, dataDir, env: {} },
      );
      const firstCapabilityRun = (workflow.capability_runs as Array<Record<string, unknown>>)[0];
      const capabilityRunResponse = await handleSelfHostRuntimeRequest(
        new Request(`http://localhost/v1/capability-runs/${firstCapabilityRun.id}`),
        { bundleDir: selfHostExampleRoot, dataDir, env: {} },
      );
      const capabilityRun = await json(capabilityRunResponse);

      expect(sourceResponse.status).toBe(202);
      expect(source).toMatchObject({
        object: 'source_ref',
        kind: 'n8n_webhook',
        status: 'accepted',
      });
      expect(workflowResponse.status).toBe(202);
      expect(workflow).toMatchObject({
        object: 'workflow_run',
        status: 'succeeded',
        mode: 'self_host_starter',
        recipe_id: 'recipe.n8n-ingest-audit-review',
        source_id: source.id,
      });
      expect(workflow.document_id).toEqual(expect.stringMatching(/^doc-/));
      expect((workflow.capability_runs as unknown[]).length).toBeGreaterThan(3);
      expect((workflow.capability_runs as Array<Record<string, unknown>>).map((run) => run.capability_id)).toEqual(
        expect.arrayContaining(['bridge.n8n.webhook', 'parser.mineru', 'auditor.wcag.basic', 'review.a11y.findings']),
      );
      expect(storedWorkflowResponse.status).toBe(200);
      expect((await json(storedWorkflowResponse)).id).toBe(workflow.id);
      expect(capabilityRunResponse.status).toBe(200);
      expect(capabilityRun).toMatchObject({
        object: 'capability_run',
        id: firstCapabilityRun.id,
        workflow_run_id: workflow.id,
        status: 'succeeded',
      });
      expect(graphResponse.status).toBe(200);
      expect(graph).toMatchObject({
        schema_version: 'okra-document-graph/v1',
        document: { id: workflow.document_id },
      });
      expect((graph.findings as unknown[]).length).toBeGreaterThan(0);
      expect((graph.reviews as unknown[]).length).toBeGreaterThan(0);
      expect((graph.lineage as Array<Record<string, unknown>>).map((entry) => entry.engine_id)).toEqual(
        expect.arrayContaining(['parser.mineru', 'auditor.wcag.basic', 'review.a11y.findings']),
      );
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('requires the configured API key for mutating self-host routes', async () => {
    const dataDir = tempDataDir();
    const options = {
      bundleDir: selfHostExampleRoot,
      dataDir,
      env: { OKRA_API_KEY: 'okra_self_host_key' },
    };
    try {
      const unauthenticated = await handleSelfHostRuntimeRequest(
        new Request('http://localhost/v1/sources/n8n', {
          method: 'POST',
          body: JSON.stringify({ document_url: 'https://example.com/input.pdf' }),
          headers: { 'content-type': 'application/json' },
        }),
        options,
      );
      const wrongKey = await handleSelfHostRuntimeRequest(
        new Request('http://localhost/v1/sources/n8n', {
          method: 'POST',
          body: JSON.stringify({ document_url: 'https://example.com/input.pdf' }),
          headers: {
            authorization: 'Bearer wrong',
            'content-type': 'application/json',
          },
        }),
        options,
      );
      const sourceResponse = await handleSelfHostRuntimeRequest(
        new Request('http://localhost/v1/sources/n8n', {
          method: 'POST',
          body: JSON.stringify({ document_url: 'https://example.com/input.pdf' }),
          headers: {
            authorization: 'Bearer okra_self_host_key',
            'content-type': 'application/json',
          },
        }),
        options,
      );
      const uploadResponse = await handleSelfHostRuntimeRequest(
        new Request('http://localhost/document/doc-auth-upload/upload', {
          method: 'POST',
          body: '%PDF-1.7\n/Type /Page\n%%EOF',
          headers: {
            'content-type': 'application/pdf',
            'x-okra-api-key': 'okra_self_host_key',
          },
        }),
        options,
      );
      const statusResponse = await handleSelfHostRuntimeRequest(
        new Request('http://localhost/v1/self-host/status'),
        options,
      );

      expect(unauthenticated.status).toBe(401);
      expect(await json(unauthenticated)).toMatchObject({
        object: 'error',
        code: 'UNAUTHORIZED',
      });
      expect(wrongKey.status).toBe(401);
      expect(sourceResponse.status).toBe(202);
      expect(uploadResponse.status).toBe(200);
      expect(await json(statusResponse)).toMatchObject({
        auth: {
          api_key_configured: true,
          first_owner_configured: false,
          protected_routes: expect.arrayContaining(['POST /v1/workflows']),
        },
      });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('supports the SDK upload, wait, read, pages, and nodes grammar against the starter runtime', async () => {
    const dataDir = tempDataDir();
    try {
      const client = new OkraClient({
        apiKey: 'okra_test_key',
        baseUrl: 'http://self-host.test',
        fetch: (input, init) =>
          handleSelfHostRuntimeRequest(new Request(input, init), {
            bundleDir: selfHostExampleRoot,
            dataDir,
            env: { OKRA_API_KEY: 'okra_test_key' },
          }),
      });

      const session = await client.upload(new TextEncoder().encode('%PDF-1.7\n/Type /Page\n%%EOF'), {
        documentId: 'doc-self-host-upload',
        fileName: 'starter.pdf',
      });
      const status = await session.wait({ timeoutMs: 50, pollIntervalMs: 1 });
      const read = await client.read(session.id);
      const pages = await client.pages(session.id);
      const entities = await client.entities(session.id);

      expect(status).toMatchObject({
        phase: 'complete',
        pagesTotal: 1,
        document_id: 'doc-self-host-upload',
      });
      expect(read.markdown).toContain('starter.pdf');
      expect(pages).toHaveLength(1);
      expect(entities.nodes.map((node) => node.id)).toContain('blk_source_summary');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('runs parse, audit, and redact workflow verbs against the starter runtime', async () => {
    const dataDir = tempDataDir();
    try {
      const client = new OkraClient({
        apiKey: 'okra_test_key',
        baseUrl: 'http://self-host.test',
        fetch: (input, init) =>
          handleSelfHostRuntimeRequest(new Request(input, init), {
            bundleDir: selfHostExampleRoot,
            dataDir,
            env: { OKRA_API_KEY: 'okra_test_key' },
          }),
      });

      const session = await client.upload(new TextEncoder().encode('%PDF-1.7\n/Type /Page\n%%EOF'), {
        documentId: 'doc-workflow-verbs',
        fileName: 'verbs.pdf',
      });
      const parseRun = await runDocumentWorkflow(client, 'parse', {
        documentId: session.id,
        engine: 'mineru',
      });
      const auditRun = await runDocumentWorkflow(client, 'audit', {
        documentId: session.id,
        standard: 'wcag',
      });
      const redactRun = await runDocumentWorkflow(client, 'redact', {
        documentId: session.id,
        model: 'local',
        policy: { preset: 'starter' },
      });

      expect(parseRun).toMatchObject({
        object: 'document_workflow_run',
        verb: 'parse',
        status: 'succeeded',
        recipe_id: 'recipe.parse-document',
        document_id: 'doc-workflow-verbs',
      });
      expect(parseRun.capability_runs.map((run) => (run as Record<string, unknown>).capability_id)).toEqual(
        expect.arrayContaining(['parser.mineru', 'viewer.document-graph']),
      );
      expect(auditRun).toMatchObject({
        verb: 'audit',
        status: 'succeeded',
        recipe_id: 'recipe.audit-review',
      });
      expect(auditRun.capability_runs.map((run) => (run as Record<string, unknown>).capability_id)).toEqual(
        expect.arrayContaining(['auditor.wcag.basic', 'review.a11y.findings', 'viewer.document-graph']),
      );
      expect(redactRun).toMatchObject({
        verb: 'redact',
        status: 'succeeded',
        recipe_id: 'recipe.redact-review',
      });
      expect(redactRun.capability_runs.map((run) => (run as Record<string, unknown>).capability_id)).toEqual(
        expect.arrayContaining(['redactor.policy.basic', 'review.redactions', 'viewer.document-graph']),
      );
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('accumulates graph state across parse -> audit verbs (no reset between runs)', async () => {
    const dataDir = tempDataDir();
    try {
      const client = new OkraClient({
        apiKey: 'okra_test_key',
        baseUrl: 'http://self-host.test',
        fetch: (input, init) =>
          handleSelfHostRuntimeRequest(new Request(input, init), {
            bundleDir: selfHostExampleRoot,
            dataDir,
            env: { OKRA_API_KEY: 'okra_test_key' },
          }),
      });
      const session = await client.upload(new TextEncoder().encode('%PDF-1.7\n/Type /Page\n%%EOF'), {
        documentId: 'doc-cumulative',
        fileName: 'cumulative.pdf',
      });
      await runDocumentWorkflow(client, 'parse', { documentId: session.id });
      const afterParse = await client.request<Record<string, unknown>>(
        '/v1/documents/doc-cumulative/graph',
        { method: 'GET' },
      );
      const parseBlockIds = (afterParse.blocks as Array<Record<string, unknown>>).map((b) => b.id);

      await runDocumentWorkflow(client, 'audit', { documentId: session.id, standard: 'wcag' });
      const afterAudit = await client.request<Record<string, unknown>>(
        '/v1/documents/doc-cumulative/graph',
        { method: 'GET' },
      );
      const auditBlockIds = (afterAudit.blocks as Array<Record<string, unknown>>).map((b) => b.id);

      // The blocks written by parse must survive the audit run (graph is not reset),
      // and audit must add findings derived from that same graph.
      for (const id of parseBlockIds) {
        expect(auditBlockIds).toContain(id);
      }
      expect((afterAudit.findings as unknown[]).length).toBeGreaterThan(0);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('accumulates graph state across source_id workflow runs (n8n path, no reset)', async () => {
    const dataDir = tempDataDir();
    const options = { bundleDir: selfHostExampleRoot, dataDir, env: { OKRA_API_KEY: 'okra_test_key' } };
    const post = (path: string, body: unknown) =>
      handleSelfHostRuntimeRequest(
        new Request(`http://self-host.test${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer okra_test_key' },
          body: JSON.stringify(body),
        }),
        options,
      );
    try {
      const sourceResp = await json(await post('/v1/sources/n8n', { document_url: 'https://example.com/x.pdf' }));
      const sourceId = sourceResp.id as string;
      // two separate workflow runs sharing only source_id
      const parseRun = await json(await post('/v1/workflows', { recipe_id: 'recipe.parse-document', source_id: sourceId }));
      const documentId = parseRun.document_id as string;
      const afterParse = await json(await handleSelfHostRuntimeRequest(
        new Request(`http://self-host.test/v1/documents/${documentId}/graph`, {
          headers: { authorization: 'Bearer okra_test_key' },
        }),
        options,
      ));
      const parseBlockIds = (afterParse.blocks as Array<Record<string, unknown>>).map((b) => b.id);
      await post('/v1/workflows', { recipe_id: 'recipe.audit-review', source_id: sourceId });
      const afterAudit = await json(await handleSelfHostRuntimeRequest(
        new Request(`http://self-host.test/v1/documents/${documentId}/graph`, {
          headers: { authorization: 'Bearer okra_test_key' },
        }),
        options,
      ));
      const auditBlockIds = (afterAudit.blocks as Array<Record<string, unknown>>).map((b) => b.id);
      // graph state from the parse run must survive the source_id-based audit run
      for (const id of parseBlockIds) {
        expect(auditBlockIds).toContain(id);
      }
      expect((afterAudit.findings as unknown[]).length).toBeGreaterThan(0);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('dispatches configured capability steps to isolated HTTP services', async () => {
    const dataDir = tempDataDir();
    const capabilityRequests: Array<Record<string, unknown>> = [];
    const capabilityFetch: typeof fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      const capabilityIdByHost: Record<string, string> = {
        'okra-parser-mineru': 'parser.mineru',
        'okra-auditor-wcag': 'auditor.wcag.basic',
        'okra-redactor-policy': 'redactor.policy.basic',
      };
      const capabilityId = capabilityIdByHost[url.hostname];
      const body = await request.clone().json();
      capabilityRequests.push(body as Record<string, unknown>);
      expect(capabilityId).toBeTruthy();
      expect(url.pathname).toBe('/v1/capability-runs');
      return handleCapabilityServiceRequest(request, { capabilityId: capabilityId! });
    };

    try {
      const client = new OkraClient({
        apiKey: 'okra_test_key',
        baseUrl: 'http://self-host.test',
        fetch: (input, init) =>
          handleSelfHostRuntimeRequest(new Request(input, init), {
            bundleDir: selfHostExampleRoot,
            dataDir,
            env: {
              OKRA_API_KEY: 'okra_test_key',
              OKRA_CAPABILITY_PARSER_MINERU_URL: 'http://okra-parser-mineru:8080',
              OKRA_CAPABILITY_AUDITOR_WCAG_BASIC_URL: 'http://okra-auditor-wcag:8080',
              OKRA_CAPABILITY_REDACTOR_POLICY_BASIC_URL: 'http://okra-redactor-policy:8080',
            },
            capabilityFetch,
          }),
      });

      const session = await client.upload(new TextEncoder().encode('%PDF-1.7\n/Type /Page\n%%EOF'), {
        documentId: 'doc-external-parser',
        fileName: 'external.pdf',
      });
      const parseRun = await runDocumentWorkflow(client, 'parse', {
        documentId: session.id,
        engine: 'mineru',
      });
      const parseGraph = await client.request<Record<string, unknown>>('/v1/documents/doc-external-parser/graph', {
        method: 'GET',
      });
      const auditRun = await runDocumentWorkflow(client, 'audit', {
        documentId: session.id,
        standard: 'wcag',
      });
      const auditGraph = await client.request<Record<string, unknown>>('/v1/documents/doc-external-parser/graph', {
        method: 'GET',
      });
      const redactRun = await runDocumentWorkflow(client, 'redact', {
        documentId: session.id,
        model: 'local',
        policy: { preset: 'starter' },
      });
      const redactGraph = await client.request<Record<string, unknown>>('/v1/documents/doc-external-parser/graph', {
        method: 'GET',
      });

      expect(capabilityRequests).toHaveLength(3);
      expect(capabilityRequests.map((request) => request.capability_id)).toEqual([
        'parser.mineru',
        'auditor.wcag.basic',
        'redactor.policy.basic',
      ]);
      expect(capabilityRequests).toEqual(expect.arrayContaining([expect.objectContaining({
        object: 'capability_run_request',
        protocol: 'okra-capability-http/v1',
        capability_id: 'parser.mineru',
        document_id: 'doc-external-parser',
      })]));
      expect(parseRun.capability_runs[0]).toMatchObject({
        capability_id: 'parser.mineru',
        mode: 'external_http',
        endpoint_url: 'http://okra-parser-mineru:8080/v1/capability-runs',
      });
      expect(auditRun.capability_runs[0]).toMatchObject({
        capability_id: 'auditor.wcag.basic',
        mode: 'external_http',
        endpoint_url: 'http://okra-auditor-wcag:8080/v1/capability-runs',
      });
      expect(redactRun.capability_runs[0]).toMatchObject({
        capability_id: 'redactor.policy.basic',
        mode: 'external_http',
        endpoint_url: 'http://okra-redactor-policy:8080/v1/capability-runs',
      });
      expect((parseGraph.blocks as Array<Record<string, unknown>>).map((block) => block.id)).toContain('blk_parse_service');
      expect((auditGraph.findings as Array<Record<string, unknown>>).map((finding) => finding.id)).toContain(
        'finding_audit_service',
      );
      // The basic policy redactor only proposes redactions for real PII matches.
      // This fixture has no extractable text (fake PDF), so it honestly proposes none.
      expect(Array.isArray(redactGraph.redactions)).toBe(true);
      expect((redactGraph.lineage as Array<Record<string, unknown>>).map((entry) => entry.runtime)).toContain(
        'external_http',
      );
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('fails closed when a configured external capability service is unavailable', async () => {
    const dataDir = tempDataDir();
    const options = {
      bundleDir: selfHostExampleRoot,
      dataDir,
      env: {
        OKRA_API_KEY: 'okra_test_key',
        OKRA_CAPABILITY_PARSER_MINERU_URL: 'http://okra-parser-mineru:8080',
      },
      capabilityFetch: async () => new Response('not ready', { status: 503 }),
    };
    try {
      const uploadResponse = await handleSelfHostRuntimeRequest(
        new Request('http://localhost/document/doc-external-fail/upload', {
          method: 'POST',
          body: '%PDF-1.7\n/Type /Page\n%%EOF',
          headers: {
            'content-type': 'application/pdf',
            'x-okra-api-key': 'okra_test_key',
          },
        }),
        options,
      );
      const workflowResponse = await handleSelfHostRuntimeRequest(
        new Request('http://localhost/v1/workflows', {
          method: 'POST',
          body: JSON.stringify({
            recipe_id: 'recipe.parse-document',
            document_id: 'doc-external-fail',
          }),
          headers: {
            authorization: 'Bearer okra_test_key',
            'content-type': 'application/json',
          },
        }),
        options,
      );

      expect(uploadResponse.status).toBe(200);
      expect(workflowResponse.status).toBe(502);
      expect(await json(workflowResponse)).toMatchObject({
        object: 'error',
        code: 'CAPABILITY_DISPATCH_FAILED',
        capability_id: 'parser.mineru',
      });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('runs the clean self-host smoke path without opening a port', async () => {
    const dataDir = tempDataDir();
    try {
      const client = new OkraClient({
        apiKey: 'okra_smoke_key',
        baseUrl: 'http://self-host.test',
        fetch: (input, init) =>
          handleSelfHostRuntimeRequest(new Request(input, init), {
            bundleDir: selfHostExampleRoot,
            dataDir,
            env: { OKRA_API_KEY: 'okra_smoke_key' },
          }),
      });

      const result = await runSelfHostSmoke(client, {
        baseUrl: 'http://self-host.test',
        documentId: 'doc-smoke-test',
        workflow: 'both',
        timeoutMs: 50,
        pollIntervalMs: 1,
      });

      expect(result.ok).toBe(true);
      expect(result.document_id).toBe('doc-smoke-test');
      expect(result.open_url).toBe('http://self-host.test/?doc=doc-smoke-test&view=review');
      expect(result.checks.map((check) => check.name)).toEqual([
        'health',
        'status',
        'upload',
        'parse',
        'audit',
        'redact',
        'graph',
        'open',
      ]);
      expect(result.parse_run?.recipe_id).toBe('recipe.parse-document');
      expect(result.audit_run?.recipe_id).toBe('recipe.audit-review');
      expect(result.redact_run?.recipe_id).toBe('recipe.redact-review');

      const evidence = createSelfHostSmokeEvidence(result, '2026-01-01T00:00:00.000Z');
      expect(evidence).toMatchObject({
        object: 'self_host_smoke_evidence',
        schema_version: 'okra-self-host-smoke-evidence/v1',
        status: 'passed',
        generated_at: '2026-01-01T00:00:00.000Z',
        base_url: 'http://self-host.test',
        workflow: 'both',
        readiness: {
          eligible: true,
        },
      });
      expect(evidence.readiness.required_checks).toEqual([
        'health',
        'status',
        'upload',
        'parse',
        'audit',
        'redact',
        'graph',
        'open',
      ]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('rejects unknown recipe ids before pretending to schedule a workflow', async () => {
    const response = await handleSelfHostRuntimeRequest(
      new Request('http://localhost/v1/workflows', {
        method: 'POST',
        body: JSON.stringify({ recipe_id: 'recipe.missing' }),
        headers: { 'content-type': 'application/json' },
      }),
      { bundleDir: selfHostExampleRoot, env: {} },
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({
      object: 'error',
      error: 'unknown recipe_id "recipe.missing"',
    });
  });
});
