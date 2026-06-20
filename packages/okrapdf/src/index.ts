// Client
export { OkraClient } from './client.js';

// Providers factory
export { createOkra, withCache, withQualityScore, withSecret } from './providers.js';
export {
  DYNAMIC_WORKFLOW_EXAMPLES,
  workflowPreset,
  WORKFLOW_PRESETS,
  DEFAULT_WORKFLOW_CAPABILITIES,
  defineDynamicWorkflow,
  dynamicWorkflowToCapabilities,
  dynamicWorkflowToAgentWorkflowSource,
  getDynamicWorkflowExample,
  listDynamicWorkflowExamples,
  validateDynamicWorkflow,
} from './workflows.js';
export type {
  ExtractionPhase,
  OkraProvider,
  OkraMiddleware,
  CreateOkraOptions,
} from './providers.js';
export type { WorkflowPresetName } from './workflows.js';
export type {
  DynamicWorkflowCodeStep,
  DynamicWorkflowDatasetProvider,
  DynamicWorkflowDatasetRef,
  DynamicWorkflowDefinition,
  DynamicWorkflowEvalConfig,
  DynamicWorkflowEvalMetric,
  DynamicWorkflowExample,
  DynamicWorkflowGateCondition,
  DynamicWorkflowGateStep,
  DynamicWorkflowOcrStep,
  DynamicWorkflowOutputKind,
  DynamicWorkflowRun,
  DynamicWorkflowRunList,
  DynamicWorkflowRunListOptions,
  DynamicWorkflowRunOptions,
  DynamicWorkflowStep,
  DynamicWorkflowStepBase,
  DynamicWorkflowStepKind,
  DynamicWorkflowValidationResult,
  DynamicWorkflowVlmStep,
} from './workflows.js';

// Deterministic URL builder
export { doc } from './url.js';

// Document Event Protocol
export { DocumentEventStream } from './events.js';
export type { OkraEvent, DocumentEvent, DocumentEventType, DocumentEventHandler, DocumentEventStreamOptions } from './events.js';

// Context-first source navigation API
export {
  createHttpContextClient,
  createOfflineContextClient,
  getOfflineContextFixture,
  listOfflineContextFixtures,
  offlineContextFixtures,
} from './context.js';
export type {
  AskContextRequest,
  AskContextResponse,
  ContextAgentSimulation,
  ContextBlock,
  ContextCitation,
  ContextStructureArtifact,
  ContextStructureNode,
  ContextTraceComparison,
  GetContextRequest,
  GetContextResponse,
  HttpContextClientOptions,
  OfflineContextExample,
  OfflineContextFixture,
  OkraContextAllowanceScope,
  OkraContextClient,
  OkraContextPolicy,
  OkraContextScope,
  OkraContextToolName,
  OpenSourceRequest,
  OpenSourceResponse,
  ReadStructureRequest,
  ReadStructureResponse,
  ResolveSourceRequest,
  ResolveSourceResponse,
} from './context.js';

// WebSocket session adapter
export { WsSession } from './ws-session.js';
export type { WsSendFn, WsSubscribeFn, WsSessionOptions, ChatStreamServerEvent } from './ws-session.js';

// Errors
export { OkraRuntimeError, StructuredOutputError } from './errors.js';

// Local-first PDF skillset
export {
  doctorLocalHarness,
  findLocalTables,
  getLocalDocumentStatus,
  ingestLocalDocument,
  readLocalPage,
  searchLocalDocument,
  summarizeLocalDocument,
} from './local/index.js';
export type {
  LocalCitation,
  LocalDoctorReport,
  LocalDocumentExtractor,
  LocalDocumentPageRecord,
  LocalDocumentRecord,
  LocalDocumentStatus,
  LocalTableCandidate,
  LocalToolAvailability,
} from './local/types.js';

// Backward-compat alias (was OkraRuntime in @okrapdf/runtime)
export { OkraClient as OkraRuntime } from './client.js';

