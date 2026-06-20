import { z } from "zod";
import { bboxSchema } from "./bbox.js";
import { citationBoxSchema } from "./citation.js";

export const pdfSourceAllowanceScopeSchema = z.enum([
  "public_unlicensed",
  "open_license",
  "public_domain",
  "user_private",
  "owner_permissioned",
  "blocked",
]);

export const pdfSourceContextScopeSchema = z.enum([
  "metadata",
  "structure",
  "bounded_context",
  "answer",
  "source_redirect",
  "full_text",
  "full_markdown",
]);

export const pdfSourceSummaryAllowanceSchema = z.enum([
  "disabled",
  "bounded",
  "allowed",
]);

export const pdfSourceFeaturePolicySchema = z.object({
  structure: z.boolean(),
  cited_snippets: z.boolean(),
  qa: z.boolean(),
  summaries: pdfSourceSummaryAllowanceSchema,
  full_text_export: z.boolean(),
  full_markdown: z.boolean(),
  read_full_section: z.boolean(),
  cross_user_cache: z.boolean(),
  requires_original_source: z.boolean(),
  max_snippet_chars: z.number().int().nonnegative(),
  max_context_tokens: z.number().int().positive(),
  max_adjacent_snippets: z.number().int().nonnegative(),
});

export type PdfSourceAllowanceScope = z.infer<typeof pdfSourceAllowanceScopeSchema>;
export type PdfSourceContextScope = z.infer<typeof pdfSourceContextScopeSchema>;
export type PdfSourceFeaturePolicy = z.infer<typeof pdfSourceFeaturePolicySchema>;

export const PDF_SOURCE_ALLOWANCE_POLICIES: Record<
  PdfSourceAllowanceScope,
  PdfSourceFeaturePolicy
> = {
  public_unlicensed: {
    structure: true,
    cited_snippets: true,
    qa: true,
    summaries: "bounded",
    full_text_export: false,
    full_markdown: false,
    read_full_section: false,
    cross_user_cache: false,
    requires_original_source: true,
    max_snippet_chars: 480,
    max_context_tokens: 2_400,
    max_adjacent_snippets: 2,
  },
  open_license: {
    structure: true,
    cited_snippets: true,
    qa: true,
    summaries: "allowed",
    full_text_export: true,
    full_markdown: true,
    read_full_section: true,
    cross_user_cache: true,
    requires_original_source: true,
    max_snippet_chars: 2_000,
    max_context_tokens: 16_000,
    max_adjacent_snippets: 12,
  },
  public_domain: {
    structure: true,
    cited_snippets: true,
    qa: true,
    summaries: "allowed",
    full_text_export: true,
    full_markdown: true,
    read_full_section: true,
    cross_user_cache: true,
    requires_original_source: false,
    max_snippet_chars: 4_000,
    max_context_tokens: 32_000,
    max_adjacent_snippets: 24,
  },
  user_private: {
    structure: true,
    cited_snippets: true,
    qa: true,
    summaries: "allowed",
    full_text_export: true,
    full_markdown: true,
    read_full_section: true,
    cross_user_cache: false,
    requires_original_source: false,
    max_snippet_chars: 4_000,
    max_context_tokens: 32_000,
    max_adjacent_snippets: 24,
  },
  owner_permissioned: {
    structure: true,
    cited_snippets: true,
    qa: true,
    summaries: "allowed",
    full_text_export: true,
    full_markdown: true,
    read_full_section: true,
    cross_user_cache: true,
    requires_original_source: false,
    max_snippet_chars: 4_000,
    max_context_tokens: 32_000,
    max_adjacent_snippets: 24,
  },
  blocked: {
    structure: false,
    cited_snippets: false,
    qa: false,
    summaries: "disabled",
    full_text_export: false,
    full_markdown: false,
    read_full_section: false,
    cross_user_cache: false,
    requires_original_source: true,
    max_snippet_chars: 0,
    max_context_tokens: 1,
    max_adjacent_snippets: 0,
  },
};

