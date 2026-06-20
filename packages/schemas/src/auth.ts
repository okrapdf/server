import { z } from "zod";

// ── WS auth ───────────────────────────────────────────────────────────────────

export const resourceTypeSchema = z.enum([
  "task",
  "session",
  "canvas",
  "document",
]);

export const wsTokenPayloadSchema = z.object({
  userId: z.string(),
  resourceId: z.string(),
  resourceType: resourceTypeSchema,
  expiry: z.number(),
});

export const wsTokenResultSchema = z.object({
  valid: z.boolean(),
  payload: wsTokenPayloadSchema.optional(),
  error: z.string().optional(),
});

// ── Share route ───────────────────────────────────────────────────────────────

export const shareRouteRoleSchema = z.enum(["admin", "viewer", "public"]);

// ── Inferred types ────────────────────────────────────────────────────────────

export type ResourceType = z.infer<typeof resourceTypeSchema>;
export type WsTokenPayload = z.infer<typeof wsTokenPayloadSchema>;
export type WsTokenResult = z.infer<typeof wsTokenResultSchema>;
export type ShareRouteRole = z.infer<typeof shareRouteRoleSchema>;
