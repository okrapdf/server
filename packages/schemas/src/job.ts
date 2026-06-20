import { z } from "zod";
import { bboxSchema } from "./bbox.js";
import { parserProfileSchema } from "./parser-profile.js";
export {
  BUILTIN_PARSER_PROFILES,
  BUILTIN_PARSER_PROMPTS,
  GEMINI_3_FLASH_MODEL,
  PARSER_PROFILE_ALIASES,
  parserConfidenceKindSchema,
  parserProfileSchema,
  parserPromptBboxOrderSchema,
  parserPromptSchema,
  PARSER_MODEL_ALIASES,
  isParserProfileExecutable,
  listExecutableParserProfiles,
  promptRegistryKey,
  resolveParserModel,
  resolveParserProfile,
  resolveParserProfileByModelPrompt,
  resolveParserProfileId,
  resolveParserPrompt,
  type ParserConfidenceKind,
  type ParserProfile,
  type ParserPrompt,
} from "./parser-profile.js";

// -- Job Status --

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "idle",
  "awaiting_user_input",
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
]);

export const pagePhaseStatusSchema = z.enum([
  "idle",
  "processing",
  "completed",
  "error",
]);

export const queueInfoSchema = z.object({
  position: z.number().nullable(),
  ahead: z.number(),
  executing: z.number(),
  pending_pages: z.number(),
});

export const ocrJobStatusSchema = z.object({
  job_id: z.string(),
  status: jobStatusSchema,
  inserted_at: z.string(),
  updated_at: z.string(),
  total_pages: z.number().optional(),
  pages_done: z.number().optional(),
  current_page: z.number().optional(),
  result_url: z.string().optional(),
  error: z.string().optional(),
  pdf_url: z.string().optional(),
  queue: queueInfoSchema.optional(),
  file_name: z.string().optional(),
  status_source: z.enum(["document_agent", "database"]).optional(),
});

export const ocrJobListItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  file_name: z.string().nullable(),
  total_pages: z.number().nullable(),
  pages_completed: z.number().nullable(),
  inserted_at: z.string(),
  updated_at: z.string(),
  thumbnail_url: z.string().nullable(),
  is_public: z.boolean(),
});

export const ocrJobsListResponseSchema = z.object({
  jobs: ocrJobListItemSchema.array(),
});

// -- Pages --

export const pageMetadataSchema = z
  .object({
    has_tables: z.boolean().optional(),
    has_footnotes: z.boolean().optional(),
    has_incomplete_table: z.boolean().optional(),
    has_figures: z.boolean().optional(),
    table_count: z.number().optional(),
    word_count: z.number().optional(),
    is_sparse: z.boolean().optional(),
  })
  .passthrough(); // allow custom metadata keys

export const textBlockSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  bbox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});

export const pageContentSchema = z.object({
  page: z.number(),
  content: z.string(),
  version: z.number().optional(),
  blocks: textBlockSchema.array().optional(),
  has_tables: z.boolean().optional(),
  metadata: pageMetadataSchema.optional(),
  dimension: z
    .object({
      width: z.number().nullable(),
      height: z.number().nullable(),
    })
    .nullable()
    .optional(),
});

export const pageInfoSchema = z.object({
  page: z.number(),
  status: pagePhaseStatusSchema,
  ocr_status: pagePhaseStatusSchema.optional(),
  ai_status: pagePhaseStatusSchema.optional(),
  url: z.string().optional(),
  has_tables: z.boolean().nullable().optional(),
  metadata: pageMetadataSchema.optional(),
  version: z.number().optional(),
  error: z.string().nullable().optional(),
});

export const pagesListResponseSchema = z.object({
  job_id: z.string(),
  pages: pageInfoSchema.array(),
});

// -- Inferred types --

export type JobStatus = z.infer<typeof jobStatusSchema>;
export type PagePhaseStatus = z.infer<typeof pagePhaseStatusSchema>;
export type QueueInfo = z.infer<typeof queueInfoSchema>;
export type OcrJobStatus = z.infer<typeof ocrJobStatusSchema>;
export type OcrJobListItem = z.infer<typeof ocrJobListItemSchema>;
export type OcrJobsListResponse = z.infer<typeof ocrJobsListResponseSchema>;
export type PageMetadata = z.infer<typeof pageMetadataSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type PageContent = z.infer<typeof pageContentSchema>;
export type PageInfo = z.infer<typeof pageInfoSchema>;
export type PagesListResponse = z.infer<typeof pagesListResponseSchema>;