export function getPdfSourceFeaturePolicy(
  scope: PdfSourceAllowanceScope,
): PdfSourceFeaturePolicy {
  return PDF_SOURCE_ALLOWANCE_POLICIES[scope];
}

export function pdfSourceAllowsContextScope(
  scope: PdfSourceContextScope,
  policy: PdfSourceFeaturePolicy,
): boolean {
  switch (scope) {
    case "metadata":
    case "source_redirect":
      return true;
    case "structure":
      return policy.structure;
    case "bounded_context":
      return policy.cited_snippets;
    case "answer":
      return policy.qa;
    case "full_text":
      return policy.full_text_export;
    case "full_markdown":
      return policy.full_markdown;
  }
}

export const pdfSourceLicenseStatusSchema = z.enum([
  "unknown",
  "unlicensed",
  "open_license",
  "public_domain",
  "permissioned",
  "blocked",
]);

export const detectedPdfSourceLicenseSchema = z.object({
  status: pdfSourceLicenseStatusSchema,
  label: z.string().trim().min(1).max(160),
  url: z.string().url().optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().trim().min(1).max(240)).default([]),
});

export const sha256Schema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i, "Expected a 64-character sha256 hex digest")
  .transform((value) => value.toLowerCase());

export const resolvePdfSourceRequestSchema = z
  .object({
    url: z.string().url().optional(),
    sha256: sha256Schema.optional(),
    title_hint: z.string().trim().min(1).max(240).optional(),
    user_asserted_access: z.boolean().optional(),
  })
  .refine((value) => value.url || value.sha256, {
    message: "Provide either url or sha256",
    path: ["url"],
  });

export const resolvePdfSourceResponseSchema = z.object({
  object: z.literal("pdf_source"),
  source_id: z.string().trim().min(1),
  canonical_url: z.string().url().optional(),
  sha256: sha256Schema.optional(),
  title: z.string().trim().min(1).max(280).optional(),
  page_count: z.number().int().positive().optional(),
  detected_license: detectedPdfSourceLicenseSchema,
  allowance_scope: pdfSourceAllowanceScopeSchema,
  allowance_policy: pdfSourceFeaturePolicySchema.optional(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().trim().min(1).max(280)).default([]),
  is_synthetic: z.boolean().optional(),
});

export const pdfStructureNodeKindSchema = z.enum([
  "front_matter",
  "toc",
  "section",
  "subsection",
  "appendix",
  "table",
  "figure",
  "form",
  "references",
  "metadata",
]);

export const pdfStructureContentKindSchema = z.enum([
  "text",
  "table",
  "figure",
  "form",
  "appendix",
  "references",
  "metadata",
]);

export const pdfStructureNodeSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(280),
  level: z.number().int().min(1).max(12),
  kind: pdfStructureNodeKindSchema.default("section"),
  page_start: z.number().int().positive(),
  page_end: z.number().int().positive().optional(),
  parent_id: z.string().trim().min(1).optional(),
  path: z.array(z.string().trim().min(1).max(160)).default([]),
  token_estimate: z.number().int().nonnegative(),
  content_kinds: z.array(pdfStructureContentKindSchema).default(["text"]),
  confidence: z.number().min(0).max(1).optional(),
  summary_preview: z.string().trim().max(320).optional(),
}).refine(
  (value) => value.page_end === undefined || value.page_end >= value.page_start,
  {
    message: "page_end must be greater than or equal to page_start",
    path: ["page_end"],
  },
);

