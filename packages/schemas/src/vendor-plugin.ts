import { z } from "zod";
import { vendorTierSchema, vendorCategorySchema } from "./vendor.js";
import { canonicalParseResultSchema, canonicalEntityMetadataSchema } from "./entity.js";

// ── Ports ─────────────────────────────────────────────────────────────────────

export const inputPortSchema = z.enum([
  "pdf-bytes",
  "page-images",
  "nodes-json",
  "gcs-prefix",
]);

export const outputPortSchema = z.enum([
  "parsed-result",
  "entity-metadata",
  "projection-receipt",
]);

// ── Vendor Spec ───────────────────────────────────────────────────────────────

export const vendorPropertySchema = z.object({
  name: z.string(),
  displayName: z.string(),
  type: z.enum(["string", "number", "boolean", "options"]),
  default: z.unknown(),
  description: z.string().optional(),
  options: z
    .array(
      z.object({
        name: z.string(),
        value: z.union([z.string(), z.number(), z.boolean()]),
      }),
    )
    .optional(),
});

// ── Completion Strategies ─────────────────────────────────────────────────────
// Inspired by PostHog's HogFunctionTemplate (declarative connector spec)
// and Unstructured's 4-role decomposition (Indexer → Downloader → Stager → Uploader).
//
// Each vendor declares HOW it completes async work:
//   sync     — blocking call, result returned inline
//   poll     — submit job, poll status endpoint until done
//   webhook  — submit job with callback URL, vendor POSTs result back

export const syncStrategySchema = z.object({
  type: z.literal("sync"),
});

export const pollStrategySchema = z.object({
  type: z.literal("poll"),
  initialDelayMs: z.number(),
  maxDelayMs: z.number(),
  backoffMultiplier: z.number(),
});

export const webhookStrategySchema = z.object({
  type: z.literal("webhook"),
  /** Events the vendor can fire, e.g. ["parse.success", "parse.failed"] */
  events: z.array(z.string()).optional(),
  /** Whether vendor accepts custom headers on callback (for auth/signing) */
  supportsHeaders: z.boolean().default(false),
  /** "full" = result inline in POST body; "notification" = just a signal, fetch result separately */
  payloadStyle: z.enum(["full", "notification"]).default("full"),
});

export const completionStrategySchema = z.discriminatedUnion("type", [
  syncStrategySchema,
  pollStrategySchema,
  webhookStrategySchema,
]);

// ── Vendor Spec ───────────────────────────────────────────────────────────────

export const vendorSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  tier: vendorTierSchema,
  category: vendorCategorySchema,
  requiredEnvKeys: z.array(z.string()),
  inputs: z.array(inputPortSchema),
  outputs: z.array(outputPortSchema),
  properties: z.array(vendorPropertySchema),
  /** Vendors can support multiple strategies (e.g. LlamaParse supports both poll and webhook) */
  completionStrategies: z.array(completionStrategySchema).min(1),
  bestFor: z.array(z.string()).optional(),
  supportsRegionExtract: z.boolean().optional(),
  hooks: z.array(z.string()).optional(),
});

// ── Vendor Input ──────────────────────────────────────────────────────────────

export const vendorContextSchema = z.object({
  documentId: z.string(),
  fileName: z.string().optional(),
  pageCount: z.number().optional(),
  phase: z.string().optional(),
});

export const vendorInputSchema = z.object({
  pdfBytes: z.instanceof(ArrayBuffer).optional(),
  pageImageUrls: z.record(z.coerce.number(), z.string()).optional(),
  nodesJson: z.string().optional(),
  gcsPrefix: z.string().optional(),
  totalPages: z.number().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  context: vendorContextSchema.optional(),
});

// ── Vendor Output ─────────────────────────────────────────────────────────────

export const vendorUsageSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  actualModelId: z.string().optional(),
  parserProfile: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  costUsd: z.number().optional(),
  costEstimated: z.boolean().optional(),
  currency: z.string().optional(),
});

