import { z } from "zod";

export const exportFormatSchema = z.enum([
  "markdown",
  "excel",
  "docx",
  "snapshot",
  "audit",
]);

// -- Excel preview --

export const tablePreviewSchema = z.object({
  pageNumber: z.number(),
  tableIndex: z.number(),
  headers: z.string().array(),
  rows: z.string().array().array(),
});

export const excelPreviewSheetSchema = z.object({
  name: z.string(),
  pageNumber: z.number(),
  tables: tablePreviewSchema.array(),
});

export const excelPreviewResponseSchema = z.object({
  sheets: excelPreviewSheetSchema.array(),
  totalTables: z.number(),
  fileName: z.string(),
});

// -- Docx preview --

export const docxPreviewPageSchema = z.object({
  pageNumber: z.number(),
  content: z.string(),
});

export const docxPreviewResponseSchema = z.object({
  pages: docxPreviewPageSchema.array(),
  totalPages: z.number(),
  fileName: z.string(),
});

// -- Markdown export --

export const markdownPageSchema = z.object({
  pageNumber: z.number(),
  content: z.string(),
  vendor: z.string().optional(),
});

// -- Audit export --

export const auditVerifyResponseSchema = z.object({
  version: z.string().optional(),
  documentLog: z.unknown(),
  vendorLog: z.unknown(),
});

// -- Inferred types --

export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type TablePreview = z.infer<typeof tablePreviewSchema>;
export type ExcelPreviewSheet = z.infer<typeof excelPreviewSheetSchema>;
export type ExcelPreviewResponse = z.infer<typeof excelPreviewResponseSchema>;
export type DocxPreviewPage = z.infer<typeof docxPreviewPageSchema>;
export type DocxPreviewResponse = z.infer<typeof docxPreviewResponseSchema>;
export type MarkdownPage = z.infer<typeof markdownPageSchema>;
export type AuditVerifyResponse = z.infer<typeof auditVerifyResponseSchema>;
