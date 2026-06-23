/**
 * DocumentAgent — durable orchestrator (workerd + Agents SDK), using the SDK's
 * NATIVE durable primitives (no hand-rolled ledger/event table):
 *   - this.runFiber(name, fn)   durable execution (cf_agents_runs, keepAlive, auto-recovery)
 *   - ctx.stash() / snapshot     per-page checkpoint
 *   - onFiberRecovered()         SDK re-fires after a dead process → resume
 *   - this.setState()            durable state (cf_agents_state) + client broadcast
 *
 * The parse run is one durable fiber that processes pages 1..N via a stateless parser
 * CONTAINER over HTTP, recording each page's blocks into state. State is the source of
 * truth for "what's done", so resume = re-run the fiber and skip resolved pages.
 *
 * Re-entrancy: each run carries an `epoch`. startRun bumps it; the fiber aborts before
 * any commit once `state.epoch` moves past its own — so a duplicate/re-upload can never
 * mix an old run's pages (or counts) into a new one.
 *
 * Durability is at-least-once per page (a crash between parse and commit re-parses that
 * page on resume), but the RESULT is exactly-once: re-parsing overwrites the same page key.
 */
import { Agent } from 'agents';

export interface Env {
  DOCUMENT_AGENT: DurableObjectNamespace<DocumentAgent>;
  /** Per-parser base URLs, resolved generically as OKRA_PARSER_<ID>_URL. */
  OKRA_PARSER_LITEPARSE_URL: string;
  OKRA_PARSER_GEMINI_VISION_URL?: string;
  /** Static self-host UI, bound via wrangler [assets]. */
  ASSETS: Fetcher;
}

export type RunStatus = 'idle' | 'running' | 'completed' | 'completed_with_errors' | 'failed';

export interface Block {
  type: string;
  value?: string;
  label?: string;
  bbox?: { x: number; y: number; w: number; h: number };
  confidence?: number;
}

export interface RunState {
  documentId: string;
  status: RunStatus;
  epoch: number;
  parserId: string;
  fileName: string | null;
  pagesTotal: number;
  pagesDone: number;
  pagesFailed: number;
  pages: Record<number, Block[]>;
  errors: Record<number, string>;
  createdAt: number;
  updatedAt: number;
}

const MAX_ATTEMPTS = 3;
const PARSE_TIMEOUT_MS = 120_000;

const INITIAL: RunState = {
  documentId: '', status: 'idle', epoch: 0, parserId: 'liteparse', fileName: null,
  pagesTotal: 0, pagesDone: 0, pagesFailed: 0, pages: {}, errors: {}, createdAt: 0, updatedAt: 0,
};

/** Resolve a parser id to its container URL via OKRA_PARSER_<ID>_URL (e.g.
 *  'liteparse' → OKRA_PARSER_LITEPARSE_URL, 'gemini-vision' → OKRA_PARSER_GEMINI_VISION_URL). */
function parserBaseUrl(env: Env, parserId: string): string {
  const key = `OKRA_PARSER_${parserId.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}_URL`;
  const url = (env as unknown as Record<string, string | undefined>)[key];
  if (url) return url;
  throw new Error(`no URL configured for parser '${parserId}' (set ${key})`);
}