export const pdfStructureArtifactSchema = z.object({
  id: z.string().trim().min(1),
  title_hint: z.string().trim().min(1).max(240).optional(),
  page: z.number().int().positive(),
  section_id: z.string().trim().min(1).optional(),
  columns: z.array(z.string().trim().min(1).max(160)).default([]),
  row_count_hint: z.number().int().positive().optional(),
  bbox: citationBoxSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const readPdfStructureRequestSchema = z.object({
  source_id: z.string().trim().min(1),
  max_depth: z.number().int().min(1).max(12).optional(),
  include_artifacts: z.boolean().optional().default(true),
});

export const readPdfStructureResponseSchema = z.object({
  object: z.literal("pdf_structure"),
  source_id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(280).optional(),
  canonical_url: z.string().url().optional(),
  page_count: z.number().int().positive().optional(),
  pages_parsed: z.number().int().nonnegative().optional(),
  coverage: z.enum(["unknown", "empty", "partial", "complete"]).optional(),
  page_coverage: z.enum(["unknown", "empty", "partial", "complete"]).optional(),
  page_coverage_percent: z.number().int().min(0).max(100).optional(),
  allowance_scope: pdfSourceAllowanceScopeSchema,
  policy: pdfSourceFeaturePolicySchema.optional(),
  outline: z.array(pdfStructureNodeSchema),
  tables: z.array(pdfStructureArtifactSchema).default([]),
  figures: z.array(pdfStructureArtifactSchema).default([]),
  generated_at: z.string().datetime().optional(),
});

export const pdfContextBlockKindSchema = z.enum([
  "snippet",
  "table_summary",
  "figure_summary",
  "metadata",
  "section_summary",
  "navigation",
]);

export const pdfContextCitationSchema = z.object({
  page: z.number().int().positive(),
  section_id: z.string().trim().min(1).optional(),
  source_url: z.string().url().optional(),
  citation_url: z.string().url(),
  short_snippet: z.string().trim().min(1).max(600).optional(),
  bbox: bboxSchema.optional(),
  bbox_source: z.literal("node").optional(),
});

export const pdfContextBlockSchema = z.object({
  block_id: z.string().trim().min(1),
  kind: pdfContextBlockKindSchema,
  section_id: z.string().trim().min(1).optional(),
  page: z.number().int().positive().optional(),
  page_start: z.number().int().positive().optional(),
  page_end: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(240).optional(),
  text: z.string().trim().min(1).max(4_000),
  token_estimate: z.number().int().nonnegative(),
  citations: z.array(pdfContextCitationSchema).default([]),
  confidence: z.number().min(0).max(1).optional(),
});

export const getPdfContextRequestSchema = z.object({
  source_id: z.string().trim().min(1),
  query: z.string().trim().min(1).max(1_000),
  section_ids: z.array(z.string().trim().min(1)).max(20).optional(),
  context_scope: pdfSourceContextScopeSchema.optional().default("bounded_context"),
  max_tokens: z.number().int().min(1).max(32_000).optional(),
});

export const pdfContextOmittedReasonSchema = z.enum([
  "scope_limit",
  "copyright_guardrail",
  "token_budget",
  "not_found",
  "original_source_required",
]);

export const getPdfContextResponseSchema = z.object({
  object: z.literal("pdf_context"),
  source_id: z.string().trim().min(1),
  query: z.string().trim().min(1),
  context_scope: pdfSourceContextScopeSchema,
  context_blocks: z.array(pdfContextBlockSchema),
  citations: z.array(pdfContextCitationSchema).default([]),
  omitted_reason: pdfContextOmittedReasonSchema.optional(),
  policy: pdfSourceFeaturePolicySchema.optional(),
});

export const askPdfRequestSchema = z.object({
  source_id: z.string().trim().min(1),
  question: z.string().trim().min(1).max(1_000),
  section_ids: z.array(z.string().trim().min(1)).max(20).optional(),
  max_answer_tokens: z.number().int().min(1).max(8_000).optional(),
});

export const askPdfResponseSchema = z.object({
  object: z.literal("pdf_answer"),
  source_id: z.string().trim().min(1),
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1).max(12_000),
  citations: z.array(pdfContextCitationSchema).min(1),
  confidence: z.number().min(0).max(1),
  follow_up_sections: z.array(z.string().trim().min(1)).default([]),
  policy: pdfSourceFeaturePolicySchema.optional(),
});

export const openOriginalSourceRequestSchema = z.object({
  source_id: z.string().trim().min(1),
  page: z.number().int().positive().optional(),
  section_id: z.string().trim().min(1).optional(),
});

export const openOriginalSourceResponseSchema = z.object({
  object: z.literal("original_source_link"),
  source_id: z.string().trim().min(1),
  url: z.string().url(),
  page: z.number().int().positive().optional(),
  section_id: z.string().trim().min(1).optional(),
});

export const pdfSourceContextToolNameSchema = z.enum([
  "resolve_source",
  "read_structure",
  "get_context",
  "ask",
  "open_source",
]);

export const PDF_SOURCE_CONTEXT_TOOL_NAMES = pdfSourceContextToolNameSchema.options;

const pdfContextOfflineExampleBaseSchema = z.object({
  id: z.string().trim().min(1),
  sample_id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(160),
  user_query: z.string().trim().min(1).max(1_000),
  user_visible_result: z.string().trim().min(1).max(1_200),
});

export const resolveSourceOfflineExampleSchema = pdfContextOfflineExampleBaseSchema.extend({
  tool_name: z.literal("resolve_source"),
  request: resolvePdfSourceRequestSchema,
  response: resolvePdfSourceResponseSchema,
});

export const readStructureOfflineExampleSchema = pdfContextOfflineExampleBaseSchema.extend({
  tool_name: z.literal("read_structure"),
  request: readPdfStructureRequestSchema,
  response: readPdfStructureResponseSchema,
});

export const getContextOfflineExampleSchema = pdfContextOfflineExampleBaseSchema.extend({
  tool_name: z.literal("get_context"),
  request: getPdfContextRequestSchema,
  response: getPdfContextResponseSchema,
});

export const askOfflineExampleSchema = pdfContextOfflineExampleBaseSchema.extend({
  tool_name: z.literal("ask"),
  request: askPdfRequestSchema,
  response: askPdfResponseSchema,
});

export const openSourceOfflineExampleSchema = pdfContextOfflineExampleBaseSchema.extend({
  tool_name: z.literal("open_source"),
  request: openOriginalSourceRequestSchema,
  response: openOriginalSourceResponseSchema,
});

export const pdfContextOfflineExampleSchema = z.discriminatedUnion("tool_name", [
  resolveSourceOfflineExampleSchema,
  readStructureOfflineExampleSchema,
  getContextOfflineExampleSchema,
  askOfflineExampleSchema,
  openSourceOfflineExampleSchema,
]);

export const pdfContextAgentKindSchema = z.enum(["claude", "codex", "other_agent"]);

export const pdfContextAgentSimulationSchema = z.object({
  id: z.string().trim().min(1),
  sample_id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(180),
  agent_user: z.object({
    kind: pdfContextAgentKindSchema,
    name: z.string().trim().min(1).max(120),
    prompt: z.string().trim().min(1).max(1_500),
  }),
  objective: z.string().trim().min(1).max(500),
  mocked_tool_exchanges: z.array(pdfContextOfflineExampleSchema).min(1),
  final_handoff: z.object({
    parser_task: z.string().trim().min(1).max(500),
    target_table_id: z.string().trim().min(1).optional(),
    target_page: z.number().int().positive().optional(),
    expected_title: z.string().trim().min(1).max(240).optional(),
    expected_columns: z.array(z.string().trim().min(1).max(160)).default([]),
    validation_checks: z.array(z.string().trim().min(1).max(240)).default([]),
  }),
  expected_delta: z.object({
    baseline_strategy: z.string().trim().min(1).max(500),
    okra_strategy: z.string().trim().min(1).max(500),
    why_faster: z.string().trim().min(1).max(500),
    token_estimate_without_okra: z.number().int().positive().optional(),
    token_estimate_with_okra: z.number().int().positive().optional(),
  }),
});

export const pdfContextTraceStepSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(160),
  actor: z.enum(["user", "agent", "okra", "parser", "source"]),
  tool_name: pdfSourceContextToolNameSchema.optional(),
  action: z.string().trim().min(1).max(280),
  input_summary: z.string().trim().min(1).max(500).optional(),
  output_summary: z.string().trim().min(1).max(800),
  pages_touched: z.array(z.number().int().positive()).default([]),
  token_estimate: z.number().int().nonnegative(),
  elapsed_ms_estimate: z.number().int().nonnegative().optional(),
});

