import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  okraDocumentGraphSchema,
  okraEngineManifestSchema,
  okraSelfHostRuntimeManifestSchema,
  okraWorkflowRecipeManifestSchema,
} from './self-host.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const selfHostExampleRoot = join(repoRoot, 'runtime');

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

function findEnvRefs(value: unknown, refs = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const matcher = /\$env\.([A-Z0-9_]+)/g;
    for (const match of value.matchAll(matcher)) refs.add(match[1]);
    return refs;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => findEnvRefs(item, refs));
    return refs;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => findEnvRefs(item, refs));
  }

  return refs;
}

describe('okraEngineManifestSchema', () => {
  it('accepts a Hugging Face-backed parser engine manifest', () => {
    const parsed = okraEngineManifestSchema.parse({
      id: 'parser.mineru',
      name: 'MinerU Parser',
      version: '0.1.0',
      description: 'Extracts layout-aware document blocks through a self-hosted MinerU path.',
      kind: 'parser',
      runtime: 'huggingface_model',
      runtime_config: {
        huggingface_model_id: 'opendatalab/PDF-Extract-Kit-1.0',
      },
      input_schema: {
        type: 'object',
        required: ['source'],
      },
      output_schema: {
        $ref: 'okra-document-graph/v1',
      },
      reads: ['source', 'document'],
      writes: ['pages', 'blocks', 'artifacts', 'lineage'],
      volumes: [
        {
          name: 'model-cache',
          mount_path: '/data/huggingface',
          purpose: 'Persistent Hugging Face model cache for Railway deployments.',
          required: true,
        },
      ],
      resource_profile: {
        cpu_millicores: 2000,
        memory_mb: 4096,
        timeout_seconds: 600,
      },
      license: 'Apache-2.0',
      commercial_ok: true,
      network_policy: {
        mode: 'allowlist',
        allowed_hosts: ['huggingface.co'],
        outbound_http: true,
      },
      offline_ok: false,
    });

    expect(parsed.kind).toBe('parser');
    expect(parsed.lineage.required_fields).toContain('engine_id');
    expect(parsed.writes).toContain('blocks');
  });

  it('keeps n8n as a workflow bridge instead of embedded orchestration', () => {
    const parsed = okraEngineManifestSchema.parse({
      id: 'bridge.n8n.webhook',
      name: 'n8n Webhook Bridge',
      version: '0.1.0',
      description: 'Receives n8n webhook payloads and turns them into graph sources.',
      kind: 'workflow_bridge',
      runtime: 'http_base_url',
      runtime_config: {
        endpoint_path: '/v1/sources/n8n',
      },
      input_schema: {
        type: 'object',
      },
      output_schema: {
        $ref: 'okra-document-graph/v1#/source',
      },
      reads: ['source'],
      writes: ['source', 'lineage'],
      license: 'MIT',
      commercial_ok: true,
      network_policy: {
        mode: 'restricted',
      },
      offline_ok: false,
    });

    expect(parsed.kind).toBe('workflow_bridge');
    expect(parsed.writes).toEqual(['source', 'lineage']);
  });

  it('rejects manifests that do not declare graph writes', () => {
    const result = okraEngineManifestSchema.safeParse({
      id: 'parser.empty',
      name: 'Empty Parser',
      version: '0.1.0',
      description: 'Invalid because it writes no shared graph capability.',
      kind: 'parser',
      runtime: 'in_process',
      input_schema: {},
      output_schema: {},
      reads: ['source'],
      writes: [],
      license: 'MIT',
      commercial_ok: true,
      network_policy: {
        mode: 'offline',
      },
      offline_ok: true,
    });

    expect(result.success).toBe(false);
  });

  it('rejects allowlist network policies without allowed hosts', () => {
    const result = okraEngineManifestSchema.safeParse({
      id: 'parser.bad-network',
      name: 'Bad Network Parser',
      version: '0.1.0',
      description: 'Invalid allowlist example.',
      kind: 'parser',
      runtime: 'external_api',
      input_schema: {},
      output_schema: {},
      reads: ['source'],
      writes: ['blocks'],
      license: 'Commercial',
      commercial_ok: false,
      network_policy: {
        mode: 'allowlist',
      },
      offline_ok: false,
    });

    expect(result.success).toBe(false);
  });

  it('rejects host-network isolation for self-host capabilities', () => {
    const result = okraEngineManifestSchema.safeParse({
      id: 'parser.host-network',
      name: 'Host Network Parser',
      version: '0.1.0',
      description: 'Invalid because self-host capabilities should not use host networking.',
      kind: 'parser',
      runtime: 'docker_image',
      runtime_config: {
        image: 'ghcr.io/okrapdf/parser-host-network:0.1.0',
      },
      input_schema: {},
      output_schema: {},
      reads: ['source'],
      writes: ['blocks'],
      license: 'MIT',
      commercial_ok: true,
      network_policy: {
        mode: 'restricted',
      },
      isolation: {
        namespace: 'okra.capabilities.parser.host-network',
        mode: 'container',
        network_namespace: 'host',
      },
      offline_ok: false,
    });

    expect(result.success).toBe(false);
  });
});

