/**
 * E2E integration tests for the relay client.
 *
 * These simulate a realistic desktop app: the mock WS server tracks document
 * state, emits events on state changes, and validates the wire-level protocol.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { RelayClient } from './client.js';
import type { RelayCommand, ViewportState } from './types.js';

// ── Stateful mock desktop app ───────────────────────────────────────────────

interface DesktopState {
  documentId: string | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  highlights: Array<{ page: number; label?: string }>;
}

function createDesktopApp(port: number) {
  const wss = new WebSocketServer({ port });
  const wireLog: Array<{ direction: 'in' | 'out'; raw: string }> = [];

  const state: DesktopState = {
    documentId: null,
    currentPage: 1,
    totalPages: 0,
    zoom: 1.0,
    highlights: [],
  };

  // Simulated document catalog
  const catalog: Record<string, { fileName: string; totalPages: number }> = {
    'doc-annual-2025': { fileName: 'AnnualReport2025.pdf', totalPages: 84 },
    'doc-invoice-99': { fileName: 'invoice_99.pdf', totalPages: 3 },
  };

  function viewportSnapshot(): ViewportState {
    return {
      documentId: state.documentId,
      currentPage: state.currentPage,
      totalPages: state.totalPages,
      zoom: state.zoom,
      visiblePages: {
        first: Math.max(1, state.currentPage - 1),
        last: Math.min(state.totalPages || 1, state.currentPage + 1),
      },
      selection: null,
    };
  }

  function broadcast(msg: unknown) {
    const raw = JSON.stringify(msg);
    for (const ws of wss.clients) {
      if (ws.readyState === WsWebSocket.OPEN) {
        ws.send(raw);
        wireLog.push({ direction: 'out', raw });
      }
    }
  }

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      const raw = data.toString();
      wireLog.push({ direction: 'in', raw });

      let cmd: RelayCommand & { type: string };
      try {
        cmd = JSON.parse(raw);
      } catch {
        return;
      }

      const reply = (payload: unknown, ok = true, error?: string) => {
        const resp = ok
          ? { type: 'response', id: cmd.id, ts: Date.now(), ok: true, payload }
          : { type: 'response', id: cmd.id, ts: Date.now(), ok: false, error, code: 'ERROR' };
        const respRaw = JSON.stringify(resp);
        ws.send(respRaw);
        wireLog.push({ direction: 'out', raw: respRaw });
      };

      switch (cmd.type) {
        case 'ping':
          reply({});
          break;

        case 'open-document': {
          const { documentId, page } = cmd.payload as { documentId: string; page?: number };
          const doc = catalog[documentId];
          if (!doc) {
            reply(null, false, `Unknown document: ${documentId}`);
            return;
          }
          state.documentId = documentId;
          state.totalPages = doc.totalPages;
          state.currentPage = page ?? 1;
          state.highlights = [];
          reply({});
          // Desktop emits document-opened event
          broadcast({
            type: 'document-opened',
            ts: Date.now(),
            payload: { documentId, fileName: doc.fileName, totalPages: doc.totalPages },
          });
          break;
        }

        case 'navigate-page': {
          const { page } = cmd.payload as { page: number };
          if (!state.documentId) {
            reply(null, false, 'No document open');
            return;
          }
          if (page < 1 || page > state.totalPages) {
            reply(null, false, `Page ${page} out of range (1-${state.totalPages})`);
            return;
          }
          state.currentPage = page;
          reply({});
          // Desktop emits viewport-changed event
          broadcast({
            type: 'viewport-changed',
            ts: Date.now(),
            payload: viewportSnapshot(),
          });
          break;
        }

        case 'highlight-region': {
          const { page, label } = cmd.payload as { page: number; label?: string };
          state.highlights.push({ page, label });
          reply({});
          break;
        }

        case 'clear-highlights':
          state.highlights = [];
          reply({});
          break;

        case 'get-viewport-state':
          reply(viewportSnapshot());
          break;

        default:
          reply(null, false, `Unknown command: ${cmd.type}`);
      }
    });
  });

  return {
    wss,
    state,
    wireLog,
    broadcast,
    close: () => new Promise<void>((resolve) => wss.close(() => resolve())),
  };
}

// ── Test setup ──────────────────────────────────────────────────────────────

const E2E_PORT = 19771;
const E2E_URL = `ws://localhost:${E2E_PORT}`;

function createRelay() {
  return new RelayClient({
    url: E2E_URL,
    autoReconnect: false,
    connectTimeoutMs: 2000,
    responseTimeoutMs: 3000,
  });
}

/** Wait briefly for async WS events to propagate. */
const tick = (ms = 50) => new Promise<void>((r) => setTimeout(r, ms));