export const pdfContextTracePathSchema = z.object({
  strategy: z.enum(["without_okra", "with_okra"]),
  summary: z.string().trim().min(1).max(500),
  steps: z.array(pdfContextTraceStepSchema).min(1),
  token_estimate: z.number().int().positive(),
  pages_touched: z.array(z.number().int().positive()).default([]),
  result_confidence: z.number().min(0).max(1),
  risk_notes: z.array(z.string().trim().min(1).max(240)).default([]),
});

export const pdfContextTraceComparisonSchema = z.object({
  id: z.string().trim().min(1),
  sample_id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(180),
  task: z.string().trim().min(1).max(500),
  baseline: pdfContextTracePathSchema,
  okra: pdfContextTracePathSchema,
  outcome: z.object({
    target_table_id: z.string().trim().min(1).optional(),
    target_page: z.number().int().positive().optional(),
    saved_tokens_estimate: z.number().int(),
    token_reduction_percent: z.number().min(0).max(100),
    pages_avoided: z.number().int().nonnegative(),
    result: z.string().trim().min(1).max(800),
  }),
});

export const pdfContextUxSampleSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(500),
  persona: z.string().trim().min(1).max(120),
  source: resolvePdfSourceResponseSchema,
  structure: readPdfStructureResponseSchema,
  context_queries: z.array(
    z.object({
      label: z.string().trim().min(1).max(120),
      request: getPdfContextRequestSchema,
      response: getPdfContextResponseSchema,
    }),
  ),
  qa_pairs: z.array(
    z.object({
      label: z.string().trim().min(1).max(120),
      request: askPdfRequestSchema,
      response: askPdfResponseSchema,
    }),
  ),
  blocked_actions: z.array(
    z.object({
      action: z.string().trim().min(1).max(160),
      reason: z.string().trim().min(1).max(320),
      fallback_tool: pdfSourceContextToolNameSchema.optional(),
    }),
  ).default([]),
  examples: z.array(pdfContextOfflineExampleSchema).default([]),
});

