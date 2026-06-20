import { z } from 'zod';
import { bboxSchema } from './bbox.js';

const jsonObjectSchema = z.record(z.string(), z.unknown());

const stringIdSchema = z.string().trim().min(1);

const ensureUniqueStrings = (
  values: readonly string[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
  message: string,
) => {
  if (new Set(values).size !== values.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message,
    });
  }
};

// -- Okra engine manifests ----------------------------------------------------

export const okraEngineKindSchema = z.enum([
  'parser',
  'auditor',
  'redactor',
  'renderer',
  'sourcer',
  'viewer',
  'review_ui',
  'workflow_bridge',
]);

export const okraEngineRuntimeSchema = z.enum([
  'in_process',
  'docker_image',
  'railway_service',
  'http_base_url',
  'huggingface_model',
  'local_binary',
  'external_api',
]);

export const okraDocumentGraphCapabilitySchema = z.enum([
  'source',
  'document',
  'pages',
  'blocks',
  'regions',
  'artifacts',
  'findings',
  'redactions',
  'reviews',
  'lineage',
]);

export const okraEngineEnvVarSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  required: z.boolean().default(false),
  default: z.string().optional(),
});

export const okraEngineSecretSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  required: z.boolean().default(true),
});

export const okraEngineVolumeSchema = z.object({
  name: z.string().trim().min(1),
  mount_path: z.string().trim().min(1),
  purpose: z.string().trim().min(1).optional(),
  required: z.boolean().default(false),
  size_mb: z.number().int().positive().optional(),
});

export const okraEngineHealthcheckSchema = z
  .object({
    path: z.string().trim().min(1).optional(),
    command: z.array(z.string().trim().min(1)).min(1).optional(),
    interval_seconds: z.number().int().positive().optional(),
    timeout_seconds: z.number().int().positive().optional(),
  })
  .refine((value) => value.path || value.command, {
    message: 'healthcheck requires either path or command',
  });

export const okraEngineResourceProfileSchema = z.object({
  cpu_millicores: z.number().int().positive().optional(),
  memory_mb: z.number().int().positive().optional(),
  gpu: z
    .object({
      required: z.boolean().default(false),
      kind: z.string().trim().min(1).optional(),
      memory_mb: z.number().int().positive().optional(),
    })
    .optional(),
  timeout_seconds: z.number().int().positive().optional(),
  concurrency: z.number().int().positive().optional(),
});

export const okraEngineNetworkPolicySchema = z
  .object({
    mode: z.enum(['offline', 'allowlist', 'restricted', 'unrestricted']),
    allowed_hosts: z.array(z.string().trim().min(1)).default([]),
    outbound_http: z.boolean().default(false),
  })
  .refine((value) => value.mode !== 'allowlist' || value.allowed_hosts.length > 0, {
    message: 'allowlist network policy requires at least one allowed host',
    path: ['allowed_hosts'],
  });

export const okraEngineRuntimeConfigSchema = z
  .object({
    image: z.string().trim().min(1).optional(),
    command: z.array(z.string().trim().min(1)).min(1).optional(),
    base_url: z.string().trim().min(1).optional(),
    railway_service_name: z.string().trim().min(1).optional(),
    huggingface_model_id: z.string().trim().min(1).optional(),
    local_binary: z.string().trim().min(1).optional(),
    endpoint_path: z.string().trim().min(1).optional(),
  })
  .passthrough();

export const okraEngineLineageFieldSchema = z.enum([
  'run_id',
  'engine_id',
  'engine_version',
  'runtime',
  'model',
  'container_digest',
  'params_hash',
  'input_hash',
  'output_hash',
  'timing',
  'cost',
  'status',
]);

export const okraEngineLineageContractSchema = z.object({
  required_fields: z.array(okraEngineLineageFieldSchema).min(1),
  events: z
    .array(z.enum(['queued', 'started', 'progress', 'completed', 'failed', 'canceled']))
    .min(1),
});

export const okraEngineIsolationModeSchema = z.enum([
  'in_process',
  'process',
  'container',
  'worker',
  'external_service',
]);

export const okraEngineNetworkNamespaceSchema = z.enum(['none', 'isolated', 'external']);

export const okraEngineFilesystemIsolationSchema = z.object({
  read_only_root: z.boolean().default(true),
  writable_paths: z.array(stringIdSchema).default([]),
  volume_mounts: z.array(stringIdSchema).default([]),
});

export const okraEngineSecretsIsolationSchema = z.object({
  scope: z.enum(['none', 'declared_only']).default('declared_only'),
});

export const okraEngineIsolationSchema = z.object({
  namespace: stringIdSchema,
  mode: okraEngineIsolationModeSchema,
  network_namespace: okraEngineNetworkNamespaceSchema.default('isolated'),
  filesystem: okraEngineFilesystemIsolationSchema.default({
    read_only_root: true,
    writable_paths: [],
    volume_mounts: [],
  }),
  secrets: okraEngineSecretsIsolationSchema.default({
    scope: 'declared_only',
  }),
  notes: stringIdSchema.optional(),
});

