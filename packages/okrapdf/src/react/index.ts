// Provider
export { OkraProvider, useOkra, useOkraDocument } from './provider';
export type { OkraProviderProps, OkraContextValue } from './provider';

// Hooks
export { useDocumentStatus } from './use-document-status';
export { usePages } from './use-pages';
export { usePageContent } from './use-page-content';
export { useChat } from './use-chat';
export {
  adaptChatMessages,
  libreChatAdapter,
  toLibreChatMessage,
  toLibreChatMessages,
  useAdaptedChatMessages,
  useLibreChatMessages,
} from './chat-adapters';
export { useDocumentQuery } from './use-document-query';
export { useOkraQuery } from './use-okra-query';
export { createOkraContext } from './create-okra-context';
export { normalizeOkraRpcArgs } from './rpc-schema';

// DocumentAgent contract types — the canonical shape served by api.okrapdf.com.
// Used as default generic arguments for createOkraContext so `createOkraContext()`
// (no generics) gives you the standard state and methods out of the box.
export type {
  DocumentPhase,
  DocumentFacetSummary,
  DocumentAgentUiState,
  DocumentAgentState,
  DocumentAgentMethods,
  TriggerRenderParams,
  TriggerParseParams,
  TriggerExtractParams,
  TriggerExtractResult,
} from './agent-types';

// Hook option/return types
export type { UseDocumentStatusOptions, UseDocumentStatusReturn } from './use-document-status';
export type { UsePagesOptions, UsePagesReturn } from './use-pages';
export type { UsePageContentOptions, UsePageContentReturn } from './use-page-content';
export type { UseDocumentQueryOptions, UseDocumentQueryReturn } from './use-document-query';
export type { UseOkraQueryOptions } from './use-okra-query';
export type {
  CreateOkraContextOptions,
  OkraAuthEndpointRequest,
  OkraAuthEndpointResponse,
} from './create-okra-context';

// Shared types
export type {
  Message,
  ChatStatus,
  ChatMessageAdapter,
  LibreChatMessage,
  OkraDocumentStatus,
  UseOkraDocumentReturn,
  UseOkraQueryReturn,
  UseChatReturn,
  ChatConfig,
  // Re-exported from ../types
  OkraSession,
  CompletionEvent,
  DocumentStatus,
  GenerateResult,
  Page,
} from './types';
