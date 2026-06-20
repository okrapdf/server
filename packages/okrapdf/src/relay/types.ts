/**
 * okraPDF Desktop Relay Protocol
 *
 * JSON-over-WebSocket protocol between the okra CLI (client) and the
 * native macOS desktop app (server at ws://localhost:9770).
 *
 * Two message flows:
 *   - Commands: CLI -> Desktop (request/response with `id` for matching)
 *   - Events:   Desktop -> CLI (fire-and-forget, no `id`)
 */

// ── Message Envelope ────────────────────────────────────────────────────────

export interface RelayEnvelope {
  /** Message type discriminator. */
  type: string;
  /** Request ID for command/response pairs. Absent on events. */
  id?: string;
  /** Epoch-ms timestamp. */
  ts: number;
}

// ── Bounding Box ────────────────────────────────────────────────────────────

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Commands (CLI -> Desktop) ───────────────────────────────────────────────

export interface OpenDocumentCommand extends RelayEnvelope {
  type: 'open-document';
  id: string;
  payload: {
    /** okraPDF document ID (doc-xxx) or local file path. */
    documentId: string;
    /** Optional page to jump to after opening. */
    page?: number;
    /** Source hint for UI breadcrumbs ("cli", "openclaw", "collection:NAME"). */
    source?: string;
  };
}

export interface NavigatePageCommand extends RelayEnvelope {
  type: 'navigate-page';
  id: string;
  payload: {
    /** Target page number (1-indexed). */
    page: number;
    /** Optional scroll offset within the page (0-1 normalized). */
    scrollY?: number;
    /** Animate the transition. Default: true. */
    animate?: boolean;
  };
}

export interface HighlightRegionCommand extends RelayEnvelope {
  type: 'highlight-region';
  id: string;
  payload: {
    /** Page number containing the region. */
    page: number;
    /** Bounding box in PDF coordinates (points from top-left). */
    bbox: BBox;
    /** Highlight style. Default: 'pulse'. */
    style?: 'pulse' | 'underline' | 'box' | 'fill';
    /** Label shown alongside the highlight. */
    label?: string;
    /** Auto-dismiss after ms. 0 = persistent until cleared. Default: 3000. */
    durationMs?: number;
  };
}

export interface ClearHighlightsCommand extends RelayEnvelope {
  type: 'clear-highlights';
  id: string;
  payload: Record<string, never>;
}

export interface GetViewportStateCommand extends RelayEnvelope {
  type: 'get-viewport-state';
  id: string;
  payload: Record<string, never>;
}

export interface PingCommand extends RelayEnvelope {
  type: 'ping';
  id: string;
  payload: Record<string, never>;
}

export type RelayCommand =
  | OpenDocumentCommand
  | NavigatePageCommand
  | HighlightRegionCommand
  | ClearHighlightsCommand
  | GetViewportStateCommand
  | PingCommand;

export type RelayCommandType = RelayCommand['type'];

// ── Responses (Desktop -> CLI, matched by `id`) ────────────────────────────

export interface RelayOkResponse<T = undefined> extends RelayEnvelope {
  type: 'response';
  id: string;
  ok: true;
  payload: T extends undefined ? Record<string, never> : T;
}

export interface RelayErrorResponse extends RelayEnvelope {
  type: 'response';
  id: string;
  ok: false;
  error: string;
  code?: string;
}

export type RelayResponse<T = undefined> = RelayOkResponse<T> | RelayErrorResponse;

// ── Viewport State (returned by get-viewport-state) ────────────────────────

export interface ViewportState {
  /** Currently active document ID. Null if nothing is open. */
  documentId: string | null;
  /** Current page number (1-indexed). */
  currentPage: number;
  /** Total pages in the document. */
  totalPages: number;
  /** Zoom level (1.0 = 100%). */
  zoom: number;
  /** Visible page range (e.g. pages 3-5 are in the viewport). */
  visiblePages: { first: number; last: number };
  /** Current text selection, if any. */
  selection: {
    text: string;
    page: number;
    bbox: BBox;
  } | null;
}

// ── Events (Desktop -> CLI, fire-and-forget) ────────────────────────────────

export interface ViewportChangedEvent extends RelayEnvelope {
  type: 'viewport-changed';
  payload: ViewportState;
}

export interface DocumentOpenedEvent extends RelayEnvelope {
  type: 'document-opened';
  payload: {
    documentId: string;
    fileName: string | null;
    totalPages: number;
  };
}

export interface DocumentClosedEvent extends RelayEnvelope {
  type: 'document-closed';
  payload: {
    documentId: string;
  };
}

export interface SelectionChangedEvent extends RelayEnvelope {
  type: 'selection-changed';
  payload: {
    text: string;
    page: number;
    bbox: BBox;
  } | null;
}

export interface AppStateEvent extends RelayEnvelope {
  type: 'app-state';
  payload: {
    /** Desktop app readiness. */
    state: 'ready' | 'busy' | 'background';
    /** Desktop app version. */
    version: string;
  };
}

export type RelayEvent =
  | ViewportChangedEvent
  | DocumentOpenedEvent
  | DocumentClosedEvent
  | SelectionChangedEvent
  | AppStateEvent;

export type RelayEventType = RelayEvent['type'];

// ── Inbound = anything the CLI can receive from the desktop ─────────────────

export type RelayInbound = RelayResponse<unknown> | RelayEvent;

// ── Config ──────────────────────────────────────────────────────────────────

export interface RelayConfig {
  /** WebSocket URL of the desktop app relay server. Default: ws://localhost:9770 */
  url: string;
  /** Connection timeout in ms. Default: 3000 */
  connectTimeoutMs: number;
  /** Command response timeout in ms. Default: 5000 */
  responseTimeoutMs: number;
  /** Auto-reconnect on disconnect. Default: true */
  autoReconnect: boolean;
  /** Max reconnect attempts. Default: 5 */
  maxReconnectAttempts: number;
}

export const RELAY_DEFAULTS: RelayConfig = {
  url: 'ws://localhost:9770',
  connectTimeoutMs: 3000,
  responseTimeoutMs: 5000,
  autoReconnect: true,
  maxReconnectAttempts: 5,
};

export const RELAY_PORT = 9770;