// Public types
export type {
  JsonSchema,
  RuntimeErrorCode,
  StructuredOutputErrorCode,
  OkraClientOptions,
  UploadInput,
  FileUploadTransport,
  FileUploadOptions,
  FileListOptions,
  OkraFileUrls,
  OkraFile,
  OkraFileListResponse,
  DeleteFileResult,
  OkraFiles,
  UploadRedactPiiOptions,
  UploadRedactOptions,
  UploadOptions,
  ParseOptions,
  JobStatus,
  JobError,
  JobListOptions,
  OkraJob,
  JobListResponse,
  ParseUsage,
  ParseExtraction,
  ParseArtifact,
  ParseResult,
  ParseJob,
  CanonicalParseBlock,
  CanonicalParsePage,
  CanonicalParseOutput,
  InvoiceExtractionQuality,
  InvoiceExtractionInput,
  InvoiceExtractionRunOptions,
  InvoiceExtractionRun,
  InvoiceExtractionRunListOptions,
  InvoiceExtractionRunList,
  InvoiceExtractionException,
  InvoiceExtractionExceptionList,
  InvoiceExtractionResolveExceptionOptions,
  InvoiceExtractionExceptionResolution,
  WorkflowPhase,
  WorkflowTier,
  WorkflowPhaseConfig,
  ProcessingCapabilities,
  DocumentAction,
  PrincipalRef,
  DocumentGrantConstraints,
  DocumentGrant,
  DocumentAccessRoleProfile,
  DocumentAccess,
  PageImageStrategy,
  DocumentExtract,
  DocumentFeatureFlags,
  DocumentRuntime,
  DocumentAgentModelEndpoint,
  DocumentAgentModelConfig,
  DocumentAgentToolPolicies,
  DocumentAgentToolsConfig,
  DocumentAgentContextConfig,
  DocumentAgentSecurityConfig,
  DocumentAgentRuntimeConfig,
  DocumentAgentConfig,
  DocumentPluginSpec,
  DocumentSpec,
  DocumentSpecRecord,
  DocumentSpecDiff,
  DocumentConfigUpdate,
  DocumentConfigResult,
  ReparseOptions,
  ReparseResult,
  VerifyBbox,
  VerifyParams,
  VerifyResult,
  VerifyVerdict,
  ApplyWorkflowOptions,
  ApplyWorkflowResult,
  ApiKeyWorkflowConfigResponse,
  DocumentPluginState,
  DocumentAssetStatus,
  TocItem,
  TocAssetData,
  DocumentAsset,
  DocumentStatus,
  WaitOptions,
  Page,
  PageBlock,
  PageEntity,
  Entity,
  EntitiesResponse,
  QueryResult,
  LogEntry,
  LogsOptions,
  CompletionEvent,
  CompletionOptions,
  GenerateOptions,
  GenerateResult,
  SessionCreateOptions,
  SessionAttachOptions,
  SessionState,
  OkraSession,
  StructuredOutputMeta,
  StructuredSchema,
  CitationBbox,
  PageLocationCitation,
  PublishResult,
  ShareLinkOptions,
  ShareLinkLinks,
  ShareLinkCapabilities,
  ShareLinkResult,
  Collection,
  CollectionDocument,
  CollectionExportFormat,
  CollectionExportOptions,
  CollectionSummary,
  CollectionExportEvent,
  CollectionMarkdownExport,
  CollectionQueryEvent,
  CollectionQueryOptions,
  CollectionQueryResult,
  CollectionQueryStream,
  DocumentAnswer,
  DocumentMarkdownExport,
  MarkdownPage,
  OkraCollections,
  DeleteDocumentResult,
  DocumentListItem,
  DocumentListResponse,
  ReadDocumentOptions,
  ReadDocumentResult,
  DocUrlOptions,
  UrlBuilderOptions,
} from './types.js';

// ── Content types (#330/#331) — typed extraction contracts (JSON schema +
//    per-field evidence policy + lifecycle + generated CLI/SDK names). Resolve a
//    manifest with getContentType(id) and use `.schema` with OkraClient.generate,
//    or run `okra <id> extract` / `okra extract --content-type <id>` from the CLI.
export { listContentTypes, getContentType } from './content-types/registry.js';
export type { ContentTypeSummary } from './content-types/registry.js';
export {
  contentTypeManifestViolations,
  isContentTypeManifest,
  RESERVED_NOUNS,
} from './content-types/manifest.js';
export type {
  ContentTypeManifest,
  ContentTypeField,
  ContentTypeFieldType,
  EvidencePolicy,
  ReviewConfig,
  ExportFormat,
  ExtractionConfig,
  CliGenerationHints,
  SdkGenerationHints,
} from './content-types/manifest.js';
export { invoiceContentType } from './content-types/invoice.js';