export const okraEngineManifestSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  version: z.string().trim().min(1),
  description: z.string().trim().min(1),
  kind: okraEngineKindSchema,
  runtime: okraEngineRuntimeSchema,
  runtime_config: okraEngineRuntimeConfigSchema.optional(),
  input_schema: jsonObjectSchema,
  output_schema: jsonObjectSchema,
  reads: z.array(okraDocumentGraphCapabilitySchema).min(1),
  writes: z.array(okraDocumentGraphCapabilitySchema).min(1),
  env: z.array(okraEngineEnvVarSchema).default([]),
  secrets: z.array(okraEngineSecretSchema).default([]),
  volumes: z.array(okraEngineVolumeSchema).default([]),
  healthcheck: okraEngineHealthcheckSchema.optional(),
  resource_profile: okraEngineResourceProfileSchema.optional(),
  license: z.string().trim().min(1),
  commercial_ok: z.boolean(),
  network_policy: okraEngineNetworkPolicySchema,
  isolation: okraEngineIsolationSchema.optional(),
  offline_ok: z.boolean(),
  lineage: okraEngineLineageContractSchema.default({
    required_fields: ['run_id', 'engine_id', 'engine_version', 'runtime', 'status'],
    events: ['started', 'completed', 'failed'],
  }),
  metadata: jsonObjectSchema.optional(),
});

// -- Self-host runtime and recipe manifests ----------------------------------

export const okraWorkflowRecipeTriggerSchema = z.enum([
  'manual_upload',
  'api_call',
  'mcp_tool',
  'webhook',
  'scheduled',
  'folder_watch',
]);

export const okraWorkflowRecipeStepErrorPolicySchema = z.enum([
  'fail_recipe',
  'continue',
  'manual_review',
]);

export const okraWorkflowRecipeGraphContractSchema = z.object({
  reads: z.array(okraDocumentGraphCapabilitySchema).min(1),
  writes: z.array(okraDocumentGraphCapabilitySchema).min(1),
});

export const okraWorkflowRecipeStepSchema = z.object({
  id: stringIdSchema,
  name: stringIdSchema.optional(),
  description: stringIdSchema.optional(),
  uses: stringIdSchema,
  reads: z.array(okraDocumentGraphCapabilitySchema).min(1),
  writes: z.array(okraDocumentGraphCapabilitySchema).min(1),
  input_map: jsonObjectSchema.default({}),
  parameters_schema: jsonObjectSchema.optional(),
  output_map: jsonObjectSchema.default({}),
  on_error: okraWorkflowRecipeStepErrorPolicySchema.default('fail_recipe'),
  requires_review: z.boolean().default(false),
  metadata: jsonObjectSchema.optional(),
});

export const okraWorkflowRecipeManifestSchema = z
  .object({
    schema_version: z.literal('okra-workflow-recipe/v1'),
    id: stringIdSchema,
    name: stringIdSchema,
    version: stringIdSchema,
    description: stringIdSchema,
    recipe_mode: z.literal('external').default('external'),
    triggers: z.array(okraWorkflowRecipeTriggerSchema).min(1),
    capability_refs: z.array(stringIdSchema).min(1),
    graph_contract: okraWorkflowRecipeGraphContractSchema,
    parameters_schema: jsonObjectSchema.default({ type: 'object' }),
    steps: z.array(okraWorkflowRecipeStepSchema).min(1),
    labels: z.array(stringIdSchema).default([]),
    metadata: jsonObjectSchema.optional(),
  })
  .superRefine((manifest, ctx) => {
    ensureUniqueStrings(
      manifest.steps.map((step) => step.id),
      ctx,
      ['steps'],
      'recipe step ids must be unique',
    );
    ensureUniqueStrings(
      manifest.capability_refs,
      ctx,
      ['capability_refs'],
      'capability_refs must be unique',
    );

    const capabilityRefs = new Set(manifest.capability_refs);
    manifest.steps.forEach((step, index) => {
      if (!capabilityRefs.has(step.uses)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'uses'],
          message: `recipe step uses undeclared capability ref "${step.uses}"`,
        });
      }
    });
  });

export const okraSelfHostDeploymentTargetSchema = z.enum([
  'railway',
  'docker_compose',
  'cloudflare_workers',
  'cloudflare_pages',
  'local_process',
]);

export const okraSelfHostUiRuntimeSchema = z.enum([
  'vite_static',
  'static_assets',
  'cloudflare_worker_static_assets',
  'cloudflare_pages',
]);

export const okraSelfHostApiRuntimeSchema = z.enum([
  'node_http',
  'container_http',
  'cloudflare_worker',
]);

export const okraSelfHostServiceKindSchema = z.enum([
  'app',
  'api',
  'worker',
  'capability_service',
  'postgres',
  'redis',
  'valkey',
  'volume',
  'object_store',
  'recipe_catalog',
  'external_service',
]);

export const okraSelfHostServiceRuntimeSchema = z.enum([
  'dockerfile',
  'container_image',
  'nixpacks',
  'cloudflare_worker',
  'managed_postgres',
  'managed_redis',
  'managed_volume',
  'external',
]);

export const okraSelfHostRailwayServiceSchema = z.object({
  service_name: stringIdSchema,
  builder: z.enum(['DOCKERFILE', 'NIXPACKS']).optional(),
  dockerfile_path: stringIdSchema.optional(),
  healthcheck_path: stringIdSchema.optional(),
  healthcheck_timeout_seconds: z.number().int().positive().optional(),
});

