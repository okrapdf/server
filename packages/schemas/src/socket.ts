import { z } from "zod";

// =============================================================================
// Client → Server Event Types (Commands)
// =============================================================================

export const ClientEventType = {
  INIT: "INIT",
  PING: "PING",
  JOIN_SESSION: "JOIN_SESSION",
  START_SANDBOX: "START_SANDBOX",
  STOP_SANDBOX: "STOP_SANDBOX",
  EXEC: "EXEC",
  AGENT_MESSAGE: "AGENT_MESSAGE",
  AGENT_STOP: "AGENT_STOP",
  AGENT_RESET: "AGENT_RESET",
  CANVAS_QUERY: "CANVAS_QUERY",
  CANVAS_LOAD: "CANVAS_LOAD",
  CANVAS_SAVE: "CANVAS_SAVE",
  TASK_QUERY: "TASK_QUERY",
  CHAT_COMPLETION: "CHAT_COMPLETION",
} as const;

export type ClientEventType =
  (typeof ClientEventType)[keyof typeof ClientEventType];

// =============================================================================
// Server → Client Event Types
// =============================================================================

export const ServerEventType = {
  CONNECTED: "CONNECTED",
  READY: "READY",
  PONG: "PONG",
  MESSAGE_ACK: "MESSAGE_ACK",
  MESSAGE_ERROR: "MESSAGE_ERROR",
  EVENTS_BATCH: "EVENTS_BATCH",
  SANDBOX_STATUS: "SANDBOX_STATUS",
  LIFECYCLE: "LIFECYCLE",
  TERM_DATA: "TERM_DATA",
  EXEC_COMPLETE: "EXEC_COMPLETE",
  SYSTEM: "SYSTEM",
  ERROR: "ERROR",
  AGENT_STARTED: "AGENT_STARTED",
  AGENT_MESSAGE: "AGENT_MESSAGE",
  AGENT_ACTION: "AGENT_ACTION",
  AGENT_STEP_COMPLETE: "AGENT_STEP_COMPLETE",
  AGENT_DONE: "AGENT_DONE",
  AGENT_ERROR: "AGENT_ERROR",
  AGENT_EVENT: "AGENT_EVENT",
  AGENT_STATE_CHANGED: "AGENT_STATE_CHANGED",
  FILE_UPLOADED: "FILE_UPLOADED",
  FILES_SYNC: "FILES_SYNC",
  CANVAS_PHASE: "CANVAS_PHASE",
  CANVAS_RESULT: "CANVAS_RESULT",
  CANVAS_CHILD_EVENT: "CANVAS_CHILD_EVENT",
  TASK_PHASE: "TASK_PHASE",
  TASK_RESULT: "TASK_RESULT",
  TASK_CHILD_EVENT: "TASK_CHILD_EVENT",
  CANVAS_SNAPSHOT: "CANVAS_SNAPSHOT",
  CANVAS_SAVED: "CANVAS_SAVED",
  CANVAS_DIFF: "CANVAS_DIFF",
  TOC_REQUEST_RECEIVED: "TOC_REQUEST_RECEIVED",
  TOC_AUTH_COMPLETED: "TOC_AUTH_COMPLETED",
  TOC_DB_QUERY_STARTED: "TOC_DB_QUERY_STARTED",
  TOC_DB_QUERY_COMPLETED: "TOC_DB_QUERY_COMPLETED",
  TOC_GCS_DOWNLOAD_STARTED: "TOC_GCS_DOWNLOAD_STARTED",
  TOC_GCS_DOWNLOAD_COMPLETED: "TOC_GCS_DOWNLOAD_COMPLETED",
  TOC_SANDBOX_CREATED: "TOC_SANDBOX_CREATED",
  TOC_EXTRACTION_STARTED: "TOC_EXTRACTION_STARTED",
  TOC_EXTRACTION_COMPLETED: "TOC_EXTRACTION_COMPLETED",
  TOC_RESPONSE_READY: "TOC_RESPONSE_READY",
  CHAT_STREAM_START: "CHAT_STREAM_START",
  CHAT_STREAM_DELTA: "CHAT_STREAM_DELTA",
  CHAT_STREAM_DONE: "CHAT_STREAM_DONE",
  CHAT_STREAM_ERROR: "CHAT_STREAM_ERROR",
} as const;

