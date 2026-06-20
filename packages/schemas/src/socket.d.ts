import { z } from "zod";
export declare const ClientEventType: {
    readonly INIT: "INIT";
    readonly PING: "PING";
    readonly JOIN_SESSION: "JOIN_SESSION";
    readonly START_SANDBOX: "START_SANDBOX";
    readonly STOP_SANDBOX: "STOP_SANDBOX";
    readonly EXEC: "EXEC";
    readonly AGENT_MESSAGE: "AGENT_MESSAGE";
    readonly AGENT_STOP: "AGENT_STOP";
    readonly AGENT_RESET: "AGENT_RESET";
    readonly CANVAS_QUERY: "CANVAS_QUERY";
    readonly CANVAS_LOAD: "CANVAS_LOAD";
    readonly CANVAS_SAVE: "CANVAS_SAVE";
    readonly TASK_QUERY: "TASK_QUERY";
    readonly CHAT_COMPLETION: "CHAT_COMPLETION";
};
export type ClientEventType = (typeof ClientEventType)[keyof typeof ClientEventType];
export declare const ServerEventType: {
    readonly CONNECTED: "CONNECTED";
    readonly READY: "READY";
    readonly PONG: "PONG";
    readonly MESSAGE_ACK: "MESSAGE_ACK";
    readonly MESSAGE_ERROR: "MESSAGE_ERROR";
    readonly EVENTS_BATCH: "EVENTS_BATCH";
    readonly SANDBOX_STATUS: "SANDBOX_STATUS";
    readonly LIFECYCLE: "LIFECYCLE";
    readonly TERM_DATA: "TERM_DATA";
    readonly EXEC_COMPLETE: "EXEC_COMPLETE";
    readonly SYSTEM: "SYSTEM";
    readonly ERROR: "ERROR";
    readonly AGENT_STARTED: "AGENT_STARTED";
    readonly AGENT_MESSAGE: "AGENT_MESSAGE";
    readonly AGENT_ACTION: "AGENT_ACTION";
    readonly AGENT_STEP_COMPLETE: "AGENT_STEP_COMPLETE";
    readonly AGENT_DONE: "AGENT_DONE";
    readonly AGENT_ERROR: "AGENT_ERROR";
    readonly AGENT_EVENT: "AGENT_EVENT";
    readonly AGENT_STATE_CHANGED: "AGENT_STATE_CHANGED";
    readonly FILE_UPLOADED: "FILE_UPLOADED";
    readonly FILES_SYNC: "FILES_SYNC";
    readonly CANVAS_PHASE: "CANVAS_PHASE";
    readonly CANVAS_RESULT: "CANVAS_RESULT";
    readonly CANVAS_CHILD_EVENT: "CANVAS_CHILD_EVENT";
    readonly TASK_PHASE: "TASK_PHASE";
    readonly TASK_RESULT: "TASK_RESULT";
    readonly TASK_CHILD_EVENT: "TASK_CHILD_EVENT";
    readonly CANVAS_SNAPSHOT: "CANVAS_SNAPSHOT";
    readonly CANVAS_SAVED: "CANVAS_SAVED";
    readonly CANVAS_DIFF: "CANVAS_DIFF";
    readonly TOC_REQUEST_RECEIVED: "TOC_REQUEST_RECEIVED";
    readonly TOC_AUTH_COMPLETED: "TOC_AUTH_COMPLETED";
    readonly TOC_DB_QUERY_STARTED: "TOC_DB_QUERY_STARTED";
    readonly TOC_DB_QUERY_COMPLETED: "TOC_DB_QUERY_COMPLETED";
    readonly TOC_GCS_DOWNLOAD_STARTED: "TOC_GCS_DOWNLOAD_STARTED";
    readonly TOC_GCS_DOWNLOAD_COMPLETED: "TOC_GCS_DOWNLOAD_COMPLETED";
    readonly TOC_SANDBOX_CREATED: "TOC_SANDBOX_CREATED";
    readonly TOC_EXTRACTION_STARTED: "TOC_EXTRACTION_STARTED";
    readonly TOC_EXTRACTION_COMPLETED: "TOC_EXTRACTION_COMPLETED";
    readonly TOC_RESPONSE_READY: "TOC_RESPONSE_READY";
    readonly CHAT_STREAM_START: "CHAT_STREAM_START";
    readonly CHAT_STREAM_DELTA: "CHAT_STREAM_DELTA";
    readonly CHAT_STREAM_DONE: "CHAT_STREAM_DONE";
    readonly CHAT_STREAM_ERROR: "CHAT_STREAM_ERROR";
};
export type ServerEventType = (typeof ServerEventType)[keyof typeof ServerEventType];
/** Explicit agent execution states (OpenHands pattern) */
export declare const AgentExecutionState: {
    readonly IDLE: "idle";
    readonly RUNNING: "running";
    readonly AWAITING_USER_INPUT: "awaiting_user_input";
    readonly FINISHED: "finished";
    readonly ERROR: "error";
};
export type AgentExecutionState = (typeof AgentExecutionState)[keyof typeof AgentExecutionState];
export declare const SandboxStatus: {
    readonly IDLE: "idle";
    readonly BOOTING: "booting";
    readonly READY: "ready";
    readonly ERROR: "error";
};
export type SandboxStatus = (typeof SandboxStatus)[keyof typeof SandboxStatus];
/**
 * Granular lifecycle phases for UI loading states.
 * - idle → booting → environment_ready → files_ready → installing → starting → interaction_ready
 */
