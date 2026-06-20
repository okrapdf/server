import { z } from "zod";

export const vendorTierSchema = z.enum(["fast", "standard", "premium"]);

export const vendorCategorySchema = z.enum([
  "ocr",
  "entity",
  "vlm",
  "projection",
]);

export const ocrVendorIdSchema = z.enum([
  "llamaparse",
  "aws_textract",
  "gemini",
  "pdfplumber",
  "docai",
  "qwen",
  "docling",
  "reducto",
  "unstructuredio",
]);

export type VendorTier = z.infer<typeof vendorTierSchema>;
export type VendorCategory = z.infer<typeof vendorCategorySchema>;
export type OcrVendorId = z.infer<typeof ocrVendorIdSchema>;
