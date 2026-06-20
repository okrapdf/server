/**
 * Collection Query — NDJSON event stream types.
 *
 * Streamed as newline-delimited JSON (application/x-ndjson).
 * Each line is one of: StartEvent | TextDeltaEvent | ResultEvent | DoneEvent | ErrorEvent.
 *
 * Usage:
 *   import { CollectionQueryEvent, parseCollectionQueryEvent } from '@okrapdf/schemas';
 */

import { z } from "zod";

// ── Individual event schemas ─────────────────────────────────────────────────

export const collectionQueryStartEvent = z.object({
  type: z.literal("start"),
  query_id: z.string(),
  prompt: z.string(),
  doc_count: z.number().int(),
});

/** Streaming text chunk for a single document within the fan-out. */
export const collectionQueryTextDeltaEvent = z.object({
  type: z.literal("text_delta"),
  query_id: z.string(),
  doc_id: z.string(),
  text: z.string(),
});

export const collectionQueryResultEvent = z.object({
  type: z.literal("result"),
  query_id: z.string(),
  doc_id: z.string(),
  status: z.enum(["fulfilled", "failed", "timeout"]),
  answer: z.string(),
  error: z.string().optional(),
  /** Structured extraction output when query included a schema. */
  data: z.record(z.string(), z.unknown()).optional(),
  usage: z.object({
    cost_usd: z.number(),
  }),
  duration_ms: z.number(),
});

export const collectionQueryDoneEvent = z.object({
  type: z.literal("done"),
  query_id: z.string(),
  completed: z.number().int(),
  failed: z.number().int(),
  total_cost_usd: z.number(),
});

export const collectionQueryErrorEvent = z.object({
  type: z.literal("error"),
  query_id: z.string(),
  error: z.string(),
});

// ── Discriminated union ──────────────────────────────────────────────────────

export const collectionQueryEvent = z.discriminatedUnion("type", [
  collectionQueryStartEvent,
  collectionQueryTextDeltaEvent,
  collectionQueryResultEvent,
  collectionQueryDoneEvent,
  collectionQueryErrorEvent,
]);

// ── Inferred types ───────────────────────────────────────────────────────────

export type CollectionQueryStartEvent = z.infer<typeof collectionQueryStartEvent>;
export type CollectionQueryTextDeltaEvent = z.infer<typeof collectionQueryTextDeltaEvent>;
export type CollectionQueryResultEvent = z.infer<typeof collectionQueryResultEvent>;
export type CollectionQueryDoneEvent = z.infer<typeof collectionQueryDoneEvent>;
export type CollectionQueryErrorEvent = z.infer<typeof collectionQueryErrorEvent>;
export type CollectionQueryEvent = z.infer<typeof collectionQueryEvent>;

// ── Parse helper ─────────────────────────────────────────────────────────────

/** Parse a single NDJSON line into a typed event. Returns null on parse failure. */
export function parseCollectionQueryEvent(line: string): CollectionQueryEvent | null {
  try {
    const parsed = JSON.parse(line);
    const result = collectionQueryEvent.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