export const okraSelfHostDockerNetworkKindSchema = z.enum([
  'public_ingress',
  'private_runtime',
  'capability_mesh',
  'external_bridge',
]);

export const okraSelfHostDockerNetworkConfigSchema = z.object({
  driver: z.enum(['bridge', 'overlay', 'platform']).default('bridge'),
  internal: z.boolean().default(false),
  external: z.boolean().default(false),
  attachable: z.boolean().default(false),
  name: stringIdSchema.optional(),
});

export const okraSelfHostDockerNetworkSchema = z
  .object({
    id: stringIdSchema,
    name: stringIdSchema.optional(),
    kind: okraSelfHostDockerNetworkKindSchema,
    description: stringIdSchema.optional(),
    docker: okraSelfHostDockerNetworkConfigSchema.default({
      driver: 'bridge',
      internal: false,
      external: false,
      attachable: false,
    }),
    capability_refs: z.array(stringIdSchema).default([]),
    metadata: jsonObjectSchema.optional(),
  })
  .superRefine((network, ctx) => {
    if (network.docker.external && network.docker.internal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['docker'],
        message: 'docker network cannot be both external and internal',
      });
    }

    if (network.kind === 'public_ingress' && network.docker.internal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['docker', 'internal'],
        message: 'public ingress networks cannot be Docker-internal',
      });
    }

    if (
      (network.kind === 'private_runtime' || network.kind === 'capability_mesh') &&
      !network.docker.internal
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['docker', 'internal'],
        message: `${network.kind} networks must be Docker-internal`,
      });
    }

    if (
      network.kind === 'external_bridge' &&
      !network.docker.external &&
      !network.docker.attachable
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['docker'],
        message: 'external bridge networks must be external or attachable',
      });
    }
  });

