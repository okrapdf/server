import { z } from "zod";
import { vendorCategorySchema } from "./vendor.js";
import {
  inputPortSchema,
  outputPortSchema,
  vendorOutputSchema,
} from "./vendor-plugin.js";

// ── Lineage record ────────────────────────────────────────────────────────────

export const lineageRecordSchema = z.object({
  id: z.string(),
  stepIndex: z.number(),
  vendorId: z.string(),
  category: vendorCategorySchema,
  input: z.object({
    ports: z.array(inputPortSchema),
    pdfSizeBytes: z.number().optional(),
    pageImageCount: z.number().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
  output: z.object({
    ports: z.array(outputPortSchema),
    success: z.boolean(),
    pageCount: z.number().optional(),
    blockCount: z.number().optional(),
    entityCount: z.number().optional(),
    costUsd: z.number().optional(),
    durationMs: z.number(),
    error: z.string().optional(),
    debugKeys: z.array(z.string()).optional(),
    model: z.string().optional(),
    hasRawPages: z.boolean().optional(),
  }),
  startedAt: z.number(),
  completedAt: z.number(),
  rawOutput: vendorOutputSchema.optional(),
});

// ── Pipeline config ───────────────────────────────────────────────────────────

export const pipelineStepSchema = z.object({
  category: vendorCategorySchema,
  vendorId: z.string().optional(),
  requiresCapability: z.string().optional(),
  optional: z.boolean().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const pipelineConfigSchema = z.object({
  name: z.string(),
  steps: z.array(pipelineStepSchema),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type LineageRecord = z.infer<typeof lineageRecordSchema>;
export type PipelineStep = z.infer<typeof pipelineStepSchema>;
export type PipelineConfig = z.infer<typeof pipelineConfigSchema>;
