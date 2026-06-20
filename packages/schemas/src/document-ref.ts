import { z } from "zod";
import { bboxSchema } from "./bbox.js";

/**
 * Vendor-agnostic reference to a location within a document.
 * The minimum citation anchor: documentId + page.
 * Optional bbox for sub-page precision (when vendor provides it).
 * Optional nodeId for internal back-reference (opaque — never parsed).
 */
export const docLocationSchema = z.object({
  /** Document identifier */
  documentId: z.string().min(1),
  /** 1-indexed page number */
  page: z.number().int().positive(),
  /** Normalized 0-1 bounding box (optional, vendor-dependent) */
  bbox: bboxSchema.optional(),
  /** Opaque internal node ID for back-reference (optional) */
  nodeId: z.string().optional(),
  /** Block type at this reference (text, table, header, etc.) */
  type: z.string().optional(),
  /** Text snippet for fuzzy matching / display (optional) */
  snippet: z.string().optional(),
});

export type DocLocation = z.infer<typeof docLocationSchema>;

/**
 * Citation: a DocLocation with a source label for LLM responses.
 * The LLM emits [source:N], post-processing maps N → Citation.
 */
export const citationSchema = z.object({
  /** Source index as used in LLM prompt/response (1-indexed) */
  sourceIndex: z.number().int().positive(),
  /** The location this citation points to */
  ref: docLocationSchema,
  /** Human-readable label (e.g., "Page 54, Income Statement") */
  label: z.string().optional(),
});

export type Citation = z.infer<typeof citationSchema>;

/**
 * A cited response: text + extracted citations.
 * Emitted by DocumentAgent after LLM response post-processing.
 */
export const citedResponseSchema = z.object({
  /** Response text (may contain [source:N] markers) */
  text: z.string(),
  /** Extracted citations mapped from [source:N] references */
  citations: citationSchema.array(),
});

export type CitedResponse = z.infer<typeof citedResponseSchema>;