export const okraSelfHostServiceSchema = z.object({
  id: stringIdSchema,
  name: stringIdSchema,
  kind: okraSelfHostServiceKindSchema,
  runtime: okraSelfHostServiceRuntimeSchema,
  description: stringIdSchema.optional(),
  image: stringIdSchema.optional(),
  start_command: stringIdSchema.optional(),
  public: z.boolean().default(false),
  required: z.boolean().default(true),
  depends_on: z.array(stringIdSchema).default([]),
  env: z.array(stringIdSchema).default([]),
  volumes: z.array(stringIdSchema).default([]),
  network_refs: z.array(stringIdSchema).default([]),
  capability_ref: stringIdSchema.optional(),
  recipe_catalog_ref: stringIdSchema.optional(),
  railway: okraSelfHostRailwayServiceSchema.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const okraSelfHostEnvVarSchema = z.object({
  name: stringIdSchema,
  description: stringIdSchema.optional(),
  required: z.boolean().default(false),
  secret: z.boolean().default(false),
  default: z.string().optional(),
  example: z.string().optional(),
});

export const okraSelfHostVolumeSchema = z.object({
  id: stringIdSchema,
  mount_path: stringIdSchema,
  purpose: stringIdSchema,
  required: z.boolean().default(true),
  size_mb: z.number().int().positive().optional(),
});

export const okraSelfHostRecipeCatalogKindSchema = z.enum([
  'directory',
  'json_file',
  'n8n_export',
  'url_catalog',
]);

export const okraSelfHostRecipeCatalogRefSchema = z
  .object({
    id: stringIdSchema,
    kind: okraSelfHostRecipeCatalogKindSchema,
    path: stringIdSchema.optional(),
    uri: stringIdSchema.optional(),
    required: z.boolean().default(true),
    description: stringIdSchema.optional(),
  })
  .refine((catalog) => catalog.path || catalog.uri, {
    message: 'recipe catalog requires either path or uri',
  });

export const okraSelfHostCapabilityCatalogKindSchema = z.enum([
  'directory',
  'json_file',
  'url_catalog',
]);

export const okraSelfHostCapabilityCatalogRefSchema = z
  .object({
    id: stringIdSchema,
    kind: okraSelfHostCapabilityCatalogKindSchema,
    path: stringIdSchema.optional(),
    uri: stringIdSchema.optional(),
    required: z.boolean().default(true),
    description: stringIdSchema.optional(),
  })
  .refine((catalog) => catalog.path || catalog.uri, {
    message: 'capability catalog requires either path or uri',
  });

export const okraSelfHostDataBoundarySchema = z.object({
  database: stringIdSchema,
  artifact_store: stringIdSchema,
  document_graph_store: stringIdSchema,
  recipe_store: stringIdSchema,
  notes: stringIdSchema.optional(),
});

export const okraSelfHostAuthBootstrapModeSchema = z.enum([
  'single_owner_api_key',
  'external_auth',
]);

export const okraSelfHostRegistrationModeSchema = z.enum([
  'invite_only',
  'closed',
  'open',
]);

export const okraSelfHostAuthBootstrapSchema = z.object({
  mode: okraSelfHostAuthBootstrapModeSchema.default('single_owner_api_key'),
  owner_email_env: stringIdSchema.default('OKRA_FIRST_OWNER_EMAIL'),
  api_key_env: stringIdSchema.default('OKRA_API_KEY'),
  registration_mode: okraSelfHostRegistrationModeSchema.default('invite_only'),
  protected_routes: z.array(stringIdSchema).default([]),
  notes: stringIdSchema.optional(),
});

export const okraSelfHostCapabilityImplementationStatusSchema = z.enum([
  'planned',
  'starter_adapter',
  'model_backed',
  'policy_backed',
  'agent_backed',
  'external_bridge',
]);

export const okraSelfHostCapabilityImplementationTargetStatusSchema = z.enum([
  'model_backed',
  'policy_backed',
  'agent_backed',
  'external_bridge',
]);

export const okraSelfHostCapabilityImplementationModelSchema = z.object({
  provider: stringIdSchema.optional(),
  model_id: stringIdSchema.optional(),
  cache_volume: stringIdSchema.optional(),
  cache_path: stringIdSchema.optional(),
  env: z.array(stringIdSchema).default([]),
});

export const okraSelfHostCapabilityImplementationSchema = z.object({
  id: stringIdSchema,
  capability_ref: stringIdSchema,
  service_id: stringIdSchema,
  status: okraSelfHostCapabilityImplementationStatusSchema.default('planned'),
  target_status: okraSelfHostCapabilityImplementationTargetStatusSchema,
  protocol: stringIdSchema.default('okra-capability-http/v1'),
  endpoint_path: stringIdSchema.default('/v1/capability-runs'),
  image: stringIdSchema.optional(),
  dockerfile_path: stringIdSchema.optional(),
  command: stringIdSchema.optional(),
  network_refs: z.array(stringIdSchema).default([]),
  env: z.array(stringIdSchema).default([]),
  volumes: z.array(stringIdSchema).default([]),
  model: okraSelfHostCapabilityImplementationModelSchema.optional(),
  readiness_gate: stringIdSchema.default('model_backed_capabilities'),
  promotion_actions: z.array(stringIdSchema).default([]),
  smoke_tests: z.array(stringIdSchema).default([]),
  metadata: jsonObjectSchema.optional(),
});

export const okraSelfHostNonGoalSchema = z.enum([
  'nextjs_server',
  'embedded_n8n',
  'embedded_posthog_analytics',
  'closed_cloud_dependency',
  'monolithic_ocr_pipeline',
]);

export const okraSelfHostSmokeTestSchema = z.object({
  name: stringIdSchema,
  description: stringIdSchema.optional(),
  command: stringIdSchema.optional(),
  path: stringIdSchema.optional(),
  expected_status: z.number().int().positive().optional(),
});

export const okraSelfHostRuntimeManifestSchema = z
  .object({
    schema_version: z.literal('okra-self-host-runtime/v1'),
    id: stringIdSchema,
    name: stringIdSchema,
    version: stringIdSchema,
    description: stringIdSchema,
    roadmap_items: z.array(stringIdSchema).min(1),
    deployment_targets: z.array(okraSelfHostDeploymentTargetSchema).min(1),
    ui_runtime: okraSelfHostUiRuntimeSchema,
    api_runtime: okraSelfHostApiRuntimeSchema,
    recipe_mode: z.literal('external_catalog').default('external_catalog'),
    recipe_catalogs: z.array(okraSelfHostRecipeCatalogRefSchema).min(1),
    capability_catalogs: z.array(okraSelfHostCapabilityCatalogRefSchema).default([]),
    capability_refs: z.array(stringIdSchema).default([]),
    services: z.array(okraSelfHostServiceSchema).min(1),
    docker_networks: z.array(okraSelfHostDockerNetworkSchema).default([]),
    capability_implementations: z.array(okraSelfHostCapabilityImplementationSchema).default([]),
    env: z.array(okraSelfHostEnvVarSchema).default([]),
    volumes: z.array(okraSelfHostVolumeSchema).default([]),
    data_boundary: okraSelfHostDataBoundarySchema.optional(),
    auth_bootstrap: okraSelfHostAuthBootstrapSchema.optional(),
    non_goals: z.array(okraSelfHostNonGoalSchema).default([]),
    smoke_tests: z.array(okraSelfHostSmokeTestSchema).default([]),
    metadata: jsonObjectSchema.optional(),
  })
  .superRefine((manifest, ctx) => {
    ensureUniqueStrings(
      manifest.recipe_catalogs.map((catalog) => catalog.id),
      ctx,
      ['recipe_catalogs'],
      'recipe catalog ids must be unique',
    );
    ensureUniqueStrings(
      manifest.capability_catalogs.map((catalog) => catalog.id),
      ctx,
      ['capability_catalogs'],
      'capability catalog ids must be unique',
    );
    ensureUniqueStrings(
      manifest.services.map((service) => service.id),
      ctx,
      ['services'],
      'service ids must be unique',
    );
    ensureUniqueStrings(
      manifest.capability_refs,
      ctx,
      ['capability_refs'],
      'capability_refs must be unique',
    );
    ensureUniqueStrings(
      manifest.docker_networks.map((network) => network.id),
      ctx,
      ['docker_networks'],
      'docker network ids must be unique',
    );
    ensureUniqueStrings(
      manifest.capability_implementations.map((implementation) => implementation.id),
      ctx,
      ['capability_implementations'],
      'capability implementation ids must be unique',
    );

    const serviceIds = new Set(manifest.services.map((service) => service.id));
    const volumeIds = new Set(manifest.volumes.map((volume) => volume.id));
    const catalogIds = new Set(manifest.recipe_catalogs.map((catalog) => catalog.id));
    const capabilityRefs = new Set(manifest.capability_refs);
    const envNames = new Set(manifest.env.map((env) => env.name));
    const dockerNetworkIds = new Set(manifest.docker_networks.map((network) => network.id));
    const dockerNetworkKinds = new Map(
      manifest.docker_networks.map((network) => [network.id, network.kind]),
    );

    manifest.services.forEach((service, serviceIndex) => {
      service.depends_on.forEach((dependency, dependencyIndex) => {
        if (!serviceIds.has(dependency)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['services', serviceIndex, 'depends_on', dependencyIndex],
            message: `service depends on unknown service "${dependency}"`,
          });
        }
      });

      service.volumes.forEach((volume, volumeIndex) => {
        if (!volumeIds.has(volume)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['services', serviceIndex, 'volumes', volumeIndex],
            message: `service references unknown volume "${volume}"`,
          });
        }
      });

      service.network_refs.forEach((networkRef, networkIndex) => {
        if (!dockerNetworkIds.has(networkRef)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['services', serviceIndex, 'network_refs', networkIndex],
            message: `service references unknown Docker network "${networkRef}"`,
          });
        }
      });

      if (manifest.docker_networks.length > 0 && service.public) {
        const hasIngressNetwork = service.network_refs.some(
          (networkRef) => dockerNetworkKinds.get(networkRef) === 'public_ingress',
        );
        if (!hasIngressNetwork) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['services', serviceIndex, 'network_refs'],
            message: 'public services must attach to a public_ingress Docker network',
          });
        }
      }

      if (['postgres', 'redis', 'valkey', 'object_store'].includes(service.kind)) {
        const hasPublicNetwork = service.network_refs.some(
          (networkRef) => dockerNetworkKinds.get(networkRef) === 'public_ingress',
        );
        if (hasPublicNetwork) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['services', serviceIndex, 'network_refs'],
            message: 'stateful private services must not attach to public_ingress networks',
          });
        }
      }

      if (service.kind === 'external_service') {
        const hasNonBridgeNetwork = service.network_refs.some(
          (networkRef) => dockerNetworkKinds.get(networkRef) !== 'external_bridge',
        );
        if (hasNonBridgeNetwork) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['services', serviceIndex, 'network_refs'],
            message: 'external services may only attach through external_bridge networks',
          });
        }
      }

      if (service.recipe_catalog_ref && !catalogIds.has(service.recipe_catalog_ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['services', serviceIndex, 'recipe_catalog_ref'],
          message: `service references unknown recipe catalog "${service.recipe_catalog_ref}"`,
        });
      }
    });

    manifest.docker_networks.forEach((network, networkIndex) => {
      network.capability_refs.forEach((capabilityRef, capabilityIndex) => {
        if (!capabilityRefs.has(capabilityRef)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['docker_networks', networkIndex, 'capability_refs', capabilityIndex],
            message: `Docker network references unknown capability "${capabilityRef}"`,
          });
        }
      });
    });

    manifest.capability_implementations.forEach((implementation, implementationIndex) => {
      if (!capabilityRefs.has(implementation.capability_ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['capability_implementations', implementationIndex, 'capability_ref'],
          message: `capability implementation references unknown capability "${implementation.capability_ref}"`,
        });
      }

      if (!serviceIds.has(implementation.service_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['capability_implementations', implementationIndex, 'service_id'],
          message: `capability implementation references unknown service "${implementation.service_id}"`,
        });
      }

      implementation.network_refs.forEach((networkRef, networkIndex) => {
        if (!dockerNetworkIds.has(networkRef)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['capability_implementations', implementationIndex, 'network_refs', networkIndex],
            message: `capability implementation references unknown Docker network "${networkRef}"`,
          });
        }
      });

      implementation.env.forEach((envRef, envIndex) => {
        if (!envNames.has(envRef)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['capability_implementations', implementationIndex, 'env', envIndex],
            message: `capability implementation references unknown env var "${envRef}"`,
          });
        }
      });

      implementation.volumes.forEach((volumeRef, volumeIndex) => {
        if (!volumeIds.has(volumeRef)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['capability_implementations', implementationIndex, 'volumes', volumeIndex],
            message: `capability implementation references unknown volume "${volumeRef}"`,
          });
        }
      });
    });
  });

