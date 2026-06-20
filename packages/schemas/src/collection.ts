/**
 * Collection — shared schemas for collection-level operations.
 *
 * Two call shapes:
 *   query()   — map-reduce: fan-out prompt → N docs → N independent answers (NDJSON)
 *   stream()  — ai-sdk completions: collection-as-model → 1 synthesized answer (OpenAI SSE)
 */

import { z } from "zod";

// ── Collection ID ────────────────────────────────────────────────────────────

/** Collection identifier: `col-{hex}` */
export const collectionIdSchema = z.string().regex(
  /^col-[a-f0-9]{32}$/,
  "Collection ID must match col-{32 hex chars}",
);

export type CollectionId = z.infer<typeof collectionIdSchema>;

// ── Query request (map-reduce path) ─────────────────────────────────────────

export const collectionQueryRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  /** Stream NDJSON events as results arrive. Default: true. */
  stream: z.boolean().default(true),
  /** JSON Schema for structured extraction per document. When present, each
   *  doc result includes a `data` field matching this schema. */
  schema: z.record(z.string(), z.unknown()).optional(),
  /** Subset of document IDs to query. Omit to query all docs in collection. */
  doc_ids: z.string().array().optional(),
});

export type CollectionQueryRequest = z.infer<typeof collectionQueryRequestSchema>;

// ── Completions request (ai-sdk path) ───────────────────────────────────────
// Follows OpenAI /chat/completions wire format so it can be used as an
// AI SDK model provider without transformation.

export const collectionCompletionMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const collectionCompletionsRequestSchema = z.object({
  messages: collectionCompletionMessageSchema.array().min(1),
  /** Model to use for synthesis. */
  model: z.string().optional(),
  stream: z.boolean().default(false),
  /** Limit retrieval to these document IDs. */
  doc_ids: z.string().array().optional(),
  /** Max tokens in the synthesized response. */
  max_tokens: z.number().int().positive().optional(),
});

export type CollectionCompletionMessage = z.infer<typeof collectionCompletionMessageSchema>;
export type CollectionCompletionsRequest = z.infer<typeof collectionCompletionsRequestSchema>;

// ── Completions response (non-streaming) ────────────────────────────────────
// Mirrors OpenAI chat.completion shape.

export const collectionCompletionsResponseSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    message: z.object({
      role: z.literal("assistant"),
      content: z.string(),
    }),
    finish_reason: z.enum(["stop", "length"]),
  })),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }).optional(),
  /** Document IDs that contributed to the response. */
  sources: z.array(z.object({
    doc_id: z.string(),
    page: z.number().int().optional(),
    snippet: z.string().optional(),
  })).optional(),
});

export type CollectionCompletionsResponse = z.infer<typeof collectionCompletionsResponseSchema>;

// ── Extraction Schema ─────────���─────────────────────────────────────────────
// Declared field types that drive structured extraction, UI rendering, and SDK
// type hints. Stored as JSON on the collection. Inspired by emdash-cms schema
// pattern: define once, extract from every document.

export const extractionFieldType = z.enum([
  "string",
  "number",
  "currency",
  "percentage",
  "date",
  "boolean",
  "array",
  "enum",
]);

export type ExtractionFieldType = z.infer<typeof extractionFieldType>;

export const extractionFieldSchema = z.object({
  /** Machine-readable key (snake_case). Becomes property name in JSON output. */
  key: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
  /** Human-readable label. e.g. "Total Revenue" */
  label: z.string().min(1).max(128),
  /** Field type — drives JSON Schema generation and UI rendering. */
  type: extractionFieldType,
  /** Extraction hint for the LLM. e.g. "Total revenue for the fiscal year" */
  description: z.string().max(500).optional(),
  /** Must be present in extraction output. Default: true. */
  required: z.boolean().default(true),
  /** For "enum" type: allowed values. */
  enum_values: z.array(z.string().min(1)).optional(),
  /** For "currency" type: expected currency code (e.g. "USD"). LLM infers if omitted. */
  currency_code: z.string().length(3).optional(),
  /** Display order (0-indexed). */
  order: z.number().int().min(0).optional(),
});

export type ExtractionField = z.infer<typeof extractionFieldSchema>;

export const collectionExtractionSchema = z.object({
  /** Stable ID for referencing this schema in queries and execute code. */
  id: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/),
  /** Schema format version. Always 1 for now. */
  version: z.literal(1).default(1),
  /** Human-readable name. e.g. "10-K Financial Summary" */
  name: z.string().min(1).max(128),
  /** Optional description. */
  description: z.string().max(500).optional(),
  /** Ordered list of fields to extract. 1-50 fields. */
  fields: z.array(extractionFieldSchema).min(1).max(50),
});

export type CollectionExtractionSchema = z.infer<typeof collectionExtractionSchema>;

/** Array of extraction schemas stored on a collection. Max 20 schemas. */
export const collectionExtractionSchemasArray = z.array(collectionExtractionSchema).max(20);

export type CollectionExtractionSchemasArray = z.infer<typeof collectionExtractionSchemasArray>;

// ── JSON Schema converter ───────────��───────────────────────────────────────

function fieldToJsonSchemaProperty(field: ExtractionField): Record<string, unknown> {
  const desc = field.description;
  switch (field.type) {
    case "string":
      return { type: "string", ...(desc && { description: desc }) };
    case "number":
      return { type: "number", ...(desc && { description: desc }) };
    case "currency": {
      const currDesc = desc || (field.currency_code ? `Currency amount in ${field.currency_code}` : "Currency amount");
      return {
        type: "object",
        description: currDesc,
        properties: {
          value: { type: "number" },
          currency: { type: "string", ...(field.currency_code && { default: field.currency_code }) },
        },
        required: ["value", "currency"],
        additionalProperties: false,
      };
    }
    case "percentage":
      return { type: "number", minimum: 0, maximum: 100, ...(desc && { description: desc }) };
    case "date":
      return { type: "string", format: "date", ...(desc && { description: desc }) };
    case "boolean":
      return { type: "boolean", ...(desc && { description: desc }) };
    case "array":
      return { type: "array", items: { type: "string" }, ...(desc && { description: desc }) };
    case "enum":
      return {
        type: "string",
        ...(field.enum_values?.length && { enum: field.enum_values }),
        ...(desc && { description: desc }),
      };
  }
}

/** Convert a CollectionExtractionSchema to an OpenAI-compatible JSON Schema
 *  suitable for `response_format.json_schema.schema`. */
export function extractionSchemaToJsonSchema(
  schema: CollectionExtractionSchema,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of schema.fields) {
    properties[field.key] = fieldToJsonSchemaProperty(field);
    if (field.required !== false) {
      required.push(field.key);
    }
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}
