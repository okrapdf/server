import type { PageLocationCitation } from '../types';

export type LocalDocumentStatus = 'processing' | 'ready' | 'failed';

export interface LocalToolAvailability {
  available: boolean;
  path: string | null;
}

export interface LocalDocumentExtractor {
  pdftotext: LocalToolAvailability;
  pdfinfo: LocalToolAvailability;
  pdftoppm: LocalToolAvailability;
  tesseract: LocalToolAvailability;
  ocrUsed: boolean;
}

export interface LocalDocumentPageRecord {
  pageNumber: number;
  textPath: string;
  charCount: number;
  excerpt: string;
  ocrApplied: boolean;
}

export interface LocalDocumentRecord {
  documentId: string;
  filename: string;
  storedPath: string;
  sourcePath: string;
  status: LocalDocumentStatus;
  pageCount: number;
  charCount: number;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  extractor: LocalDocumentExtractor;
  pages: LocalDocumentPageRecord[];
}

/**
 * Self-host citations use the same Anthropic `page_location` shape as the cloud
 * surfaces (M-CITE / #580) — "one citation shape everywhere". `citation_url`
 * points at the stored source PDF at the cited page (`file://…#page=N`), the
 * honest local proof; no `bbox` (the text-only local path has no element boxes).
 */
export type LocalCitation = PageLocationCitation;

export interface LocalTableCandidate {
  page: number;
  preview: string;
  rowCount: number;
  score?: number;
}

export interface LocalDoctorReport {
  ok: boolean;
  dataDir: string;
  tools: {
    pdftotext: LocalToolAvailability;
    pdfinfo: LocalToolAvailability;
    pdftoppm: LocalToolAvailability;
    tesseract: LocalToolAvailability;
  };
}

