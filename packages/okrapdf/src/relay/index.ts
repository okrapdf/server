/**
 * okraPDF Desktop Relay
 *
 * WebSocket bridge between the okra CLI and the native macOS desktop app.
 * The desktop app runs a WS server on localhost:9770; the CLI connects as
 * a client and sends typed commands (open-document, navigate-page, etc.).
 *
 * @example
 *   import { RelayClient } from 'okrapdf/relay';
 *
 *   const relay = new RelayClient();
 *   await relay.connect();
 *   await relay.openDocument('doc-abc', { page: 3 });
 *   const vp = await relay.getViewportState();
 *   relay.on('selection-changed', (sel) => console.log(sel?.text));
 *   relay.close();
 */

export { RelayClient } from './client.js';

export type {
  // Protocol envelope
  RelayEnvelope,

  // Geometry
  BBox,

  // Commands (CLI -> Desktop)
  OpenDocumentCommand,
  NavigatePageCommand,
  HighlightRegionCommand,
  ClearHighlightsCommand,
  GetViewportStateCommand,
  PingCommand,
  RelayCommand,
  RelayCommandType,

  // Responses (Desktop -> CLI)
  RelayOkResponse,
  RelayErrorResponse,
  RelayResponse,

  // Viewport
  ViewportState,

  // Events (Desktop -> CLI)
  ViewportChangedEvent,
  DocumentOpenedEvent,
  DocumentClosedEvent,
  SelectionChangedEvent,
  AppStateEvent,
  RelayEvent,
  RelayEventType,
  RelayInbound,

  // Config
  RelayConfig,
} from './types.js';

export { RELAY_DEFAULTS, RELAY_PORT } from './types.js';
