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
};
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
};
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
};
export const SandboxStatus = {
    IDLE: "idle",
    BOOTING: "booting",
    READY: "ready",
    ERROR: "error",
};
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
};
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
// =============================================================================
// Runtime Utilities
// =============================================================================
export const EPHEMERAL_EVENT_TYPES = new Set([
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
export function isPersistableEvent(event) {
    return !EPHEMERAL_EVENT_TYPES.has(event.type);
}
export function isClientEvent(data) {
    if (!data || typeof data !== "object")
        return false;
    const maybeEvent = data;
    return (typeof maybeEvent.type === "string" &&
        CLIENT_EVENT_TYPES.has(maybeEvent.type));
}
export function isServerEvent(data) {
    if (!data || typeof data !== "object")
        return false;
    const maybeEvent = data;
    return (typeof maybeEvent.type === "string" &&
        SERVER_EVENT_TYPES.has(maybeEvent.type));
}
export function parseServerEvent(json) {
    try {
        const parsed = JSON.parse(json);
        if (isServerEvent(parsed))
            return parsed;
        return null;
    }
    catch {
        return null;
    }
}
export function parseClientEvent(json) {
    try {
        const parsed = JSON.parse(json);
        if (isClientEvent(parsed))
            return parsed;
        return null;
    }
    catch {
        return null;
    }
}
export function parseAgentOutputMessage(line) {
    if (!line.trim())
        return null;
    try {
        const json = JSON.parse(line);
        const result = agentOutputMessageSchema.safeParse(json);
        return result.success ? result.data : null;
    }
    catch {
        return null;
    }
}
export function parseSystemMessageToLifecycle(msg) {
    const lower = msg.toLowerCase();
    if (lower.includes("booting"))
        return SandboxLifecycle.BOOTING;
    if (lower.includes("environment ready"))
        return SandboxLifecycle.ENVIRONMENT_READY;
    if (lower.includes("files ready") ||
        lower.includes("files loaded") ||
        lower.includes("restored"))
        return SandboxLifecycle.FILES_READY;
    if (lower.includes("installing"))
        return SandboxLifecycle.INSTALLING;
    if (lower.includes("starting"))
        return SandboxLifecycle.STARTING;
    if (lower.includes("interaction ready") || lower.includes("agent ready"))
        return SandboxLifecycle.INTERACTION_READY;
    if (lower.includes("ready"))
        return SandboxLifecycle.READY;
    if (lower.includes("error"))
        return SandboxLifecycle.ERROR;
    return null;
}
//# sourceMappingURL=socket.js.map