export const vendorOutputSchema = z.object({
  parsedResult: canonicalParseResultSchema.optional(),
  entityMetadata: z
    .record(z.coerce.number(), canonicalEntityMetadataSchema)
    .optional(),
  projectionReceipt: z
    .object({
      externalId: z.string().optional(),
      rowsAffected: z.number().optional(),
    })
    .optional(),
  costUsd: z.number().optional(),
  durationMs: z.number(),
  usage: vendorUsageSchema.optional(),
  debug: z.record(z.string(), z.unknown()).optional(),
  rawPages: z
    .array(
      z.object({
        pageNumber: z.number(),
        raw: z.unknown(),
      }),
    )
    .optional(),
});

// ── Async: Job Handle + Poll Result ──────────────────────────────────────────

export const vendorJobHandleSchema = z.object({
  vendorJobId: z.string(),
  vendorId: z.string(),
  submittedAt: z.number(),
  /** Which strategy was used to submit this job */
  strategy: z.enum(["poll", "webhook"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const vendorPollResultSchema = z.object({
  done: z.boolean(),
  output: vendorOutputSchema.optional(),
  retryAfterMs: z.number().optional(),
});

// ── Webhook Callback ─────────────────────────────────────────────────────────
// The normalized shape we store when a vendor webhook hits our endpoint.
// Each vendor adapter normalizes its raw POST body into this shape.

export const webhookEventSchema = z.enum([
  "parse.success",
  "parse.failed",
  "parse.progress",
]);

export const vendorWebhookPayloadSchema = z.object({
  vendorId: z.string(),
  vendorJobId: z.string(),
  documentId: z.string(),
  event: webhookEventSchema,
  /** Present when payloadStyle=full and event=parse.success */
  output: vendorOutputSchema.optional(),
  /** Present when payloadStyle=notification — URL to fetch result from */
  resultUrl: z.string().optional(),
  /** Error message when event=parse.failed */
  error: z.string().optional(),
  /** Vendor-reported progress (0-1) when event=parse.progress */
  progress: z.number().min(0).max(1).optional(),
  receivedAt: z.number(),
  raw: z.unknown().optional(),
});

// ── Webhook Registration ─────────────────────────────────────────────────────
// Config we send TO the vendor when submitting a job with webhook strategy.

export const webhookRegistrationSchema = z.object({
  callbackUrl: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  events: z.array(webhookEventSchema).optional(),
  /** Opaque token we embed in the callback URL or headers for verification */
  secret: z.string().optional(),
});

// ── Parse options ─────────────────────────────────────────────────────────────

export const parseOptionsSchema = z.object({
  pageRange: z
    .object({ start: z.number(), end: z.number() })
    .optional(),
  regionExtract: z.boolean().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  /** Override default completion strategy for this job */
  preferredStrategy: z.enum(["sync", "poll", "webhook"]).optional(),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type InputPort = z.infer<typeof inputPortSchema>;
export type OutputPort = z.infer<typeof outputPortSchema>;
export type VendorProperty = z.infer<typeof vendorPropertySchema>;
export type SyncStrategy = z.infer<typeof syncStrategySchema>;
export type PollStrategy = z.infer<typeof pollStrategySchema>;
export type WebhookStrategy = z.infer<typeof webhookStrategySchema>;
export type CompletionStrategy = z.infer<typeof completionStrategySchema>;
export type VendorSpec = z.infer<typeof vendorSpecSchema>;
export type VendorContext = z.infer<typeof vendorContextSchema>;
export type VendorInput = z.infer<typeof vendorInputSchema>;
export type VendorOutput = z.infer<typeof vendorOutputSchema>;
export type VendorJobHandle = z.infer<typeof vendorJobHandleSchema>;
export type VendorPollResult = z.infer<typeof vendorPollResultSchema>;
export type WebhookEvent = z.infer<typeof webhookEventSchema>;
export type VendorWebhookPayload = z.infer<typeof vendorWebhookPayloadSchema>;
export type WebhookRegistration = z.infer<typeof webhookRegistrationSchema>;
export type ParseOptions = z.infer<typeof parseOptionsSchema>;
