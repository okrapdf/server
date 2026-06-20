/**
 * RelayClient — WebSocket client that connects to the okraPDF desktop app's
 * local relay server and provides typed command/event methods.
 *
 * Usage:
 *   const relay = new RelayClient();
 *   await relay.connect();
 *   const viewport = await relay.getViewportState();
 *   relay.on('viewport-changed', (vp) => console.log(vp.currentPage));
 *   await relay.openDocument('doc-abc123', { page: 5 });
 *   relay.close();
 */

import WebSocket from 'ws';
import type {
  BBox,
  RelayConfig,
  RelayCommand,
  RelayCommandType,
  RelayEvent,
  RelayInbound,
  RelayResponse,
  ViewportState,
} from './types.js';
import { RELAY_DEFAULTS } from './types.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

let counter = 0;
function nextId(): string {
  return `relay-${Date.now()}-${++counter}`;
}

function now(): number {
  return Date.now();
}

// ── Event emitter (minimal, typed) ──────────────────────────────────────────

type ExtractPayload<T extends RelayEvent['type']> = Extract<RelayEvent, { type: T }>['payload'];

type EventPayloadMap = {
  'viewport-changed': ViewportState;
  'document-opened': ExtractPayload<'document-opened'>;
  'document-closed': ExtractPayload<'document-closed'>;
  'selection-changed': ExtractPayload<'selection-changed'>;
  'app-state': ExtractPayload<'app-state'>;
  // Lifecycle
  'connected': undefined;
  'disconnected': { code: number; reason: string };
  'error': Error;
};

type EventHandler<K extends keyof EventPayloadMap> = (payload: EventPayloadMap[K]) => void;

// ── Pending request tracker ─────────────────────────────────────────────────

interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── RelayClient ─────────────────────────────────────────────────────────────

export class RelayClient {
  readonly config: RelayConfig;

  #ws: WebSocket | null = null;
  #pending = new Map<string, PendingRequest>();
  #listeners = new Map<string, Set<EventHandler<any>>>();
  #reconnectAttempt = 0;
  #closed = false;

  constructor(config?: Partial<RelayConfig>) {
    this.config = { ...RELAY_DEFAULTS, ...config };
    // Env override
    if (process.env.OKRA_RELAY_URL) {
      this.config.url = process.env.OKRA_RELAY_URL;
    }
  }

  // ── Connection lifecycle ────────────────────────────────────────────────

