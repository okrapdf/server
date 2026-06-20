import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import { RelayClient } from './client.js';
import type { RelayCommand, ViewportState } from './types.js';

// -- Test WS server that speaks the relay protocol ------------------------

function createTestServer(port: number) {
  const wss = new WebSocketServer({ port });
  const received: RelayCommand[] = [];

  // Default handler: auto-ack every command
  let handler = (cmd: RelayCommand, reply: (msg: unknown) => void) => {
    reply({ type: 'response', id: cmd.id, ts: Date.now(), ok: true, payload: {} });
  };

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as RelayCommand;
      received.push(msg);
      handler(msg, (reply) => ws.send(JSON.stringify(reply)));
    });
  });

  return {
    wss,
    received,
    /** Override the default response handler. */
    onCommand(fn: typeof handler) {
      handler = fn;
    },
    /** Push an event to all connected clients. */
    broadcast(event: unknown) {
      for (const ws of wss.clients) {
        ws.send(JSON.stringify(event));
      }
    },
    close() {
      return new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}

const TEST_PORT = 19770; // Avoid colliding with real relay on 9770
const TEST_URL = `ws://localhost:${TEST_PORT}`;

describe('RelayClient', () => {
  let server: ReturnType<typeof createTestServer>;

  beforeEach(() => {
    server = createTestServer(TEST_PORT);
  });

  afterEach(async () => {
    await server.close();
  });

  it('connects and disconnects', async () => {
    const relay = new RelayClient({ url: TEST_URL, autoReconnect: false });
    await relay.connect();
    expect(relay.connected).toBe(true);
    relay.close();
    expect(relay.connected).toBe(false);
  });

  it('sends open-document command', async () => {
    const relay = new RelayClient({ url: TEST_URL, autoReconnect: false });
    await relay.connect();

    await relay.openDocument('doc-abc123', { page: 5, source: 'cli' });

    expect(server.received).toHaveLength(1);
    expect(server.received[0]!.type).toBe('open-document');
    expect(server.received[0]!.payload).toMatchObject({
      documentId: 'doc-abc123',
      page: 5,
      source: 'cli',
    });

    relay.close();
  });

  it('sends navigate-page command', async () => {
    const relay = new RelayClient({ url: TEST_URL, autoReconnect: false });
    await relay.connect();

    await relay.navigatePage(12, { animate: false });

    expect(server.received[0]!.type).toBe('navigate-page');
    expect(server.received[0]!.payload).toMatchObject({ page: 12, animate: false });

    relay.close();
  });

  it('sends highlight-region command', async () => {
    const relay = new RelayClient({ url: TEST_URL, autoReconnect: false });
    await relay.connect();

    await relay.highlightRegion(3, { x: 10, y: 20, width: 100, height: 50 }, {
      style: 'box',
      label: 'Revenue',
      durationMs: 5000,
    });

    expect(server.received[0]!.type).toBe('highlight-region');
    expect(server.received[0]!.payload).toMatchObject({
      page: 3,
      bbox: { x: 10, y: 20, width: 100, height: 50 },
      style: 'box',
      label: 'Revenue',
    });

    relay.close();
  });

  it('returns viewport state from get-viewport-state', async () => {
    const mockViewport: ViewportState = {
      documentId: 'doc-xyz',
      currentPage: 7,
      totalPages: 42,
      zoom: 1.5,
      visiblePages: { first: 6, last: 8 },
      selection: null,
    };

    server.onCommand((cmd, reply) => {
      if (cmd.type === 'get-viewport-state') {
        reply({ type: 'response', id: cmd.id, ts: Date.now(), ok: true, payload: mockViewport });
      } else {
        reply({ type: 'response', id: cmd.id, ts: Date.now(), ok: true, payload: {} });
      }
    });

    const relay = new RelayClient({ url: TEST_URL, autoReconnect: false });
    await relay.connect();

    const vp = await relay.getViewportState();
    expect(vp.documentId).toBe('doc-xyz');
    expect(vp.currentPage).toBe(7);
    expect(vp.zoom).toBe(1.5);

    relay.close();
  });

  it('measures ping latency', async () => {
    const relay = new RelayClient({ url: TEST_URL, autoReconnect: false });
    await relay.connect();

    const latency = await relay.ping();
    expect(latency).toBeGreaterThanOrEqual(0);
    expect(latency).toBeLessThan(1000);

    relay.close();
  });

  it('receives desktop events via on()', async () => {
    const relay = new RelayClient({ url: TEST_URL, autoReconnect: false });
    await relay.connect();

    const pages: number[] = [];
    relay.on('viewport-changed', (vp) => pages.push(vp.currentPage));

    server.broadcast({
      type: 'viewport-changed',
      ts: Date.now(),
      payload: {
        documentId: 'doc-1',
        currentPage: 3,
        totalPages: 10,
        zoom: 1.0,
        visiblePages: { first: 3, last: 3 },
        selection: null,
      },
    });

    // Give the event time to arrive
    await new Promise((r) => setTimeout(r, 50));
    expect(pages).toEqual([3]);

    relay.close();
  });

  it('unsubscribes from events', async () => {
    const relay = new RelayClient({ url: TEST_URL, autoReconnect: false });
    await relay.connect();

    const calls: number[] = [];
    const unsub = relay.on('viewport-changed', (vp) => calls.push(vp.currentPage));

    const broadcastViewport = (page: number) =>
      server.broadcast({
        type: 'viewport-changed',
        ts: Date.now(),
        payload: {
          documentId: 'doc-1',
          currentPage: page,
          totalPages: 10,
          zoom: 1.0,
          visiblePages: { first: page, last: page },
          selection: null,
        },
      });

    broadcastViewport(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toEqual([1]);

    unsub();
    broadcastViewport(2);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toEqual([1]); // No new call after unsub

    relay.close();
  });

  it('rejects commands when not connected', async () => {
    const relay = new RelayClient({ url: TEST_URL, autoReconnect: false });
    await expect(relay.openDocument('doc-1')).rejects.toThrow('not connected');
  });

  it('handles error responses from desktop', async () => {
    server.onCommand((cmd, reply) => {
      reply({
        type: 'response',
        id: cmd.id,
        ts: Date.now(),
        ok: false,
        error: 'Document not found',
        code: 'NOT_FOUND',
      });
    });

    const relay = new RelayClient({ url: TEST_URL, autoReconnect: false });
    await relay.connect();

    await expect(relay.openDocument('doc-missing')).rejects.toThrow('Document not found');

    relay.close();
  });

  it('times out when desktop does not respond', async () => {
    // Server that never replies
    server.onCommand(() => {});

    const relay = new RelayClient({
      url: TEST_URL,
      autoReconnect: false,
      responseTimeoutMs: 200,
    });
    await relay.connect();

    await expect(relay.ping()).rejects.toThrow(/timed out/);

    relay.close();
  });

  it('emits connected and disconnected lifecycle events', async () => {
    const events: string[] = [];

    const relay = new RelayClient({ url: TEST_URL, autoReconnect: false });
    relay.on('connected', () => events.push('connected'));
    relay.on('disconnected', () => events.push('disconnected'));

    await relay.connect();
    expect(events).toEqual(['connected']);

    relay.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(events).toEqual(['connected', 'disconnected']);
  });

  it('rejects pending commands on disconnect', async () => {
    server.onCommand(() => {}); // Never reply

    const relay = new RelayClient({
      url: TEST_URL,
      autoReconnect: false,
      responseTimeoutMs: 5000,
    });
    await relay.connect();

    const pending = relay.ping();
    relay.close();

    await expect(pending).rejects.toThrow('Connection closed');
  });

  it('times out on connection to non-existent server', async () => {
    const relay = new RelayClient({
      url: 'ws://localhost:19999', // Nothing listening here
      autoReconnect: false,
      connectTimeoutMs: 500,
    });

    await expect(relay.connect()).rejects.toThrow(/connection failed/i);
  });
});