export declare const SandboxLifecycle: {
    readonly IDLE: "idle";
    readonly BOOTING: "booting";
    readonly ENVIRONMENT_READY: "environment_ready";
    readonly FILES_READY: "files_ready";
    readonly INSTALLING: "installing";
    readonly STARTING: "starting";
    readonly INTERACTION_READY: "interaction_ready";
    readonly READY: "ready";
    readonly ERROR: "error";
};
export type SandboxLifecycle = (typeof SandboxLifecycle)[keyof typeof SandboxLifecycle];
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
    config?: {
        temperature?: number;
        maxTokens?: number;
    };
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
    payload: {
        snapshot: Record<string, unknown>;
    };
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
    messages: Array<{
        role: string;
        content: string;
    }>;
    systemPromptSuffix?: string;
    agentConfigOverride?: unknown;
}
export type ClientEvent = InitEvent | PingEvent | JoinSessionEvent | StartSandboxEvent | StopSandboxEvent | ExecEvent | AgentMessageClientEvent | AgentStopEvent | AgentResetEvent | CanvasQueryClientEvent | CanvasLoadClientEvent | CanvasSaveClientEvent | TaskQueryClientEvent | ChatCompletionClientEvent;
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
export type ContentBlock = TextContentBlock | ToolUseContentBlock | ToolResultContentBlock;
export interface AgentMessageServerEvent {
    type: "AGENT_MESSAGE";
    message?: {
        content: ContentBlock[];
    };
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
export interface TocEventServerEvent {
    type: "TOC_REQUEST_RECEIVED" | "TOC_AUTH_COMPLETED" | "TOC_DB_QUERY_STARTED" | "TOC_DB_QUERY_COMPLETED" | "TOC_GCS_DOWNLOAD_STARTED" | "TOC_GCS_DOWNLOAD_COMPLETED" | "TOC_SANDBOX_CREATED" | "TOC_EXTRACTION_STARTED" | "TOC_EXTRACTION_COMPLETED" | "TOC_RESPONSE_READY";
    data?: Record<string, unknown>;
    cost?: {
        duration_ms?: number;
        total_usd?: number;
        input_tokens?: number;
        output_tokens?: number;
    };
}
export type OrchestratorPhase = "decomposing" | "querying" | "synthesizing" | "done" | "error";
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
export type CanvasDiffType = "job_status" | "page_ready" | "entities_updated";
export interface CanvasDiffServerEvent {
    type: "CANVAS_DIFF";
    diffType: CanvasDiffType;
    data: Record<string, unknown>;
    clock: number;
}
export interface CanvasSavedServerEvent {
    type: "CANVAS_SAVED";
    payload: {
        version: number;
    };
}
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
    usage?: {
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
    };
    model?: string;
}
export interface ChatStreamErrorServerEvent {
    type: "CHAT_STREAM_ERROR";
    requestId: string;
    error: string;
}
export type ChatStreamServerEvent = ChatStreamStartServerEvent | ChatStreamDeltaServerEvent | ChatStreamDoneServerEvent | ChatStreamErrorServerEvent;
/** Events that are persisted and replayed on reconnection */
export type PersistableServerEvent = (SandboxStatusServerEvent | LifecycleServerEvent | AgentStartedServerEvent | AgentMessageServerEvent | AgentActionServerEvent | AgentDoneServerEvent | AgentErrorServerEvent | AgentStateChangedServerEvent | SystemServerEvent | TocEventServerEvent | CanvasPhaseServerEvent | CanvasResultServerEvent) & ServerEventMeta;
export type ServerEvent = ConnectedServerEvent | ReadyServerEvent | EventsBatchServerEvent | PongServerEvent | MessageAckServerEvent | MessageErrorServerEvent | SandboxStatusServerEvent | LifecycleServerEvent | TermDataServerEvent | ExecCompleteServerEvent | SystemServerEvent | ErrorServerEvent | FileUploadedServerEvent | FilesSyncServerEvent | AgentStartedServerEvent | AgentMessageServerEvent | AgentActionServerEvent | AgentStepCompleteServerEvent | AgentDoneServerEvent | AgentErrorServerEvent | AgentGenericServerEvent | AgentStateChangedServerEvent | TocEventServerEvent | CanvasPhaseServerEvent | CanvasResultServerEvent | CanvasChildEventServerEvent | TaskPhaseServerEvent | TaskResultServerEvent | TaskChildEventServerEvent | CanvasSnapshotServerEvent | CanvasSavedServerEvent | CanvasDiffServerEvent | ChatStreamStartServerEvent | ChatStreamDeltaServerEvent | ChatStreamDoneServerEvent | ChatStreamErrorServerEvent;
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
export type CanvasAction = {
    action: "stack";
    shapeIds: string[];
    direction: "horizontal" | "vertical";
    gap?: number;
} | {
    action: "align";
    shapeIds: string[];
    alignment: "left" | "right" | "top" | "bottom" | "center-horizontal" | "center-vertical";
} | {
    action: "distribute";
    shapeIds: string[];
    direction: "horizontal" | "vertical";
} | {
    action: "pack";
    shapeIds: string[];
    gap?: number;
} | {
    action: "zoomToFit";
};
export declare const toolUseBlockSchema: z.ZodObject<{
    type: z.ZodLiteral<"tool_use">;
    name: z.ZodString;
    input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    type: "tool_use";
    input?: Record<string, unknown> | undefined;
}, {
    name: string;
    type: "tool_use";
    input?: Record<string, unknown> | undefined;
}>;
export declare const agentTextBlockSchema: z.ZodObject<{
    type: z.ZodLiteral<"text">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "text";
    text: string;
}, {
    type: "text";
    text: string;
}>;
export declare const contentBlockSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"tool_use">;
    name: z.ZodString;
    input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    type: "tool_use";
    input?: Record<string, unknown> | undefined;
}, {
    name: string;
    type: "tool_use";
    input?: Record<string, unknown> | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"text">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "text";
    text: string;
}, {
    type: "text";
    text: string;
}>]>;
export declare const assistantMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"assistant">;
    message: z.ZodObject<{
        content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"tool_use">;
            name: z.ZodString;
            input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            type: "tool_use";
            input?: Record<string, unknown> | undefined;
        }, {
            name: string;
            type: "tool_use";
            input?: Record<string, unknown> | undefined;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>]>, "many">;
    }, "strip", z.ZodTypeAny, {
        content: ({
            name: string;
            type: "tool_use";
            input?: Record<string, unknown> | undefined;
        } | {
            type: "text";
            text: string;
        })[];
    }, {
        content: ({
            name: string;
            type: "tool_use";
            input?: Record<string, unknown> | undefined;
        } | {
            type: "text";
            text: string;
        })[];
    }>;
}, "strip", z.ZodTypeAny, {
    message: {
        content: ({
            name: string;
            type: "tool_use";
            input?: Record<string, unknown> | undefined;
        } | {
            type: "text";
            text: string;
        })[];
    };
    type: "assistant";
}, {
    message: {
        content: ({
            name: string;
            type: "tool_use";
            input?: Record<string, unknown> | undefined;
        } | {
            type: "text";
            text: string;
        })[];
    };
    type: "assistant";
}>;
export declare const resultMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"result">;
    session_id: z.ZodOptional<z.ZodString>;
    total_cost_usd: z.ZodOptional<z.ZodNumber>;
    duration_ms: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "result";
    session_id?: string | undefined;
    duration_ms?: number | undefined;
    total_cost_usd?: number | undefined;
}, {
    type: "result";
    session_id?: string | undefined;
    duration_ms?: number | undefined;
    total_cost_usd?: number | undefined;
}>;
export declare const errorMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"error">;
    error: z.ZodString;
}, "strip", z.ZodTypeAny, {
    error: string;
    type: "error";
}, {
    error: string;
    type: "error";
}>;
export declare const systemMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"system">;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    type: "system";
}, {
    message: string;
    type: "system";
}>;
export declare const agentOutputMessageSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"assistant">;
    message: z.ZodObject<{
        content: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
            type: z.ZodLiteral<"tool_use">;
            name: z.ZodString;
            input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            type: "tool_use";
            input?: Record<string, unknown> | undefined;
        }, {
            name: string;
            type: "tool_use";
            input?: Record<string, unknown> | undefined;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>]>, "many">;
    }, "strip", z.ZodTypeAny, {
        content: ({
            name: string;
            type: "tool_use";
            input?: Record<string, unknown> | undefined;
        } | {
            type: "text";
            text: string;
        })[];
    }, {
        content: ({
            name: string;
            type: "tool_use";
            input?: Record<string, unknown> | undefined;
        } | {
            type: "text";
            text: string;
        })[];
    }>;
}, "strip", z.ZodTypeAny, {
    message: {
        content: ({
            name: string;
            type: "tool_use";
            input?: Record<string, unknown> | undefined;
        } | {
            type: "text";
            text: string;
        })[];
    };
    type: "assistant";
}, {
    message: {
        content: ({
            name: string;
            type: "tool_use";
            input?: Record<string, unknown> | undefined;
        } | {
            type: "text";
            text: string;
        })[];
    };
    type: "assistant";
}>, z.ZodObject<{
    type: z.ZodLiteral<"result">;
    session_id: z.ZodOptional<z.ZodString>;
    total_cost_usd: z.ZodOptional<z.ZodNumber>;
    duration_ms: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "result";
    session_id?: string | undefined;
    duration_ms?: number | undefined;
    total_cost_usd?: number | undefined;
}, {
    type: "result";
    session_id?: string | undefined;
    duration_ms?: number | undefined;
    total_cost_usd?: number | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"error">;
    error: z.ZodString;
}, "strip", z.ZodTypeAny, {
    error: string;
    type: "error";
}, {
    error: string;
    type: "error";
}>, z.ZodObject<{
    type: z.ZodLiteral<"system">;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    type: "system";
}, {
    message: string;
    type: "system";
}>]>;
export type ToolUseBlock = z.infer<typeof toolUseBlockSchema>;
export type AgentTextBlock = z.infer<typeof agentTextBlockSchema>;
export type AgentContentBlock = z.infer<typeof contentBlockSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type ResultMessage = z.infer<typeof resultMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
export type SystemMessage = z.infer<typeof systemMessageSchema>;
export type AgentOutputMessage = z.infer<typeof agentOutputMessageSchema>;
export declare const EPHEMERAL_EVENT_TYPES: Set<string>;
export declare function isPersistableEvent(event: ServerEvent): boolean;
export declare function isClientEvent(data: unknown): data is ClientEvent;
export declare function isServerEvent(data: unknown): data is ServerEvent;
export declare function parseServerEvent(json: string): ServerEvent | null;
export declare function parseClientEvent(json: string): ClientEvent | null;
export declare function parseAgentOutputMessage(line: string): AgentOutputMessage | null;
export declare function parseSystemMessageToLifecycle(msg: string): SandboxLifecycle | null;
/** Legacy alias */
export type ClientMessage = ClientEvent;
//# sourceMappingURL=socket.d.ts.map