async function callParser<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PARSE_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`parser ${path} ${res.status}: ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export class DocumentAgent extends Agent<Env, RunState> {
  initialState = INITIAL;

  // ── RPC ─────────────────────────────────────────────────────────────────

  async startRun(opts: {
    documentId: string; pdfBase64: string; fileName?: string; parserId?: string;
  }): Promise<{ documentId: string; status: RunStatus; pagesTotal: number; epoch: number }> {
    this.ensureSource();
    const parserId = opts.parserId ?? 'liteparse';
    const baseUrl = parserBaseUrl(this.env, parserId);
    const { pageCount } = await callParser<{ pageCount: number }>(baseUrl, '/pages', { pdf_base64: opts.pdfBase64 });
    if (!pageCount || pageCount < 1) throw new Error('document has no pages');

    const epoch = (this.state.epoch ?? 0) + 1; // supersedes any in-flight fiber
    this.sql`INSERT OR REPLACE INTO source (id, b64) VALUES (1, ${opts.pdfBase64})`;
    const now = Date.now();
    this.setState({
      documentId: opts.documentId, status: 'running', epoch, parserId, fileName: opts.fileName ?? null,
      pagesTotal: pageCount, pagesDone: 0, pagesFailed: 0, pages: {}, errors: {}, createdAt: now, updatedAt: now,
    });

    void this.runFiber('parse', (ctx) => this.parseLoop(ctx, epoch));
    return { documentId: opts.documentId, status: 'running', pagesTotal: pageCount, epoch };
  }

  async getStatus(): Promise<{ run: Omit<RunState, 'pages'>; pages: Array<{ page: number; status: string }> }> {
    const s = this.state;
    const pages: Array<{ page: number; status: string }> = [];
    for (let p = 1; p <= s.pagesTotal; p++) {
      pages.push({ page: p, status: s.pages[p] ? 'completed' : s.errors[p] ? 'failed' : s.status === 'running' ? 'running' : 'pending' });
    }
    const { pages: _omit, ...run } = s;
    return { run, pages };
  }

  async getGraph(): Promise<{ documentId: string; status: RunStatus; pages: Array<{ pageNumber: number; blocks: Block[] }> }> {
    const s = this.state;
    return {
      documentId: s.documentId,
      status: s.status,
      pages: Object.keys(s.pages).map(Number).sort((a, b) => a - b).map((p) => ({ pageNumber: p, blocks: s.pages[p] })),
    };
  }

  // ── durable fiber: the parse loop ───────────────────────────────────────

  private async parseLoop(ctx: { stash(d: unknown): void }, epoch: number): Promise<void> {
    const total = this.state.pagesTotal;
    const baseUrl = parserBaseUrl(this.env, this.state.parserId);
    const src = this.sql`SELECT b64 FROM source WHERE id=1` as unknown as Array<{ b64: string }>;
    if (src.length === 0) return;
    const pdf = src[0].b64;

    for (let page = 1; page <= total; page++) {
      if (this.state.epoch !== epoch) return; // superseded by a newer run
      if (this.state.pages[page] || this.state.errors[page]) continue; // resume: skip resolved
      let lastErr = '';
      let ok = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const { blocks } = await callParser<{ blocks: Block[] }>(baseUrl, '/parse', { pdf_base64: pdf, page });
          if (this.state.epoch !== epoch) return; // a new run started while we awaited
          this.setState({ ...this.state, pages: { ...this.state.pages, [page]: blocks ?? [] }, pagesDone: Object.keys(this.state.pages).length + 1, updatedAt: Date.now() });
          ctx.stash({ lastPage: page });
          ok = true;
          break;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
        }
      }
      if (!ok) {
        if (this.state.epoch !== epoch) return;
        this.setState({ ...this.state, errors: { ...this.state.errors, [page]: lastErr }, pagesFailed: Object.keys(this.state.errors).length + 1, updatedAt: Date.now() });
      }
    }

    if (this.state.epoch !== epoch) return;
    const failed = Object.keys(this.state.errors).length;
    this.setState({ ...this.state, status: failed > 0 ? 'completed_with_errors' : 'completed', updatedAt: Date.now() });
  }

  /** SDK calls this after restart for an interrupted fiber → resume the CURRENT run. */
  async onFiberRecovered(ctx: { name: string }): Promise<void> {
    if (ctx.name === 'parse' && this.state.status === 'running') {
      const epoch = this.state.epoch;
      void this.runFiber('parse', (c) => this.parseLoop(c, epoch));
    }
  }

  // ── input storage (the only custom SQLite; not a ledger, not broadcast) ──

  private ensureSource(): void {
    this.sql`CREATE TABLE IF NOT EXISTS source (id INTEGER PRIMARY KEY CHECK (id = 1), b64 TEXT NOT NULL)`;
  }
}
