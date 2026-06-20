import { z } from "zod";

/**
 * OpenCode Dispatch Protocol
 *
 * Deprecated canonical location:
 *   packages/protocol/src/opencode.ts
 *
 * Canonical wire-format contract for the OpenCode `serve` HTTP API.
 * Both iOS (OpenCodeDispatchClient) and desktop-swift (OpenCodeServerBridge)
 * parse this format — changes here must be reflected in both Swift impls.
 *
 * Endpoints covered:
 *   GET  /global/health
 *   POST /session
 *   POST /session/:id/prompt_async
 *   GET  /session/:id/message?limit=N
 */

// ---------------------------------------------------------------------------
// Wire format — what OpenCode returns from GET /session/:id/message
// ---------------------------------------------------------------------------

export const openCodePartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
});

export type OpenCodePart = z.infer<typeof openCodePartSchema>;

/** Part types that should be rendered as user-visible content. */
export const RENDERABLE_PART_TYPES = ["text", "reasoning"] as const;

export const openCodeMessageTimeSchema = z.object({
  created: z.number().optional(),
});

export const openCodeMessageInfoSchema = z.object({
  id: z.string(),
  role: z.string(),
  time: openCodeMessageTimeSchema.optional(),
});

export const openCodeWireMessageSchema = z.object({
  info: openCodeMessageInfoSchema,
  parts: z.array(openCodePartSchema).optional(),
});

export type OpenCodeWireMessage = z.infer<typeof openCodeWireMessageSchema>;

/** Full response from GET /session/:id/message */
export const openCodeMessageListResponseSchema = z.array(
  openCodeWireMessageSchema
);

// ---------------------------------------------------------------------------
// Parsed format — the normalized shape both clients should produce
// ---------------------------------------------------------------------------

export const openCodeParsedMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.string().min(1),
  createdAt: z.number(),
});

export type OpenCodeParsedMessage = z.infer<typeof openCodeParsedMessageSchema>;

// ---------------------------------------------------------------------------
// Parse function — canonical implementation both Swift clients must match
// ---------------------------------------------------------------------------

/**
 * Parse raw OpenCode wire messages into the normalized format.
 *
 * Rules (must be identical in iOS and desktop-swift):
 * 1. Extract id, role from info
 * 2. Extract createdAt from info.time.created (default 0)
 * 3. Collect text from parts where type ∈ RENDERABLE_PART_TYPES
 * 4. Trim each part's text, drop empty strings
 * 5. Join with "\n"
 * 6. Drop messages with empty content
 * 7. Sort by createdAt ASC, then id ASC for ties
 */
export function parseOpenCodeMessages(
  wire: OpenCodeWireMessage[]
): OpenCodeParsedMessage[] {
  const parsed = wire
    .map((msg) => {
      const { id, role, time } = msg.info;
      const createdAt = time?.created ?? 0;

      const parts = msg.parts ?? [];
      const content = parts
        .filter((p) =>
          (RENDERABLE_PART_TYPES as readonly string[]).includes(p.type)
        )
        .map((p) => (p.text ?? "").trim())
        .filter((t) => t.length > 0)
        .join("\n");

      if (!content) return null;
      return { id, role, content, createdAt };
    })
    .filter((m): m is OpenCodeParsedMessage => m !== null);

  return parsed.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Prompt request — POST /session/:id/prompt_async
// ---------------------------------------------------------------------------

export const openCodePromptPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
});

export const openCodePromptRequestSchema = z.object({
  system: z.string().optional(),
  parts: z.array(openCodePromptPartSchema).min(1),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
  variant: z.string().optional(),
});

export type OpenCodePromptRequest = z.infer<typeof openCodePromptRequestSchema>;

// ---------------------------------------------------------------------------
// Session create — POST /session
// ---------------------------------------------------------------------------

export const openCodeSessionCreateRequestSchema = z.object({
  title: z.string().min(1),
});

export const openCodeSessionCreateResponseSchema = z.object({
  id: z.string().min(1),
});

export type OpenCodeSessionCreateResponse = z.infer<
  typeof openCodeSessionCreateResponseSchema
>;
