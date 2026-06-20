import { z } from "zod";
export declare const CONTROL_PLANE_PROTOCOL_VERSION = "2026-03-31";
export declare const controlPlaneTransportSchema: z.ZodEnum<["websocket", "http", "sse", "ndjson"]>;
export type ControlPlaneTransport = z.infer<typeof controlPlaneTransportSchema>;
export declare const controlPlaneCategorySchema: z.ZodEnum<["session", "sandbox", "agent", "task", "canvas", "toc", "chat_stream", "system", "transport"]>;
export type ControlPlaneCategory = z.infer<typeof controlPlaneCategorySchema>;
export declare const controlPlaneStageSchema: z.ZodEnum<["stable", "experimental", "planned"]>;
export type ControlPlaneStage = z.infer<typeof controlPlaneStageSchema>;
export declare const controlPlaneRequirementIdSchema: z.ZodEnum<["attachable_sessions", "deterministic_replay", "stable_persisted_event_metadata", "explicit_client_correlation", "event_driven_ui", "separate_live_stream_and_audit_log", "multi_transport_contract", "first_class_permissions", "cloudflare_agents_compatible_events"]>;
export type ControlPlaneRequirementId = z.infer<typeof controlPlaneRequirementIdSchema>;
export declare const controlPlaneRequirementSchema: z.ZodObject<{
    id: z.ZodEnum<["attachable_sessions", "deterministic_replay", "stable_persisted_event_metadata", "explicit_client_correlation", "event_driven_ui", "separate_live_stream_and_audit_log", "multi_transport_contract", "first_class_permissions", "cloudflare_agents_compatible_events"]>;
    stage: z.ZodEnum<["implemented", "planned"]>;
    summary: z.ZodString;
    rationale: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: "attachable_sessions" | "deterministic_replay" | "stable_persisted_event_metadata" | "explicit_client_correlation" | "event_driven_ui" | "separate_live_stream_and_audit_log" | "multi_transport_contract" | "first_class_permissions" | "cloudflare_agents_compatible_events";
    summary: string;
    stage: "planned" | "implemented";
    rationale: string;
}, {
    id: "attachable_sessions" | "deterministic_replay" | "stable_persisted_event_metadata" | "explicit_client_correlation" | "event_driven_ui" | "separate_live_stream_and_audit_log" | "multi_transport_contract" | "first_class_permissions" | "cloudflare_agents_compatible_events";
    summary: string;
    stage: "planned" | "implemented";
    rationale: string;
}>;
export type ControlPlaneRequirement = z.infer<typeof controlPlaneRequirementSchema>;
export declare const CONTROL_PLANE_REQUIREMENTS: {
    id: "attachable_sessions" | "deterministic_replay" | "stable_persisted_event_metadata" | "explicit_client_correlation" | "event_driven_ui" | "separate_live_stream_and_audit_log" | "multi_transport_contract" | "first_class_permissions" | "cloudflare_agents_compatible_events";
    summary: string;
    stage: "planned" | "implemented";
    rationale: string;
}[];
export declare const controlPlaneRuntimeSchema: z.ZodEnum<["local_agent", "cloudflare_agent", "shared"]>;
export type ControlPlaneRuntime = z.infer<typeof controlPlaneRuntimeSchema>;
export declare const controlPlaneRuntimeStatusSchema: z.ZodEnum<["current", "target", "transitional"]>;
export type ControlPlaneRuntimeStatus = z.infer<typeof controlPlaneRuntimeStatusSchema>;
export declare const controlPlaneRuntimeScopeSchema: z.ZodObject<{
    runtime: z.ZodEnum<["local_agent", "cloudflare_agent", "shared"]>;
    status: z.ZodEnum<["current", "target", "transitional"]>;
    summary: z.ZodString;
    responsibilities: z.ZodArray<z.ZodString, "many">;
    excludedResponsibilities: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    requirementRefs: z.ZodArray<z.ZodEnum<["attachable_sessions", "deterministic_replay", "stable_persisted_event_metadata", "explicit_client_correlation", "event_driven_ui", "separate_live_stream_and_audit_log", "multi_transport_contract", "first_class_permissions", "cloudflare_agents_compatible_events"]>, "many">;
    commandRefs: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    eventRefs: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    status: "current" | "target" | "transitional";
    runtime: "local_agent" | "cloudflare_agent" | "shared";
    summary: string;
    responsibilities: string[];
    excludedResponsibilities: string[];
    requirementRefs: ("attachable_sessions" | "deterministic_replay" | "stable_persisted_event_metadata" | "explicit_client_correlation" | "event_driven_ui" | "separate_live_stream_and_audit_log" | "multi_transport_contract" | "first_class_permissions" | "cloudflare_agents_compatible_events")[];
    commandRefs: string[];
    eventRefs: string[];
}, {
    status: "current" | "target" | "transitional";
    runtime: "local_agent" | "cloudflare_agent" | "shared";
    summary: string;
    responsibilities: string[];
    requirementRefs: ("attachable_sessions" | "deterministic_replay" | "stable_persisted_event_metadata" | "explicit_client_correlation" | "event_driven_ui" | "separate_live_stream_and_audit_log" | "multi_transport_contract" | "first_class_permissions" | "cloudflare_agents_compatible_events")[];
    excludedResponsibilities?: string[] | undefined;
    commandRefs?: string[] | undefined;
    eventRefs?: string[] | undefined;
}>;
export type ControlPlaneRuntimeScope = z.infer<typeof controlPlaneRuntimeScopeSchema>;
export declare const CONTROL_PLANE_RUNTIME_SCOPES: {
    status: "current" | "target" | "transitional";
    runtime: "local_agent" | "cloudflare_agent" | "shared";
    summary: string;
    responsibilities: string[];
    excludedResponsibilities: string[];
    requirementRefs: ("attachable_sessions" | "deterministic_replay" | "stable_persisted_event_metadata" | "explicit_client_correlation" | "event_driven_ui" | "separate_live_stream_and_audit_log" | "multi_transport_contract" | "first_class_permissions" | "cloudflare_agents_compatible_events")[];
    commandRefs: string[];
    eventRefs: string[];
}[];
export declare const controlPlaneTodoIdSchema: z.ZodEnum<["runtime_split_local_vs_cloudflare", "dual_run_api_attachable_endpoints", "desktop_swift_pilot_consumer", "sse_surface_for_attachable_clients", "first_class_permission_protocol", "cloudflare_agents_event_projection", "share_and_parse_events_on_hosted_runtime"]>;
export type ControlPlaneTodoId = z.infer<typeof controlPlaneTodoIdSchema>;
export declare const controlPlaneTodoStatusSchema: z.ZodEnum<["todo", "in_progress", "blocked"]>;
export type ControlPlaneTodoStatus = z.infer<typeof controlPlaneTodoStatusSchema>;
export declare const controlPlaneTodoSchema: z.ZodObject<{
    id: z.ZodEnum<["runtime_split_local_vs_cloudflare", "dual_run_api_attachable_endpoints", "desktop_swift_pilot_consumer", "sse_surface_for_attachable_clients", "first_class_permission_protocol", "cloudflare_agents_event_projection", "share_and_parse_events_on_hosted_runtime"]>;
    status: z.ZodEnum<["todo", "in_progress", "blocked"]>;
    ownerRuntime: z.ZodEnum<["local_agent", "cloudflare_agent", "shared"]>;
    summary: z.ZodString;
    desiredOutcome: z.ZodString;
    requirementRefs: z.ZodArray<z.ZodEnum<["attachable_sessions", "deterministic_replay", "stable_persisted_event_metadata", "explicit_client_correlation", "event_driven_ui", "separate_live_stream_and_audit_log", "multi_transport_contract", "first_class_permissions", "cloudflare_agents_compatible_events"]>, "many">;
    references: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    status: "todo" | "in_progress" | "blocked";
    id: "runtime_split_local_vs_cloudflare" | "dual_run_api_attachable_endpoints" | "desktop_swift_pilot_consumer" | "sse_surface_for_attachable_clients" | "first_class_permission_protocol" | "cloudflare_agents_event_projection" | "share_and_parse_events_on_hosted_runtime";
    summary: string;
    requirementRefs: ("attachable_sessions" | "deterministic_replay" | "stable_persisted_event_metadata" | "explicit_client_correlation" | "event_driven_ui" | "separate_live_stream_and_audit_log" | "multi_transport_contract" | "first_class_permissions" | "cloudflare_agents_compatible_events")[];
    ownerRuntime: "local_agent" | "cloudflare_agent" | "shared";
    desiredOutcome: string;
    references: string[];
}, {
    status: "todo" | "in_progress" | "blocked";
    id: "runtime_split_local_vs_cloudflare" | "dual_run_api_attachable_endpoints" | "desktop_swift_pilot_consumer" | "sse_surface_for_attachable_clients" | "first_class_permission_protocol" | "cloudflare_agents_event_projection" | "share_and_parse_events_on_hosted_runtime";
    summary: string;
    requirementRefs: ("attachable_sessions" | "deterministic_replay" | "stable_persisted_event_metadata" | "explicit_client_correlation" | "event_driven_ui" | "separate_live_stream_and_audit_log" | "multi_transport_contract" | "first_class_permissions" | "cloudflare_agents_compatible_events")[];
    ownerRuntime: "local_agent" | "cloudflare_agent" | "shared";
    desiredOutcome: string;
    references: string[];
}>;
export type ControlPlaneTodo = z.infer<typeof controlPlaneTodoSchema>;
export declare const CONTROL_PLANE_TODOS: {
    status: "todo" | "in_progress" | "blocked";
    id: "runtime_split_local_vs_cloudflare" | "dual_run_api_attachable_endpoints" | "desktop_swift_pilot_consumer" | "sse_surface_for_attachable_clients" | "first_class_permission_protocol" | "cloudflare_agents_event_projection" | "share_and_parse_events_on_hosted_runtime";
    summary: string;
    requirementRefs: ("attachable_sessions" | "deterministic_replay" | "stable_persisted_event_metadata" | "explicit_client_correlation" | "event_driven_ui" | "separate_live_stream_and_audit_log" | "multi_transport_contract" | "first_class_permissions" | "cloudflare_agents_compatible_events")[];
    ownerRuntime: "local_agent" | "cloudflare_agent" | "shared";
    desiredOutcome: string;
    references: string[];
}[];
export declare const controlPlaneClientCommandTypeSchema: z.ZodEnum<["INIT", "PING", "JOIN_SESSION", "START_SANDBOX", "STOP_SANDBOX", "EXEC", "AGENT_MESSAGE", "AGENT_STOP", "AGENT_RESET", "CANVAS_QUERY", "CANVAS_LOAD", "CANVAS_SAVE", "TASK_QUERY", "CHAT_COMPLETION"]>;
export type ControlPlaneClientCommandType = z.infer<typeof controlPlaneClientCommandTypeSchema>;
export declare const controlPlaneClientCommandDefinitionSchema: z.ZodObject<{
    type: z.ZodEnum<["INIT", "PING", "JOIN_SESSION", "START_SANDBOX", "STOP_SANDBOX", "EXEC", "AGENT_MESSAGE", "AGENT_STOP", "AGENT_RESET", "CANVAS_QUERY", "CANVAS_LOAD", "CANVAS_SAVE", "TASK_QUERY", "CHAT_COMPLETION"]>;
    category: z.ZodEnum<["session", "sandbox", "agent", "task", "canvas", "toc", "chat_stream", "system", "transport"]>;
    stage: z.ZodEnum<["stable", "experimental", "planned"]>;
    transports: z.ZodArray<z.ZodEnum<["websocket", "http", "sse", "ndjson"]>, "many">;
    description: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "AGENT_MESSAGE" | "PING" | "JOIN_SESSION" | "TASK_QUERY" | "CANVAS_LOAD" | "CANVAS_SAVE" | "CANVAS_QUERY" | "INIT" | "START_SANDBOX" | "STOP_SANDBOX" | "EXEC" | "AGENT_STOP" | "AGENT_RESET" | "CHAT_COMPLETION";
    description: string;
    stage: "stable" | "experimental" | "planned";
    category: "task" | "session" | "canvas" | "system" | "agent" | "sandbox" | "transport" | "toc" | "chat_stream";
    transports: ("websocket" | "sse" | "http" | "ndjson")[];
}, {
    type: "AGENT_MESSAGE" | "PING" | "JOIN_SESSION" | "TASK_QUERY" | "CANVAS_LOAD" | "CANVAS_SAVE" | "CANVAS_QUERY" | "INIT" | "START_SANDBOX" | "STOP_SANDBOX" | "EXEC" | "AGENT_STOP" | "AGENT_RESET" | "CHAT_COMPLETION";
    description: string;
    stage: "stable" | "experimental" | "planned";
    category: "task" | "session" | "canvas" | "system" | "agent" | "sandbox" | "transport" | "toc" | "chat_stream";
    transports: ("websocket" | "sse" | "http" | "ndjson")[];
}>;
export type ControlPlaneClientCommandDefinition = z.infer<typeof controlPlaneClientCommandDefinitionSchema>;
export declare const CONTROL_PLANE_CLIENT_COMMANDS: {
    type: "AGENT_MESSAGE" | "PING" | "JOIN_SESSION" | "TASK_QUERY" | "CANVAS_LOAD" | "CANVAS_SAVE" | "CANVAS_QUERY" | "INIT" | "START_SANDBOX" | "STOP_SANDBOX" | "EXEC" | "AGENT_STOP" | "AGENT_RESET" | "CHAT_COMPLETION";
    description: string;
    stage: "stable" | "experimental" | "planned";
    category: "task" | "session" | "canvas" | "system" | "agent" | "sandbox" | "transport" | "toc" | "chat_stream";
    transports: ("websocket" | "sse" | "http" | "ndjson")[];
}[];
export declare const controlPlaneServerEventTypeSchema: z.ZodEnum<["CONNECTED", "READY", "PONG", "MESSAGE_ACK", "MESSAGE_ERROR", "EVENTS_BATCH", "SANDBOX_STATUS", "LIFECYCLE", "TERM_DATA", "EXEC_COMPLETE", "SYSTEM", "ERROR", "AGENT_STARTED", "AGENT_MESSAGE", "AGENT_ACTION", "AGENT_STEP_COMPLETE", "AGENT_DONE", "AGENT_ERROR", "AGENT_EVENT", "AGENT_STATE_CHANGED", "FILE_UPLOADED", "FILES_SYNC", "CANVAS_PHASE", "CANVAS_RESULT", "CANVAS_CHILD_EVENT", "TASK_PHASE", "TASK_RESULT", "TASK_CHILD_EVENT", "CANVAS_SNAPSHOT", "CANVAS_SAVED", "CANVAS_DIFF", "TOC_REQUEST_RECEIVED", "TOC_AUTH_COMPLETED", "TOC_DB_QUERY_STARTED", "TOC_DB_QUERY_COMPLETED", "TOC_GCS_DOWNLOAD_STARTED", "TOC_GCS_DOWNLOAD_COMPLETED", "TOC_SANDBOX_CREATED", "TOC_EXTRACTION_STARTED", "TOC_EXTRACTION_COMPLETED", "TOC_RESPONSE_READY", "CHAT_STREAM_START", "CHAT_STREAM_DELTA", "CHAT_STREAM_DONE", "CHAT_STREAM_ERROR"]>;
export type ControlPlaneServerEventType = z.infer<typeof controlPlaneServerEventTypeSchema>;
export declare const controlPlaneServerEventDefinitionSchema: z.ZodObject<{
    type: z.ZodEnum<["CONNECTED", "READY", "PONG", "MESSAGE_ACK", "MESSAGE_ERROR", "EVENTS_BATCH", "SANDBOX_STATUS", "LIFECYCLE", "TERM_DATA", "EXEC_COMPLETE", "SYSTEM", "ERROR", "AGENT_STARTED", "AGENT_MESSAGE", "AGENT_ACTION", "AGENT_STEP_COMPLETE", "AGENT_DONE", "AGENT_ERROR", "AGENT_EVENT", "AGENT_STATE_CHANGED", "FILE_UPLOADED", "FILES_SYNC", "CANVAS_PHASE", "CANVAS_RESULT", "CANVAS_CHILD_EVENT", "TASK_PHASE", "TASK_RESULT", "TASK_CHILD_EVENT", "CANVAS_SNAPSHOT", "CANVAS_SAVED", "CANVAS_DIFF", "TOC_REQUEST_RECEIVED", "TOC_AUTH_COMPLETED", "TOC_DB_QUERY_STARTED", "TOC_DB_QUERY_COMPLETED", "TOC_GCS_DOWNLOAD_STARTED", "TOC_GCS_DOWNLOAD_COMPLETED", "TOC_SANDBOX_CREATED", "TOC_EXTRACTION_STARTED", "TOC_EXTRACTION_COMPLETED", "TOC_RESPONSE_READY", "CHAT_STREAM_START", "CHAT_STREAM_DELTA", "CHAT_STREAM_DONE", "CHAT_STREAM_ERROR"]>;
    category: z.ZodEnum<["session", "sandbox", "agent", "task", "canvas", "toc", "chat_stream", "system", "transport"]>;
    stage: z.ZodEnum<["stable", "experimental", "planned"]>;
    transports: z.ZodArray<z.ZodEnum<["websocket", "http", "sse", "ndjson"]>, "many">;
    persisted: z.ZodBoolean;
    description: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "CONNECTED" | "READY" | "EVENTS_BATCH" | "PONG" | "MESSAGE_ACK" | "MESSAGE_ERROR" | "SANDBOX_STATUS" | "LIFECYCLE" | "TERM_DATA" | "EXEC_COMPLETE" | "SYSTEM" | "ERROR" | "FILE_UPLOADED" | "FILES_SYNC" | "AGENT_STARTED" | "AGENT_MESSAGE" | "AGENT_ACTION" | "AGENT_STEP_COMPLETE" | "AGENT_DONE" | "AGENT_ERROR" | "AGENT_EVENT" | "AGENT_STATE_CHANGED" | "TOC_REQUEST_RECEIVED" | "TOC_AUTH_COMPLETED" | "TOC_DB_QUERY_STARTED" | "TOC_DB_QUERY_COMPLETED" | "TOC_GCS_DOWNLOAD_STARTED" | "TOC_GCS_DOWNLOAD_COMPLETED" | "TOC_SANDBOX_CREATED" | "TOC_EXTRACTION_STARTED" | "TOC_EXTRACTION_COMPLETED" | "TOC_RESPONSE_READY" | "CANVAS_PHASE" | "CANVAS_RESULT" | "CANVAS_CHILD_EVENT" | "TASK_PHASE" | "TASK_RESULT" | "TASK_CHILD_EVENT" | "CANVAS_SNAPSHOT" | "CANVAS_SAVED" | "CANVAS_DIFF" | "CHAT_STREAM_START" | "CHAT_STREAM_DELTA" | "CHAT_STREAM_DONE" | "CHAT_STREAM_ERROR";
    description: string;
    persisted: boolean;
    stage: "stable" | "experimental" | "planned";
    category: "task" | "session" | "canvas" | "system" | "agent" | "sandbox" | "transport" | "toc" | "chat_stream";
    transports: ("websocket" | "sse" | "http" | "ndjson")[];
}, {
    type: "CONNECTED" | "READY" | "EVENTS_BATCH" | "PONG" | "MESSAGE_ACK" | "MESSAGE_ERROR" | "SANDBOX_STATUS" | "LIFECYCLE" | "TERM_DATA" | "EXEC_COMPLETE" | "SYSTEM" | "ERROR" | "FILE_UPLOADED" | "FILES_SYNC" | "AGENT_STARTED" | "AGENT_MESSAGE" | "AGENT_ACTION" | "AGENT_STEP_COMPLETE" | "AGENT_DONE" | "AGENT_ERROR" | "AGENT_EVENT" | "AGENT_STATE_CHANGED" | "TOC_REQUEST_RECEIVED" | "TOC_AUTH_COMPLETED" | "TOC_DB_QUERY_STARTED" | "TOC_DB_QUERY_COMPLETED" | "TOC_GCS_DOWNLOAD_STARTED" | "TOC_GCS_DOWNLOAD_COMPLETED" | "TOC_SANDBOX_CREATED" | "TOC_EXTRACTION_STARTED" | "TOC_EXTRACTION_COMPLETED" | "TOC_RESPONSE_READY" | "CANVAS_PHASE" | "CANVAS_RESULT" | "CANVAS_CHILD_EVENT" | "TASK_PHASE" | "TASK_RESULT" | "TASK_CHILD_EVENT" | "CANVAS_SNAPSHOT" | "CANVAS_SAVED" | "CANVAS_DIFF" | "CHAT_STREAM_START" | "CHAT_STREAM_DELTA" | "CHAT_STREAM_DONE" | "CHAT_STREAM_ERROR";
    description: string;
    persisted: boolean;
    stage: "stable" | "experimental" | "planned";
    category: "task" | "session" | "canvas" | "system" | "agent" | "sandbox" | "transport" | "toc" | "chat_stream";
    transports: ("websocket" | "sse" | "http" | "ndjson")[];
}>;
export type ControlPlaneServerEventDefinition = z.infer<typeof controlPlaneServerEventDefinitionSchema>;
export declare const CONTROL_PLANE_SERVER_EVENTS: {
    type: "CONNECTED" | "READY" | "EVENTS_BATCH" | "PONG" | "MESSAGE_ACK" | "MESSAGE_ERROR" | "SANDBOX_STATUS" | "LIFECYCLE" | "TERM_DATA" | "EXEC_COMPLETE" | "SYSTEM" | "ERROR" | "FILE_UPLOADED" | "FILES_SYNC" | "AGENT_STARTED" | "AGENT_MESSAGE" | "AGENT_ACTION" | "AGENT_STEP_COMPLETE" | "AGENT_DONE" | "AGENT_ERROR" | "AGENT_EVENT" | "AGENT_STATE_CHANGED" | "TOC_REQUEST_RECEIVED" | "TOC_AUTH_COMPLETED" | "TOC_DB_QUERY_STARTED" | "TOC_DB_QUERY_COMPLETED" | "TOC_GCS_DOWNLOAD_STARTED" | "TOC_GCS_DOWNLOAD_COMPLETED" | "TOC_SANDBOX_CREATED" | "TOC_EXTRACTION_STARTED" | "TOC_EXTRACTION_COMPLETED" | "TOC_RESPONSE_READY" | "CANVAS_PHASE" | "CANVAS_RESULT" | "CANVAS_CHILD_EVENT" | "TASK_PHASE" | "TASK_RESULT" | "TASK_CHILD_EVENT" | "CANVAS_SNAPSHOT" | "CANVAS_SAVED" | "CANVAS_DIFF" | "CHAT_STREAM_START" | "CHAT_STREAM_DELTA" | "CHAT_STREAM_DONE" | "CHAT_STREAM_ERROR";
    description: string;
    persisted: boolean;
    stage: "stable" | "experimental" | "planned";
    category: "task" | "session" | "canvas" | "system" | "agent" | "sandbox" | "transport" | "toc" | "chat_stream";
    transports: ("websocket" | "sse" | "http" | "ndjson")[];
}[];
export declare const CONTROL_PLANE_CLIENT_COMMANDS_BY_TYPE: Map<"AGENT_MESSAGE" | "PING" | "JOIN_SESSION" | "TASK_QUERY" | "CANVAS_LOAD" | "CANVAS_SAVE" | "CANVAS_QUERY" | "INIT" | "START_SANDBOX" | "STOP_SANDBOX" | "EXEC" | "AGENT_STOP" | "AGENT_RESET" | "CHAT_COMPLETION", {
    type: "AGENT_MESSAGE" | "PING" | "JOIN_SESSION" | "TASK_QUERY" | "CANVAS_LOAD" | "CANVAS_SAVE" | "CANVAS_QUERY" | "INIT" | "START_SANDBOX" | "STOP_SANDBOX" | "EXEC" | "AGENT_STOP" | "AGENT_RESET" | "CHAT_COMPLETION";
    description: string;
    stage: "stable" | "experimental" | "planned";
    category: "task" | "session" | "canvas" | "system" | "agent" | "sandbox" | "transport" | "toc" | "chat_stream";
    transports: ("websocket" | "sse" | "http" | "ndjson")[];
}>;
export declare const CONTROL_PLANE_SERVER_EVENTS_BY_TYPE: Map<"CONNECTED" | "READY" | "EVENTS_BATCH" | "PONG" | "MESSAGE_ACK" | "MESSAGE_ERROR" | "SANDBOX_STATUS" | "LIFECYCLE" | "TERM_DATA" | "EXEC_COMPLETE" | "SYSTEM" | "ERROR" | "FILE_UPLOADED" | "FILES_SYNC" | "AGENT_STARTED" | "AGENT_MESSAGE" | "AGENT_ACTION" | "AGENT_STEP_COMPLETE" | "AGENT_DONE" | "AGENT_ERROR" | "AGENT_EVENT" | "AGENT_STATE_CHANGED" | "TOC_REQUEST_RECEIVED" | "TOC_AUTH_COMPLETED" | "TOC_DB_QUERY_STARTED" | "TOC_DB_QUERY_COMPLETED" | "TOC_GCS_DOWNLOAD_STARTED" | "TOC_GCS_DOWNLOAD_COMPLETED" | "TOC_SANDBOX_CREATED" | "TOC_EXTRACTION_STARTED" | "TOC_EXTRACTION_COMPLETED" | "TOC_RESPONSE_READY" | "CANVAS_PHASE" | "CANVAS_RESULT" | "CANVAS_CHILD_EVENT" | "TASK_PHASE" | "TASK_RESULT" | "TASK_CHILD_EVENT" | "CANVAS_SNAPSHOT" | "CANVAS_SAVED" | "CANVAS_DIFF" | "CHAT_STREAM_START" | "CHAT_STREAM_DELTA" | "CHAT_STREAM_DONE" | "CHAT_STREAM_ERROR", {
    type: "CONNECTED" | "READY" | "EVENTS_BATCH" | "PONG" | "MESSAGE_ACK" | "MESSAGE_ERROR" | "SANDBOX_STATUS" | "LIFECYCLE" | "TERM_DATA" | "EXEC_COMPLETE" | "SYSTEM" | "ERROR" | "FILE_UPLOADED" | "FILES_SYNC" | "AGENT_STARTED" | "AGENT_MESSAGE" | "AGENT_ACTION" | "AGENT_STEP_COMPLETE" | "AGENT_DONE" | "AGENT_ERROR" | "AGENT_EVENT" | "AGENT_STATE_CHANGED" | "TOC_REQUEST_RECEIVED" | "TOC_AUTH_COMPLETED" | "TOC_DB_QUERY_STARTED" | "TOC_DB_QUERY_COMPLETED" | "TOC_GCS_DOWNLOAD_STARTED" | "TOC_GCS_DOWNLOAD_COMPLETED" | "TOC_SANDBOX_CREATED" | "TOC_EXTRACTION_STARTED" | "TOC_EXTRACTION_COMPLETED" | "TOC_RESPONSE_READY" | "CANVAS_PHASE" | "CANVAS_RESULT" | "CANVAS_CHILD_EVENT" | "TASK_PHASE" | "TASK_RESULT" | "TASK_CHILD_EVENT" | "CANVAS_SNAPSHOT" | "CANVAS_SAVED" | "CANVAS_DIFF" | "CHAT_STREAM_START" | "CHAT_STREAM_DELTA" | "CHAT_STREAM_DONE" | "CHAT_STREAM_ERROR";
    description: string;
    persisted: boolean;
    stage: "stable" | "experimental" | "planned";
    category: "task" | "session" | "canvas" | "system" | "agent" | "sandbox" | "transport" | "toc" | "chat_stream";
    transports: ("websocket" | "sse" | "http" | "ndjson")[];
}>;
export declare function getControlPlaneClientCommandDefinition(type: ControlPlaneClientCommandType): ControlPlaneClientCommandDefinition | undefined;
export declare function getControlPlaneServerEventDefinition(type: ControlPlaneServerEventType): ControlPlaneServerEventDefinition | undefined;
export declare function isPersistedServerEventType(type: ControlPlaneServerEventType): boolean;
export declare function isEphemeralServerEventType(type: ControlPlaneServerEventType): boolean;
//# sourceMappingURL=control-plane-protocol.d.ts.map