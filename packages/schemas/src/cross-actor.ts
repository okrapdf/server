import { z } from "zod";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const financialDocTypeSchema = z.enum([
  "invoice",
  "purchase_order",
  "contract",
  "receipt",
  "statement",
  "tax_form",
  "unknown",
]);

export const claimTypeSchema = z.enum([
  "total_amount",
  "line_item",
  "tax_amount",
  "discount",
  "vendor_name",
  "date",
  "reference_number",
  "payment_terms",
  "quantity",
  "unit_price",
]);

// ── Verification claim ────────────────────────────────────────────────────────

export const verificationClaimSchema = z.object({
  sourceDocumentId: z.string(),
  sourceNodeId: z.string(),
  sourceDocumentType: financialDocTypeSchema,
  claimType: claimTypeSchema,
  fieldLabel: z.string(),
  value: z.string(),
  expectedCounterpartyType: financialDocTypeSchema.optional(),
  context: z
    .object({
      vendorName: z.string().optional(),
      invoiceNumber: z.string().optional(),
      poNumber: z.string().optional(),
      contractId: z.string().optional(),
      dateRange: z
        .object({ from: z.string(), to: z.string() })
        .optional(),
      lineItemDescription: z.string().optional(),
    })
    .optional(),
});

// ── Counterparty match ────────────────────────────────────────────────────────

export const counterpartyMatchSchema = z.object({
  nodeId: z.string(),
  label: z.string().nullable(),
  value: z.string(),
  confidence: z.number(),
  matchType: z.enum(["exact", "fuzzy", "semantic"]),
});

// ── Discrepancy ───────────────────────────────────────────────────────────────

export const discrepancySchema = z.object({
  field: z.string(),
  claimedValue: z.string(),
  counterpartyValue: z.string(),
  divergencePercent: z.number(),
  severity: z.enum(["info", "warning", "blocking"]),
  explanation: z.string(),
});

// ── Reconciliation result ─────────────────────────────────────────────────────

export const reconciliationResultSchema = z.object({
  counterpartyDocumentId: z.string(),
  status: z.enum([
    "corroborated",
    "disputed",
    "not_found",
    "partial_match",
    "error",
  ]),
  confidence: z.number(),
  matches: z.array(counterpartyMatchSchema),
  discrepancies: z.array(discrepancySchema),
  assessment: z.string(),
  timestamp: z.number(),
});

// ── Handshake record ──────────────────────────────────────────────────────────

export const handshakeRecordSchema = z.object({
  handshakeId: z.string(),
  initiatorDocumentId: z.string(),
  counterpartyDocumentId: z.string(),
  claim: verificationClaimSchema,
  result: reconciliationResultSchema,
  timestamp: z.number(),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type FinancialDocType = z.infer<typeof financialDocTypeSchema>;
export type ClaimType = z.infer<typeof claimTypeSchema>;
export type VerificationClaim = z.infer<typeof verificationClaimSchema>;
export type CounterpartyMatch = z.infer<typeof counterpartyMatchSchema>;
export type Discrepancy = z.infer<typeof discrepancySchema>;
export type ReconciliationResult = z.infer<typeof reconciliationResultSchema>;
export type HandshakeRecord = z.infer<typeof handshakeRecordSchema>;
