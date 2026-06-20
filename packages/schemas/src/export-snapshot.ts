import { z } from "zod";
import { canonicalBlockSchema } from "./entity.js";
import {
  tablePreviewSchema,
  docxPreviewPageSchema,
  excelPreviewSheetSchema,
} from "./export.js";

// ── Snapshot page (detection metadata) ────────────────────────────────────────

export const snapshotPageSchema = z.object({
  pageNumber: z.number(),
  blocks: z.array(canonicalBlockSchema),
  detection: z.object({
    vendor: z.string(),
    pass: z.number(),
    confidence: z.number().nullable(),
  }),
});

// ── Export snapshot (v1 schema) ───────────────────────────────────────────────

export const exportSnapshotSchema = z.object({
  version: z.literal(1),
  documentId: z.string(),
  fileName: z.string().nullable(),
  provenance: z.object({
    vendor: z.string(),
    chainHead: z.string().nullable(),
    pdfSha256: z.string().nullable(),
    snapshotAt: z.string(),
    snapshotDigest: z.string(),
  }),
  pages: z.array(snapshotPageSchema),
  pageCount: z.number(),
});

// ── Audit snapshot ────────────────────────────────────────────────────────────

export const auditSnapshotSchema = z.object({
  version: z.literal(1),
  documentId: z.string(),
  pdfSha256: z.string().nullable(),
  snapshotAt: z.string(),
  chains: z.object({
    documentLog: z.object({
      head: z.string().nullable(),
      entries: z.number(),
    }),
    vendorLog: z.object({
      head: z.string().nullable(),
      entries: z.number(),
    }),
  }),
  tables: z.record(z.string(), z.array(z.unknown())),
});

// ── Pre-formatted export shapes ───────────────────────────────────────────────

export const preFormattedMarkdownSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number(),
      content: z.string(),
      vendor: z.string(),
    }),
  ),
  pageCount: z.number(),
});

export const preFormattedExcelSchema = z.object({
  sheets: z.array(excelPreviewSheetSchema),
  totalTables: z.number(),
});

export const preFormattedDocxSchema = z.object({
  pages: z.array(docxPreviewPageSchema),
  totalPages: z.number(),
});

// ── Vendor export result ──────────────────────────────────────────────────────

export const vendorExportResultSchema = z.object({
  markdown: z.array(docxPreviewPageSchema),
  tables: z.array(tablePreviewSchema),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type SnapshotPage = z.infer<typeof snapshotPageSchema>;
export type ExportSnapshot = z.infer<typeof exportSnapshotSchema>;
export type AuditSnapshot = z.infer<typeof auditSnapshotSchema>;
export type PreFormattedMarkdown = z.infer<typeof preFormattedMarkdownSchema>;
export type PreFormattedExcel = z.infer<typeof preFormattedExcelSchema>;
export type PreFormattedDocx = z.infer<typeof preFormattedDocxSchema>;
export type VendorExportResult = z.infer<typeof vendorExportResultSchema>;
