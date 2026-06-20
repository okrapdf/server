/**
 * Canonical types for the okraPDF `DocumentAgent` running on
 * `api.okrapdf.com`. Exported so consumers of `@okrapdf/sdk/react` don't have
 * to redeclare them for every app that calls `createOkraContext()`.
 *
 * Mirrors `DocumentState` in `apps/api/packages/server/src/document-agent.ts`
 * and `documentPhaseSchema` in `@okrapdf/schemas`. The SDK intentionally
 * inlines the phase union to avoid a workspace-wide dep on `@okrapdf/schemas`
 * — if the server adds a phase, add it here too.
 */

export type DocumentPhase =
  | 'idle'
  | 'uploading'
  | 'parsing'
  | 'hydrating'
  | 'verifying'
  | 'awaiting_review'
  | 'complete'
  | 'error';

export type DocumentFacetSummary = {
  phase: 'idle' | 'running' | 'complete' | 'error';
  nodes: number;
  pages: number;
  duration_ms: number | null;
  cost_usd: number;
  error: string | null;
  payload?: unknown;
};

export type ParsingIntentKind =
  | 'general_read'
  | 'question_answering'
  | 'structured_extract'
  | 'table_extract'
  | 'invoice_extract'
  | 'ocr_repair'
  | 'compliance_review'
  | 'engine_compare';

export type ParsingPlanStep = {
  id: string;
  title: string;
  detail: string;
  phase: 'queued' | DocumentPhase;
  resumable: boolean;
  status: 'planned';
};

export type ParsingLifecyclePlan = {
  object: 'document_parse_plan';
  version: 'okra.parse_plan.v1';
  createdAt: string;
  intent: {
    raw: string | null;
    kind: ParsingIntentKind;
    summary: string;
  };
  workflow: {
    engine: 'DOC_LIFECYCLE_WORKFLOW';
    runner: 'AgentWorkflow';
    resumable: true;
    trigger: 'default_parse' | 'parse_only' | 'render_only' | 'parse_and_render' | 'accept_only';
  };
  strategy: {
    processor: string | null;
    pageImages: 'none' | 'cover' | 'eager';
    cache: 'disabled' | 'prefer';
    runParse: boolean;
    runRender: boolean;
    skipParse: boolean;
  };
  steps: ParsingPlanStep[];
  toolPolicy: {
    free: string[];
    requiresGrant: string[];
  };
};

export type DocumentAgentUiState = {
  activeTab: 'chat' | 'extract' | 'summary';
  currentPage: number;
  selectedText: string | null;
  selectedPage: number | null;
  retryFacet: string | null;
};

export type DocumentAgentState = {
  documentId: string | null;
  phase: DocumentPhase;
  pagesTotal: number;
  pagesCompleted: number;
  pageImagesTotal: number;
  pageImagesCompleted: number;
  totalNodes: number;
  verifiedNodes: number;
  failedNodes: number;
  pendingNodes: number;
  verificationPercent: number;
  activeVendor: string | null;
  /**
   * PDF sha256 (full 64-hex) — content-addressed identifier for the source PDF.
   * Required for CF Images URL construction via `doc(id, { pdfSha, renderer })`.
   * Null until the upload workflow computes it (set once, never changes per doc).
   */
  pdfSha256?: string | null;
  /**
   * Render backend that produced the page images most recently written for
   * this document. Clients must pass this through to `doc({ renderer })` so
   * the emitted `imagedelivery.net` URL's `-{renderer}` tag matches the
   * actual uploaded image ID (`okra-{env}-{sha12}-p{N}-r{V}-{renderer}`).
   *
   * `mupdf150` — MuPDF container @ 150 DPI (server default when bound).
   * `pdfjs2x`  — pdf.js via Browser Rendering @ scale=2 (fallback).
   * `null`     — no pages rendered yet.
   */
  activeRenderer?: 'mupdf150' | 'pdfjs2x' | null;
  /** Intent-aware parsing plan published by the upload lifecycle. */
  parsePlan?: ParsingLifecyclePlan | null;
  facets?: Record<string, DocumentFacetSummary>;
  /** Frontend-owned UI state — written via `setState()`, DO reacts in `onStateChanged()`. */
  ui?: DocumentAgentUiState;
};

export type TriggerRenderParams = { strategy?: 'eager' | 'cover' | 'none' };
export type TriggerParseParams = { vendor?: string };
export type TriggerExtractParams = {
  schema: unknown;
  prompt?: string;
  model?: string;
  pages?: number[];
  monitor?: false | { intervalMs?: number; firstTickMs?: number };
};
export type TriggerExtractResult = { rows: unknown[]; data: unknown };

export type DocumentAgentMethods = {
  triggerRender(params?: TriggerRenderParams): Promise<void>;
  triggerParse(params?: TriggerParseParams): Promise<void>;
  triggerExtract(params: TriggerExtractParams): Promise<TriggerExtractResult>;
};