// -- Okra document graph ------------------------------------------------------

export const okraDocumentGraphSourceKindSchema = z.enum([
  'local_file',
  'url',
  'upload',
  'apify_actor_output',
  'n8n_webhook_payload',
  'object_store_key',
  'email_attachment',
  'webhook_payload',
  'other',
]);

export const okraDocumentGraphSourceSchema = z.object({
  id: z.string().trim().min(1),
  kind: okraDocumentGraphSourceKindSchema,
  uri: z.string().trim().min(1).optional(),
  filename: z.string().trim().min(1).optional(),
  content_type: z.string().trim().min(1).optional(),
  size_bytes: z.number().int().nonnegative().optional(),
  hash: z.string().trim().min(1).optional(),
  received_at: z.string().datetime().optional(),
  metadata: jsonObjectSchema.optional(),
});

export const okraDocumentLifecycleStateSchema = z.enum([
  'created',
  'uploaded',
  'queued',
  'processing',
  'ready',
  'failed',
  'archived',
]);

export const okraDocumentPermissionSchema = z.object({
  owner_id: z.string().trim().min(1).optional(),
  access: z.enum(['private', 'unlisted', 'public', 'disabled']).default('private'),
  policy: z.string().trim().min(1).optional(),
});

export const okraDocumentGraphDocumentSchema = z.object({
  id: z.string().trim().min(1),
  source_id: z.string().trim().min(1),
  sha256: z.string().trim().min(1).optional(),
  filename: z.string().trim().min(1).optional(),
  mime_type: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  lifecycle_state: okraDocumentLifecycleStateSchema,
  permissions: okraDocumentPermissionSchema.default({ access: 'private' }),
  metadata: jsonObjectSchema.optional(),
});