export type DetectedPdfSourceLicense = z.infer<typeof detectedPdfSourceLicenseSchema>;
export type ResolvePdfSourceRequest = z.infer<typeof resolvePdfSourceRequestSchema>;
export type ResolvePdfSourceResponse = z.infer<typeof resolvePdfSourceResponseSchema>;
export type PdfStructureNode = z.infer<typeof pdfStructureNodeSchema>;
export type PdfStructureArtifact = z.infer<typeof pdfStructureArtifactSchema>;
export type ReadPdfStructureRequest = z.infer<typeof readPdfStructureRequestSchema>;
export type ReadPdfStructureResponse = z.infer<typeof readPdfStructureResponseSchema>;
export type PdfContextBlock = z.infer<typeof pdfContextBlockSchema>;
export type PdfContextCitation = z.infer<typeof pdfContextCitationSchema>;
export type GetPdfContextRequest = z.infer<typeof getPdfContextRequestSchema>;
export type GetPdfContextResponse = z.infer<typeof getPdfContextResponseSchema>;
export type AskPdfRequest = z.infer<typeof askPdfRequestSchema>;
export type AskPdfResponse = z.infer<typeof askPdfResponseSchema>;
export type OpenOriginalSourceRequest = z.infer<typeof openOriginalSourceRequestSchema>;
export type OpenOriginalSourceResponse = z.infer<typeof openOriginalSourceResponseSchema>;
export type PdfSourceContextToolName = z.infer<typeof pdfSourceContextToolNameSchema>;
export type PdfContextOfflineExample = z.infer<typeof pdfContextOfflineExampleSchema>;
export type PdfContextAgentSimulation = z.infer<typeof pdfContextAgentSimulationSchema>;
export type PdfContextTraceComparison = z.infer<typeof pdfContextTraceComparisonSchema>;
export type PdfContextUxSample = z.infer<typeof pdfContextUxSampleSchema>;
