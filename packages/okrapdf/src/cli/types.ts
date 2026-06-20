/**
 * CLI Types for okraPDF Review Operations
 *
 * These types mirror the review page UI interactions:
 * - Left panel: Document tree (verification status, entity counts)
 * - Middle panel: PDF viewer (entities, overlays)
 * - Right panel: Page content (markdown, versions)
 */

// ============================================================================
// Verification Tree Types (Left Panel)
// ============================================================================

export type VerificationPageStatus =
  | 'complete'    // All entities verified
  | 'partial'     // Some entities verified
  | 'flagged'     // Has flagged items
  | 'pending'     // Has entities but none verified
  | 'empty'       // No entities
  | 'gap'         // OCR content but no entities (needs attention)
  | 'error';      // Verification error

export interface VerificationTreePage {
  page: number;
  status: VerificationPageStatus;
  total: number;
  verified: number;
  pending: number;
  flagged: number;
  rejected: number;
  avgConfidence: number;
  hasOcr: boolean;
  ocrLineCount: number;
  hasCoverageGaps: boolean;
  uncoveredCount: number;
  resolution: string | null;
  classification: string | null;
  isStale: boolean;
}

export interface VerificationTreeSummary {
  complete: number;
  partial: number;
  flagged: number;
  pending: number;
  empty: number;
  gap: number;
  resolved?: number;
  stale?: number;
}

export interface VerificationTree {
  jobId: string;
  documentId: string;
  totalPages: number;
  summary: VerificationTreeSummary;
  pages: VerificationTreePage[];
}

// ============================================================================
// Entity Types (Middle Panel - jQuery-like selectors)
// ============================================================================

export type EntityType = 'table' | 'figure' | 'footnote' | 'summary' | 'signature' | 'paragraph';

export interface EntityBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Entity {
  id: string;
  type: EntityType;
  title: string | null;
  page: number;
  schema?: string[];
  isComplete?: boolean;
  bbox?: EntityBBox;
  confidence?: number;
  verificationStatus?: 'pending' | 'verified' | 'flagged' | 'rejected';
}

export interface EntitiesResponse {
  jobId: string;
  entities: Entity[];
  counts: {
    tables: number;
    figures: number;
    footnotes: number;
    summaries: number;
    signatures?: number;
  };
  extractionStatus?: 'not_started' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  totalPages?: number;
}

// ============================================================================
// Page Content Types (Right Panel)
// ============================================================================

export interface TextBlock {
  text: string;
  bbox?: EntityBBox;
  confidence?: number;
}

export interface PageDimension {
  width: number | null;
  height: number | null;
}

export interface PageContent {
  page: number;
  content: string;
  version?: number;
  blocks?: TextBlock[];
  dimension?: PageDimension | null;
}

export interface PageVersionInfo {
  version: number;
  editSource: 'ocr_extraction' | 'user_edit' | 'ai_correction';
  createdAt: string | null;
  preview: string;
}

export interface PageVersionsResponse {
  page: number;
  currentVersion: number;
  versions: PageVersionInfo[];
}

// ============================================================================
// Table Types
// ============================================================================

export interface Table {
  id: string;
  pageNumber: number;
  markdown: string;
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number };
  confidence: number | null;
  verificationStatus: 'pending' | 'verified' | 'flagged' | 'rejected';
  verifiedBy: string | null;
  verifiedAt: string | null;
  wasCorrected?: boolean;
  createdAt: string;
}

export interface TablesResponse {
  tables: Table[];
  source: 'job_id' | 'document_uuid';
}

// ============================================================================
// Search Types
// ============================================================================

export type MatchSource = 'content' | 'table_title' | 'table_schema' | 'table_row' | 'figure' | 'footnote' | 'summary' | 'signature' | 'paragraph';

export interface SearchResult {
  page: number;
  snippet: string;
  matchCount: number;
  matchSource?: MatchSource;
}

export interface SearchResponse {
  query: string;
  totalMatches: number;
  results: SearchResult[];
}

// ============================================================================
// History Types
// ============================================================================

export interface HistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  state: string;
  previousState: string | null;
  transitionName: string | null;
  triggeredBy: string | null;
  triggeredByName: string | null;
  reason: string | null;
  resolution: string | null;
  classification: string | null;
  pageNum: number | null;
  createdAt: string;
}

export interface HistoryResponse {
  history: HistoryEntry[];
}

// ============================================================================
// CLI Command Types
// ============================================================================

export type OutputFormat = 'text' | 'json' | 'markdown';

export interface TreeOptions {
  status?: VerificationPageStatus;
  entity?: EntityType;
  format?: OutputFormat;
}

export interface FindOptions {
  selector: string;
  topK?: number;
  minConfidence?: number;
  pageRange?: [number, number];
  sortBy?: 'confidence' | 'page' | 'type';
  stats?: boolean;
  format?: OutputFormat;
}

export interface PageGetOptions {
  format?: OutputFormat;
  version?: number;
}

export interface PageResolveOptions {
  resolution: string;
  classification?: string;
  reason?: string;
}

export interface SearchOptions {
  format?: OutputFormat;
  limit?: number;
}

export interface TablesOptions {
  page?: number;
  status?: 'pending' | 'verified' | 'flagged' | 'rejected';
  format?: OutputFormat;
}

export interface HistoryOptions {
  limit?: number;
  format?: OutputFormat;
}

// ============================================================================
// Query Engine Types (jQuery-like API)
// ============================================================================

export interface QueryConfig {
  selector: string;
  topK?: number;
  minConfidence?: number;
  pageRange?: [number, number];
  sortBy?: 'confidence' | 'page' | 'type';
}

export interface QueryStats {
  total: number;
  byType: Record<EntityType, number>;
  byPage: Record<number, number>;
  avgConfidence: number;
  minConfidence: number;
  maxConfidence: number;
}

export interface QueryResult {
  entities: Entity[];
  total: number;
  stats?: QueryStats;
  duration: number;
}