export const okraDocumentAssetRefSchema = z.object({
  artifact_id: z.string().trim().min(1),
  uri: z.string().trim().min(1).optional(),
});

export const okraDocumentGraphPageSchema = z.object({
  page_number: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(['pt', 'px']).default('pt'),
  rotation: z.number().default(0),
  rendered_assets: z.array(okraDocumentAssetRefSchema).default([]),
  text_state: z.enum(['none', 'embedded', 'ocr', 'hybrid']).optional(),
  metadata: jsonObjectSchema.optional(),
});

export const okraDocumentRegionSchema = z.object({
  id: z.string().trim().min(1).optional(),
  page_number: z.number().int().positive(),
  bbox: bboxSchema,
  anchor_id: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).optional(),
  source_block_id: z.string().trim().min(1).optional(),
});

export const okraDocumentBlockKindSchema = z.enum([
  'text',
  'heading',
  'list',
  'list_item',
  'table',
  'table_cell',
  'figure',
  'formula',
  'form_field',
  'image',
  'signature',
  'unknown',
]);

export const okraDocumentGraphBlockSchema = z.object({
  id: z.string().trim().min(1),
  kind: okraDocumentBlockKindSchema,
  page_number: z.number().int().positive().optional(),
  parent_id: z.string().trim().min(1).optional(),
  text: z.string().optional(),
  bbox: bboxSchema.optional(),
  regions: z.array(okraDocumentRegionSchema).default([]),
  confidence: z.number().min(0).max(1).optional(),
  metadata: jsonObjectSchema.optional(),
});

export const okraDocumentArtifactKindSchema = z.enum([
  'markdown',
  'json',
  'page_image',
  'crop',
  'tagged_pdf',
  'redacted_pdf',
  'report',
  'html',
  'text',
  'other',
]);

export const okraDocumentGraphArtifactSchema = z.object({
  id: z.string().trim().min(1),
  kind: okraDocumentArtifactKindSchema,
  uri: z.string().trim().min(1).optional(),
  path: z.string().trim().min(1).optional(),
  media_type: z.string().trim().min(1).optional(),
  page_number: z.number().int().positive().optional(),
  hash: z.string().trim().min(1).optional(),
  created_by_run_id: z.string().trim().min(1).optional(),
  metadata: jsonObjectSchema.optional(),
});

export const okraDocumentFindingSeveritySchema = z.enum([
  'info',
  'low',
  'medium',
  'high',
  'critical',
]);

export const okraDocumentFindingStatusSchema = z.enum([
  'open',
  'accepted',
  'resolved',
  'dismissed',
]);

export const okraDocumentFindingSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(['wcag', 'pdfua', 'security', 'content_quality', 'other']),
  standard: z.string().trim().min(1).optional(),
  rule_id: z.string().trim().min(1).optional(),
  severity: okraDocumentFindingSeveritySchema,
  message: z.string().trim().min(1),
  evidence: z.array(okraDocumentRegionSchema).default([]),
  status: okraDocumentFindingStatusSchema.default('open'),
  created_by_run_id: z.string().trim().min(1).optional(),
  metadata: jsonObjectSchema.optional(),
});

export const okraDocumentRedactionStateSchema = z.enum([
  'proposed',
  'approved',
  'rejected',
  'applied',
]);

export const okraDocumentRedactionSchema = z.object({
  id: z.string().trim().min(1),
  state: okraDocumentRedactionStateSchema,
  regions: z.array(okraDocumentRegionSchema).min(1),
  reason: z.string().trim().min(1),
  replacement: z.string().optional(),
  created_by_run_id: z.string().trim().min(1).optional(),
  reviewer_id: z.string().trim().min(1).optional(),
  metadata: jsonObjectSchema.optional(),
});

export const okraDocumentReviewStatusSchema = z.enum([
  'pending',
  'in_review',
  'approved',
  'rejected',
  'changes_requested',
]);

export const okraDocumentFinalClaimLevelSchema = z.enum([
  'unreviewed',
  'machine_only',
  'human_reviewed',
  'attested',
]);