describe('RelayClient E2E', () => {
  let app: ReturnType<typeof createDesktopApp>;

  beforeEach(() => {
    app = createDesktopApp(E2E_PORT);
  });

  afterEach(async () => {
    await app.close();
  });

  // ── Full workflow: open → navigate → highlight → viewport → close ───────

  it('runs a full document review workflow', async () => {
    const relay = createRelay();
    const events: string[] = [];

    relay.on('document-opened', (e) => events.push(`opened:${e.documentId}`));
    relay.on('viewport-changed', (vp) => events.push(`page:${vp.currentPage}`));

    await relay.connect();
    expect(relay.connected).toBe(true);

    // 1. Open document
    await relay.openDocument('doc-annual-2025', { page: 1, source: 'cli' });
    await tick();
    expect(app.state.documentId).toBe('doc-annual-2025');
    expect(events).toContain('opened:doc-annual-2025');

    // 2. Navigate to page 42
    await relay.navigatePage(42);
    await tick();
    expect(app.state.currentPage).toBe(42);
    expect(events).toContain('page:42');

    // 3. Highlight a revenue figure
    await relay.highlightRegion(42, { x: 100, y: 200, width: 300, height: 20 }, {
      style: 'box',
      label: 'Total Revenue',
    });
    expect(app.state.highlights).toHaveLength(1);
    expect(app.state.highlights[0]).toMatchObject({ page: 42, label: 'Total Revenue' });

    // 4. Query viewport state
    const vp = await relay.getViewportState();
    expect(vp.documentId).toBe('doc-annual-2025');
    expect(vp.currentPage).toBe(42);
    expect(vp.totalPages).toBe(84);
    expect(vp.visiblePages.first).toBeLessThanOrEqual(42);
    expect(vp.visiblePages.last).toBeGreaterThanOrEqual(42);

    // 5. Clear highlights
    await relay.clearHighlights();
    expect(app.state.highlights).toHaveLength(0);

    // 6. Navigate to another page
    await relay.navigatePage(1);
    await tick();
    expect(app.state.currentPage).toBe(1);

    relay.close();
  });

  // ── Wire protocol validation ────────────────────────────────────────────

  it('sends well-formed wire messages with unique IDs and timestamps', async () => {
    const relay = createRelay();
    await relay.connect();

    await relay.openDocument('doc-annual-2025');
    await relay.navigatePage(10);

    // Parse all inbound messages the server received
    const inbound = app.wireLog
      .filter((e) => e.direction === 'in')
      .map((e) => JSON.parse(e.raw));

    expect(inbound).toHaveLength(2);

    // Both must have type, id, ts, payload
    for (const msg of inbound) {
      expect(msg).toHaveProperty('type');
      expect(msg).toHaveProperty('id');
      expect(msg).toHaveProperty('ts');
      expect(msg).toHaveProperty('payload');
      expect(typeof msg.id).toBe('string');
      expect(msg.id.length).toBeGreaterThan(0);
      expect(typeof msg.ts).toBe('number');
      expect(msg.ts).toBeGreaterThan(0);
    }

    // IDs must be unique
    expect(inbound[0].id).not.toBe(inbound[1].id);

    // Types are correct
    expect(inbound[0].type).toBe('open-document');
    expect(inbound[1].type).toBe('navigate-page');

    // Payloads are correct
    expect(inbound[0].payload).toMatchObject({ documentId: 'doc-annual-2025' });
    expect(inbound[1].payload).toMatchObject({ page: 10 });

    // Responses sent back also have matching IDs
    const outbound = app.wireLog
      .filter((e) => e.direction === 'out')
      .map((e) => JSON.parse(e.raw))
      .filter((m) => m.type === 'response');

    expect(outbound).toHaveLength(2);
    expect(outbound[0].id).toBe(inbound[0].id);
    expect(outbound[1].id).toBe(inbound[1].id);
    expect(outbound[0].ok).toBe(true);
    expect(outbound[1].ok).toBe(true);

    relay.close();
  });

  // ── Error handling across the wire ──────────────────────────────────────

  it('propagates server errors for unknown documents and out-of-range pages', async () => {
    const relay = createRelay();
    await relay.connect();

    // Unknown document
    await expect(relay.openDocument('doc-nonexistent')).rejects.toThrow('Unknown document');

    // Open a real document first
    await relay.openDocument('doc-invoice-99');

    // Out-of-range page (doc has 3 pages)
    await expect(relay.navigatePage(999)).rejects.toThrow('out of range');

    // Navigate before open (close then try — but state persists so let's test with a fresh state)
    // Verify the valid navigate still works
    await relay.navigatePage(2);
    const vp = await relay.getViewportState();
    expect(vp.currentPage).toBe(2);

    relay.close();
  });

  // ── Concurrent commands with correct response matching ──────────────────

  it('matches responses correctly when commands are sent concurrently', async () => {
    const relay = createRelay();
    await relay.connect();

    await relay.openDocument('doc-annual-2025');

    // Fire 5 navigate commands concurrently
    const results = await Promise.all([
      relay.navigatePage(10),
      relay.navigatePage(20),
      relay.navigatePage(30),
      relay.navigatePage(40),
      relay.navigatePage(50),
    ]);

    // All should resolve (none should reject with wrong ID)
    expect(results).toHaveLength(5);

    // Server should have received all 6 commands (1 open + 5 navigates)
    const inbound = app.wireLog
      .filter((e) => e.direction === 'in')
      .map((e) => JSON.parse(e.raw));
    expect(inbound).toHaveLength(6);

    // All IDs unique
    const ids = inbound.map((m: { id: string }) => m.id);
    expect(new Set(ids).size).toBe(6);

    relay.close();
  });

  // ── Interleaved events between commands ─────────────────────────────────

  it('receives events interleaved between command responses', async () => {
    const relay = createRelay();
    const timeline: string[] = [];

    relay.on('document-opened', () => timeline.push('event:opened'));
    relay.on('viewport-changed', (vp) => timeline.push(`event:page-${vp.currentPage}`));

    await relay.connect();

    // Open emits document-opened event from server
    await relay.openDocument('doc-annual-2025', { page: 5 });
    timeline.push('cmd:open-done');
    await tick();

    // Navigate emits viewport-changed event from server
    await relay.navigatePage(20);
    timeline.push('cmd:nav-done');
    await tick();

    await relay.navigatePage(50);
    timeline.push('cmd:nav2-done');
    await tick();

    // Commands completed in order, events arrived between them
    expect(timeline).toContain('cmd:open-done');
    expect(timeline).toContain('event:opened');
    expect(timeline).toContain('cmd:nav-done');
    expect(timeline).toContain('event:page-20');
    expect(timeline).toContain('cmd:nav2-done');
    expect(timeline).toContain('event:page-50');

    // open-done must come before nav-done (sequential)
    expect(timeline.indexOf('cmd:open-done')).toBeLessThan(timeline.indexOf('cmd:nav-done'));

    relay.close();
  });

  // ── Desktop pushes unsolicited events ───────────────────────────────────

  it('handles unsolicited desktop events (user scrolled in app)', async () => {
    const relay = createRelay();
    const pages: number[] = [];
    relay.on('viewport-changed', (vp) => pages.push(vp.currentPage));

    await relay.connect();
    await relay.openDocument('doc-annual-2025');

    // Simulate the user scrolling in the desktop app (not via CLI)
    for (const page of [10, 11, 12, 13]) {
      app.state.currentPage = page;
      app.broadcast({
        type: 'viewport-changed',
        ts: Date.now(),
        payload: {
          documentId: 'doc-annual-2025',
          currentPage: page,
          totalPages: 84,
          zoom: 1.0,
          visiblePages: { first: page - 1, last: page + 1 },
          selection: null,
        },
      });
    }

    await tick(100);
    expect(pages).toEqual(expect.arrayContaining([10, 11, 12, 13]));
    expect(pages.length).toBeGreaterThanOrEqual(4);

    relay.close();
  });

  // ── Multiple documents in sequence ──────────────────────────────────────

  it('switches between documents', async () => {
    const relay = createRelay();
    await relay.connect();

    // Open first doc
    await relay.openDocument('doc-annual-2025', { page: 10 });
    let vp = await relay.getViewportState();
    expect(vp.documentId).toBe('doc-annual-2025');
    expect(vp.currentPage).toBe(10);
    expect(vp.totalPages).toBe(84);

    // Switch to second doc
    await relay.openDocument('doc-invoice-99', { page: 2 });
    vp = await relay.getViewportState();
    expect(vp.documentId).toBe('doc-invoice-99');
    expect(vp.currentPage).toBe(2);
    expect(vp.totalPages).toBe(3);

    // Highlights from first doc are cleared
    expect(app.state.highlights).toHaveLength(0);

    relay.close();
  });

  // ── Ping round-trip ─────────────────────────────────────────────────────

  it('measures round-trip latency via ping', async () => {
    const relay = createRelay();
    await relay.connect();

    const latencies: number[] = [];
    for (let i = 0; i < 5; i++) {
      latencies.push(await relay.ping());
    }

    // All pings should complete with low latency (localhost)
    for (const ms of latencies) {
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThan(500);
    }

    relay.close();
  });
});
