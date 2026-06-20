/**
 * CLI Commands Index
 *
 * Exports all commands for the okra CLI.
 */

// Entity Search (jQuery-like)
export { find, formatFindOutput, formatStats, type FindOptions } from './find';

// Full-text Search
export { search, formatSearchOutput, type SearchOptions } from './search';

// Authentication
export {
  authLogin,
  authSetKey,
  authStatus,
  authWhoAmI,
  authToken,
  authLogout,
  maskApiKey,
  verifyApiKey,
  type AuthStatusOptions,
  type AuthVerificationResult,
} from './auth';

// Profiles
export { profileAdd, profileUse, profileCurrent, profileList, profileRemove } from './profile';

// Self-host bundle validation
export {
  validateSelfHostBundle,
  formatSelfHostValidationResult,
  createSelfHostDeploymentPlan,
  formatSelfHostDeploymentPlanResult,
  createSelfHostEnvArtifact,
  formatSelfHostEnvArtifactResult,
  createSelfHostComposeArtifact,
  formatSelfHostComposeArtifactResult,
  createSelfHostDockerNetworkHandoffArtifact,
  formatSelfHostDockerNetworkHandoffArtifactResult,
  createSelfHostRailwayConfigArtifact,
  formatSelfHostRailwayConfigArtifactResult,
  createSelfHostRailwayTemplateArtifact,
  formatSelfHostRailwayTemplateArtifactResult,
  createSelfHostRailwayTemplateListingArtifact,
  formatSelfHostRailwayTemplateListingArtifactResult,
  createSelfHostRailwayTemplatePublicationEvidenceArtifact,
  formatSelfHostRailwayTemplatePublicationEvidenceArtifactResult,
  createSelfHostCapabilityImplementationsArtifact,
  formatSelfHostCapabilityImplementationsArtifactResult,
  createSelfHostCapabilityPromotionEvidenceArtifact,
  formatSelfHostCapabilityPromotionEvidenceArtifactResult,
  createSelfHostRailwayPublishEvidenceBundleArtifact,
  formatSelfHostRailwayPublishEvidenceBundleArtifactResult,
  createSelfHostRailwayPublishReadinessArtifact,
  formatSelfHostRailwayPublishReadinessArtifactResult,
  createSelfHostRailwayPublishPackArtifact,
  formatSelfHostRailwayPublishPackArtifactResult,
  materializeSelfHostPublishArtifacts,
  formatSelfHostMaterializeArtifactsResult,
  type SelfHostCapabilityImplementation,
  type SelfHostCapabilityImplementationModel,
  type SelfHostCapabilityImplementationsArtifactResult,
  type SelfHostCapabilityImplementationsHandoff,
  type SelfHostCapabilityPromotionEvidence,
  type SelfHostCapabilityPromotionEvidenceArtifactResult,
  type SelfHostCapabilityPromotionEvidenceEntry,
  type SelfHostCapabilityPromotionEvidenceStatus,
  type SelfHostComposeArtifactResult,
  type SelfHostComposeMode,
  type SelfHostDeploymentPlan,
  type SelfHostDeploymentPlanResult,
  type SelfHostDockerNetworkHandoff,
  type SelfHostDockerNetworkHandoffArtifactResult,
  type SelfHostDockerNetworkHandoffNetwork,
  type SelfHostDockerNetworkOwner,
  type SelfHostDockerNetworkSeparatedLaunch,
  type SelfHostDockerNetworkServiceAttachment,
  type SelfHostEnvArtifactResult,
  type SelfHostMaterializeArtifactsResult,
  type SelfHostMaterializedArtifact,
  type SelfHostRailwayConfigArtifactResult,
  type SelfHostRailwayPublishEvidenceBundle,
  type SelfHostRailwayPublishEvidenceBundleArtifactResult,
  type SelfHostRailwayPublishEvidenceBundleEntry,
  type SelfHostRailwayPublishEvidenceBundleOptions,
  type SelfHostRailwayPublishEvidenceBundleStatus,
  type SelfHostRailwayPublishReadiness,
  type SelfHostRailwayPublishReadinessArtifactResult,
  type SelfHostRailwayPublishReadinessGate,
  type SelfHostRailwayPublishReadinessGateStatus,
  type SelfHostRailwayPublishReadinessOptions,
  type SelfHostRailwayPublishPack,
  type SelfHostRailwayPublishPackArtifact,
  type SelfHostRailwayPublishPackArtifactResult,
  type SelfHostRailwayTemplateArtifactResult,
  type SelfHostRailwayTemplateHandoff,
  type SelfHostRailwayTemplateListing,
  type SelfHostRailwayTemplateListingArtifactResult,
  type SelfHostRailwayTemplateListingReference,
  type SelfHostRailwayTemplatePublicationEvidence,
  type SelfHostRailwayTemplatePublicationEvidenceArtifactResult,
  type SelfHostRailwayTemplatePublicationEvidenceStatus,
  type SelfHostRailwayTemplateService,
  type SelfHostValidationIssue,
  type SelfHostValidationResult,
  type SelfHostValidationSummary,
} from './self-host';

