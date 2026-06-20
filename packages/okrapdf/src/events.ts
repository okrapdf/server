/**
 * Document Event Protocol v1 — SDK types + DocumentEventStream
 *
 * Canonical source for OkraEvent / DocumentEvent types.
 * Server mirror: apps/api/packages/server/src/da/event-protocol.ts (keep in sync).
 */

// ── Cross-stack base event type ─────────────────────────────────────────────

export interface OkraEvent {
  v: number;
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// ── Document-specific events ────────────────────────────────────────────────

export interface DocumentEvent extends OkraEvent {
  v: 1;
  type: `document.${string}`;
  documentId: string;
}

export type DocumentEventType =
  // Tier 1 — Progress
  | 'document.phase_changed'
  | 'document.vendor_started'
  | 'document.vendor_completed'
  | 'document.vendor_failed'
  | 'document.parse_complete'
  | 'document.hydrated'
  | 'document.verification_progress'
  | 'document.ready'
  | 'document.error'
  | 'document.thumbnail_ready'
  // Tier 2 — Granular
  | 'document.node_verified'
  | 'document.page_resolved'
  | 'document.extraction_started';

// ── DocumentEventStream ─────────────────────────────────────────────────────

export type DocumentEventHandler = (event: DocumentEvent) => void;

export interface DocumentEventStreamOptions {
  /** Filter to specific event types. Omit or null = all public events. */
  events?: DocumentEventType[];
  signal?: AbortSignal;
}

/**
 * Lightweight WebSocket event stream for document lifecycle events.
 *
 * Usage:
 *   const stream = new DocumentEventStream(wsUrl);
 *   stream.on('document.ready', (evt) => console.log('Done!', evt.data));
 *   stream.connect();
 *   // or: for await (const evt of stream) { ... }
 */
export class DocumentEventStream {
  #ws: WebSocket | null = null;
  #url: string;
  #options: DocumentEventStreamOptions;
  #handlers = new Map<string, Set<DocumentEventHandler>>();
  #closed = false;

  // Async iterator support
  #queue: DocumentEvent[] = [];
  #resolve: (() => void) | null = null;
  #iteratorDone = false;

  constructor(url: string, options?: DocumentEventStreamOptions) {
    this.#url = url;
    this.#options = options ?? {};

    if (this.#options.signal) {
      this.#options.signal.addEventListener('abort', () => this.close(), { once: true });
    }
  }

  /** Open the WebSocket connection. */
  connect(): void {
    if (this.#closed) return;

    const ws = new WebSocket(this.#url);
    this.#ws = ws;

    ws.onmessage = (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      // Skip cf_agent_state: prefixed messages
      if (raw.startsWith('cf_agent_state:')) return;

      let parsed: DocumentEvent;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      // Must be a v1 document event
      if (parsed.v !== 1 || typeof parsed.type !== 'string' || !parsed.type.startsWith('document.')) return;

      // Client-side event filter
      if (this.#options.events && !this.#options.events.includes(parsed.type as DocumentEventType)) return;

      // Dispatch to specific handlers
      const specific = this.#handlers.get(parsed.type);
      if (specific) {
        for (const handler of specific) handler(parsed);
      }

      // Dispatch to wildcard handlers
      const wildcard = this.#handlers.get('*');
      if (wildcard) {
        for (const handler of wildcard) handler(parsed);
      }

      // Feed async iterator
      this.#queue.push(parsed);
      this.#resolve?.();
    };

    ws.onerror = () => {
      /* swallow — onclose fires next */
    };

    ws.onclose = () => {
      this.#iteratorDone = true;
      this.#resolve?.();
    };
  }

  /** Subscribe to events. Returns unsubscribe function. */
  on(type: DocumentEventType | '*', handler: DocumentEventHandler): () => void {
    let set = this.#handlers.get(type);
    if (!set) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) this.#handlers.delete(type);
    };
  }

  /** Close the connection and clean up. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#iteratorDone = true;
    this.#resolve?.();
    try {
      this.#ws?.close();
    } catch {
      /* already closed */
    }
    this.#ws = null;
    this.#handlers.clear();
  }

  get connected(): boolean {
    return this.#ws?.readyState === WebSocket.OPEN;
  }

  /** Async iterator — `for await (const evt of stream) { ... }` */
  async *[Symbol.asyncIterator](): AsyncGenerator<DocumentEvent> {
    while (true) {
      if (this.#queue.length > 0) {
        yield this.#queue.shift()!;
        continue;
      }
      if (this.#iteratorDone) return;
      await new Promise<void>((r) => {
        this.#resolve = r;
      });
      this.#resolve = null;
    }
  }
}
