import { z } from "zod";

export const agentProviderSchema = z.enum(["openrouter", "anthropic", "fireworks"]);
export const agentContextModeSchema = z.enum(["preloaded_only", "tools_only", "hybrid"]);
export const agentRedactionRoleSchema = z.enum(["admin", "viewer", "public"]);
export const agentTableFormatSchema = z.enum(["markdown", "json", "text"]);

export const builtinToolNameSchema = z.enum([
  "get_job_metadata",
  "get_live_status",
  "query_sql",
  "query_document",
  "view_page_region",
]);

export const llmSecretRefSchema = z.object({
  namespace: z.string().min(1),
});

export const llmEndpointConfigSchema = z.object({
  provider: agentProviderSchema,
  model: z.string().min(1),
  secretRef: llmSecretRefSchema.optional(),
});

export const agentPromptConfigSchema = z.object({
  template: z.string().default("okra.analysis.v1"),
  systemSuffix: z.string().default(""),
  requirePageCitations: z.boolean().default(true),
  tableFormat: agentTableFormatSchema.default("markdown"),
});

export const agentContextPreloadSchema = z.object({
  enabled: z.boolean().default(true),
  strategy: z
    .enum(["fts_then_keyword_then_head_tail", "keyword_then_head_tail", "head_tail"])
    .default("fts_then_keyword_then_head_tail"),
  maxBytes: z.number().int().positive().default(80 * 1024),
  smallDocThresholdBytes: z.number().int().positive().default(100 * 1024),
  fallbackHeadPages: z.number().int().min(0).default(5),
  fallbackTailPages: z.number().int().min(0).default(5),
});

export const agentContextConfigSchema = z.object({
  mode: agentContextModeSchema.default("hybrid"),
  preload: agentContextPreloadSchema.default({}),
});

export const agentToolsConfigSchema = z.object({
  builtinAllowlist: z
    .array(builtinToolNameSchema)
    .default(["get_job_metadata", "get_live_status", "query_sql", "query_document", "view_page_region"]),
  allowUserTools: z.boolean().default(true),
});

export const agentLlmConfigSchema = z.object({
  chat: llmEndpointConfigSchema.default({
    provider: "openrouter",
    model: "moonshotai/kimi-k2.5",
    secretRef: { namespace: "openrouter" },
  }),
  query: llmEndpointConfigSchema.default({
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    secretRef: { namespace: "anthropic" },
  }),
});

export const agentSecurityConfigSchema = z.object({
  redactionRole: agentRedactionRoleSchema.default("admin"),
  sqlReadOnly: z.boolean().default(true),
  allowReparseTool: z.boolean().default(false),
});

export const agentRuntimeConfigSchema = z.object({
  maxToolRounds: z.number().int().min(0).max(50).default(10),
  cacheDefault: z.boolean().default(false),
  stream: z.boolean().default(true),
});

export const agentConfigSchema = z.object({
  id: z.string().default("okra/default"),
  version: z.number().int().positive().default(1),
  kind: z.enum(["builtin", "custom"]).default("builtin"),
  prompt: agentPromptConfigSchema.default({}),
  context: agentContextConfigSchema.default({}),
  tools: agentToolsConfigSchema.default({}),
  llm: agentLlmConfigSchema.default({}),
  security: agentSecurityConfigSchema.default({}),
  runtime: agentRuntimeConfigSchema.default({}),
});

export const agentConfigOverrideSchema = z.object({
  prompt: agentPromptConfigSchema.partial().optional(),
  context: z
    .object({
      mode: agentContextModeSchema.optional(),
      preload: agentContextPreloadSchema.partial().optional(),
    })
    .optional(),
  tools: z
    .object({
      builtinAllowlist: z.array(builtinToolNameSchema).optional(),
      allowUserTools: z.boolean().optional(),
    })
    .optional(),
  llm: z
    .object({
      chat: llmEndpointConfigSchema.partial().optional(),
      query: llmEndpointConfigSchema.partial().optional(),
    })
    .optional(),
  security: agentSecurityConfigSchema.partial().optional(),
  runtime: agentRuntimeConfigSchema.partial().optional(),
});

export const agentProfileSchema = z.object({
  agent_id: z.string().default("okra/default"),
  overrides: agentConfigOverrideSchema.optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type AgentConfigOverride = z.infer<typeof agentConfigOverrideSchema>;
export type AgentProfile = z.infer<typeof agentProfileSchema>;
export type LlmEndpointConfig = z.infer<typeof llmEndpointConfigSchema>;
export type BuiltinToolName = z.infer<typeof builtinToolNameSchema>;

export const agentCapabilitySchema = z.enum([
  "read:pages",
  "read:nodes",
  "write:nodes",
  "view:regions",
  "read:metadata",
  "network:fetch",
]);

const agentOutputPropertySchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  enum: z.array(z.string()).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
});

export const agentOutputSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), agentOutputPropertySchema),
  required: z.array(z.string()).optional(),
});

export const builtinToolSchema = z.enum([
  "query_sql",
  "query_document",
  "view_page_region",
  "get_job_metadata",
  "get_live_status",
]);

export const agentDefinitionSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9/-]*$/),
  name: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
  prompt: z.string().min(1).max(10000),
  capabilities: z.array(agentCapabilitySchema).default([]),
  builtinTools: z.array(builtinToolSchema).default(["query_sql"]),
  output: agentOutputSchema,
  model: z
    .object({
      provider: z.string(),
      model: z.string(),
    })
    .optional(),
  schedule: z
    .object({
      trigger: z.string().optional(),
      cron: z.string().optional(),
    })
    .optional(),
  context: z
    .object({
      pages: z.string().default("all"),
      nodes: z.union([z.string(), z.array(z.string())]).default("all"),
      redaction: z.enum(["none", "strip_pii", "redact_values"]).default("none"),
    })
    .optional(),
});

export const agentRunRequestSchema = z.object({
  context: z
    .object({
      pages: z.string().optional(),
      nodes: z.union([z.string(), z.array(z.string())]).optional(),
      redaction: z.enum(["none", "strip_pii", "redact_values"]).optional(),
    })
    .optional(),
  sample: z.number().int().min(1).max(100).optional(),
});

export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;
export type AgentRunRequest = z.infer<typeof agentRunRequestSchema>;

export const OKRA_AGENT_V1: AgentConfig = agentConfigSchema.parse({
  id: "okra/default",
  version: 1,
  kind: "builtin",
  prompt: {
    template: "okra.analysis.v1",
    systemSuffix: "",
    requirePageCitations: true,
    tableFormat: "markdown",
  },
  context: {
    mode: "hybrid",
    preload: {
      enabled: true,
      strategy: "fts_then_keyword_then_head_tail",
      maxBytes: 80 * 1024,
      smallDocThresholdBytes: 100 * 1024,
      fallbackHeadPages: 5,
      fallbackTailPages: 5,
    },
  },
  tools: {
    builtinAllowlist: ["get_job_metadata", "get_live_status", "query_sql", "query_document", "view_page_region"],
    allowUserTools: true,
  },
  llm: {
    chat: {
      provider: "openrouter",
      model: "moonshotai/kimi-k2.5",
      secretRef: { namespace: "openrouter" },
    },
    query: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      secretRef: { namespace: "anthropic" },
    },
  },
  security: {
    redactionRole: "admin",
    sqlReadOnly: true,
    allowReparseTool: false,
  },
  runtime: {
    maxToolRounds: 10,
    cacheDefault: false,
    stream: true,
  },
});
