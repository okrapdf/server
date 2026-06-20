/**
 * WsSession — OkraSession adapter that routes `stream()` over an existing
 * WebSocket connection instead of HTTP SSE.
 *
 * All non-streaming methods delegate to the inner HTTP-backed session.
 * Only `stream()` is overridden to send CHAT_COMPLETION over WS and yield
 * CompletionEvents from CHAT_STREAM_* responses.
 *
 * Usage:
 *   const wsSession = new WsSession(httpSession, { send, subscribe });
 *   const chat = useChat({ session: wsSession });
 */

import type {
  OkraSession,
  CompletionEvent,
  CompletionOptions,
  DocumentStatus,
  WaitOptions,
  Page,
  EntitiesResponse,
  QueryResult,
  PublishResult,
  ShareLinkOptions,
  ShareLinkResult,
  DocumentAsset,
  GenerateOptions,
  GenerateResult,
  SessionState,
  StructuredSchema,
} from './types';

// Chat stream event types — mirrors @okrapdf/schemas ChatStreamServerEvent
// Inlined to avoid adding @okrapdf/schemas as a dependency of the published SDK.

export type ChatStreamServerEvent =
  | { type: 'CHAT_STREAM_START'; requestId: string }
  | { type: 'CHAT_STREAM_DELTA'; requestId: string; delta: string }
  | { type: 'CHAT_STREAM_DONE'; requestId: string; usage?: { inputTokens: number; outputTokens: number; costUsd: number }; model?: string }
  | { type: 'CHAT_STREAM_ERROR'; requestId: string; error: string };

/** Function that sends a JSON string over the WebSocket. Returns false if WS is closed. */
export type WsSendFn = (message: string) => boolean;

/** Subscribe to chat stream events. Returns unsubscribe function. */
export type WsSubscribeFn = (
  requestId: string,
  handler: (event: ChatStreamServerEvent) => void,
) => () => void;

export interface WsSessionOptions {
  /** Send JSON string over the existing WebSocket connection */
  send: WsSendFn;
  /** Subscribe to CHAT_STREAM_* events for a given requestId */
  subscribe: WsSubscribeFn;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class WsSession implements OkraSession {
  readonly id: string;
  readonly modelEndpoint: string;
  readonly model?: string;

  #inner: OkraSession;
  #opts: WsSessionOptions;

  constructor(inner: OkraSession, opts: WsSessionOptions) {
    this.#inner = inner;
    this.#opts = opts;
    this.id = inner.id;
    this.modelEndpoint = inner.modelEndpoint;
    this.model = inner.model;
  }

  // ── Overridden: stream via WebSocket ──────────────────────────────────────

  async *stream(
    query: string,
    options?: CompletionOptions,
  ): AsyncGenerator<CompletionEvent> {
    const requestId = uuid();

    // Build message history (single user message for now — matches HTTP path)
    const messages = [{ role: 'user', content: query }];

    const sent = this.#opts.send(JSON.stringify({
      type: 'CHAT_COMPLETION',
      requestId,
      messages,
    }));

    if (!sent) {
      yield { type: 'error', message: 'WebSocket not connected' };
      return;
    }

    // Create a promise-based event queue
    type QueueItem =
      | { done: false; event: ChatStreamServerEvent }
      | { done: true };

    const queue: QueueItem[] = [];
    let resolve: (() => void) | null = null;
    let finished = false;

    const unsubscribe = this.#opts.subscribe(requestId, (event) => {
      if (finished) return;
      queue.push({ done: false, event });
      resolve?.();
    });

    const cleanup = () => {
      finished = true;
      unsubscribe();
    };

    // Handle abort signal
    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        cleanup();
        queue.push({ done: true });
        resolve?.();
      }, { once: true });
    }

    try {
      let fullText = '';

      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((r) => { resolve = r; });
          resolve = null;
        }

        const item = queue.shift();
        if (!item || item.done) break;

        const evt = item.event;

        switch (evt.type) {
          case 'CHAT_STREAM_START':
            // No CompletionEvent for start — just skip
            break;

          case 'CHAT_STREAM_DELTA':
            fullText += evt.delta;
            yield { type: 'text_delta', text: evt.delta };
            break;

          case 'CHAT_STREAM_DONE':
            yield { type: 'done', answer: fullText };
            cleanup();
            return;

          case 'CHAT_STREAM_ERROR':
            yield { type: 'error', message: evt.error };
            cleanup();
            return;
        }
      }
    } finally {
      cleanup();
    }
  }

  // ── Delegated to inner HTTP session ───────────────────────────────────────

  state(): SessionState { return this.#inner.state(); }
  setModel(model: string): Promise<void> { return this.#inner.setModel(model); }
  status(signal?: AbortSignal): Promise<DocumentStatus> { return this.#inner.status(signal); }
  wait(options?: WaitOptions): Promise<DocumentStatus> { return this.#inner.wait(options); }
  pages(options?: { range?: string; signal?: AbortSignal }): Promise<Page[]> { return this.#inner.pages(options); }
  page(pageNumber: number, signal?: AbortSignal): Promise<Page> { return this.#inner.page(pageNumber, signal); }
  entities(options?: { type?: string; limit?: number; offset?: number; signal?: AbortSignal }): Promise<EntitiesResponse> { return this.#inner.entities(options); }
  downloadUrl(): string { return this.#inner.downloadUrl(); }
  query(sql: string, signal?: AbortSignal): Promise<QueryResult> { return this.#inner.query(sql, signal); }
  logs(options?: import('./types').LogsOptions): Promise<import('./types').LogEntry[]> { return this.#inner.logs(options); }
  publish(signal?: AbortSignal): Promise<PublishResult> { return this.#inner.publish(signal); }
  shareLink(options?: ShareLinkOptions): Promise<ShareLinkResult> { return this.#inner.shareLink(options); }
  assets(signal?: AbortSignal): Promise<DocumentAsset[]> { return this.#inner.assets(signal); }
  asset<T = unknown>(assetId: string, signal?: AbortSignal): Promise<DocumentAsset<T> | null> {
    return this.#inner.asset<T>(assetId, signal);
  }

  prompt(query: string, options?: GenerateOptions & { schema?: undefined }): Promise<GenerateResult>;
  prompt<T>(query: string, options: GenerateOptions & { schema: StructuredSchema<T> }): Promise<GenerateResult<T>>;
  prompt<T = undefined>(query: string, options?: GenerateOptions): Promise<GenerateResult<T>> {
    if (options?.schema !== undefined) {
      return this.#inner.prompt(query, options as GenerateOptions & { schema: StructuredSchema<unknown> }) as Promise<GenerateResult<T>>;
    }
    return this.#inner.prompt(query, options as GenerateOptions & { schema?: undefined }) as Promise<GenerateResult<T>>;
  }
}