  get connected(): boolean {
    return this.#ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Connect to the desktop app relay server.
   * Resolves when the WebSocket is open, rejects on timeout or error.
   */
  connect(): Promise<void> {
    if (this.connected) return Promise.resolve();
    this.#closed = false;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.config.url);
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.terminate();
          reject(new Error(`Relay connection timed out after ${this.config.connectTimeoutMs}ms — is the okraPDF desktop app running?`));
        }
      }, this.config.connectTimeoutMs);

      ws.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.#ws = ws;
        this.#reconnectAttempt = 0;
        this.#wire(ws);
        this.#emit('connected', undefined);
        resolve();
      });

      ws.on('error', (err: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`Relay connection failed: ${err.message}`));
        }
      });
    });
  }

  /** Gracefully close the connection. */
  close(): void {
    this.#closed = true;
    this.#rejectAllPending('Connection closed');
    if (this.#ws) {
      this.#ws.close(1000, 'client shutdown');
      this.#ws = null;
    }
  }

  // ── Commands ────────────────────────────────────────────────────────────

  /**
   * Open a document in the desktop viewer.
   */
  async openDocument(
    documentId: string,
    opts?: { page?: number; source?: string },
  ): Promise<void> {
    await this.#send<void>('open-document', {
      documentId,
      page: opts?.page,
      source: opts?.source,
    });
  }

  /**
   * Navigate to a specific page.
   */
  async navigatePage(
    page: number,
    opts?: { scrollY?: number; animate?: boolean },
  ): Promise<void> {
    await this.#send<void>('navigate-page', {
      page,
      scrollY: opts?.scrollY,
      animate: opts?.animate,
    });
  }

  /**
   * Highlight a region on a page.
   */
  async highlightRegion(
    page: number,
    bbox: BBox,
    opts?: { style?: 'pulse' | 'underline' | 'box' | 'fill'; label?: string; durationMs?: number },
  ): Promise<void> {
    await this.#send<void>('highlight-region', {
      page,
      bbox,
      style: opts?.style,
      label: opts?.label,
      durationMs: opts?.durationMs,
    });
  }

  /**
   * Clear all highlights in the desktop viewer.
   */
  async clearHighlights(): Promise<void> {
    await this.#send<void>('clear-highlights', {});
  }

  /**
   * Query the current viewport state from the desktop app.
   */
  async getViewportState(): Promise<ViewportState> {
    return this.#send<ViewportState>('get-viewport-state', {});
  }

  /**
   * Ping the desktop app. Useful for health checks and latency measurement.
   */
  async ping(): Promise<number> {
    const start = now();
    await this.#send<void>('ping', {});
    return now() - start;
  }

  // ── Event subscription ──────────────────────────────────────────────────

  on<K extends keyof EventPayloadMap>(event: K, handler: EventHandler<K>): () => void {
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    set.add(handler);
    return () => { set!.delete(handler); };
  }

  off<K extends keyof EventPayloadMap>(event: K, handler: EventHandler<K>): void {
    this.#listeners.get(event)?.delete(handler);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** Send a command and wait for its response. */
  #send<T>(type: RelayCommandType, payload: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Relay not connected. Call connect() first.'));
        return;
      }

      const id = nextId();
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Relay command '${type}' timed out after ${this.config.responseTimeoutMs}ms`));
      }, this.config.responseTimeoutMs);

      this.#pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });

      const message: RelayCommand = {
        type,
        id,
        ts: now(),
        payload,
      } as RelayCommand;

      this.#ws!.send(JSON.stringify(message));
    });
  }

  /** Wire up message/close/error handlers on a WebSocket. */
  #wire(ws: WebSocket): void {
    ws.on('message', (raw: WebSocket.Data) => {
      let msg: RelayInbound;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // Ignore malformed messages
      }
      this.#dispatch(msg);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.#ws = null;
      this.#rejectAllPending('Connection lost');
      this.#emit('disconnected', { code, reason: reason.toString() });
      this.#maybeReconnect();
    });

    ws.on('error', (err: Error) => {
      this.#emit('error', err);
    });
  }

  /** Route an inbound message to the right handler. */
  #dispatch(msg: RelayInbound): void {
    // Response to a pending command
    if (msg.type === 'response' && msg.id) {
      const pending = this.#pending.get(msg.id);
      if (!pending) return;
      this.#pending.delete(msg.id);
      clearTimeout(pending.timer);

      const resp = msg as RelayResponse<unknown>;
      if (resp.ok) {
        pending.resolve(resp.payload);
      } else {
        pending.reject(new Error(resp.error));
      }
      return;
    }

    // Event from desktop
    if (msg.type && msg.type !== 'response') {
      const event = msg as RelayEvent;
      this.#emit(event.type as keyof EventPayloadMap, event.payload as any);
    }
  }

  #emit<K extends keyof EventPayloadMap>(event: K, payload: EventPayloadMap[K]): void {
    const handlers = this.#listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch {
        // Don't let a listener crash the relay
      }
    }
  }

  #rejectAllPending(reason: string): void {
    for (const [, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.#pending.clear();
  }

  #maybeReconnect(): void {
    if (this.#closed || !this.config.autoReconnect) return;
    if (this.#reconnectAttempt >= this.config.maxReconnectAttempts) return;

    this.#reconnectAttempt++;
    const delay = Math.min(500 * Math.pow(2, this.#reconnectAttempt - 1), 10000);

    setTimeout(() => {
      if (this.#closed) return;
      this.connect().catch(() => {
        // reconnect failed — #wire's close handler will trigger another attempt
      });
    }, delay);
  }
}
