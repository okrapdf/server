import { z } from "zod";

export const citationQualityGradeSchema = z.enum(["high", "medium", "low"]);

export const citationMatchStrategySchema = z.enum([
  "contains",
  "exact",
  "fuzzy",
]);

export const pixelCitationBoxSchema = z.object({
  unit: z.literal("px"),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  page_width: z.number().positive().optional(),
  page_height: z.number().positive().optional(),
});

export const pointCitationBoxSchema = z.object({
  unit: z.literal("pt"),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  page_width: z.number().positive().optional(),
  page_height: z.number().positive().optional(),
});

export const normalizedCitationBoxSchema = z.object({
  unit: z.literal("normalized"),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

export const citationBoxSchema = z.discriminatedUnion("unit", [
  pixelCitationBoxSchema,
  pointCitationBoxSchema,
  normalizedCitationBoxSchema,
]);

export const citationLocatorSchema = z
  .object({
    type: z.string().trim().min(1).optional().default("text"),
    page: z.number().int().positive().optional(),
    value: z.string().trim().min(1).optional(),
    match: citationMatchStrategySchema.optional().default("contains"),
    node_id: z.string().trim().min(1).optional(),
    bbox: citationBoxSchema.optional(),
  })
  .passthrough();

export const citationCreateRequestSchema = z.object({
  claim: z.string().trim().min(1),
  locator: citationLocatorSchema,
  label: z.string().trim().min(1).optional(),
  min_grade: citationQualityGradeSchema.optional().default("high"),
});

export const citationBatchCreateRequestSchema = z.object({
  citations: z.array(citationCreateRequestSchema).min(1).max(50),
  continue_on_error: z.boolean().optional(),
});

export const citationVerificationSchema = z.object({
  grade: citationQualityGradeSchema,
  score: z.number().min(0).max(100),
  checks: z.array(
    z.object({
      id: z.string(),
      ok: z.boolean(),
      severity: z.enum(["required", "warning"]),
      message: z.string(),
    }),
  ),
  next_steps: z.array(z.string()),
});

export const citationLocationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("page_region"),
    page: z.number().int().positive(),
    bbox: citationBoxSchema,
    normalized_bbox: normalizedCitationBoxSchema.optional(),
  }),
  z.object({
    type: z.literal("page"),
    page: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("text_anchor"),
    page: z.number().int().positive().optional(),
    quote: z.string().optional(),
    match: citationMatchStrategySchema.optional(),
  }),
  z.object({
    type: z.literal("node"),
    node_id: z.string(),
    page: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("external"),
    provider: z.string(),
    raw: z.unknown(),
  }),
]);

export const citationEvidenceSchema = z.object({
  node_id: z.string().optional(),
  page: z.number().int().positive().optional(),
  type: z.string().optional(),
  label: z.string().optional(),
  text: z.string().optional(),
  location: citationLocationSchema.optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  status: z.string().optional(),
  quote_hash: z.string().optional(),
  provider: z.string().optional(),
  raw_location: z.unknown().optional(),
});

export const apiCitationSchema = z.object({
  object: z.literal("citation"),
  id: z.string(),
  document_id: z.string(),
  claim: z.string(),
  url: z.string().url(),
  href: z.string().url(),
  created_at: z.string().optional(),
  label: z.string().optional(),
  page: z.number().int().positive().optional(),
  text: z.string().optional(),
  quote: z
    .object({
      text: z.string(),
      hash: z.string(),
    })
    .optional(),
  location: citationLocationSchema.optional(),
  evidence: z.array(citationEvidenceSchema).default([]),
  page_image: z.string().optional(),
  verification: citationVerificationSchema.optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export const citationListResponseSchema = z.object({
  object: z.literal("list"),
  data: z.array(apiCitationSchema),
  has_more: z.boolean(),
});

export const citationBatchCreateResponseSchema = z.object({
  object: z.literal("list"),
  data: z.array(apiCitationSchema),
  errors: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        error: z.string(),
      }),
    )
    .optional(),
  has_more: z.literal(false),
});

export type CitationBox = z.infer<typeof citationBoxSchema>;
export type CitationQualityGrade = z.infer<typeof citationQualityGradeSchema>;
export type CitationLocator = z.infer<typeof citationLocatorSchema>;
export type CitationCreateRequest = z.infer<typeof citationCreateRequestSchema>;
export type CitationBatchCreateRequest = z.infer<typeof citationBatchCreateRequestSchema>;
export type CitationLocation = z.infer<typeof citationLocationSchema>;
export type CitationEvidence = z.infer<typeof citationEvidenceSchema>;
export type ApiCitation = z.infer<typeof apiCitationSchema>;
export type CitationListResponse = z.infer<typeof citationListResponseSchema>;