export const okraDocumentReviewSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(['parse', 'audit', 'redaction', 'extraction', 'publish', 'other']),
  status: okraDocumentReviewStatusSchema,
  subject_type: z.enum(['document', 'block', 'finding', 'redaction', 'artifact']),
  subject_id: z.string().trim().min(1),
  reviewer_id: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
  final_claim_level: okraDocumentFinalClaimLevelSchema.default('unreviewed'),
  metadata: jsonObjectSchema.optional(),
});

export const okraEngineRunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
]);

export const okraEngineRunCostSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().trim().min(1).default('USD'),
});

export const okraEngineRunLineageSchema = z.object({
  run_id: z.string().trim().min(1),
  engine_id: z.string().trim().min(1),
  engine_version: z.string().trim().min(1),
  runtime: okraEngineRuntimeSchema,
  model: z.string().trim().min(1).optional(),
  container_image: z.string().trim().min(1).optional(),
  container_digest: z.string().trim().min(1).optional(),
  params_hash: z.string().trim().min(1).optional(),
  input_hash: z.string().trim().min(1).optional(),
  output_hash: z.string().trim().min(1).optional(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  cost: okraEngineRunCostSchema.optional(),
  status: okraEngineRunStatusSchema,
  error: z.string().optional(),
  metadata: jsonObjectSchema.optional(),
});

export const okraDocumentGraphSchema = z.object({
  schema_version: z.literal('okra-document-graph/v1'),
  source: okraDocumentGraphSourceSchema,
  additional_sources: z.array(okraDocumentGraphSourceSchema).default([]),
  document: okraDocumentGraphDocumentSchema,
  pages: z.array(okraDocumentGraphPageSchema).default([]),
  blocks: z.array(okraDocumentGraphBlockSchema).default([]),
  regions: z.array(okraDocumentRegionSchema).default([]),
  artifacts: z.array(okraDocumentGraphArtifactSchema).default([]),
  findings: z.array(okraDocumentFindingSchema).default([]),
  redactions: z.array(okraDocumentRedactionSchema).default([]),
  reviews: z.array(okraDocumentReviewSchema).default([]),
  lineage: z.array(okraEngineRunLineageSchema).default([]),
  metadata: jsonObjectSchema.optional(),
});

export type OkraEngineKind = z.infer<typeof okraEngineKindSchema>;
export type OkraEngineRuntime = z.infer<typeof okraEngineRuntimeSchema>;
export type OkraDocumentGraphCapability = z.infer<typeof okraDocumentGraphCapabilitySchema>;
export type OkraEngineEnvVar = z.infer<typeof okraEngineEnvVarSchema>;
export type OkraEngineSecret = z.infer<typeof okraEngineSecretSchema>;
export type OkraEngineVolume = z.infer<typeof okraEngineVolumeSchema>;
export type OkraEngineHealthcheck = z.infer<typeof okraEngineHealthcheckSchema>;
export type OkraEngineResourceProfile = z.infer<typeof okraEngineResourceProfileSchema>;
export type OkraEngineNetworkPolicy = z.infer<typeof okraEngineNetworkPolicySchema>;
export type OkraEngineRuntimeConfig = z.infer<typeof okraEngineRuntimeConfigSchema>;
export type OkraEngineLineageContract = z.infer<typeof okraEngineLineageContractSchema>;
export type OkraEngineIsolationMode = z.infer<typeof okraEngineIsolationModeSchema>;
export type OkraEngineNetworkNamespace = z.infer<typeof okraEngineNetworkNamespaceSchema>;
export type OkraEngineFilesystemIsolation = z.infer<typeof okraEngineFilesystemIsolationSchema>;
export type OkraEngineSecretsIsolation = z.infer<typeof okraEngineSecretsIsolationSchema>;
export type OkraEngineIsolation = z.infer<typeof okraEngineIsolationSchema>;
export type OkraEngineManifestInput = z.input<typeof okraEngineManifestSchema>;
export type OkraEngineManifest = z.infer<typeof okraEngineManifestSchema>;
export type OkraWorkflowRecipeTrigger = z.infer<typeof okraWorkflowRecipeTriggerSchema>;
export type OkraWorkflowRecipeStepErrorPolicy = z.infer<
  typeof okraWorkflowRecipeStepErrorPolicySchema
>;
export type OkraWorkflowRecipeGraphContract = z.infer<
  typeof okraWorkflowRecipeGraphContractSchema
>;
export type OkraWorkflowRecipeStep = z.infer<typeof okraWorkflowRecipeStepSchema>;
export type OkraWorkflowRecipeManifestInput = z.input<typeof okraWorkflowRecipeManifestSchema>;
export type OkraWorkflowRecipeManifest = z.infer<typeof okraWorkflowRecipeManifestSchema>;
export type OkraSelfHostDeploymentTarget = z.infer<typeof okraSelfHostDeploymentTargetSchema>;
export type OkraSelfHostUiRuntime = z.infer<typeof okraSelfHostUiRuntimeSchema>;
export type OkraSelfHostApiRuntime = z.infer<typeof okraSelfHostApiRuntimeSchema>;
export type OkraSelfHostServiceKind = z.infer<typeof okraSelfHostServiceKindSchema>;
export type OkraSelfHostServiceRuntime = z.infer<typeof okraSelfHostServiceRuntimeSchema>;
export type OkraSelfHostRailwayService = z.infer<typeof okraSelfHostRailwayServiceSchema>;
export type OkraSelfHostService = z.infer<typeof okraSelfHostServiceSchema>;
export type OkraSelfHostEnvVar = z.infer<typeof okraSelfHostEnvVarSchema>;
export type OkraSelfHostVolume = z.infer<typeof okraSelfHostVolumeSchema>;
export type OkraSelfHostRecipeCatalogKind = z.infer<
  typeof okraSelfHostRecipeCatalogKindSchema
>;
export type OkraSelfHostRecipeCatalogRef = z.infer<typeof okraSelfHostRecipeCatalogRefSchema>;
export type OkraSelfHostCapabilityCatalogKind = z.infer<
  typeof okraSelfHostCapabilityCatalogKindSchema
>;
export type OkraSelfHostCapabilityCatalogRef = z.infer<
  typeof okraSelfHostCapabilityCatalogRefSchema
>;
export type OkraSelfHostDataBoundary = z.infer<typeof okraSelfHostDataBoundarySchema>;
export type OkraSelfHostAuthBootstrapMode = z.infer<
  typeof okraSelfHostAuthBootstrapModeSchema
>;
export type OkraSelfHostRegistrationMode = z.infer<
  typeof okraSelfHostRegistrationModeSchema
>;
export type OkraSelfHostAuthBootstrap = z.infer<typeof okraSelfHostAuthBootstrapSchema>;
export type OkraSelfHostCapabilityImplementationStatus = z.infer<
  typeof okraSelfHostCapabilityImplementationStatusSchema
>;
export type OkraSelfHostCapabilityImplementationTargetStatus = z.infer<
  typeof okraSelfHostCapabilityImplementationTargetStatusSchema
>;
export type OkraSelfHostCapabilityImplementationModel = z.infer<
  typeof okraSelfHostCapabilityImplementationModelSchema
>;
export type OkraSelfHostCapabilityImplementation = z.infer<
  typeof okraSelfHostCapabilityImplementationSchema
>;
export type OkraSelfHostNonGoal = z.infer<typeof okraSelfHostNonGoalSchema>;
export type OkraSelfHostSmokeTest = z.infer<typeof okraSelfHostSmokeTestSchema>;
export type OkraSelfHostRuntimeManifestInput = z.input<
  typeof okraSelfHostRuntimeManifestSchema
>;
export type OkraSelfHostRuntimeManifest = z.infer<typeof okraSelfHostRuntimeManifestSchema>;
export type OkraDocumentGraphSourceKind = z.infer<typeof okraDocumentGraphSourceKindSchema>;
export type OkraDocumentGraphSource = z.infer<typeof okraDocumentGraphSourceSchema>;
export type OkraDocumentLifecycleState = z.infer<typeof okraDocumentLifecycleStateSchema>;
export type OkraDocumentPermission = z.infer<typeof okraDocumentPermissionSchema>;
export type OkraDocumentGraphDocument = z.infer<typeof okraDocumentGraphDocumentSchema>;
export type OkraDocumentAssetRef = z.infer<typeof okraDocumentAssetRefSchema>;
export type OkraDocumentGraphPage = z.infer<typeof okraDocumentGraphPageSchema>;
export type OkraDocumentRegion = z.infer<typeof okraDocumentRegionSchema>;
export type OkraDocumentBlockKind = z.infer<typeof okraDocumentBlockKindSchema>;
export type OkraDocumentGraphBlock = z.infer<typeof okraDocumentGraphBlockSchema>;
export type OkraDocumentArtifactKind = z.infer<typeof okraDocumentArtifactKindSchema>;
export type OkraDocumentGraphArtifact = z.infer<typeof okraDocumentGraphArtifactSchema>;
export type OkraDocumentFindingSeverity = z.infer<typeof okraDocumentFindingSeveritySchema>;
export type OkraDocumentFindingStatus = z.infer<typeof okraDocumentFindingStatusSchema>;
export type OkraDocumentFinding = z.infer<typeof okraDocumentFindingSchema>;
export type OkraDocumentRedactionState = z.infer<typeof okraDocumentRedactionStateSchema>;
export type OkraDocumentRedaction = z.infer<typeof okraDocumentRedactionSchema>;
export type OkraDocumentReviewStatus = z.infer<typeof okraDocumentReviewStatusSchema>;
export type OkraDocumentFinalClaimLevel = z.infer<typeof okraDocumentFinalClaimLevelSchema>;
export type OkraDocumentReview = z.infer<typeof okraDocumentReviewSchema>;
export type OkraEngineRunStatus = z.infer<typeof okraEngineRunStatusSchema>;
export type OkraEngineRunCost = z.infer<typeof okraEngineRunCostSchema>;
export type OkraEngineRunLineage = z.infer<typeof okraEngineRunLineageSchema>;
export type OkraDocumentGraphInput = z.input<typeof okraDocumentGraphSchema>;
export type OkraDocumentGraph = z.infer<typeof okraDocumentGraphSchema>;