// Lightweight self-host runtime server
export {
  createSelfHostRuntimeStatus,
  handleSelfHostRuntimeRequest,
  startSelfHostRuntimeServer,
  type SelfHostRuntimeCapabilitySummary,
  type SelfHostRuntimeRecipeSummary,
  type SelfHostRuntimeRequestOptions,
  type SelfHostRuntimeServerOptions,
  type SelfHostRuntimeStatus,
  type SelfHostRuntimeWorkflowExportSummary,
  type StartedSelfHostRuntimeServer,
} from './serve';

// Self-host no-server draft proof
export {
  createSelfHostDraftProof,
  formatSelfHostDraftProof,
  writeSelfHostDraftProof,
  type SelfHostDraftProof,
  type SelfHostDraftProofCheck,
  type SelfHostDraftProofWorkflowSummary,
} from './self-host-proof';

// Self-host capability service adapter
export {
  handleCapabilityServiceRequest,
  startCapabilityServiceServer,
  type CapabilityServiceRequestOptions,
  type CapabilityServiceServerOptions,
  type StartedCapabilityServiceServer,
} from './capability-service';

// Upload
export { upload, type UploadOpts, type UploadResult } from './upload';

// Render — PDF generation via /v1/renders (A.4.19)
export { render, type RenderCliOptions, type RenderCliResult, type RenderMode } from './render';

// Self-host/cloud workflow verbs
export {
  formatDocumentWorkflowRun,
  parsePolicyJson,
  runDocumentWorkflow,
  type DocumentWorkflowKind,
  type DocumentWorkflowOptions,
  type DocumentWorkflowRun,
} from './workflow-verbs';

// Self-host smoke tests
export {
  createSelfHostSmokeEvidence,
  formatSelfHostSmokeResult,
  runSelfHostSmoke,
  type SelfHostSmokeCheck,
  type SelfHostSmokeEvidence,
  type SelfHostSmokeOptions,
  type SelfHostSmokeResult,
  type SelfHostSmokeWorkflow,
} from './self-host-smoke';

// List / Delete
export { listDocuments, formatDocumentList, type ListResult } from './list';
export { deleteDocument } from './delete';

// API resources
export {
  listApiResources,
  getApiResource,
  formatApiResourceCatalog,
  formatApiResourceItem,
} from './resources';

// Collections
export {
  collectionList,
  collectionCreate,
  collectionShow,
  collectionDelete,
  collectionAddDocs,
  collectionRemoveDocs,
  collectionSetVisibility,
  collectionQueryRaw,
  collectionExport,
  formatCollectionList,
  formatCollectionDetail,
  formatCollectionCsv,
  formatCollectionTable,
  formatQueryJsonl,
  formatCollectionExportFlat,
  formatExtractCsv,
  formatExtractTable,
  formatExtractJson,
  type CollectionListOpts,
  type CollectionCreateOpts,
  type CollectionQueryOpts,
  type CollectionExportOpts,
  type CollectionRow,
  type CollectionDetail,
  type QueryResultRow,
} from './collection';
