import { z } from "zod";

// -- Document types --

export const documentTypeSchema = z.enum([
  "pdf",
  "invoice",
  "financial_statement",
  "contract",
  "receipt",
  "other",
]);

export const documentStatusSchema = z.enum([
  "uploading",
  "processing",
  "completed",
  "failed",
]);

export const verificationStatusSchema = z.enum([
  "pending",
  "needs_review",
  "verified",
  "flagged",
]);

export const documentListItemSchema = z.object({
  uuid: z.string(),
  file_name: z.string(),
  gcs_path: z.string().nullable(),
  file_size: z.number().nullable(),
  upload_date: z.string(),
  thumbnail_url: z.string().nullable(),
  verification_status: z.string().optional(),
  verification_progress: z
    .object({
      totalPages: z.number().optional(),
      total: z.number().optional(),
      verified: z.number().optional(),
      flagged: z.number().optional(),
      pending: z.number().optional(),
      rejected: z.number().optional(),
    })
    .optional(),
  import_status: z.enum(["importing", "complete", "failed"]).optional(),
});

export const documentsResponseSchema = z.object({
  documents: documentListItemSchema.array(),
});

// -- Document Agent status --

export const documentAgentStatusSchema = z.object({
  documentId: z.string(),
  phase: z.string(),
  pagesTotal: z.number(),
  pagesCompleted: z.number(),
  totalNodes: z.number(),
  verifiedNodes: z.number(),
  failedNodes: z.number(),
  pendingNodes: z.number(),
  verificationPercent: z.number(),
  activeVendor: z.string().nullable(),
});

// -- Upload --

export const uploadResponseSchema = z.object({
  documentId: z.string(),
  phase: z.string(),
  pages: z.number().optional(),
  uploadedAt: z.string().optional(),
});

export const presignResponseSchema = z.object({
  docId: z.string(),
  uploadUrl: z.string(),
  r2Key: z.string(),
  fileName: z.string(),
  expiresIn: z.number(),
});

// -- Inferred types --

export type DocumentType = z.infer<typeof documentTypeSchema>;
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type DocumentListItem = z.infer<typeof documentListItemSchema>;
export type DocumentsResponse = z.infer<typeof documentsResponseSchema>;
export type DocumentAgentStatus = z.infer<typeof documentAgentStatusSchema>;
export type UploadResponse = z.infer<typeof uploadResponseSchema>;
export type PresignResponse = z.infer<typeof presignResponseSchema>;