export type ServerEventType =
  (typeof ServerEventType)[keyof typeof ServerEventType];

// =============================================================================
// Common Enums
// =============================================================================

/** Explicit agent execution states (OpenHands pattern) */
export const AgentExecutionState = {
  IDLE: "idle",
  RUNNING: "running",
  AWAITING_USER_INPUT: "awaiting_user_input",
  FINISHED: "finished",
  ERROR: "error",
} as const;

export type AgentExecutionState =
  (typeof AgentExecutionState)[keyof typeof AgentExecutionState];

export const SandboxStatus = {
  IDLE: "idle",
  BOOTING: "booting",
  READY: "ready",
  ERROR: "error",
} as const;

export type SandboxStatus =
  (typeof SandboxStatus)[keyof typeof SandboxStatus];

/**
 * Granular lifecycle phases for UI loading states.
 * - idle → booting → environment_ready → files_ready → installing → starting → interaction_ready
 */
export const SandboxLifecycle = {
  IDLE: "idle",
  BOOTING: "booting",
  ENVIRONMENT_READY: "environment_ready",
  FILES_READY: "files_ready",
  INSTALLING: "installing",
  STARTING: "starting",
  INTERACTION_READY: "interaction_ready",
  READY: "ready",
  ERROR: "error",
} as const;

export type SandboxLifecycle =
  (typeof SandboxLifecycle)[keyof typeof SandboxLifecycle];

// =============================================================================
// Client Event Interfaces
// =============================================================================

