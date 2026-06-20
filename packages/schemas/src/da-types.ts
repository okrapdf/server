import { z } from "zod";
import { vendorTierSchema } from "./vendor.js";
import { pageImageStrategySchema } from "./api.js";
import { agentProfileSchema } from "./agent-config.js";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const documentPhaseSchema = z.enum([
  "idle",
  "uploading",
  "parsing",
  "hydrating",
  "verifying",
  "awaiting_review",
  "complete",
  "error",
]);

export const daNodeTypeSchema = z.enum([
  "document",
  "page",
  "table",
  "row",
  "cell",
  "text",
  "figure",
  "header",
  "footer",
]);

export const daNodeStatusSchema = z.enum([
  "needs_review",
  "pending",
  "verified",
  "failed",
  "superseded",
]);

export const mutationOpSchema = z.enum([
  "create",
  "update",
  "verify",
  "reject",
  "delete",
]);

export const authorTypeSchema = z.enum(["system", "agent", "human"]);

export const verifiedByTypeSchema = z.enum(["sandbox", "human"]);

export const verificationResultSchema = z.enum(["pass", "fail"]);

export const taskTypeSchema = z.enum([
  "parse",
  "parse_page",
  "region_extract",
  "entity_extract",
  "extract",
  "verify",
  "compact",
  "notify",
  "generate_thumbnail",
  "textlayer",
  "render_all_pages",
]);

export const taskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "retrying",
]);

export const ledgerPassSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export const extractionPhaseSchema = z.enum([
  "ocr",
  "enhance",
  "metadata",
  "verify",
]);

/** Alias — identical to vendorTierSchema */
export const phaseTierSchema = vendorTierSchema;

export const capabilityKeySchema = z.enum([
  "vlm_qwen",
  "structural_check",
  "sandbox_verify",
  "search",
  "review_sync",
]);

// ── Structured output errors ──────────────────────────────────────────────────

export const structuredOutputErrorCodeSchema = z.enum([
  "parse_error",
  "validation_error",
  "timeout",
  "vendor_error",
]);

export const schemaIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: structuredOutputErrorCodeSchema.optional(),
});

// ── Phase vendor config ───────────────────────────────────────────────────────

export const phaseVendorConfigSchema = z.object({
  vendor: z.string().optional(),
  tier: phaseTierSchema.optional(),
  enabled: z.boolean().optional(),
});

// ── Processing capabilities ───────────────────────────────────────────────────

export const processingCapabilitiesSchema = z.object({
  vlm_qwen: z.boolean(),
  structural_check: z.boolean(),
  sandbox_verify: z.boolean(),
  search: z.boolean(),
  review_sync: z.boolean(),
  phases: z
    .record(extractionPhaseSchema, phaseVendorConfigSchema)
    .optional(),
  middleware: z
    .array(z.object({ name: z.string() }).passthrough())
    .optional(),
});

/**
 * Default parse profile. OCR defaults to the gemini-vision VLM so every
 * document lands layout-aware nodes with bbox + markdown — the shared output
 * that powers BOTH view_document (bbox overlays) and inspect_html (HTML with
 * data-bbox). Callers can override with `processor: "textlayer"` for a free,
 * text-only parse.
 */
export const DEFAULT_CAPABILITIES: z.infer<typeof processingCapabilitiesSchema> = {
  vlm_qwen: false,
  structural_check: false,
  sandbox_verify: false,
  search: true,
  review_sync: false,
  phases: {
    ocr: { vendor: 'gemini-vision', enabled: true },
  },
};

/** Returns true if any capability requires external (non-CF-native) vendors. */
export function hasExternalCaps(caps: z.infer<typeof processingCapabilitiesSchema>): boolean {
  const ocrPhase = caps.phases?.ocr;
  if (!ocrPhase) return false;
  if (ocrPhase.enabled === false) return false;
  return (ocrPhase.vendor || '').toLowerCase() !== 'textlayer';
}

// ── Eval config ──────────────────────────────────────────────────────────────

export const documentAgentEvalScopeSchema = z.enum(["document", "user"]);
export const documentAgentEvalModelSchema = z.object({
  provider: z.enum(["anthropic", "openrouter"]),
  model: z.string().min(1),
}).strict();