describe('okraWorkflowRecipeManifestSchema', () => {
  it('keeps OCR and agent composition in external workflow recipes', () => {
    const recipe = okraWorkflowRecipeManifestSchema.parse({
      schema_version: 'okra-workflow-recipe/v1',
      id: 'recipe.hybrid-ocr-accessibility-review',
      name: 'Hybrid OCR Accessibility Review',
      version: '0.1.0',
      description:
        'Runs a swappable OCR/parser chain, audits the graph, and opens findings for review.',
      triggers: ['manual_upload', 'api_call', 'mcp_tool'],
      capability_refs: ['parser.mineru', 'auditor.wcag.basic', 'review.a11y.findings'],
      graph_contract: {
        reads: ['source', 'document', 'pages', 'blocks'],
        writes: ['pages', 'blocks', 'findings', 'reviews', 'lineage'],
      },
      parameters_schema: {
        type: 'object',
        properties: {
          ocr_strategy: {
            enum: ['mineru', 'tesseract', 'vision_hybrid'],
          },
        },
      },
      steps: [
        {
          id: 'parse',
          uses: 'parser.mineru',
          reads: ['source', 'document'],
          writes: ['pages', 'blocks', 'artifacts', 'lineage'],
          input_map: {
            source: '$.source',
          },
        },
        {
          id: 'audit',
          uses: 'auditor.wcag.basic',
          reads: ['document', 'pages', 'blocks'],
          writes: ['findings', 'lineage'],
        },
        {
          id: 'review',
          uses: 'review.a11y.findings',
          reads: ['findings'],
          writes: ['reviews', 'lineage'],
          requires_review: true,
          on_error: 'manual_review',
        },
      ],
      labels: ['ocr', 'a11y', 'human-review'],
    });

    expect(recipe.recipe_mode).toBe('external');
    expect(recipe.steps[0].uses).toBe('parser.mineru');
    expect(recipe.steps[2].requires_review).toBe(true);
  });

  it('rejects recipe steps that use undeclared capability refs', () => {
    const result = okraWorkflowRecipeManifestSchema.safeParse({
      schema_version: 'okra-workflow-recipe/v1',
      id: 'recipe.invalid',
      name: 'Invalid Recipe',
      version: '0.1.0',
      description: 'Invalid because the recipe references an undeclared capability.',
      triggers: ['manual_upload'],
      capability_refs: ['parser.mineru'],
      graph_contract: {
        reads: ['source'],
        writes: ['blocks'],
      },
      steps: [
        {
          id: 'parse',
          uses: 'parser.unknown',
          reads: ['source'],
          writes: ['blocks'],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe('okraSelfHostRuntimeManifestSchema', () => {
  it('accepts a Railway runtime manifest with external recipe catalogs and static UI', () => {
    const manifest = okraSelfHostRuntimeManifestSchema.parse({
      schema_version: 'okra-self-host-runtime/v1',
      id: 'okra-self-host-railway',
      name: 'okraPDF Self-Host Railway Runtime',
      version: '0.1.0',
      description:
        'A small self-host runtime with a static UI shell, API service, Postgres, volumes, and external workflow recipes.',
      roadmap_items: ['M-SH', 'S.5.0', 'S.5.1'],
      deployment_targets: ['railway', 'cloudflare_workers'],
      ui_runtime: 'cloudflare_worker_static_assets',
      api_runtime: 'container_http',
      recipe_catalogs: [
        {
          id: 'default-recipes',
          kind: 'directory',
          path: './recipes',
          description: 'Swappable OCR, audit, redact, and review workflows.',
        },
        {
          id: 'n8n-recipes',
          kind: 'n8n_export',
          path: './recipes/n8n',
          required: false,
        },
      ],
      capability_refs: ['parser.mineru', 'auditor.wcag.basic', 'bridge.n8n.webhook'],
      services: [
        {
          id: 'okra-app',
          name: 'Okra App Shell',
          kind: 'app',
          runtime: 'dockerfile',
          public: true,
          depends_on: ['okra-postgres'],
          env: ['DATABASE_URL', 'OKRA_SECRET_KEY', 'OKRA_RECIPE_CATALOG_DIR'],
          volumes: ['okra-data'],
          network_refs: ['okra-edge', 'okra-core', 'okra-capabilities', 'okra-integrations'],
          recipe_catalog_ref: 'default-recipes',
          railway: {
            service_name: 'okra-app',
            builder: 'DOCKERFILE',
            dockerfile_path: 'Dockerfile',
            healthcheck_path: '/health',
            healthcheck_timeout_seconds: 300,
          },
        },
        {
          id: 'okra-postgres',
          name: 'Postgres',
          kind: 'postgres',
          runtime: 'managed_postgres',
          network_refs: ['okra-core'],
        },
        {
          id: 'okra-parser-mineru',
          name: 'MinerU Parser',
          kind: 'capability_service',
          runtime: 'container_image',
          image: 'ghcr.io/okrapdf/parser-mineru:0.1.0',
          depends_on: ['okra-app'],
          env: ['HF_HOME'],
          volumes: ['okra-data'],
          network_refs: ['okra-capabilities'],
          capability_ref: 'parser.mineru',
        },
        {
          id: 'external-n8n',
          name: 'External n8n',
          kind: 'external_service',
          runtime: 'external',
          required: false,
          network_refs: ['okra-integrations'],
          capability_ref: 'bridge.n8n.webhook',
          recipe_catalog_ref: 'n8n-recipes',
        },
      ],
      docker_networks: [
        {
          id: 'okra-edge',
          kind: 'public_ingress',
          docker: {
            driver: 'bridge',
            internal: false,
            external: false,
          },
        },
        {
          id: 'okra-core',
          kind: 'private_runtime',
          docker: {
            driver: 'bridge',
            internal: true,
            external: false,
          },
        },
        {
          id: 'okra-capabilities',
          kind: 'capability_mesh',
          docker: {
            driver: 'bridge',
            internal: true,
            external: false,
          },
          capability_refs: ['parser.mineru'],
        },
        {
          id: 'okra-integrations',
          kind: 'external_bridge',
          docker: {
            driver: 'bridge',
            internal: false,
            external: true,
            attachable: true,
          },
          capability_refs: ['bridge.n8n.webhook'],
        },
      ],
      capability_implementations: [
        {
          id: 'implementation.parser-mineru',
          capability_ref: 'parser.mineru',
          service_id: 'okra-parser-mineru',
          status: 'starter_adapter',
          target_status: 'model_backed',
          protocol: 'okra-capability-http/v1',
          endpoint_path: '/v1/capability-runs',
          image: 'ghcr.io/okrapdf/okra-parser-mineru:0.1.0',
          dockerfile_path: 'runtime/capability-images/parser-mineru/Dockerfile',
          command: 'okra capability serve parser.mineru --host 0.0.0.0 --port 8080',
          network_refs: ['okra-capabilities'],
          env: ['HF_HOME'],
          volumes: ['okra-data'],
          model: {
            provider: 'huggingface',
            model_id: 'opendatalab/PDF-Extract-Kit-1.0',
            cache_volume: 'okra-data',
            cache_path: '/data/huggingface',
            env: ['HF_HOME'],
          },
          promotion_actions: [
            'Build the model-backed image.',
            'Run the capability HTTP smoke test.',
          ],
        },
      ],
      env: [
        {
          name: 'DATABASE_URL',
          required: true,
          secret: true,
        },
        {
          name: 'OKRA_SECRET_KEY',
          required: true,
          secret: true,
        },
        {
          name: 'OKRA_RECIPE_CATALOG_DIR',
          default: '/app/recipes',
        },
        {
          name: 'HF_HOME',
          default: '/data/huggingface',
        },
      ],
      volumes: [
        {
          id: 'okra-data',
          mount_path: '/data',
          purpose: 'Uploads, graph artifacts, exports, and model cache.',
        },
      ],
      data_boundary: {
        database: 'okra-postgres',
        artifact_store: 'okra-data',
        document_graph_store: 'okra-postgres',
        recipe_store: 'default-recipes',
        notes:
          'Runtime state stays in Okra services; n8n and custom agents remain external recipes or bridges.',
      },
      auth_bootstrap: {
        mode: 'single_owner_api_key',
        owner_email_env: 'OKRA_FIRST_OWNER_EMAIL',
        api_key_env: 'OKRA_API_KEY',
        registration_mode: 'invite_only',
        protected_routes: ['POST /document/:id/upload', 'POST /v1/workflows'],
      },
      non_goals: ['nextjs_server', 'embedded_n8n', 'monolithic_ocr_pipeline'],
      smoke_tests: [
        {
          name: 'Healthcheck',
          path: '/health',
          expected_status: 200,
        },
      ],
    });

    expect(manifest.recipe_mode).toBe('external_catalog');
    expect(manifest.ui_runtime).toBe('cloudflare_worker_static_assets');
    expect(manifest.non_goals).toContain('nextjs_server');
    expect(manifest.auth_bootstrap?.owner_email_env).toBe('OKRA_FIRST_OWNER_EMAIL');
    expect(manifest.recipe_catalogs[1]).toMatchObject({ required: false });
    expect(manifest.capability_implementations[0]).toMatchObject({
      capability_ref: 'parser.mineru',
      service_id: 'okra-parser-mineru',
      target_status: 'model_backed',
    });
    expect(manifest.docker_networks.map((network) => network.kind)).toEqual(
      expect.arrayContaining([
        'public_ingress',
        'private_runtime',
        'capability_mesh',
        'external_bridge',
      ]),
    );
  });

  it('rejects runtime manifests that reference unknown service dependencies', () => {
    const result = okraSelfHostRuntimeManifestSchema.safeParse({
      schema_version: 'okra-self-host-runtime/v1',
      id: 'okra-self-host-invalid',
      name: 'Invalid Self Host',
      version: '0.1.0',
      description: 'Invalid because the app depends on a missing database service.',
      roadmap_items: ['M-SH', 'S.5.1'],
      deployment_targets: ['railway'],
      ui_runtime: 'vite_static',
      api_runtime: 'container_http',
      recipe_catalogs: [
        {
          id: 'default-recipes',
          kind: 'directory',
          path: './recipes',
        },
      ],
      services: [
        {
          id: 'okra-app',
          name: 'Okra App',
          kind: 'app',
          runtime: 'dockerfile',
          depends_on: ['missing-postgres'],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects Docker topology that puts stateful services on public ingress', () => {
    const result = okraSelfHostRuntimeManifestSchema.safeParse({
      schema_version: 'okra-self-host-runtime/v1',
      id: 'okra-self-host-public-db',
      name: 'Invalid Public DB',
      version: '0.1.0',
      description: 'Invalid because the database is attached to public ingress.',
      roadmap_items: ['M-SH', 'S.5.1'],
      deployment_targets: ['docker_compose'],
      ui_runtime: 'static_assets',
      api_runtime: 'container_http',
      recipe_catalogs: [
        {
          id: 'default-recipes',
          kind: 'directory',
          path: './recipes',
        },
      ],
      services: [
        {
          id: 'okra-app',
          name: 'Okra App',
          kind: 'app',
          runtime: 'dockerfile',
          public: true,
          network_refs: ['okra-edge'],
        },
        {
          id: 'okra-postgres',
          name: 'Postgres',
          kind: 'postgres',
          runtime: 'managed_postgres',
          network_refs: ['okra-edge'],
        },
      ],
      docker_networks: [
        {
          id: 'okra-edge',
          kind: 'public_ingress',
          docker: {
            driver: 'bridge',
            internal: false,
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects capability implementations that break runtime boundaries', () => {
    const result = okraSelfHostRuntimeManifestSchema.safeParse({
      schema_version: 'okra-self-host-runtime/v1',
      id: 'okra-self-host-invalid-implementation',
      name: 'Invalid Implementation Boundary',
      version: '0.1.0',
      description: 'Invalid because implementation refs must map to known runtime resources.',
      roadmap_items: ['M-SH', 'S.5.1'],
      deployment_targets: ['docker_compose'],
      ui_runtime: 'static_assets',
      api_runtime: 'container_http',
      recipe_catalogs: [
        {
          id: 'default-recipes',
          kind: 'directory',
          path: './recipes',
        },
      ],
      capability_refs: ['parser.mineru'],
      services: [
        {
          id: 'okra-app',
          name: 'Okra App',
          kind: 'app',
          runtime: 'dockerfile',
        },
      ],
      capability_implementations: [
        {
          id: 'implementation.bad-parser',
          capability_ref: 'parser.unknown',
          service_id: 'missing-parser',
          target_status: 'model_backed',
          network_refs: ['missing-network'],
          env: ['MISSING_ENV'],
          volumes: ['missing-volume'],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects Next.js as a self-host UI runtime', () => {
    const result = okraSelfHostRuntimeManifestSchema.safeParse({
      schema_version: 'okra-self-host-runtime/v1',
      id: 'okra-self-host-next',
      name: 'Invalid Next Runtime',
      version: '0.1.0',
      description: 'Invalid because self-host should stay static or Cloudflare-compatible.',
      roadmap_items: ['M-SH', 'S.5.1'],
      deployment_targets: ['railway'],
      ui_runtime: 'nextjs',
      api_runtime: 'container_http',
      recipe_catalogs: [
        {
          id: 'default-recipes',
          kind: 'directory',
          path: './recipes',
        },
      ],
      services: [
        {
          id: 'okra-app',
          name: 'Okra App',
          kind: 'app',
          runtime: 'dockerfile',
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe('self-host runtime example manifests', () => {
  it('validates the committed Railway/static-runtime fixture and external recipes', () => {
    const runtime = okraSelfHostRuntimeManifestSchema.parse(
      readJson(join(selfHostExampleRoot, 'runtime.manifest.json')),
    );

    expect(runtime.roadmap_items).toEqual(expect.arrayContaining(['M-SH', 'S.5.0', 'S.5.1']));
    expect(runtime.deployment_targets).toEqual(
      expect.arrayContaining(['railway', 'cloudflare_workers', 'docker_compose']),
    );
    expect(runtime.ui_runtime).not.toContain('next');
    expect(runtime.recipe_mode).toBe('external_catalog');
    expect(existsSync(join(selfHostExampleRoot, 'Dockerfile'))).toBe(true);
    expect(existsSync(join(selfHostExampleRoot, 'public/index.html'))).toBe(true);
    expect(runtime.services.find((service) => service.id === 'okra-app')?.railway?.dockerfile_path).toBe(
      'runtime/Dockerfile',
    );
    expect(runtime.non_goals).toEqual(
      expect.arrayContaining(['nextjs_server', 'embedded_n8n', 'monolithic_ocr_pipeline']),
    );

    const catalogIds = new Set(runtime.recipe_catalogs.map((catalog) => catalog.id));
    for (const service of runtime.services) {
      if (service.recipe_catalog_ref) {
        expect(catalogIds.has(service.recipe_catalog_ref)).toBe(true);
      }
    }

    expect(runtime.docker_networks).toHaveLength(4);
    const networkKinds = new Map(runtime.docker_networks.map((network) => [network.id, network.kind]));
    expect(networkKinds.get('okra-edge')).toBe('public_ingress');
    expect(networkKinds.get('okra-core')).toBe('private_runtime');
    expect(networkKinds.get('okra-capabilities')).toBe('capability_mesh');
    expect(networkKinds.get('okra-integrations')).toBe('external_bridge');
    expect(runtime.capability_implementations).toHaveLength(3);
    expect(runtime.capability_implementations.map((implementation) => implementation.capability_ref)).toEqual(
      ['parser.mineru', 'auditor.wcag.basic', 'redactor.policy.basic'],
    );
    expect(runtime.capability_implementations.every((implementation) =>
      implementation.network_refs.includes('okra-capabilities'),
    )).toBe(true);
    const implementationByCapability = new Map(
      runtime.capability_implementations.map((implementation) => [
        implementation.capability_ref,
        implementation,
      ]),
    );
    for (const implementation of runtime.capability_implementations) {
      expect(implementation.dockerfile_path).toBeDefined();
      expect(existsSync(join(repoRoot, implementation.dockerfile_path!))).toBe(true);
    }

    const serviceNetworks = new Map(runtime.services.map((service) => [service.id, service.network_refs]));
    expect(serviceNetworks.get('okra-app')).toEqual(
      expect.arrayContaining(['okra-edge', 'okra-core', 'okra-capabilities', 'okra-integrations']),
    );
    expect(serviceNetworks.get('okra-parser-mineru')).toEqual(['okra-capabilities']);
    expect(serviceNetworks.get('external-n8n')).toEqual(['okra-integrations']);

    const integrationsNetwork = runtime.docker_networks.find(
      (network) => network.id === 'okra-integrations',
    );
    expect(integrationsNetwork?.docker.external).toBe(true);
    expect(integrationsNetwork?.capability_refs).toContain('bridge.n8n.webhook');

    for (const catalog of runtime.recipe_catalogs.filter((item) => item.required)) {
      expect(catalog.path).toBeDefined();
      expect(existsSync(join(selfHostExampleRoot, catalog.path!))).toBe(true);
    }

    for (const catalog of runtime.capability_catalogs.filter((item) => item.required)) {
      expect(catalog.path).toBeDefined();
      expect(existsSync(join(selfHostExampleRoot, catalog.path!))).toBe(true);
    }

    const runtimeCapabilities = new Set(runtime.capability_refs);
    const capabilityFiles = listJsonFiles(join(selfHostExampleRoot, 'capabilities')).filter((path) =>
      path.endsWith('.engine.json'),
    );
    expect(capabilityFiles.length).toBeGreaterThan(0);

    const capabilityManifests = capabilityFiles.map((path) =>
      okraEngineManifestSchema.parse(readJson(path)),
    );
    const capabilityIds = new Set(capabilityManifests.map((manifest) => manifest.id));

    expect(capabilityIds).toEqual(runtimeCapabilities);
    expect(capabilityManifests.map((manifest) => manifest.kind)).toEqual(
      expect.arrayContaining([
        'sourcer',
        'parser',
        'auditor',
        'redactor',
        'viewer',
        'review_ui',
        'workflow_bridge',
      ]),
    );

    const isolationNamespaces = new Set<string>();
    for (const capability of capabilityManifests) {
      const isolation = capability.isolation;
      expect(isolation).toBeDefined();
      if (!isolation) {
        throw new Error(`Capability ${capability.id} is missing isolation metadata`);
      }

      expect(isolation.namespace).toMatch(/^okra\.capabilities\./);
      expect(isolationNamespaces.has(isolation.namespace)).toBe(false);
      isolationNamespaces.add(isolation.namespace);
      expect(capability.network_policy.mode).not.toBe('unrestricted');

      if (capability.network_policy.mode === 'offline') {
        expect(capability.network_policy.outbound_http).toBe(false);
        expect(isolation.network_namespace).toBe('none');
      }

      if (capability.network_policy.outbound_http) {
        expect(isolation.network_namespace).not.toBe('none');
      }

      if (capability.secrets.length === 0) {
        expect(isolation.secrets.scope).not.toBe('declared_only');
      }

      const implementation = implementationByCapability.get(capability.id);
      if (implementation) {
        const runtimeConfig = capability.runtime_config as Record<string, unknown> | undefined;
        expect(runtimeConfig?.dockerfile_path).toBe(implementation.dockerfile_path);
        expect(runtimeConfig?.image).toBe(implementation.image);
      }
    }

    for (const service of runtime.services) {
      if (service.capability_ref) {
        expect(runtimeCapabilities.has(service.capability_ref)).toBe(true);
      }
    }

    const recipeFiles = listJsonFiles(join(selfHostExampleRoot, 'recipes')).filter((path) =>
      path.endsWith('.recipe.json'),
    );
    expect(recipeFiles.length).toBeGreaterThan(0);
    const referencedCapabilities = new Set(
      runtime.services.flatMap((service) => service.capability_ref ? [service.capability_ref] : []),
    );

    for (const recipeFile of recipeFiles) {
      const recipe = okraWorkflowRecipeManifestSchema.parse(readJson(recipeFile));
      expect(recipe.recipe_mode).toBe('external');
      for (const capabilityRef of recipe.capability_refs) {
        expect(runtimeCapabilities.has(capabilityRef)).toBe(true);
        referencedCapabilities.add(capabilityRef);
      }
    }

    expect(referencedCapabilities).toEqual(runtimeCapabilities);

    const runtimeEnv = new Set(runtime.env.map((env) => env.name));
    const recipeIds = new Set(
      recipeFiles.map((recipeFile) => okraWorkflowRecipeManifestSchema.parse(readJson(recipeFile)).id),
    );
    const n8nWorkflowFiles = listJsonFiles(join(selfHostExampleRoot, 'recipes/n8n')).filter((path) =>
      path.endsWith('.workflow.json'),
    );
    expect(n8nWorkflowFiles).toHaveLength(1);

    for (const workflowFile of n8nWorkflowFiles) {
      const workflow = readJson(workflowFile);
      expect(workflow).toEqual(expect.objectContaining({ name: expect.any(String) }));
      if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
        throw new Error(`n8n workflow ${workflowFile} must be a JSON object`);
      }

      const workflowRecord = workflow as Record<string, unknown>;
      const nodes = workflowRecord.nodes;
      expect(Array.isArray(nodes)).toBe(true);
      if (!Array.isArray(nodes)) {
        throw new Error(`n8n workflow ${workflowFile} must declare nodes`);
      }

      const nodeRecords = nodes as Array<Record<string, unknown>>;
      const nodeNames = new Set(nodeRecords.map((node) => node.name));
      expect(nodeRecords.map((node) => node.type)).toEqual(
        expect.arrayContaining([
          'n8n-nodes-base.webhook',
          'n8n-nodes-base.httpRequest',
          'n8n-nodes-base.respondToWebhook',
        ]),
      );
      for (const node of nodeRecords) {
        expect(node).not.toHaveProperty('credentials');
      }

      const connections = workflowRecord.connections as Record<string, unknown>;
      expect(connections).toBeDefined();
      for (const [sourceNode, connection] of Object.entries(connections)) {
        expect(nodeNames.has(sourceNode)).toBe(true);
        const main = (connection as { main?: Array<Array<{ node?: string }>> }).main ?? [];
        for (const branch of main) {
          for (const edge of branch) {
            expect(nodeNames.has(edge.node)).toBe(true);
          }
        }
      }

      const meta = workflowRecord.meta as {
        okrapdf?: { recipe_id?: string; required_env?: string[] };
      };
      const recipeId = meta.okrapdf?.recipe_id;
      expect(recipeId).toBeDefined();
      expect(recipeIds.has(recipeId!)).toBe(true);
      expect(meta.okrapdf?.required_env).toEqual(
        expect.arrayContaining(['OKRA_BASE_URL', 'OKRA_API_KEY', 'OKRA_N8N_WEBHOOK_SECRET']),
      );

      for (const envRef of findEnvRefs(workflowRecord)) {
        expect(runtimeEnv.has(envRef)).toBe(true);
        expect(meta.okrapdf?.required_env).toContain(envRef);
      }
    }
  });
});

describe('okraDocumentGraphSchema', () => {
  it('accepts a graph that combines parse, audit, redact, review, artifacts, and lineage', () => {
    const parsed = okraDocumentGraphSchema.parse({
      schema_version: 'okra-document-graph/v1',
      source: {
        id: 'src_local_1',
        kind: 'local_file',
        uri: 'file:///tmp/report.pdf',
        filename: 'report.pdf',
        content_type: 'application/pdf',
        size_bytes: 120_000,
      },
      document: {
        id: 'doc_123',
        source_id: 'src_local_1',
        sha256: 'abc123',
        filename: 'report.pdf',
        mime_type: 'application/pdf',
        lifecycle_state: 'ready',
        permissions: {
          access: 'private',
        },
      },
      pages: [
        {
          page_number: 1,
          width: 612,
          height: 792,
          rendered_assets: [{ artifact_id: 'art_page_1', uri: 'file:///data/doc_123/page-1.png' }],
          text_state: 'ocr',
        },
      ],
      blocks: [
        {
          id: 'blk_heading_1',
          kind: 'heading',
          page_number: 1,
          text: 'Annual Report',
          bbox: { x: 0.1, y: 0.08, w: 0.5, h: 0.06 },
          confidence: 0.98,
        },
      ],
      artifacts: [
        {
          id: 'art_page_1',
          kind: 'page_image',
          path: '/data/doc_123/page-1.png',
          media_type: 'image/png',
          page_number: 1,
          created_by_run_id: 'run_parse_1',
        },
        {
          id: 'art_audit_report',
          kind: 'report',
          path: '/data/doc_123/audit.json',
          media_type: 'application/json',
          created_by_run_id: 'run_audit_1',
        },
      ],
      findings: [
        {
          id: 'finding_alt_text_1',
          kind: 'wcag',
          standard: 'WCAG 2.2',
          rule_id: '1.1.1',
          severity: 'high',
          message: 'Figure is missing alternate text.',
          evidence: [
            {
              page_number: 1,
              bbox: { x: 0.2, y: 0.3, w: 0.4, h: 0.2 },
              label: 'figure',
            },
          ],
          created_by_run_id: 'run_audit_1',
        },
      ],
      redactions: [
        {
          id: 'redaction_ssn_1',
          state: 'proposed',
          regions: [
            {
              page_number: 1,
              bbox: { x: 0.15, y: 0.65, w: 0.22, h: 0.03 },
              label: 'ssn',
            },
          ],
          reason: 'Sensitive identifier',
          created_by_run_id: 'run_redact_1',
        },
      ],
      reviews: [
        {
          id: 'review_redaction_1',
          kind: 'redaction',
          status: 'pending',
          subject_type: 'redaction',
          subject_id: 'redaction_ssn_1',
          final_claim_level: 'machine_only',
        },
      ],
      lineage: [
        {
          run_id: 'run_parse_1',
          engine_id: 'parser.mineru',
          engine_version: '0.1.0',
          runtime: 'huggingface_model',
          model: 'opendatalab/PDF-Extract-Kit-1.0',
          params_hash: 'sha256:params',
          input_hash: 'sha256:input',
          output_hash: 'sha256:output',
          duration_ms: 42_000,
          cost: {
            amount: 0,
            currency: 'USD',
          },
          status: 'succeeded',
        },
      ],
    });

    expect(parsed.schema_version).toBe('okra-document-graph/v1');
    expect(parsed.blocks[0].bbox?.w).toBe(0.5);
    expect(parsed.findings[0].evidence[0].bbox.x).toBe(0.2);
    expect(parsed.redactions[0].regions[0].bbox.y).toBe(0.65);
  });

  it('rejects non-normalized block bounding boxes', () => {
    const result = okraDocumentGraphSchema.safeParse({
      schema_version: 'okra-document-graph/v1',
      source: {
        id: 'src_1',
        kind: 'upload',
      },
      document: {
        id: 'doc_1',
        source_id: 'src_1',
        lifecycle_state: 'ready',
      },
      blocks: [
        {
          id: 'blk_1',
          kind: 'text',
          page_number: 1,
          bbox: { x: 0, y: 0, w: 1.2, h: 0.1 },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