export interface InitEvent {
  type: "INIT";
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface PingEvent {
  type: "PING";
}

export interface JoinSessionEvent {
  type: "JOIN_SESSION";
  /** Last event ID received — server will send events after this cursor */
  lastEventId?: string;
}

export interface SandboxFile {
  path: string;
  content?: string;
  url?: string;
  encoding?: "utf-8" | "base64";
}

export interface SandboxBootstrapOptions {
  archiveUrl?: string;
  bootstrapUrl?: string;
  files?: SandboxFile[];
  headers?: Record<string, string>;
}

export interface StartSandboxEvent {
  type: "START_SANDBOX";
  template?: string;
  bootstrap?: SandboxBootstrapOptions;
}

export interface StopSandboxEvent {
  type: "STOP_SANDBOX";
}

export interface ExecEvent {
  type: "EXEC";
  cmd: string;
  cwd?: string;
}

/** Reusable reference to a document by job ID */
export interface DocumentRef {
  jobId: string;
  fileName: string;
}

/** Model selection passed by client */
export interface ModelRef {
  id: string;
  provider?: string;
}

/** Identity of the message sender — enables multi-client attribution */
export interface MessageAuthor {
  name: string;
  clientType?: "web" | "cli" | "api";
  clientId?: string;
}

export interface AgentMessageClientEvent {
  type: "AGENT_MESSAGE";
  clientMessageId?: string;
  content: string;
  author?: MessageAuthor;
  model?: ModelRef;
  config?: { temperature?: number; maxTokens?: number };
  systemPrompt?: string;
  systemPromptName?: string;
  systemPromptVariables?: Record<string, string>;
  agentType?: string;
  outputFormat?: {
    type: string;
    name?: string;
    schema: Record<string, unknown>;
  };
}

export interface CanvasQueryClientEvent {
  type: "CANVAS_QUERY";
  content: string;
  documents: DocumentRef[];
  clientMessageId?: string;
  model?: ModelRef;
  author?: MessageAuthor;
  canvasRunId?: string;
}

export interface CanvasLoadClientEvent {
  type: "CANVAS_LOAD";
}

export interface CanvasSaveClientEvent {
  type: "CANVAS_SAVE";
  payload: { snapshot: Record<string, unknown> };
}

export interface TaskQueryClientEvent {
  type: "TASK_QUERY";
  content: string;
  documents?: DocumentRef[];
  model?: ModelRef;
  author?: MessageAuthor;
  taskRunId?: string;
}

export interface AgentStopEvent {
  type: "AGENT_STOP";
}

export interface AgentResetEvent {
  type: "AGENT_RESET";
}

export interface ChatCompletionClientEvent {
  type: "CHAT_COMPLETION";
  requestId: string;
  messages: Array<{ role: string; content: string }>;
  systemPromptSuffix?: string;
  agentConfigOverride?: unknown;
}

export type ClientEvent =
  | InitEvent
  | PingEvent
  | JoinSessionEvent
  | StartSandboxEvent
  | StopSandboxEvent
  | ExecEvent
  | AgentMessageClientEvent
  | AgentStopEvent
  | AgentResetEvent
  | CanvasQueryClientEvent
  | CanvasLoadClientEvent
  | CanvasSaveClientEvent
  | TaskQueryClientEvent
  | ChatCompletionClientEvent;

// =============================================================================
// Server Event Interfaces
// =============================================================================

/** Optional metadata added to persistable server events */
export interface ServerEventMeta {
  eventId?: string;
  eventSequence?: number;
  eventTimestamp?: number;
}

export interface ConnectedServerEvent {
  type: "CONNECTED";
  clientId: string;
  sessionId: string;
}

export interface ReadyServerEvent {
  type: "READY";
  sandboxId: string | null;
  sandboxUrl: string | null;
}

export interface EventsBatchServerEvent {
  type: "EVENTS_BATCH";
  events: PersistableServerEvent[];
  lastEventId: string;
  count: number;
}

export interface PongServerEvent {
  type: "PONG";
  timestamp: number;
}

export interface SandboxStatusServerEvent {
  type: "SANDBOX_STATUS";
  status: "idle" | "booting" | "ready" | "error";
  sandboxId?: string;
  sandboxUrl?: string;
  error?: string;
}

export interface LifecycleServerEvent {
  type: "LIFECYCLE";
  phase: SandboxLifecycle;
  message?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

export interface TermDataServerEvent {
  type: "TERM_DATA";
  data: string;
  stream: "stdout" | "stderr";
}

export interface ExecCompleteServerEvent {
  type: "EXEC_COMPLETE";
  exitCode: number;
}

export interface SystemServerEvent {
  type: "SYSTEM";
  msg: string;
}

export interface ErrorServerEvent {
  type: "ERROR";
  msg: string;
  code?: string;
}

export interface MessageAckServerEvent {
  type: "MESSAGE_ACK";
  clientMessageId: string;
  receivedAt: number;
}

export interface MessageErrorServerEvent {
  type: "MESSAGE_ERROR";
  clientMessageId: string;
  error: string;
}

export interface FileUploadedServerEvent {
  type: "FILE_UPLOADED";
  path: string;
  filename: string;
  url: string;
  mimeType: string;
  description?: string;
  sizeBytes?: number;
}

export interface SandboxFileMeta {
  path: string;
  name: string;
  isDir: boolean;
  size?: number;
}

export interface FilesSyncServerEvent {
  type: "FILES_SYNC";
  files: SandboxFileMeta[];
  dirs: string[];
}

// -- Agent events --

export interface AgentStartedServerEvent {
  type: "AGENT_STARTED";
  prompt?: string;
  clientMessageId?: string;
  author?: MessageAuthor;
}

export interface TextContentBlock {
  type: "text";
  text: string;
}

export interface ToolUseContentBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContentBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | null;
  is_error?: boolean;
}

export type ContentBlock =
  | TextContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock;

export interface AgentMessageServerEvent {
  type: "AGENT_MESSAGE";
  message?: { content: ContentBlock[] };
  subtype?: string;
  total_cost_usd?: number | null;
  duration_ms?: number | null;
  result?: string | null;
  clientMessageId?: string;
}

export interface AgentActionServerEvent {
  type: "AGENT_ACTION";
  action: string;
  id?: string;
  input?: unknown;
  status: "executing" | "complete" | "error";
  result?: string;
  error?: string;
}

export interface AgentStepCompleteServerEvent {
  type: "AGENT_STEP_COMPLETE";
  success?: boolean;
  cost?: number;
  duration?: number;
}

export interface AgentDoneServerEvent {
  type: "AGENT_DONE";
  exitCode?: number;
  sessionId?: string;
  clientMessageId?: string;
}

export interface AgentErrorServerEvent {
  type: "AGENT_ERROR";
  error: string;
  clientMessageId?: string;
}

export interface AgentGenericServerEvent {
  type: "AGENT_EVENT";
  [key: string]: unknown;
}

export interface AgentStateChangedServerEvent {
  type: "AGENT_STATE_CHANGED";
  state: AgentExecutionState;
  reason?: string;
  payload?: unknown;
}

// -- TOC extraction events --

export interface TocEventServerEvent {
  type:
    | "TOC_REQUEST_RECEIVED"
    | "TOC_AUTH_COMPLETED"
    | "TOC_DB_QUERY_STARTED"
    | "TOC_DB_QUERY_COMPLETED"
    | "TOC_GCS_DOWNLOAD_STARTED"
    | "TOC_GCS_DOWNLOAD_COMPLETED"
    | "TOC_SANDBOX_CREATED"
    | "TOC_EXTRACTION_STARTED"
    | "TOC_EXTRACTION_COMPLETED"
    | "TOC_RESPONSE_READY";
  data?: Record<string, unknown>;
  cost?: {
    duration_ms?: number;
    total_usd?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}

// -- Shared orchestration types (Task + Canvas share the same shape) --

export type OrchestratorPhase =
  | "decomposing"
  | "querying"
  | "synthesizing"
  | "done"
  | "error";

export interface OrchestratorChildResult {
  docJobId: string;
  fileName: string;
  answer: string;
  costUsd: number;
  durationMs: number;
  status: "fulfilled" | "failed" | "timeout";
  error?: string;
}

export interface OrchestratorSubQuery {
  docJobId: string;
  query: string;
}

export interface OrchestratorProgress {
  completed: number;
  total: number;
}

// -- Task orchestration events (aliases) --

export type TaskPhase = OrchestratorPhase;
export type TaskChildResult = OrchestratorChildResult;

export interface TaskPhaseServerEvent {
  type: "TASK_PHASE";
  taskRunId: string;
  phase: TaskPhase;
  message?: string;
  subQueries?: OrchestratorSubQuery[];
  progress?: OrchestratorProgress;
}

export interface TaskResultServerEvent {
  type: "TASK_RESULT";
  taskRunId: string;
  synthesis: string;
  childResults: TaskChildResult[];
  totalCostUsd: number;
  totalDurationMs: number;
}

export interface TaskChildEventServerEvent {
  type: "TASK_CHILD_EVENT";
  taskRunId: string;
  docJobId: string;
  childEvent: ServerEvent;
}

// -- Canvas persistence events --

export interface CanvasJobMeta {
  jobId: string;
  status: "queued" | "extracting" | "completed" | "failed";
  totalPages: number;
  pagesCompleted: number;
  fileName: string;
  pages: Array<{
    page: number;
    status: "idle" | "processing" | "completed" | "error";
  }>;
}

export interface CanvasSnapshotServerEvent {
  type: "CANVAS_SNAPSHOT";
  payload: {
    snapshot: object | null;
    version: number;
    documents?: DocumentRef[];
    jobMeta?: CanvasJobMeta[];
    clock?: number;
  };
}

export type CanvasDiffType =
  | "job_status"
  | "page_ready"
  | "entities_updated";

export interface CanvasDiffServerEvent {
  type: "CANVAS_DIFF";
  diffType: CanvasDiffType;
  data: Record<string, unknown>;
  clock: number;
}

export interface CanvasSavedServerEvent {
  type: "CANVAS_SAVED";
  payload: { version: number };
}

// -- Canvas orchestration events (aliases) --

export type CanvasPhase = OrchestratorPhase;
export type CanvasChildResult = OrchestratorChildResult;

export interface CanvasPhaseServerEvent {
  type: "CANVAS_PHASE";
  canvasRunId: string;
  phase: CanvasPhase;
  message?: string;
  subQueries?: OrchestratorSubQuery[];
  progress?: OrchestratorProgress;
}

export interface CanvasResultServerEvent {
  type: "CANVAS_RESULT";
  canvasRunId: string;
  synthesis: string;
  childResults: CanvasChildResult[];
  totalCostUsd: number;
  totalDurationMs: number;
}

export interface CanvasChildEventServerEvent {
  type: "CANVAS_CHILD_EVENT";
  canvasRunId: string;
  docJobId: string;
  childEvent: ServerEvent;
}

// -- Chat completion stream events (WS TTFT optimization) --

export interface ChatStreamStartServerEvent {
  type: "CHAT_STREAM_START";
  requestId: string;
}

export interface ChatStreamDeltaServerEvent {
  type: "CHAT_STREAM_DELTA";
  requestId: string;
  delta: string;
}

export interface ChatStreamDoneServerEvent {
  type: "CHAT_STREAM_DONE";
  requestId: string;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
  model?: string;
}

export interface ChatStreamErrorServerEvent {
  type: "CHAT_STREAM_ERROR";
  requestId: string;
  error: string;
}

export type ChatStreamServerEvent =
  | ChatStreamStartServerEvent
  | ChatStreamDeltaServerEvent
  | ChatStreamDoneServerEvent
  | ChatStreamErrorServerEvent;

// =============================================================================
// Union Types
// =============================================================================

/** Events that are persisted and replayed on reconnection */
export type PersistableServerEvent = (
  | SandboxStatusServerEvent
  | LifecycleServerEvent
  | AgentStartedServerEvent
  | AgentMessageServerEvent
  | AgentActionServerEvent
  | AgentDoneServerEvent
  | AgentErrorServerEvent
  | AgentStateChangedServerEvent
  | SystemServerEvent
  | TocEventServerEvent
  | CanvasPhaseServerEvent
  | CanvasResultServerEvent
) &
  ServerEventMeta;

export type ServerEvent =
  | ConnectedServerEvent
  | ReadyServerEvent
  | EventsBatchServerEvent
  | PongServerEvent
  | MessageAckServerEvent
  | MessageErrorServerEvent
  | SandboxStatusServerEvent
  | LifecycleServerEvent
  | TermDataServerEvent
  | ExecCompleteServerEvent
  | SystemServerEvent
  | ErrorServerEvent
  | FileUploadedServerEvent
  | FilesSyncServerEvent
  | AgentStartedServerEvent
  | AgentMessageServerEvent
  | AgentActionServerEvent
  | AgentStepCompleteServerEvent
  | AgentDoneServerEvent
  | AgentErrorServerEvent
  | AgentGenericServerEvent
  | AgentStateChangedServerEvent
  | TocEventServerEvent
  | CanvasPhaseServerEvent
  | CanvasResultServerEvent
  | CanvasChildEventServerEvent
  | TaskPhaseServerEvent
  | TaskResultServerEvent
  | TaskChildEventServerEvent
  | CanvasSnapshotServerEvent
  | CanvasSavedServerEvent
  | CanvasDiffServerEvent
  | ChatStreamStartServerEvent
  | ChatStreamDeltaServerEvent
  | ChatStreamDoneServerEvent
  | ChatStreamErrorServerEvent;

// =============================================================================
// Session Types
// =============================================================================

export interface SocketAttachment {
  clientId: string;
  userId?: string;
  role?: "owner" | "observer" | "participant";
  connectedAt: number;
}

export interface SessionState {
  sessionId: string;
  sandboxId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentSessionConfig {
  url: string;
  sessionId: string;
  userId?: string;
}

export type CanvasAction =
  | {
      action: "stack";
      shapeIds: string[];
      direction: "horizontal" | "vertical";
      gap?: number;
    }
  | {
      action: "align";
      shapeIds: string[];
      alignment:
        | "left"
        | "right"
        | "top"
        | "bottom"
        | "center-horizontal"
        | "center-vertical";
    }
  | {
      action: "distribute";
      shapeIds: string[];
      direction: "horizontal" | "vertical";
    }
  | { action: "pack"; shapeIds: string[]; gap?: number }
  | { action: "zoomToFit" };

// =============================================================================
// Zod Schemas (Runtime Validation)
// =============================================================================

export const toolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  name: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
});

export const agentTextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const contentBlockSchema = z.discriminatedUnion("type", [
  toolUseBlockSchema,
  agentTextBlockSchema,
]);

export const assistantMessageSchema = z.object({
  type: z.literal("assistant"),
  message: z.object({ content: z.array(contentBlockSchema) }),
});

export const resultMessageSchema = z.object({
  type: z.literal("result"),
  session_id: z.string().optional(),
  total_cost_usd: z.number().optional(),
  duration_ms: z.number().optional(),
});

export const errorMessageSchema = z.object({
  type: z.literal("error"),
  error: z.string(),
});

export const systemMessageSchema = z.object({
  type: z.literal("system"),
  message: z.string(),
});

export const agentOutputMessageSchema = z.discriminatedUnion("type", [
  assistantMessageSchema,
  resultMessageSchema,
  errorMessageSchema,
  systemMessageSchema,
]);

export type ToolUseBlock = z.infer<typeof toolUseBlockSchema>;
export type AgentTextBlock = z.infer<typeof agentTextBlockSchema>;
export type AgentContentBlock = z.infer<typeof contentBlockSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type ResultMessage = z.infer<typeof resultMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
export type SystemMessage = z.infer<typeof systemMessageSchema>;
export type AgentOutputMessage = z.infer<typeof agentOutputMessageSchema>;

// =============================================================================
// Runtime Utilities
// =============================================================================

export const EPHEMERAL_EVENT_TYPES: Set<string> = new Set([
  "CONNECTED",
  "READY",
  "PONG",
  "MESSAGE_ACK",
  "MESSAGE_ERROR",
  "TERM_DATA",
  "EXEC_COMPLETE",
  "EVENTS_BATCH",
  "AGENT_STEP_COMPLETE",
  "AGENT_EVENT",
  "ERROR",
  "CANVAS_CHILD_EVENT",
  "CHAT_STREAM_START",
  "CHAT_STREAM_DELTA",
  "CHAT_STREAM_DONE",
  "CHAT_STREAM_ERROR",
]);

const CLIENT_EVENT_TYPES = new Set(Object.values(ClientEventType));
const SERVER_EVENT_TYPES = new Set(Object.values(ServerEventType));

export function isPersistableEvent(event: ServerEvent): boolean {
  return !EPHEMERAL_EVENT_TYPES.has(event.type);
}

export function isClientEvent(data: unknown): data is ClientEvent {
  if (!data || typeof data !== "object") return false;
  const maybeEvent = data as { type?: unknown };
  return (
    typeof maybeEvent.type === "string" &&
    CLIENT_EVENT_TYPES.has(maybeEvent.type as ClientEventType)
  );
}

export function isServerEvent(data: unknown): data is ServerEvent {
  if (!data || typeof data !== "object") return false;
  const maybeEvent = data as { type?: unknown };
  return (
    typeof maybeEvent.type === "string" &&
    SERVER_EVENT_TYPES.has(maybeEvent.type as ServerEventType)
  );
}

export function parseServerEvent(json: string): ServerEvent | null {
  try {
    const parsed = JSON.parse(json);
    if (isServerEvent(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function parseClientEvent(json: string): ClientEvent | null {
  try {
    const parsed = JSON.parse(json);
    if (isClientEvent(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function parseAgentOutputMessage(
  line: string,
): AgentOutputMessage | null {
  if (!line.trim()) return null;
  try {
    const json = JSON.parse(line);
    const result = agentOutputMessageSchema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parseSystemMessageToLifecycle(
  msg: string,
): SandboxLifecycle | null {
  const lower = msg.toLowerCase();
  if (lower.includes("booting")) return SandboxLifecycle.BOOTING;
  if (lower.includes("environment ready"))
    return SandboxLifecycle.ENVIRONMENT_READY;
  if (
    lower.includes("files ready") ||
    lower.includes("files loaded") ||
    lower.includes("restored")
  )
    return SandboxLifecycle.FILES_READY;
  if (lower.includes("installing")) return SandboxLifecycle.INSTALLING;
  if (lower.includes("starting")) return SandboxLifecycle.STARTING;
  if (lower.includes("interaction ready") || lower.includes("agent ready"))
    return SandboxLifecycle.INTERACTION_READY;
  if (lower.includes("ready")) return SandboxLifecycle.READY;
  if (lower.includes("error")) return SandboxLifecycle.ERROR;
  return null;
}

/** Legacy alias */
export type ClientMessage = ClientEvent;
