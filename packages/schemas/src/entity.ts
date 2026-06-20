import { z } from "zod";
import { bboxSchema } from "./bbox.js";

// -- Block types --
// Raw vendor types are preserved for fidelity. Known canonical types listed for reference.
// Use resolveBlockType() at export/render boundary to map raw → canonical.

export const CANONICAL_BLOCK_TYPES = [
  "table", "row", "cell", "text", "figure", "header", "footer", "key_value", "list",
] as const;

export const blockTypeSchema = z.string();

export const nodeStatusSchema = z.enum([
  "pending",
  "verified",
  "corrected",
  "flagged",
  "skipped",
  "rejected",
]);

// Recursive canonical block
export type CanonicalBlock = {
  /** Raw vendor type — preserved as-is for fidelity. */
  type: string;
  label?: string;
  value?: string;
  bbox?: { x: number; y: number; w: number; h: number };
  confidence?: number;
  children?: CanonicalBlock[];
};

export const canonicalBlockSchema: z.ZodType<CanonicalBlock> = z.object({
  type: blockTypeSchema,
  label: z.string().optional(),
  value: z.string().optional(),
  bbox: bboxSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  children: z.lazy(() => canonicalBlockSchema.array()).optional(),
});

export const canonicalPageSchema = z.object({
  pageNumber: z.number(),
  width: z.number(),
  height: z.number(),
  blocks: canonicalBlockSchema.array(),
});

export const canonicalParseResultSchema = z.object({
  pages: canonicalPageSchema.array(),
  metadata: z.object({
    vendor: z.string(),
    model: z.string().optional(),
    durationMs: z.number().optional(),
    confidence: z.number().nullable().optional(),
    pageCount: z.number(),
  }),
});

// -- Canonical Element + Entity Metadata (backend model) --

export const canonicalElementSchema = z.object({
  title: z.string(),
  bbox: bboxSchema,
  schema: z.array(z.string()).optional(),
  is_complete: z.boolean().optional(),
});

export const canonicalEntityMetadataSchema = z.object({
  tables: z.array(canonicalElementSchema),
  figures: z.array(canonicalElementSchema),
  footnotes: z.array(canonicalElementSchema),
  signatures: z.array(canonicalElementSchema),
});

// -- Entity (web-facing) --

export const entityBBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const entitySchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string().nullable(),
  page: z.number(),
  vendor: z.string().optional(),
  schema: z.string().array().optional(),
  isComplete: z.boolean().optional(),
  level: z.number().optional(),
  ordered: z.boolean().optional(),
  items: z.string().array().optional(),
  fieldType: z.string().optional(),
  value: z.string().nullable().optional(),
  bbox: entityBBoxSchema.optional(),
});

export const entityTypeDefinitionSchema = z.object({
  type: z.string(),
  label: z.string(),
  source: z.enum(["core", "plugin", "observed"]),
  color: z.string().optional(),
  plugin: z.string().optional(),
  parentType: z.string().optional(),
  description: z.string().optional(),
});

export const entitiesResponseSchema = z.object({
  jobId: z.string(),
  entities: entitySchema.array(),
  counts: z.object({
    tables: z.number(),
    figures: z.number(),
    footnotes: z.number(),
    summaries: z.number(),
    signatures: z.number().optional(),
    headings: z.number().optional(),
    paragraphs: z.number().optional(),
    lists: z.number().optional(),
    forms: z.number().optional(),
    headers: z.number().optional(),
    byType: z.record(z.string(), z.number()).optional(),
  }),
  typeDefinitions: z.record(z.string(), entityTypeDefinitionSchema).optional(),
  extractionStatus: z
    .enum([
      "not_started",
      "pending",
      "running",
      "completed",
      "failed",
      "cancelled",
      "paused",
    ])
    .optional(),
  totalPages: z.number().optional(),
  ocrVendorName: z.string().nullable().optional(),
});

// -- Tables --

export const tableSchema = z.object({
  id: z.string(),
  page_number: z.number(),
  markdown: z.string(),
  bbox: z.object({
    xmin: z.number(),
    ymin: z.number(),
    xmax: z.number(),
    ymax: z.number(),
  }),
  confidence: z.number().nullable(),
  verification_status: z.enum(["pending", "verified", "flagged", "rejected"]),
  verified_by: z.string().nullable(),
  verified_at: z.string().nullable(),
  was_corrected: z.boolean().optional(),
  created_at: z.string(),
});

export const tablesResponseSchema = z.object({
  tables: tableSchema.array(),
  source: z.enum(["job_id", "document_uuid"]),
});

// -- Search --

export const matchSourceSchema = z.enum([
  "content",
  "table_title",
  "table_schema",
  "table_row",
  "figure",
  "footnote",
  "summary",
  "signature",
  "paragraph",
  "heading",
  "list",
  "form",
  "header",
]);

export const searchResultSchema = z.object({
  page: z.number(),
  snippet: z.string(),
  match_count: z.number(),
  match_source: matchSourceSchema.optional(),
});

export const searchResponseSchema = z.object({
  query: z.string(),
  total_matches: z.number(),
  results: searchResultSchema.array(),
});

// -- Verification Tree --

export const verificationPageStatusSchema = z.enum([
  "complete",
  "partial",
  "flagged",
  "pending",
  "empty",
  "gap",
  "error",
]);

export const verificationTreePageSchema = z.object({
  page: z.number(),
  status: verificationPageStatusSchema,
  total: z.number(),
  verified: z.number(),
  pending: z.number(),
  flagged: z.number(),
  rejected: z.number(),
  avgConfidence: z.number(),
  hasOcr: z.boolean(),
  ocrLineCount: z.number(),
  hasCoverageGaps: z.boolean(),
  uncoveredCount: z.number(),
  resolution: z.string().nullable(),
  classification: z.string().nullable(),
  isStale: z.boolean(),
});

export const verificationTreeResponseSchema = z.object({
  jobId: z.string(),
  documentId: z.string(),
  totalPages: z.number(),
  summary: z.object({
    complete: z.number(),
    partial: z.number(),
    flagged: z.number(),
    pending: z.number(),
    empty: z.number(),
    gap: z.number(),
    resolved: z.number().optional(),
    stale: z.number().optional(),
  }),
  pages: verificationTreePageSchema.array(),
});

// -- Inferred types --

export type BlockType = z.infer<typeof blockTypeSchema>;
export type NodeStatus = z.infer<typeof nodeStatusSchema>;
export type CanonicalPage = z.infer<typeof canonicalPageSchema>;
export type CanonicalParseResult = z.infer<typeof canonicalParseResultSchema>;
export type CanonicalElement = z.infer<typeof canonicalElementSchema>;
export type CanonicalEntityMetadata = z.infer<typeof canonicalEntityMetadataSchema>;
export type EntityBBox = z.infer<typeof entityBBoxSchema>;
export type Entity = z.infer<typeof entitySchema>;
export type EntityTypeDefinition = z.infer<typeof entityTypeDefinitionSchema>;
export type EntitiesResponse = z.infer<typeof entitiesResponseSchema>;
export type Table = z.infer<typeof tableSchema>;
export type TablesResponse = z.infer<typeof tablesResponseSchema>;
export type MatchSource = z.infer<typeof matchSourceSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type VerificationPageStatus = z.infer<typeof verificationPageStatusSchema>;
export type VerificationTreePage = z.infer<typeof verificationTreePageSchema>;
export type VerificationTreeResponse = z.infer<typeof verificationTreeResponseSchema>;
