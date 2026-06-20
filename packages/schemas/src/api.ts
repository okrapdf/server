import { z } from "zod";

// -- Generic API response wrappers --

export const apiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

// -- Pagination (offset-based, simple) --

export const paginationParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z.object({
    items: itemSchema.array(),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    hasMore: z.boolean(),
  });

// -- Pagination (cursor-based, OpenAI-style) --
//
// Query:  GET /v1/documents?limit=20&after=doc-abc&order=desc
// Response: { data: [...], has_more: true }
//
// - `after` = last item ID from previous page (forward)
// - `before` = first item ID from previous page (backward)
// - `order` = sort by created_at
// - No total count (expensive on large sets)
// - `has_more` signals whether to fetch next page

export const cursorParamsSchema = z.object({
  /** Max items per page. */
  limit: z.number().int().min(1).max(100).default(20),
  /** Cursor: return items after this ID (forward pagination). */
  after: z.string().optional(),
  /** Cursor: return items before this ID (backward pagination). */
  before: z.string().optional(),
  /** Sort direction by created_at. */
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const cursorResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z.object({
    data: itemSchema.array(),
    has_more: z.boolean(),
  });

// -- Page image strategy --

export const pageImageStrategyInputSchema = z
  .enum(["none", "cover", "eager", "lazy"])
  .transform((value) => (value === "lazy" ? "eager" : value));

export const pageImageStrategySchema = z.enum(["none", "cover", "eager"]);

// -- Auth --

export const authVerifyResponseSchema = z.object({
  authenticated: z.literal(true),
  user_id: z.string(),
  key_id: z.string(),
  key_name: z.string(),
});

// -- Inferred types --

export type ApiError = z.infer<typeof apiErrorSchema>;
export type PaginationParams = z.infer<typeof paginationParamsSchema>;
export type CursorParams = z.infer<typeof cursorParamsSchema>;
export type PageImageStrategy = z.infer<typeof pageImageStrategySchema>;
export type AuthVerifyResponse = z.infer<typeof authVerifyResponseSchema>;