// -- Public parse jobs --

export const publicJobStatusSchema = z.enum([
  "queued",
  "running",
  "idle",
  "awaiting_user_input",
  "succeeded",
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
]);

export const parseProviderSchema = z.enum([
  "okrapdf",
  "textlayer",
  "llamaparse",
  "unstructured",
  "reducto",
  "docling",
  "google_document_ai",
  "azure_document_intelligence",
  "aws_textract",
  "mistral_ocr",
  "custom",
]);

export const parseOutputFormatSchema = z.enum([
  "nodes",
  "markdown",
  "text",
  "html",
  "json",
]);

export const parseTransformationSchema = z.object({
  format: parseOutputFormatSchema.optional(),
  formats: z.array(parseOutputFormatSchema).optional(),
  schema: z.unknown().optional(),
  options: z.record(z.unknown()).optional(),
}).passthrough();

export const parseParserConfigSchema = z.object({
  id: z.string().min(1),
  variant: z.string().min(1).optional(),
  options: z.record(z.unknown()).optional(),
  vendor_options: z.record(z.unknown()).optional(),
}).passthrough();

export const parseJobRequestSchema = z.object({
  parser: z.union([parseProviderSchema, z.string(), parseParserConfigSchema]).optional(),
  tool: z.string().min(1).optional(),
  parser_profile: z.union([z.string().min(1), parserProfileSchema]).optional(),
  file_name: z.string().nullable().optional(),
  file_source: z.enum(["inline", "file_id"]).nullable().optional(),
  file_mime_type: z.string().nullable().optional(),
  source_file_name: z.string().nullable().optional(),
  source_mime_type: z.string().nullable().optional(),
  normalized_from: z.enum(["image"]).nullable().optional(),
  pages: z.unknown().nullable().optional(),
  output_formats: z.array(parseOutputFormatSchema).optional(),
  transformation: parseTransformationSchema.nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const parseNodeRoleSchema = z.enum([
  "text",
  "heading",
  "section_heading",
  "table",
  "row",
  "cell",
  "figure",
  "header",
  "footer",
  "key_value",
  "list",
  "unknown",
]);

export type ParseNode = {
  id: string;
  page: number;
  role: z.infer<typeof parseNodeRoleSchema>;
  text: string;
  bbox?: z.infer<typeof bboxSchema>;
  confidence?: number;
  label?: string;
  type?: string;
  parent_id?: string;
  vendor_payload_ref?: {
    sha256: string;
    uri?: string;
  };
  children?: ParseNode[];
};

export const parseNodeSchema: z.ZodType<ParseNode> = z.object({
  id: z.string(),
  page: z.number().int().positive(),
  role: parseNodeRoleSchema,
  text: z.string(),
  bbox: bboxSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  label: z.string().optional(),
  type: z.string().optional(),
  parent_id: z.string().optional(),
  vendor_payload_ref: z.object({
    sha256: z.string(),
    uri: z.string().optional(),
  }).optional(),
  children: z.lazy(() => parseNodeSchema.array()).optional(),
});

export const parseNodesPageSchema = z.object({
  page: z.number().int().positive(),
  width: z.number().optional(),
  height: z.number().optional(),
  nodes: z.array(parseNodeSchema),
});

export const parseNodesFormatSchema = z.object({
  object: z.literal("parse_format"),
  format: z.literal("nodes"),
  pages: z.array(parseNodesPageSchema),
});

export const parseMarkdownFormatSchema = z.object({
  object: z.literal("parse_format"),
  format: z.literal("markdown"),
  content: z.string(),
  pages: z.array(z.object({
    page: z.number().int().positive(),
    content: z.string(),
  })),
});

export const parseTextFormatSchema = z.object({
  object: z.literal("parse_format"),
  format: z.literal("text"),
  content: z.string(),
  pages: z.array(z.object({
    page: z.number().int().positive(),
    content: z.string(),
  })),
});

export const parseJsonFormatSchema = z.object({
  object: z.literal("parse_format"),
  format: z.literal("json"),
  page_count: z.number().int().nonnegative(),
  pages: z.array(z.record(z.unknown())),
});

export const parseArtifactSchema = z.object({
  object: z.literal("artifact"),
  type: z.string(),
  url: z.string().optional(),
  hash: z.string().optional(),
  format: parseOutputFormatSchema.optional(),
}).passthrough();

export const parseResultFormatsSchema = z.object({
  nodes: parseNodesFormatSchema.optional(),
  markdown: parseMarkdownFormatSchema.optional(),
  text: parseTextFormatSchema.optional(),
  html: parseArtifactSchema.optional(),
  json: parseJsonFormatSchema.optional(),
});

export const parseResultSchema = z.object({
  object: z.literal("parse_result"),
  job: z.string(),
  file: z.object({
    name: z.string().nullable().optional(),
    source: z.enum(["inline", "file_id"]).nullable().optional(),
  }).optional(),
  usage: z.object({
    pages: z.number().int().nonnegative(),
    duration_ms: z.number().int().nonnegative().nullable().optional(),
  }),
  formats: parseResultFormatsSchema.optional(),
  extracted: z.object({
    data: z.unknown(),
    schema_valid: z.boolean(),
  }).nullable().optional(),
  extraction_error: z.string().nullable().optional(),
  tool_result: z.record(z.unknown()).optional(),
  artifacts: z.record(parseArtifactSchema).nullable().optional(),
  artifact_error: z.string().nullable().optional(),
});

export const publicJobProgressSchema = z.object({
  phase: publicJobStatusSchema.or(z.string()),
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  pages_done: z.number().int().nonnegative(),
  pages_completed: z.number().int().nonnegative(),
  pages_failed: z.number().int().nonnegative(),
  pages_running: z.number().int().nonnegative(),
  pages_pending: z.number().int().nonnegative(),
  pages_total: z.number().int().nonnegative(),
  chunks_completed: z.number().int().nonnegative(),
  chunks_total: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100).nullable(),
});

export const parseJobResponseSchema = z.object({
  object: z.literal("job"),
  id: z.string(),
  type: z.literal("parse"),
  status: publicJobStatusSchema,
  created: z.number().int().optional(),
  completed: z.number().int().nullable().optional(),
  livemode: z.boolean().optional(),
  url: z.string().optional(),
  status_url: z.string().optional(),
  job_id: z.string().optional(),
  job_type: z.literal("parse").optional(),
  job_label: z.string().nullable().optional(),
  file_name: z.string().nullable().optional(),
  terminal: z.boolean().optional(),
  next_poll_after_ms: z.number().int().nonnegative().nullable().optional(),
  retryable: z.boolean().optional(),
  progress_current: z.number().int().nonnegative().optional(),
  progress_total: z.number().int().nonnegative().optional(),
  progress: publicJobProgressSchema.optional(),
  pages_completed: z.number().int().nonnegative().optional(),
  pages_failed: z.number().int().nonnegative().optional(),
  pages_running: z.number().int().nonnegative().optional(),
  pages_pending: z.number().int().nonnegative().optional(),
  pages_total: z.number().int().nonnegative().optional(),
  chunks_completed: z.number().int().nonnegative().optional(),
  chunks_total: z.number().int().nonnegative().optional(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
  model: z.string().optional(),
  prompt_id: z.string().optional(),
  prompt_version: z.union([z.string(), z.number()]).optional(),
  confidence_kind: z.string().optional(),
  cost_usd: z.number().nonnegative().optional(),
  error_code: z.string().nullable().optional(),
  user_message: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  latest_error: z.string().nullable().optional(),
  request: parseJobRequestSchema.nullable().optional(),
  result: parseResultSchema.nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.number().int().optional(),
  updated_at: z.number().int().optional(),
  completed_at: z.number().int().nullable().optional(),
  last_error: z.object({ message: z.string(), code: z.string().optional() }).nullable().optional(),
});

export type PublicJobStatus = z.infer<typeof publicJobStatusSchema>;
export type ParseProvider = z.infer<typeof parseProviderSchema>;
export type ParseOutputFormat = z.infer<typeof parseOutputFormatSchema>;
export type ParseTransformation = z.infer<typeof parseTransformationSchema>;
export type ParseJobRequest = z.infer<typeof parseJobRequestSchema>;
export type ParseNodeRole = z.infer<typeof parseNodeRoleSchema>;
export type ParseNodesFormat = z.infer<typeof parseNodesFormatSchema>;
export type ParseMarkdownFormat = z.infer<typeof parseMarkdownFormatSchema>;
export type ParseTextFormat = z.infer<typeof parseTextFormatSchema>;
export type ParseJsonFormat = z.infer<typeof parseJsonFormatSchema>;
export type ParseResultFormats = z.infer<typeof parseResultFormatsSchema>;
export type ParseResult = z.infer<typeof parseResultSchema>;
export type ParseJobResponse = z.infer<typeof parseJobResponseSchema>;