export const documentAgentEvalConfigSchema = z.object({
  enabled: z.boolean().default(false),
  scope: documentAgentEvalScopeSchema.default("document"),
  instructions: z.string().trim().min(1).optional(),
  model: documentAgentEvalModelSchema.optional(),
  maxRecentTurns: z.number().int().min(0).max(20).default(5),
}).strict();

export type DocumentAgentEvalConfig = z.infer<typeof documentAgentEvalConfigSchema>;

// ── Document Settings ─────────────────────────────────────────────────────────

export const documentSettingsSchema = z.object({
  // Processing
  capabilities: processingCapabilitiesSchema,
  vendor: z.string().nullable().default(null),
  vendor_tier: vendorTierSchema.default('standard'),
  // Delivery
  page_image_strategy: pageImageStrategySchema.default('eager'),
  chat_model: z.string().nullable().default(null),
  query_model: z.string().nullable().default(null),
  vlm_model: z.string().nullable().default(null),
  // Behavior
  self_heal: z.boolean().default(true),
  webhook_url: z.string().url().nullable().default(null),
  cache_extraction: z.boolean().default(true),
  agent_profile: agentProfileSchema.nullable().default(null),
  // Workflow watchdog — auto-recover stuck workflows
  workflow_watchdog_timeout_ms: z.number().int().min(60_000).max(3_600_000).default(600_000), // 10 min default
  max_auto_reparse: z.number().int().min(0).max(5).default(2), // max 2 total attempts (initial + 1 retry)
  // Review provider
  review_provider: z.string().nullable().default(null),
  review_provider_url: z.string().nullable().default(null),
  review_provider_api_key: z.string().nullable().default(null),
  review_confidence_threshold: z.number().default(0.85),
  // Eval
  eval_config: documentAgentEvalConfigSchema.nullable().optional(),
});

export const documentSettingsUpdateSchema = documentSettingsSchema
  .partial()
  .extend({ capabilities: processingCapabilitiesSchema.partial().optional() });

export type DocumentSettings = z.infer<typeof documentSettingsSchema>;
export type DocumentSettingsUpdate = z.infer<typeof documentSettingsUpdateSchema>;

export const DEFAULT_SETTINGS: DocumentSettings = {
  capabilities: DEFAULT_CAPABILITIES,
  vendor: null,
  vendor_tier: 'standard',
  page_image_strategy: 'eager',
  chat_model: null,
  query_model: null,
  vlm_model: null,
  self_heal: true,
  webhook_url: null,
  cache_extraction: true,
  agent_profile: null,
  workflow_watchdog_timeout_ms: 600_000,
  max_auto_reparse: 2,
  review_provider: null,
  review_provider_url: null,
  review_provider_api_key: null,
  review_confidence_threshold: 0.85,
  eval_config: null,
};

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export const lifecycleParamsSchema = z.object({
  documentId: z.string(),
  rootId: z.string(),
  sourceUrl: z.string().optional(),
  r2Key: z.string().optional(),
  gcsPrefix: z.string().optional(),
  totalPages: z.number().optional(),
  sandboxVerify: z.boolean(),
  capabilities: processingCapabilitiesSchema,
  generation: z.number(),
  skipParse: z.boolean().optional(),
  expectedSha256: z.string().optional(),
});

export const lifecycleProgressSchema = z.object({
  phase: documentPhaseSchema,
  step: z.string().optional(),
  message: z.string().optional(),
});

// ── Data shapes (SQLite row) ──────────────────────────────────────────────────

export const documentNodeSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  type: daNodeTypeSchema,
  label: z.string().nullable(),
  value: z.string().nullable(),
  status: daNodeStatusSchema,
  bbox_x: z.number().nullable(),
  bbox_y: z.number().nullable(),
  bbox_w: z.number().nullable(),
  bbox_h: z.number().nullable(),
  page_number: z.number().nullable(),
  confidence: z.number().nullable(),
  metadata: z.string().nullable(),
  sort_order: z.number(),
  created_at: z.number(),
  updated_at: z.number(),
});

export const documentEdgeSchema = z.object({
  id: z.string(),
  source_id: z.string(),
  target_id: z.string(),
  relation: z.string(),
  metadata: z.string().nullable(),
  created_at: z.number(),
});

export const mutationSchema = z.object({
  id: z.string(),
  node_id: z.string(),
  op: mutationOpSchema,
  author_type: authorTypeSchema,
  author_id: z.string(),
  prev_value: z.string().nullable(),
  next_value: z.string().nullable(),
  metadata: z.string().nullable(),
  created_at: z.number(),
});

