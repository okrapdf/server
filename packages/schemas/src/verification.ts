import { z } from "zod";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const verificationTierSchema = z.enum([
  "bronze",
  "silver",
  "gold",
  "platinum",
]);

// ── Materiality config ────────────────────────────────────────────────────────

export const materialityConfigSchema = z.object({
  tier: verificationTierSchema,
  requiredPaths: z.number(),
  requireHumanSignoff: z.boolean(),
  maxAutoRetries: z.number(),
  toleranceCents: z.number(),
});

// ── Path results ──────────────────────────────────────────────────────────────

export const pathResultSchema = z.object({
  pathId: z.string(),
  pathType: z.enum(["semantic", "deterministic", "cross_actor", "human"]),
  value: z.string(),
  confidence: z.number(),
  source: z.string(),
  timestamp: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── Conflict diff ─────────────────────────────────────────────────────────────

export const conflictAttemptSchema = z.object({
  attemptNumber: z.number(),
  pathAValue: z.string().nullable(),
  pathBValue: z.string().nullable(),
  divergenceCents: z.number().nullable(),
  error: z.string().nullable(),
  timestamp: z.number(),
});

export const conflictDiffSchema = z.object({
  nodeId: z.string(),
  attempts: z.array(conflictAttemptSchema),
  recommendation: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
});

// ── Dual-path result ──────────────────────────────────────────────────────────

export const dualPathResultSchema = z.object({
  semanticValue: z.string().nullable(),
  deterministicValue: z.string().nullable(),
  divergence: z.number().nullable(),
  converged: z.boolean(),
  paths: z.array(pathResultSchema),
  locked: z.boolean(),
  conflictDiff: conflictDiffSchema.optional(),
});

// ── Causal lineage ────────────────────────────────────────────────────────────

export const causalLineageSchema = z.object({
  source: z.string(),
  extractionModel: z.string(),
  validationLogic: z.string(),
  sandboxScriptId: z.string(),
  verificationTier: verificationTierSchema,
  pathResults: z.array(pathResultSchema),
  crossActorRefs: z.array(z.string()),
  timestamp: z.number(),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type VerificationTier = z.infer<typeof verificationTierSchema>;
export type MaterialityConfig = z.infer<typeof materialityConfigSchema>;
export type PathResult = z.infer<typeof pathResultSchema>;
export type ConflictAttempt = z.infer<typeof conflictAttemptSchema>;
export type ConflictDiff = z.infer<typeof conflictDiffSchema>;
export type DualPathResult = z.infer<typeof dualPathResultSchema>;
export type CausalLineage = z.infer<typeof causalLineageSchema>;