export const verificationSchema = z.object({
  id: z.string(),
  node_id: z.string(),
  verified_by_type: verifiedByTypeSchema,
  verified_by_id: z.string(),
  script: z.string().nullable(),
  result: verificationResultSchema,
  error_message: z.string().nullable(),
  confidence: z.number().nullable(),
  metadata: z.string().nullable(),
  created_at: z.number(),
});

export const agentTaskSchema = z.object({
  id: z.string(),
  type: taskTypeSchema,
  status: taskStatusSchema,
  node_id: z.string().nullable(),
  attempt: z.number(),
  max_attempts: z.number(),
  scheduled_at: z.number(),
  started_at: z.number().nullable(),
  completed_at: z.number().nullable(),
  error: z.string().nullable(),
  metadata: z.string().nullable(),
  created_at: z.number(),
});

export const pageLedgerEntrySchema = z.object({
  page_number: z.number(),
  status: taskStatusSchema,
  pass: ledgerPassSchema,
  vendor: z.string().nullable(),
  attempt: z.number(),
  confidence: z.number().nullable(),
  error: z.string().nullable(),
  entity_metadata: z.string().nullable(),
  started_at: z.number().nullable(),
  completed_at: z.number().nullable(),
});

export const sandboxResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
});

// ── DOM Selector ──────────────────────────────────────────────────────────────

export const selectorSegmentSchema = z.object({
  type: z.string(),
  index: z.number().optional(),
  attr: z.string().optional(),
});

// ── Extraction Job ────────────────────────────────────────────────────────

export const extractionJobParamsSchema = z.object({
  documentId: z.string(),
  rootId: z.string(),
  r2Key: z.string(),
  jobSeq: z.number(),
  vendor: z.string().optional(),
  tier: vendorTierSchema.optional(),
  pages: z.array(z.number()).optional(),
  force: z.boolean().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const extractionJobResultSchema = z.object({
  jobSeq: z.number(),
  vendor: z.string(),
  tier: vendorTierSchema.optional(),
  pagesProcessed: z.array(z.number()),
  nodesCreated: z.number(),
  costUsd: z.number().optional(),
  durationMs: z.number(),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type DocumentPhase = z.infer<typeof documentPhaseSchema>;
export type DaNodeType = z.infer<typeof daNodeTypeSchema>;
export type DaNodeStatus = z.infer<typeof daNodeStatusSchema>;
export type MutationOp = z.infer<typeof mutationOpSchema>;
export type AuthorType = z.infer<typeof authorTypeSchema>;
export type VerifiedByType = z.infer<typeof verifiedByTypeSchema>;
export type VerificationResult = z.infer<typeof verificationResultSchema>;
export type TaskType = z.infer<typeof taskTypeSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type LedgerPass = z.infer<typeof ledgerPassSchema>;
export type ExtractionPhase = z.infer<typeof extractionPhaseSchema>;
export type PhaseTier = z.infer<typeof phaseTierSchema>;
export type CapabilityKey = z.infer<typeof capabilityKeySchema>;
export type StructuredOutputErrorCode = z.infer<typeof structuredOutputErrorCodeSchema>;
export type SchemaIssue = z.infer<typeof schemaIssueSchema>;
export type PhaseVendorConfig = z.infer<typeof phaseVendorConfigSchema>;
export type ProcessingCapabilities = z.infer<typeof processingCapabilitiesSchema>;
export type LifecycleParams = z.infer<typeof lifecycleParamsSchema>;
export type LifecycleProgress = z.infer<typeof lifecycleProgressSchema>;
export type DocumentNode = z.infer<typeof documentNodeSchema>;
export type DocumentEdge = z.infer<typeof documentEdgeSchema>;
export type Mutation = z.infer<typeof mutationSchema>;
export type Verification = z.infer<typeof verificationSchema>;
export type AgentTask = z.infer<typeof agentTaskSchema>;
export type PageLedgerEntry = z.infer<typeof pageLedgerEntrySchema>;
export type SandboxResult = z.infer<typeof sandboxResultSchema>;
export type SelectorSegment = z.infer<typeof selectorSegmentSchema>;
export type ExtractionJobParams = z.infer<typeof extractionJobParamsSchema>;
export type ExtractionJobResult = z.infer<typeof extractionJobResultSchema>;
