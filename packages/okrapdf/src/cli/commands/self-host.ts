import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

export interface SelfHostValidationIssue {
  path: string;
  message: string;
}

export interface SelfHostValidationSummary {
  services: number;
  recipes: number;
  n8nWorkflows: number;
  capabilities: number;
  capabilityNamespaces: number;
  dockerNetworks: number;
  deploymentTargets: string[];
  uiRuntime: string;
  apiRuntime: string;
}

export interface SelfHostPlanService {
  id: string;
  name: string;
  kind: string;
  runtime: string;
  image?: string;
  startCommand?: string;
  public: boolean;
  required: boolean;
  dependsOn: string[];
  env: string[];
  volumes: string[];
  networkRefs: string[];
  capabilityRef?: string;
  recipeCatalogRef?: string;
  railway?: {
    serviceName: string;
    builder?: string;
    dockerfilePath?: string;
    healthcheckPath?: string;
    healthcheckTimeoutSeconds?: number;
  };
}

export interface SelfHostPlanDockerNetwork {
  id: string;
  name: string;
  dockerName: string;
  kind: string;
  driver: string;
  internal: boolean;
  external: boolean;
  attachable: boolean;
  services: string[];
  capabilities: string[];
}

export interface SelfHostPlanEnvVar {
  name: string;
  required: boolean;
  secret: boolean;
  default?: string;
  example?: string;
  consumers: string[];
}

export interface SelfHostPlanVolume {
  id: string;
  mountPath: string;
  purpose: string;
  required: boolean;
  sizeMb?: number;
  consumers: string[];
}

export interface SelfHostPlanCapability {
  id: string;
  namespace: string;
  networkNamespace: string;
  outboundHttp: boolean;
}

export interface SelfHostDeploymentPlan {
  target: 'railway';
  services: SelfHostPlanService[];
  dockerNetworks: SelfHostPlanDockerNetwork[];
  env: SelfHostPlanEnvVar[];
  volumes: SelfHostPlanVolume[];
  recipes: string[];
  recipeCatalogs: Array<{ id: string; path?: string; required: boolean }>;
  capabilities: SelfHostPlanCapability[];
  smokeTests: Array<{ name: string; command?: string; path?: string; expectedStatus?: number }>;
  steps: string[];
}

export interface SelfHostDeploymentPlanResult {
  object: 'self_host_deployment_plan';
  ok: boolean;
  root: string;
  target: 'railway';
  validation: SelfHostValidationResult;
  plan: SelfHostDeploymentPlan | null;
}

export interface SelfHostEnvArtifactResult {
  object: 'self_host_env_artifact';
  ok: boolean;
  root: string;
  target: 'railway';
  validation: SelfHostValidationResult;
  env: SelfHostPlanEnvVar[];
  dotenv: string | null;
}

export interface SelfHostComposeArtifactResult {
  object: 'self_host_compose_artifact';
  ok: boolean;
  root: string;
  mode: SelfHostComposeMode;
  validation: SelfHostValidationResult;
  services: SelfHostPlanService[];
  networks: SelfHostPlanDockerNetwork[];
  volumes: SelfHostPlanVolume[];
  compose: string | null;
  commands: string[];
}

export type SelfHostComposeMode = 'networks' | 'stack' | 'capabilities' | 'integrations';

export type SelfHostDockerNetworkOwner =
  | 'compose_stack'
  | 'operator_created'
  | 'compose_stack_or_operator_created';

export interface SelfHostDockerNetworkServiceAttachment {
  serviceId: string;
  serviceName: string;
  kind: string;
  public: boolean;
  required: boolean;
  networkRefs: string[];
  launchBoundary: 'core_stack' | 'capability_overlay' | 'external_integration';
  capabilityRef?: string;
  recipeCatalogRef?: string;
}

export interface SelfHostDockerNetworkHandoffNetwork {
  id: string;
  name: string;
  dockerName: string;
  kind: string;
  driver: string;
  internal: boolean;
  external: boolean;
  attachable: boolean;
  owner: SelfHostDockerNetworkOwner;
  composeModes: SelfHostComposeMode[];
  allowedServices: string[];
  capabilityRefs: string[];
  bootstrapCommand: string;
  notes: string[];
}

export interface SelfHostDockerNetworkSeparatedLaunch {
  id: string;
  kind: 'capability_services' | 'external_integrations';
  composeFile: string;
  services: string[];
  networks: string[];
  requiredBootstrap: string[];
  launchCommand: string;
  notes: string[];
}

export interface SelfHostDockerNetworkHandoff {
  object: 'docker_network_handoff';
  schema_version: 'okra-docker-network-handoff/v1';
  name: string;
  source_manifest: string;
  status: 'handoff_ready';
  summary: {
    networks: number;
    internalNetworks: number;
    externalNetworks: number;
    attachableNetworks: number;
    publicServices: number;
    privateServices: number;
    capabilityServices: number;
    externalServices: number;
    separatedLaunches: number;
  };
  networks: SelfHostDockerNetworkHandoffNetwork[];
  serviceAttachments: SelfHostDockerNetworkServiceAttachment[];
  separatedLaunches: SelfHostDockerNetworkSeparatedLaunch[];
  composeFiles: Array<{ path: string; purpose: string }>;
  guardrails: string[];
  docs: string[];
}

export interface SelfHostDockerNetworkHandoffArtifactResult {
  object: 'self_host_docker_network_handoff_artifact';
  ok: boolean;
  root: string;
  validation: SelfHostValidationResult;
  handoff: SelfHostDockerNetworkHandoff | null;
}

export interface SelfHostRailwayConfigArtifactResult {
  object: 'self_host_railway_config_artifact';
  ok: boolean;
  root: string;
  validation: SelfHostValidationResult;
  service: SelfHostPlanService | null;
  configPath: string | null;
  railwayJson: Record<string, unknown> | null;
  templateChecklist: string[];
  docs: string[];
}

export interface SelfHostRailwayTemplateService {
  id: string;
  name: string;
  kind: string;
  required: boolean;
  public: boolean;
  startCommand?: string;
  configPath?: string;
  dockerfilePath?: string;
  healthcheckPath?: string;
  healthcheckTimeoutSeconds?: number;
  env: Array<{
    name: string;
    required: boolean;
    secret: boolean;
    default?: string;
    example?: string;
  }>;
  volumes: Array<{ id: string; mountPath: string }>;
  privateNetworks: string[];
  publicNetworking: boolean;
  capabilityRef?: string;
  recipeCatalogRef?: string;
}

export interface SelfHostRailwayTemplateHandoff {
  object: 'railway_template_handoff';
  schema_version: 'okra-railway-template-handoff/v1';
  name: string;
  source_manifest: string;
  status: 'handoff_ready';
  publication: {
    state: 'not_published';
    reason: string;
    required_external_actions: string[];
  };
  services: SelfHostRailwayTemplateService[];
  managedServices: Array<{ id: string; kind: string; required: boolean }>;
  externalServices: Array<{ id: string; capabilityRef?: string; recipeCatalogRef?: string; notes: string }>;
  volumes: SelfHostPlanVolume[];
  dockerNetworks: SelfHostPlanDockerNetwork[];
  smokeTests: SelfHostDeploymentPlan['smokeTests'];
  templateChecklist: string[];
  deployButton: {
    state: 'pending_template_url';
    markdown: null;
    docs: string;
  };
  docs: string[];
}

export interface SelfHostRailwayTemplateArtifactResult {
  object: 'self_host_railway_template_artifact';
  ok: boolean;
  root: string;
  validation: SelfHostValidationResult;
  handoff: SelfHostRailwayTemplateHandoff | null;
}

export interface SelfHostRailwayTemplateListingReference {
  name: string;
  url: string;
  pattern: string;
  appliedAs: string;
}

export interface SelfHostRailwayTemplateListing {
  object: 'railway_template_listing';
  schema_version: 'okra-railway-template-listing/v1';
  name: string;
  source_manifest: string;
  status: 'listing_ready';
  template: {
    name: string;
    slug: string;
    category: string;
    tagline: string;
    description: string;
    tags: string[];
    repository: string;
    rootDirectory: string;
    deployButton: {
      state: 'pending_template_url';
      markdown: null;
      evidencePath: string;
    };
  };
  positioning: string[];
  referenceTemplates: SelfHostRailwayTemplateListingReference[];
  services: SelfHostRailwayTemplateService[];
  managedServices: SelfHostRailwayTemplateHandoff['managedServices'];
  externalServices: SelfHostRailwayTemplateHandoff['externalServices'];
  environmentPrompts: {
    requiredSecrets: string[];
    requiredPlain: string[];
    optional: string[];
  };
  volumes: SelfHostPlanVolume[];
  postDeployChecks: string[];
  publicationEvidencePath: string;
  docs: string[];
}

export interface SelfHostRailwayTemplateListingArtifactResult {
  object: 'self_host_railway_template_listing_artifact';
  ok: boolean;
  root: string;
  validation: SelfHostValidationResult;
  listing: SelfHostRailwayTemplateListing | null;
}

export type SelfHostRailwayTemplatePublicationEvidenceStatus = 'pending' | 'published' | 'failed';

export interface SelfHostRailwayTemplatePublicationEvidence {
  object: 'railway_template_publication_evidence';
  schema_version: 'okra-railway-template-publication-evidence/v1';
  name: string;
  source_manifest: string;
  status: SelfHostRailwayTemplatePublicationEvidenceStatus;
  generated_at: string;
  templateUrl: string | null;
  deployButtonMarkdown: string | null;
  railwayProjectId: string | null;
  railwayTemplateId: string | null;
  serviceConfigFiles: string[];
  requiredChecks: string[];
  passedChecks: string[];
  missingChecks: string[];
  readiness: {
    eligible: boolean;
    reason: string;
  };
  requiredExternalActions: string[];
  docs: string[];
}

export interface SelfHostRailwayTemplatePublicationEvidenceArtifactResult {
  object: 'self_host_railway_template_publication_evidence_artifact';
  ok: boolean;
  root: string;
  validation: SelfHostValidationResult;
  evidence: SelfHostRailwayTemplatePublicationEvidence | null;
}

export type SelfHostRailwayPublishReadinessGateStatus = 'pass' | 'warning' | 'blocked';

export interface SelfHostRailwayPublishReadinessGate {
  id: string;
  label: string;
  status: SelfHostRailwayPublishReadinessGateStatus;
  evidence: string[];
  actions: string[];
}

export interface SelfHostRailwayPublishReadiness {
  object: 'railway_publish_readiness';
  schema_version: 'okra-railway-publish-readiness/v1';
  name: string;
  source_manifest: string;
  status: 'ready' | 'blocked';
  publishable: boolean;
  templateUrl: string | null;
  deploymentBaseUrl: string | null;
  summary: {
    passed: number;
    warnings: number;
    blocked: number;
    services: number;
    recipes: number;
    capabilities: number;
    dockerNetworks: number;
  };
  gates: SelfHostRailwayPublishReadinessGate[];
  blockers: string[];
  warnings: string[];
  nextActions: string[];
  docs: string[];
}

export interface SelfHostRailwayPublishReadinessOptions {
  templateUrl?: string;
  deploymentBaseUrl?: string;
  evidenceBundlePath?: string;
  templateEvidencePath?: string;
  modelBackedCapabilities?: string[];
  capabilityEvidencePath?: string;
  smokeEvidencePath?: string;
  smokePassed?: boolean;
}

export interface SelfHostRailwayPublishReadinessArtifactResult {
  object: 'self_host_railway_publish_readiness_artifact';
  ok: boolean;
  root: string;
  validation: SelfHostValidationResult;
  readiness: SelfHostRailwayPublishReadiness | null;
}

export interface SelfHostRailwayPublishPackArtifact {
  path: string;
  kind: string;
  serviceId?: string;
  required: boolean;
}

export interface SelfHostRailwayPublishPack {
  object: 'railway_publish_pack';
  schema_version: 'okra-railway-publish-pack/v1';
  name: string;
  source_manifest: string;
  status: 'pack_ready';
  summary: {
    services: number;
    appServices: number;
    optionalCapabilityServices: number;
    managedServices: number;
    externalServices: number;
    configFiles: number;
    requiredSecrets: number;
    requiredPlainEnv: number;
    volumes: number;
    dockerNetworks: number;
    readinessStatus: 'ready' | 'blocked';
    blockers: number;
  };
  artifacts: SelfHostRailwayPublishPackArtifact[];
  railway: {
    composerMode: 'project_to_template';
    publicServiceId: string | null;
    serviceConfigFiles: Array<{
      serviceId: string;
      serviceName?: string;
      required: boolean;
      public: boolean;
      configPath: string;
      dockerfilePath?: string;
      startCommand?: string;
      healthcheckPath?: string;
    }>;
    managedServices: SelfHostRailwayTemplateHandoff['managedServices'];
    env: {
      requiredSecrets: string[];
      requiredPlain: string[];
      optional: string[];
    };
    templatePublicationEvidenceRequiredChecks: string[];
    volumes: SelfHostPlanVolume[];
    templateChecklist: string[];
    deployButton: SelfHostRailwayTemplateHandoff['deployButton'];
  };
  docker: {
    organization: 'separated_compose_overlays';
    networkHandoffPath: string;
    composeFiles: Array<{ path: string; purpose: string }>;
    networks: SelfHostDockerNetworkHandoffNetwork[];
    bootstrapCommands: string[];
    stackLaunchCommand: string;
    capabilityLaunchCommand: string;
    integrationLaunchCommand: string;
  };
  capabilities: {
    protocol: 'okra-capability-http/v1';
    privateNetwork: string | null;
    promotionEvidenceRequiredChecks: string[];
    implementations: SelfHostCapabilityImplementation[];
  };
  externalIntegrations: SelfHostRailwayTemplateHandoff['externalServices'];
  publication: {
    state: 'ready' | 'blocked_external_evidence';
    templateUrl: string | null;
    deploymentBaseUrl: string | null;
    blockers: string[];
    nextActions: string[];
    requiredExternalActions: string[];
  };
  docs: string[];
}

export interface SelfHostRailwayPublishPackArtifactResult {
  object: 'self_host_railway_publish_pack_artifact';
  ok: boolean;
  root: string;
  validation: SelfHostValidationResult;
  pack: SelfHostRailwayPublishPack | null;
}

export interface SelfHostMaterializedArtifact {
  path: string;
  kind: string;
  required: boolean;
  changed: boolean;
  bytes: number;
}

export interface SelfHostMaterializeArtifactsResult {
  object: 'self_host_materialize_artifacts';
  ok: boolean;
  root: string;
  validation: SelfHostValidationResult;
  artifacts: SelfHostMaterializedArtifact[];
  readinessStatus: 'ready' | 'blocked' | null;
  blockers: string[];
  nextActions: string[];
}

export interface SelfHostCapabilityImplementationModel {
  provider?: string;
  modelId?: string;
  cacheVolume?: string;
  cachePath?: string;
  env: string[];
}

export interface SelfHostCapabilityImplementation {
  id: string;
  capabilityRef: string;
  serviceId: string;
  serviceName?: string;
  status: string;
  targetStatus: string;
  protocol: string;
  endpointPath: string;
  image?: string;
  dockerfilePath?: string;
  command?: string;
  networkRefs: string[];
  env: string[];
  volumes: string[];
  model?: SelfHostCapabilityImplementationModel;
  readinessGate: string;
  promotionActions: string[];
  smokeTests: string[];
  metadata?: Record<string, unknown>;
}

export interface SelfHostCapabilityImplementationsHandoff {
  object: 'capability_implementations_handoff';
  schema_version: 'okra-capability-implementations-handoff/v1';
  name: string;
  source_manifest: string;
  status: 'handoff_ready';
  summary: {
    implementations: number;
    starterAdapters: number;
    productionBacked: number;
    services: number;
    privateNetworks: number;
  };
  implementations: SelfHostCapabilityImplementation[];
  dockerNetworks: SelfHostPlanDockerNetwork[];
  docs: string[];
}

export interface SelfHostCapabilityImplementationsArtifactResult {
  object: 'self_host_capability_implementations_artifact';
  ok: boolean;
  root: string;
  validation: SelfHostValidationResult;
  handoff: SelfHostCapabilityImplementationsHandoff | null;
}

export type SelfHostCapabilityPromotionEvidenceStatus = 'pending' | 'passed' | 'failed';

export interface SelfHostCapabilityPromotionEvidenceEntry {
  capabilityRef: string;
  serviceId: string;
  targetStatus: string;
  status: SelfHostCapabilityPromotionEvidenceStatus;
  protocol: string;
  endpointPath: string;
  imageRef: string | null;
  imageDigest: string | null;
  sourceRevision: string | null;
  networkRefs: string[];
  requiredChecks: string[];
  passedChecks: string[];
  missingChecks: string[];
  promotionActions: string[];
}

export interface SelfHostCapabilityPromotionEvidence {
  object: 'capability_promotion_evidence';
  schema_version: 'okra-capability-promotion-evidence/v1';
  name: string;
  source_manifest: string;
  status: SelfHostCapabilityPromotionEvidenceStatus;
  generated_at: string;
  summary: {
    capabilities: number;
    passed: number;
    pending: number;
    failed: number;
    productionBacked: number;
  };
  required: {
    parser: boolean;
    auditOrRedact: boolean;
  };
  readiness: {
    eligible: boolean;
    reason: string;
    productionBackedCapabilities: string[];
  };
  capabilities: SelfHostCapabilityPromotionEvidenceEntry[];
  docs: string[];
}

export interface SelfHostCapabilityPromotionEvidenceArtifactResult {
  object: 'self_host_capability_promotion_evidence_artifact';
  ok: boolean;
  root: string;
  validation: SelfHostValidationResult;
  evidence: SelfHostCapabilityPromotionEvidence | null;
}

export type SelfHostRailwayPublishEvidenceBundleStatus = 'pending' | 'ready' | 'failed';

export interface SelfHostRailwayPublishEvidenceBundleEntry {
  id: 'template_publication' | 'capability_promotion' | 'live_deploy_smoke';
  path: string;
  status: string;
  passed: boolean;
  reason: string;
  checks: string[];
}

export interface SelfHostRailwayPublishEvidenceBundle {
  object: 'railway_publish_evidence_bundle';
  schema_version: 'okra-railway-publish-evidence-bundle/v1';
  name: string;
  source_manifest: string;
  status: SelfHostRailwayPublishEvidenceBundleStatus;
  generated_at: string;
  evidencePaths: {
    templatePublication: string;
    capabilityPromotion: string;
    liveDeploySmoke: string;
    readiness: string;
    publishPack: string;
  };
  evidence: {
    templatePublication: SelfHostRailwayPublishEvidenceBundleEntry;
    capabilityPromotion: SelfHostRailwayPublishEvidenceBundleEntry;
    liveDeploySmoke: SelfHostRailwayPublishEvidenceBundleEntry;
  };
  readiness: {
    eligible: boolean;
    reason: string;
    command: string;
  };
  nextActions: string[];
  docs: string[];
}

export interface SelfHostRailwayPublishEvidenceBundleOptions {
  templateEvidencePath?: string;
  capabilityEvidencePath?: string;
  smokeEvidencePath?: string;
  readinessPath?: string;
  publishPackPath?: string;
}

export interface SelfHostRailwayPublishEvidenceBundleArtifactResult {
  object: 'self_host_railway_publish_evidence_bundle_artifact';
  ok: boolean;
  root: string;
  validation: SelfHostValidationResult;
  evidenceBundle: SelfHostRailwayPublishEvidenceBundle | null;
}

export interface SelfHostValidationResult {
  object: 'self_host_validation';
  ok: boolean;
  root: string;
  manifest: string;
  summary: SelfHostValidationSummary | null;
  errors: SelfHostValidationIssue[];
  warnings: SelfHostValidationIssue[];
}

interface RuntimeManifest {
  schema_version?: unknown;
  deployment_targets?: unknown;
  ui_runtime?: unknown;
  api_runtime?: unknown;
  recipe_catalogs?: unknown;
  capability_catalogs?: unknown;
  capability_refs?: unknown;
  services?: unknown;
  docker_networks?: unknown;
  capability_implementations?: unknown;
  env?: unknown;
  volumes?: unknown;
  smoke_tests?: unknown;
}

interface CatalogRef {
  id: string;
  kind?: string;
  path?: string;
  uri?: string;
  required: boolean;
}

interface RuntimeService {
  id: string;
  name: string;
  kind: string;
  runtime: string;
  image?: string;
  startCommand?: string;
  public: boolean;
  required: boolean;
  dependsOn: string[];
  env: string[];
  volumes: string[];
  networkRefs: string[];
  capability_ref?: string;
  recipe_catalog_ref?: string;
  railway?: {
    serviceName: string;
    builder?: string;
    dockerfilePath?: string;
    healthcheckPath?: string;
    healthcheckTimeoutSeconds?: number;
  };
}

interface RuntimeDockerNetwork {
  id: string;
  name: string;
  dockerName: string;
  kind: string;
  driver: string;
  internal: boolean;
  external: boolean;
  attachable: boolean;
  capabilityRefs: string[];
}

interface WorkflowRecipeManifest {
  id: string;
  capability_refs: string[];
}

interface N8nWorkflowExport {
  name: string;
  recipeId?: string;
  requiredEnv: string[];
}

interface CapabilityManifest {
  id: string;
  kind?: unknown;
  network_policy: {
    mode?: unknown;
    outbound_http?: boolean;
  };
  env: string[];
  secrets: string[];
  isolation?: {
    namespace?: unknown;
    network_namespace?: unknown;
    secrets?: {
      scope?: unknown;
    };
  };
}

interface LoadedBundle {
  runtime: RuntimeManifest;
  recipes: WorkflowRecipeManifest[];
  n8nWorkflows: N8nWorkflowExport[];
  capabilities: CapabilityManifest[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) return listJsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  });
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

function bundleLocalPathExists(root: string, path: string): boolean {
  const selfHostPrefix = 'runtime/';
  const candidates = [
    resolve(root, path),
    path.startsWith(selfHostPrefix) ? resolve(root, path.slice(selfHostPrefix.length)) : '',
    resolve(root, '..', '..', path),
  ].filter(Boolean);
  return candidates.some((candidate) => existsSync(candidate));
}

function catalogRefs(value: unknown): CatalogRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string') return [];
    return [
      {
        id: item.id,
        ...(typeof item.kind === 'string' ? { kind: item.kind } : {}),
        ...(typeof item.path === 'string' ? { path: item.path } : {}),
        ...(typeof item.uri === 'string' ? { uri: item.uri } : {}),
        required: item.required !== false,
      },
    ];
  });
}

function runtimeServices(value: unknown): RuntimeService[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string') return [];
    const railway = isRecord(item.railway) ? item.railway : undefined;
    return [
      {
        id: item.id,
        name: typeof item.name === 'string' ? item.name : item.id,
        kind: typeof item.kind === 'string' ? item.kind : '',
        runtime: typeof item.runtime === 'string' ? item.runtime : '',
        ...(typeof item.image === 'string' ? { image: item.image } : {}),
        ...(typeof item.start_command === 'string' ? { startCommand: item.start_command } : {}),
        public: item.public === true,
        required: item.required !== false,
        dependsOn: stringArray(item.depends_on),
        env: stringArray(item.env),
        volumes: stringArray(item.volumes),
        networkRefs: stringArray(item.network_refs),
        ...(typeof item.capability_ref === 'string' ? { capability_ref: item.capability_ref } : {}),
        ...(typeof item.recipe_catalog_ref === 'string'
          ? { recipe_catalog_ref: item.recipe_catalog_ref }
          : {}),
        ...(railway && typeof railway.service_name === 'string'
          ? {
              railway: {
                serviceName: railway.service_name,
                ...(typeof railway.builder === 'string' ? { builder: railway.builder } : {}),
                ...(typeof railway.dockerfile_path === 'string'
                  ? { dockerfilePath: railway.dockerfile_path }
                  : {}),
                ...(typeof railway.healthcheck_path === 'string'
                  ? { healthcheckPath: railway.healthcheck_path }
                  : {}),
                ...(typeof railway.healthcheck_timeout_seconds === 'number'
                  ? { healthcheckTimeoutSeconds: railway.healthcheck_timeout_seconds }
                  : {}),
              },
            }
          : {}),
      },
    ];
  });
}

function dockerNetworks(value: unknown): RuntimeDockerNetwork[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string') return [];
    const docker = isRecord(item.docker) ? item.docker : {};
    return [
      {
        id: item.id,
        name: typeof item.name === 'string' ? item.name : item.id,
        dockerName: typeof docker.name === 'string' ? docker.name : item.id,
        kind: typeof item.kind === 'string' ? item.kind : '',
        driver: typeof docker.driver === 'string' ? docker.driver : 'bridge',
        internal: docker.internal === true,
        external: docker.external === true,
        attachable: docker.attachable === true,
        capabilityRefs: stringArray(item.capability_refs),
      },
    ];
  });
}

function capabilityImplementations(value: unknown, services: RuntimeService[] = []): SelfHostCapabilityImplementation[] {
  if (!Array.isArray(value)) return [];
  const serviceNames = new Map(services.map((service) => [service.id, service.name]));
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string') return [];
    const model = isRecord(item.model) ? item.model : undefined;
    const metadata = isRecord(item.metadata) ? item.metadata : undefined;
    const serviceName = typeof item.service_id === 'string' ? serviceNames.get(item.service_id) : undefined;
    return [
      {
        id: item.id,
        capabilityRef: typeof item.capability_ref === 'string' ? item.capability_ref : '',
        serviceId: typeof item.service_id === 'string' ? item.service_id : '',
        ...(serviceName ? { serviceName } : {}),
        status: typeof item.status === 'string' ? item.status : 'planned',
        targetStatus: typeof item.target_status === 'string' ? item.target_status : 'model_backed',
        protocol: typeof item.protocol === 'string' ? item.protocol : 'okra-capability-http/v1',
        endpointPath: typeof item.endpoint_path === 'string' ? item.endpoint_path : '/v1/capability-runs',
        ...(typeof item.image === 'string' ? { image: item.image } : {}),
        ...(typeof item.dockerfile_path === 'string' ? { dockerfilePath: item.dockerfile_path } : {}),
        ...(typeof item.command === 'string' ? { command: item.command } : {}),
        networkRefs: stringArray(item.network_refs),
        env: stringArray(item.env),
        volumes: stringArray(item.volumes),
        ...(model
          ? {
              model: {
                ...(typeof model.provider === 'string' ? { provider: model.provider } : {}),
                ...(typeof model.model_id === 'string' ? { modelId: model.model_id } : {}),
                ...(typeof model.cache_volume === 'string' ? { cacheVolume: model.cache_volume } : {}),
                ...(typeof model.cache_path === 'string' ? { cachePath: model.cache_path } : {}),
                env: stringArray(model.env),
              },
            }
          : {}),
        readinessGate: typeof item.readiness_gate === 'string'
          ? item.readiness_gate
          : 'model_backed_capabilities',
        promotionActions: stringArray(item.promotion_actions),
        smokeTests: stringArray(item.smoke_tests),
        ...(metadata ? { metadata } : {}),
      },
    ];
  });
}

function envVars(value: unknown): SelfHostPlanEnvVar[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== 'string') return [];
    return [
      {
        name: item.name,
        required: item.required === true,
        secret: item.secret === true,
        ...(typeof item.default === 'string' ? { default: item.default } : {}),
        ...(typeof item.example === 'string' ? { example: item.example } : {}),
        consumers: [],
      },
    ];
  });
}

function volumes(value: unknown): SelfHostPlanVolume[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string') return [];
    return [
      {
        id: item.id,
        mountPath: typeof item.mount_path === 'string' ? item.mount_path : '',
        purpose: typeof item.purpose === 'string' ? item.purpose : '',
        required: item.required !== false,
        ...(typeof item.size_mb === 'number' ? { sizeMb: item.size_mb } : {}),
        consumers: [],
      },
    ];
  });
}

function smokeTests(value: unknown): SelfHostDeploymentPlan['smokeTests'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== 'string') return [];
    return [
      {
        name: item.name,
        ...(typeof item.command === 'string' ? { command: item.command } : {}),
        ...(typeof item.path === 'string' ? { path: item.path } : {}),
        ...(typeof item.expected_status === 'number' ? { expectedStatus: item.expected_status } : {}),
      },
    ];
  });
}

function parseRuntime(root: string, errors: SelfHostValidationIssue[]): RuntimeManifest | null {
  const manifestPath = join(root, 'runtime.manifest.json');
  try {
    const runtime = readJson(manifestPath);
    if (!isRecord(runtime)) {
      errors.push({ path: manifestPath, message: 'runtime manifest must be a JSON object' });
      return null;
    }
    if (runtime.schema_version !== 'okra-self-host-runtime/v1') {
      errors.push({
        path: manifestPath,
        message: 'schema_version must be okra-self-host-runtime/v1',
      });
    }
    if (typeof runtime.ui_runtime === 'string' && runtime.ui_runtime.includes('next')) {
      errors.push({
        path: 'runtime.ui_runtime',
        message: 'Next.js is not a self-host UI runtime target',
      });
    }
    if (!Array.isArray(runtime.recipe_catalogs) || runtime.recipe_catalogs.length === 0) {
      errors.push({ path: 'runtime.recipe_catalogs', message: 'runtime must declare recipe catalogs' });
    }
    if (!Array.isArray(runtime.capability_refs) || runtime.capability_refs.length === 0) {
      errors.push({ path: 'runtime.capability_refs', message: 'runtime must declare capability refs' });
    }
    if (!Array.isArray(runtime.services) || runtime.services.length === 0) {
      errors.push({ path: 'runtime.services', message: 'runtime must declare services' });
    }
    return runtime;
  } catch (error) {
    errors.push({ path: manifestPath, message: formatUnknownError(error) });
    return null;
  }
}

function loadRecipeCatalogs(
  root: string,
  runtime: RuntimeManifest,
  errors: SelfHostValidationIssue[],
  warnings: SelfHostValidationIssue[],
): WorkflowRecipeManifest[] {
  const recipes: WorkflowRecipeManifest[] = [];

  for (const catalog of catalogRefs(runtime.recipe_catalogs)) {
    if (!catalog.path) {
      warnings.push({
        path: catalog.id,
        message: 'URI recipe catalogs are not fetched by local validation',
      });
      continue;
    }

    const catalogPath = resolve(root, catalog.path);
    if (!existsSync(catalogPath)) {
      const issue = { path: catalogPath, message: 'recipe catalog path does not exist' };
      if (catalog.required) errors.push(issue);
      else warnings.push(issue);
      continue;
    }

    const stat = statSync(catalogPath);
    const files = stat.isDirectory() ? listJsonFiles(catalogPath) : [catalogPath];
    for (const file of files.filter((path) => path.endsWith('.recipe.json'))) {
      try {
        const recipe = readJson(file);
        if (!isRecord(recipe) || typeof recipe.id !== 'string') {
          errors.push({ path: file, message: 'recipe manifest must declare an id' });
          continue;
        }
        if (recipe.schema_version !== 'okra-workflow-recipe/v1') {
          errors.push({ path: file, message: 'schema_version must be okra-workflow-recipe/v1' });
        }
        const refs = stringArray(recipe.capability_refs);
        if (refs.length === 0) {
          errors.push({ path: file, message: 'recipe must declare capability_refs' });
        }
        recipes.push({ id: recipe.id, capability_refs: refs });
      } catch (error) {
        errors.push({ path: file, message: formatUnknownError(error) });
      }
    }
  }

  return recipes;
}

function findEnvRefs(value: unknown, refs = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const matcher = /\$env\.([A-Z0-9_]+)/g;
    for (const match of value.matchAll(matcher)) {
      refs.add(match[1]);
    }
    return refs;
  }

  if (Array.isArray(value)) {
    for (const item of value) findEnvRefs(item, refs);
    return refs;
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) findEnvRefs(item, refs);
  }

  return refs;
}

function validateN8nConnections(
  file: string,
  workflow: Record<string, unknown>,
  nodeNames: Set<string>,
  errors: SelfHostValidationIssue[],
): void {
  if (!isRecord(workflow.connections)) {
    errors.push({ path: file, message: 'n8n workflow export must declare connections' });
    return;
  }

  for (const [sourceName, sourceConnections] of Object.entries(workflow.connections)) {
    if (!nodeNames.has(sourceName)) {
      errors.push({
        path: file,
        message: `n8n workflow connection references unknown source node "${sourceName}"`,
      });
    }

    if (!isRecord(sourceConnections) || !Array.isArray(sourceConnections.main)) continue;
    for (const branch of sourceConnections.main) {
      if (!Array.isArray(branch)) continue;
      for (const edge of branch) {
        if (!isRecord(edge) || typeof edge.node !== 'string') continue;
        if (!nodeNames.has(edge.node)) {
          errors.push({
            path: file,
            message: `n8n workflow connection references unknown target node "${edge.node}"`,
          });
        }
      }
    }
  }
}

function loadN8nWorkflowExports(
  root: string,
  runtime: RuntimeManifest,
  recipes: WorkflowRecipeManifest[],
  errors: SelfHostValidationIssue[],
  warnings: SelfHostValidationIssue[],
): N8nWorkflowExport[] {
  const workflows: N8nWorkflowExport[] = [];
  const recipeIds = new Set(recipes.map((recipe) => recipe.id));
  const declaredEnv = new Set(envVars(runtime.env).map((env) => env.name));

  for (const catalog of catalogRefs(runtime.recipe_catalogs).filter(
    (item) => item.kind === 'n8n_export',
  )) {
    if (!catalog.path) {
      warnings.push({
        path: catalog.id,
        message: 'URI n8n workflow catalogs are not fetched by local validation',
      });
      continue;
    }

    const catalogPath = resolve(root, catalog.path);
    if (!existsSync(catalogPath)) continue;

    const stat = statSync(catalogPath);
    const files = stat.isDirectory() ? listJsonFiles(catalogPath) : [catalogPath];
    for (const file of files.filter((path) => path.endsWith('.workflow.json'))) {
      try {
        const workflow = readJson(file);
        if (!isRecord(workflow)) {
          errors.push({ path: file, message: 'n8n workflow export must be a JSON object' });
          continue;
        }

        if (typeof workflow.name !== 'string') {
          errors.push({ path: file, message: 'n8n workflow export must declare a name' });
        }
        if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
          errors.push({ path: file, message: 'n8n workflow export must declare nodes' });
          continue;
        }

        const nodeNames = new Set<string>();
        const nodeTypes = new Set<string>();
        for (const node of workflow.nodes) {
          if (!isRecord(node)) {
            errors.push({ path: file, message: 'n8n workflow nodes must be JSON objects' });
            continue;
          }
          if (typeof node.name === 'string') nodeNames.add(node.name);
          if (typeof node.type === 'string') nodeTypes.add(node.type);
          if ('credentials' in node) {
            errors.push({
              path: file,
              message: 'n8n workflow exports must not embed credential references',
            });
          }
        }

        if (!nodeTypes.has('n8n-nodes-base.webhook')) {
          errors.push({ path: file, message: 'n8n workflow export must include a Webhook node' });
        }
        if (!nodeTypes.has('n8n-nodes-base.httpRequest')) {
          errors.push({ path: file, message: 'n8n workflow export must include an HTTP Request node' });
        }
        if (!nodeTypes.has('n8n-nodes-base.respondToWebhook')) {
          errors.push({
            path: file,
            message: 'n8n workflow export must include a Respond to Webhook node',
          });
        }

        validateN8nConnections(file, workflow, nodeNames, errors);

        const envRefs = [...findEnvRefs(workflow)].sort();
        for (const envRef of envRefs) {
          if (!declaredEnv.has(envRef)) {
            errors.push({
              path: file,
              message: `n8n workflow references undeclared env var "${envRef}"`,
            });
          }
        }

        const meta = isRecord(workflow.meta) ? workflow.meta : {};
        const okrapdf = isRecord(meta.okrapdf) ? meta.okrapdf : {};
        const recipeId = typeof okrapdf.recipe_id === 'string' ? okrapdf.recipe_id : undefined;
        if (!recipeId) {
          errors.push({ path: file, message: 'n8n workflow export must declare meta.okrapdf.recipe_id' });
        } else if (!recipeIds.has(recipeId)) {
          errors.push({
            path: file,
            message: `n8n workflow references unknown Okra recipe "${recipeId}"`,
          });
        }

        const requiredEnv = Array.isArray(okrapdf.required_env)
          ? okrapdf.required_env.filter((item): item is string => typeof item === 'string')
          : [];
        for (const envRef of envRefs) {
          if (!requiredEnv.includes(envRef)) {
            errors.push({
              path: file,
              message: `n8n workflow env var "${envRef}" must be listed in meta.okrapdf.required_env`,
            });
          }
        }

        workflows.push({
          name: typeof workflow.name === 'string' ? workflow.name : file,
          ...(recipeId ? { recipeId } : {}),
          requiredEnv,
        });
      } catch (error) {
        errors.push({ path: file, message: formatUnknownError(error) });
      }
    }
  }

  return workflows;
}

function loadCapabilityCatalogs(
  root: string,
  runtime: RuntimeManifest,
  errors: SelfHostValidationIssue[],
  warnings: SelfHostValidationIssue[],
): CapabilityManifest[] {
  const capabilities: CapabilityManifest[] = [];
  const catalogs = catalogRefs(runtime.capability_catalogs);

  if (catalogs.length === 0) {
    errors.push({
      path: join(root, 'runtime.manifest.json'),
      message: 'runtime manifest must declare at least one capability catalog',
    });
  }

  for (const catalog of catalogs) {
    if (!catalog.path) {
      warnings.push({
        path: catalog.id,
        message: 'URI capability catalogs are not fetched by local validation',
      });
      continue;
    }

    const catalogPath = resolve(root, catalog.path);
    if (!existsSync(catalogPath)) {
      const issue = { path: catalogPath, message: 'capability catalog path does not exist' };
      if (catalog.required) errors.push(issue);
      else warnings.push(issue);
      continue;
    }

    const stat = statSync(catalogPath);
    const files = stat.isDirectory() ? listJsonFiles(catalogPath) : [catalogPath];
    for (const file of files.filter((path) => path.endsWith('.engine.json'))) {
      try {
        const capability = readJson(file);
        if (!isRecord(capability) || typeof capability.id !== 'string') {
          errors.push({ path: file, message: 'capability manifest must declare an id' });
          continue;
        }
        const networkPolicy = isRecord(capability.network_policy) ? capability.network_policy : {};
        const capabilityEnv = Array.isArray(capability.env)
          ? capability.env.flatMap((item) =>
              isRecord(item) && typeof item.name === 'string' ? [item.name] : [],
            )
          : [];
        const capabilitySecrets = Array.isArray(capability.secrets)
          ? capability.secrets.flatMap((item) =>
              isRecord(item) && typeof item.name === 'string' ? [item.name] : [],
            )
          : [];
        const isolation = isRecord(capability.isolation) ? capability.isolation : undefined;
        const isolationSecrets =
          isolation && isRecord(isolation.secrets) ? isolation.secrets : undefined;
        capabilities.push({
          id: capability.id,
          kind: capability.kind,
          network_policy: {
            mode: networkPolicy.mode,
            outbound_http: networkPolicy.outbound_http === true,
          },
          env: capabilityEnv,
          secrets: capabilitySecrets,
          ...(isolation
            ? {
                isolation: {
                  namespace: isolation.namespace,
                  network_namespace: isolation.network_namespace,
                  ...(isolationSecrets
                    ? { secrets: { scope: isolationSecrets.scope } }
                    : {}),
                },
              }
            : {}),
        });
      } catch (error) {
        errors.push({ path: file, message: formatUnknownError(error) });
      }
    }
  }

  return capabilities;
}

function validateReferences(bundle: LoadedBundle, errors: SelfHostValidationIssue[]): void {
  const runtimeCapabilityRefs = new Set(stringArray(bundle.runtime.capability_refs));
  const capabilityIds = new Set(bundle.capabilities.map((capability) => capability.id));
  const referencedCapabilityRefs = new Set<string>();

  for (const capabilityRef of runtimeCapabilityRefs) {
    if (!capabilityIds.has(capabilityRef)) {
      errors.push({
        path: 'runtime.capability_refs',
        message: `capability "${capabilityRef}" is declared by runtime but has no manifest`,
      });
    }
  }

  for (const capability of bundle.capabilities) {
    if (!runtimeCapabilityRefs.has(capability.id)) {
      errors.push({
        path: capability.id,
        message: 'capability manifest id is not declared by runtime.capability_refs',
      });
    }
  }

  for (const service of runtimeServices(bundle.runtime.services)) {
    if (service.capability_ref && !runtimeCapabilityRefs.has(service.capability_ref)) {
      errors.push({
        path: `services.${service.id}.capability_ref`,
        message: `service references unknown capability "${service.capability_ref}"`,
      });
    }
    if (service.capability_ref) referencedCapabilityRefs.add(service.capability_ref);
  }

  for (const recipe of bundle.recipes) {
    for (const capabilityRef of recipe.capability_refs) {
      if (!runtimeCapabilityRefs.has(capabilityRef)) {
        errors.push({
          path: `recipes.${recipe.id}.capability_refs`,
          message: `recipe references unknown capability "${capabilityRef}"`,
        });
      }
      referencedCapabilityRefs.add(capabilityRef);
    }
  }

  for (const capabilityRef of runtimeCapabilityRefs) {
    if (!referencedCapabilityRefs.has(capabilityRef)) {
      errors.push({
        path: 'runtime.capability_refs',
        message: `capability "${capabilityRef}" is not referenced by any recipe or service`,
      });
    }
  }
}

function validateCapabilityImplementations(
  root: string,
  bundle: LoadedBundle,
  errors: SelfHostValidationIssue[],
): void {
  const services = runtimeServices(bundle.runtime.services);
  const implementations = capabilityImplementations(bundle.runtime.capability_implementations, services);
  const runtimeCapabilityRefs = new Set(stringArray(bundle.runtime.capability_refs));
  const serviceIds = new Set(services.map((service) => service.id));
  const envNames = new Set(envVars(bundle.runtime.env).map((env) => env.name));
  const volumeIds = new Set(volumes(bundle.runtime.volumes).map((volume) => volume.id));
  const networkIds = new Set(dockerNetworks(bundle.runtime.docker_networks).map((network) => network.id));
  const implementedCapabilityRefs = new Set<string>();

  for (const implementation of implementations) {
    if (!runtimeCapabilityRefs.has(implementation.capabilityRef)) {
      errors.push({
        path: `capability_implementations.${implementation.id}.capability_ref`,
        message: `capability implementation references unknown capability "${implementation.capabilityRef}"`,
      });
    }

    if (!serviceIds.has(implementation.serviceId)) {
      errors.push({
        path: `capability_implementations.${implementation.id}.service_id`,
        message: `capability implementation references unknown service "${implementation.serviceId}"`,
      });
    }

    if (implementation.dockerfilePath && !bundleLocalPathExists(root, implementation.dockerfilePath)) {
      errors.push({
        path: `capability_implementations.${implementation.id}.dockerfile_path`,
        message: `capability implementation Dockerfile does not exist: ${implementation.dockerfilePath}`,
      });
    }

    const service = services.find((item) => item.id === implementation.serviceId);
    if (service) {
      if (!['capability_service', 'external_service'].includes(service.kind)) {
        errors.push({
          path: `capability_implementations.${implementation.id}.service_id`,
          message: 'capability implementation must point at a capability_service or external_service',
        });
      }
      if (service.capability_ref && service.capability_ref !== implementation.capabilityRef) {
        errors.push({
          path: `capability_implementations.${implementation.id}.capability_ref`,
          message: `implementation capability "${implementation.capabilityRef}" does not match service capability "${service.capability_ref}"`,
        });
      }
    }

    for (const networkRef of implementation.networkRefs) {
      if (!networkIds.has(networkRef)) {
        errors.push({
          path: `capability_implementations.${implementation.id}.network_refs`,
          message: `capability implementation references unknown Docker network "${networkRef}"`,
        });
      }
      if (service && !service.networkRefs.includes(networkRef)) {
        errors.push({
          path: `capability_implementations.${implementation.id}.network_refs`,
          message: `implementation network "${networkRef}" is not attached to service "${service.id}"`,
        });
      }
    }

    for (const envRef of implementation.env) {
      if (!envNames.has(envRef)) {
        errors.push({
          path: `capability_implementations.${implementation.id}.env`,
          message: `capability implementation references unknown env var "${envRef}"`,
        });
      }
    }

    for (const volumeRef of implementation.volumes) {
      if (!volumeIds.has(volumeRef)) {
        errors.push({
          path: `capability_implementations.${implementation.id}.volumes`,
          message: `capability implementation references unknown volume "${volumeRef}"`,
        });
      }
      if (service && !service.volumes.includes(volumeRef)) {
        errors.push({
          path: `capability_implementations.${implementation.id}.volumes`,
          message: `implementation volume "${volumeRef}" is not attached to service "${service.id}"`,
        });
      }
    }

    implementedCapabilityRefs.add(implementation.capabilityRef);
  }

  for (const service of services.filter((item) => item.kind === 'capability_service')) {
    if (!service.capability_ref || implementedCapabilityRefs.has(service.capability_ref)) continue;
    errors.push({
      path: `services.${service.id}.capability_ref`,
      message: `capability service "${service.id}" has no capability implementation handoff`,
    });
  }
}

function validateIsolation(
  capabilities: CapabilityManifest[],
  errors: SelfHostValidationIssue[],
): void {
  const namespaces = new Set<string>();

  for (const capability of capabilities) {
    const isolation = capability.isolation;
    if (!isolation) {
      errors.push({ path: capability.id, message: 'capability must declare isolation metadata' });
      continue;
    }

    if (typeof isolation.namespace !== 'string') {
      errors.push({
        path: `${capability.id}.isolation.namespace`,
        message: 'capability must declare an isolation namespace',
      });
    } else {
      if (!isolation.namespace.startsWith('okra.capabilities.')) {
        errors.push({
          path: `${capability.id}.isolation.namespace`,
          message: 'isolation namespace must start with okra.capabilities.',
        });
      }
      if (namespaces.has(isolation.namespace)) {
        errors.push({
          path: `${capability.id}.isolation.namespace`,
          message: `duplicate isolation namespace "${isolation.namespace}"`,
        });
      }
      namespaces.add(isolation.namespace);
    }

    if (capability.network_policy.mode === 'unrestricted') {
      errors.push({
        path: `${capability.id}.network_policy.mode`,
        message: 'unrestricted egress is not allowed for self-host capabilities',
      });
    }

    if (capability.network_policy.mode === 'offline') {
      if (capability.network_policy.outbound_http) {
        errors.push({
          path: `${capability.id}.network_policy.outbound_http`,
          message: 'offline capabilities cannot enable outbound HTTP',
        });
      }
      if (isolation.network_namespace !== 'none') {
        errors.push({
          path: `${capability.id}.isolation.network_namespace`,
          message: 'offline capabilities must use network_namespace "none"',
        });
      }
    }

    if (capability.network_policy.outbound_http && isolation.network_namespace === 'none') {
      errors.push({
        path: `${capability.id}.isolation.network_namespace`,
        message: 'outbound HTTP requires an isolated or external network namespace',
      });
    }

    if (capability.secrets.length === 0 && isolation.secrets?.scope !== 'none') {
      errors.push({
        path: `${capability.id}.isolation.secrets.scope`,
        message: 'capabilities without declared secrets must use secrets scope "none"',
      });
    }
  }
}

function validateDockerNetworks(
  bundle: LoadedBundle,
  errors: SelfHostValidationIssue[],
): void {
  const networks = dockerNetworks(bundle.runtime.docker_networks);
  if (networks.length === 0) return;

  const networkIds = new Set<string>();
  const networkKinds = new Map<string, string>();
  const services = runtimeServices(bundle.runtime.services);
  const capabilityById = new Map(bundle.capabilities.map((capability) => [capability.id, capability]));
  const runtimeCapabilityRefs = new Set(stringArray(bundle.runtime.capability_refs));

  for (const network of networks) {
    if (networkIds.has(network.id)) {
      errors.push({
        path: 'runtime.docker_networks',
        message: `duplicate Docker network "${network.id}"`,
      });
    }
    networkIds.add(network.id);
    networkKinds.set(network.id, network.kind);

    if (network.external && network.internal) {
      errors.push({
        path: `docker_networks.${network.id}`,
        message: 'Docker network cannot be both external and internal',
      });
    }
    if (network.kind === 'public_ingress' && network.internal) {
      errors.push({
        path: `docker_networks.${network.id}`,
        message: 'public ingress networks cannot be Docker-internal',
      });
    }
    if (
      (network.kind === 'private_runtime' || network.kind === 'capability_mesh') &&
      !network.internal
    ) {
      errors.push({
        path: `docker_networks.${network.id}`,
        message: `${network.kind} networks must be Docker-internal`,
      });
    }
    if (network.kind === 'external_bridge' && !network.external && !network.attachable) {
      errors.push({
        path: `docker_networks.${network.id}`,
        message: 'external bridge networks must be external or attachable',
      });
    }

    for (const capabilityRef of network.capabilityRefs) {
      if (!runtimeCapabilityRefs.has(capabilityRef)) {
        errors.push({
          path: `docker_networks.${network.id}.capability_refs`,
          message: `Docker network references unknown capability "${capabilityRef}"`,
        });
        continue;
      }

      const capability = capabilityById.get(capabilityRef);
      if (!capability) continue;

      const namespace = capability.isolation?.network_namespace;
      if (namespace === 'none') {
        errors.push({
          path: `docker_networks.${network.id}.capability_refs`,
          message: `capability "${capabilityRef}" has no network namespace and cannot be attached to Docker networks`,
        });
      }
      if (network.kind === 'capability_mesh' && namespace !== 'isolated') {
        errors.push({
          path: `docker_networks.${network.id}.capability_refs`,
          message: `capability "${capabilityRef}" must use isolated network namespace on capability_mesh`,
        });
      }
      if (network.kind === 'external_bridge' && namespace !== 'external') {
        errors.push({
          path: `docker_networks.${network.id}.capability_refs`,
          message: `capability "${capabilityRef}" must use external network namespace on external_bridge`,
        });
      }
    }
  }

  for (const service of services) {
    for (const networkRef of service.networkRefs) {
      if (!networkIds.has(networkRef)) {
        errors.push({
          path: `services.${service.id}.network_refs`,
          message: `service references unknown Docker network "${networkRef}"`,
        });
      }
    }

    if (service.public) {
      const hasPublicIngress = service.networkRefs.some(
        (networkRef) => networkKinds.get(networkRef) === 'public_ingress',
      );
      if (!hasPublicIngress) {
        errors.push({
          path: `services.${service.id}.network_refs`,
          message: 'public services must attach to a public_ingress Docker network',
        });
      }
    }

    if (['postgres', 'redis', 'valkey', 'object_store'].includes(service.kind)) {
      const hasPublicNetwork = service.networkRefs.some(
        (networkRef) => networkKinds.get(networkRef) === 'public_ingress',
      );
      if (hasPublicNetwork) {
        errors.push({
          path: `services.${service.id}.network_refs`,
          message: 'stateful private services must not attach to public_ingress networks',
        });
      }
    }

    if (service.kind === 'external_service') {
      const hasNonBridgeNetwork = service.networkRefs.some(
        (networkRef) => networkKinds.get(networkRef) !== 'external_bridge',
      );
      if (hasNonBridgeNetwork) {
        errors.push({
          path: `services.${service.id}.network_refs`,
          message: 'external services may only attach through external_bridge networks',
        });
      }
    }
  }
}

function createSummary(bundle: LoadedBundle): SelfHostValidationSummary {
  const namespaces = bundle.capabilities
    .map((capability) => capability.isolation?.namespace)
    .filter((namespace): namespace is string => typeof namespace === 'string');

  return {
    services: runtimeServices(bundle.runtime.services).length,
    recipes: bundle.recipes.length,
    n8nWorkflows: bundle.n8nWorkflows.length,
    capabilities: bundle.capabilities.length,
    capabilityNamespaces: new Set(namespaces).size,
    dockerNetworks: dockerNetworks(bundle.runtime.docker_networks).length,
    deploymentTargets: stringArray(bundle.runtime.deployment_targets),
    uiRuntime: typeof bundle.runtime.ui_runtime === 'string' ? bundle.runtime.ui_runtime : '',
    apiRuntime: typeof bundle.runtime.api_runtime === 'string' ? bundle.runtime.api_runtime : '',
  };
}

export function validateSelfHostBundle(bundleDir: string): SelfHostValidationResult {
  const root = resolve(bundleDir);
  const errors: SelfHostValidationIssue[] = [];
  const warnings: SelfHostValidationIssue[] = [];

  if (!existsSync(root)) {
    return {
      object: 'self_host_validation',
      ok: false,
      root,
      manifest: join(root, 'runtime.manifest.json'),
      summary: null,
      errors: [{ path: root, message: 'bundle directory does not exist' }],
      warnings,
    };
  }

  const runtime = parseRuntime(root, errors);
  if (!runtime) {
    return {
      object: 'self_host_validation',
      ok: false,
      root,
      manifest: join(root, 'runtime.manifest.json'),
      summary: null,
      errors,
      warnings,
    };
  }

  const recipes = loadRecipeCatalogs(root, runtime, errors, warnings);
  const n8nWorkflows = loadN8nWorkflowExports(root, runtime, recipes, errors, warnings);
  const capabilities = loadCapabilityCatalogs(root, runtime, errors, warnings);
  const bundle = { runtime, recipes, n8nWorkflows, capabilities };

  validateReferences(bundle, errors);
  validateCapabilityImplementations(root, bundle, errors);
  validateIsolation(capabilities, errors);
  validateDockerNetworks(bundle, errors);

  return {
    object: 'self_host_validation',
    ok: errors.length === 0,
    root,
    manifest: join(root, 'runtime.manifest.json'),
    summary: createSummary(bundle),
    errors,
    warnings,
  };
}

function createLoadedBundle(
  root: string,
  errors: SelfHostValidationIssue[],
  warnings: SelfHostValidationIssue[],
): LoadedBundle | null {
  const runtime = parseRuntime(root, errors);
  if (!runtime) return null;

  const recipes = loadRecipeCatalogs(root, runtime, errors, warnings);
  const n8nWorkflows = loadN8nWorkflowExports(root, runtime, recipes, errors, warnings);
  const capabilities = loadCapabilityCatalogs(root, runtime, errors, warnings);
  const bundle = { runtime, recipes, n8nWorkflows, capabilities };

  validateReferences(bundle, errors);
  validateCapabilityImplementations(root, bundle, errors);
  validateIsolation(capabilities, errors);
  validateDockerNetworks(bundle, errors);

  return bundle;
}

function createValidationResult(
  root: string,
  errors: SelfHostValidationIssue[],
  warnings: SelfHostValidationIssue[],
  bundle: LoadedBundle | null,
): SelfHostValidationResult {
  return {
    object: 'self_host_validation',
    ok: errors.length === 0,
    root,
    manifest: join(root, 'runtime.manifest.json'),
    summary: bundle ? createSummary(bundle) : null,
    errors,
    warnings,
  };
}

function attachConsumers<T extends { name: string; consumers: string[] }>(
  values: T[],
  services: RuntimeService[],
  getRefs: (service: RuntimeService) => string[],
): T[] {
  const byName = new Map(values.map((value) => [value.name, value]));
  for (const service of services) {
    for (const ref of getRefs(service)) {
      byName.get(ref)?.consumers.push(service.id);
    }
  }
  return values;
}

function attachVolumeConsumers(
  values: SelfHostPlanVolume[],
  services: RuntimeService[],
): SelfHostPlanVolume[] {
  const byId = new Map(values.map((value) => [value.id, value]));
  for (const service of services) {
    for (const ref of service.volumes) {
      byId.get(ref)?.consumers.push(service.id);
    }
  }
  return values;
}

function createDockerNetworkPlan(
  runtimeNetworks: RuntimeDockerNetwork[],
  services: RuntimeService[],
): SelfHostPlanDockerNetwork[] {
  return runtimeNetworks.map((network) => ({
    id: network.id,
    name: network.name,
    dockerName: network.dockerName,
    kind: network.kind,
    driver: network.driver,
    internal: network.internal,
    external: network.external,
    attachable: network.attachable,
    services: services
      .filter((service) => service.networkRefs.includes(network.id))
      .map((service) => service.id),
    capabilities: network.capabilityRefs,
  }));
}

function serviceLaunchBoundary(
  service: SelfHostPlanService,
): SelfHostDockerNetworkServiceAttachment['launchBoundary'] {
  if (service.kind === 'external_service') return 'external_integration';
  if (service.kind === 'capability_service') return 'capability_overlay';
  return 'core_stack';
}

function dockerNetworkOwner(network: SelfHostPlanDockerNetwork): SelfHostDockerNetworkOwner {
  if (network.kind === 'external_bridge' || network.external) return 'operator_created';
  if (network.kind === 'capability_mesh') return 'compose_stack_or_operator_created';
  return 'compose_stack';
}

function dockerNetworkComposeModes(network: SelfHostPlanDockerNetwork): SelfHostComposeMode[] {
  const modes: SelfHostComposeMode[] = ['networks'];
  if (network.kind === 'public_ingress' || network.kind === 'private_runtime') {
    modes.push('stack');
  }
  if (network.kind === 'capability_mesh') {
    modes.push('stack', 'capabilities');
  }
  if (network.kind === 'external_bridge') {
    modes.push('stack', 'integrations');
  }
  return [...new Set(modes)];
}

function dockerNetworkNotes(network: SelfHostPlanDockerNetwork): string[] {
  if (network.kind === 'public_ingress') {
    return ['Only okra-app should publish host ports or public HTTP routing on this lane.'];
  }
  if (network.kind === 'private_runtime') {
    return ['Keep stateful services on this Docker-internal lane; do not attach external workflow runners.'];
  }
  if (network.kind === 'capability_mesh') {
    return [
      'Parser, audit, and redaction services attach here and speak okra-capability-http/v1.',
      'Pre-create this network when launching capability services as a separate Compose project.',
    ];
  }
  if (network.kind === 'external_bridge') {
    return [
      'External workflow runners attach here intentionally.',
      'Do not use host networking for n8n or other recipe runners.',
    ];
  }
  return [];
}

function createDockerNetworkHandoff(plan: SelfHostDeploymentPlan): SelfHostDockerNetworkHandoff {
  const capabilityServices = plan.services.filter((service) => service.kind === 'capability_service');
  const externalServices = plan.services.filter((service) => service.kind === 'external_service');
  const okraData = plan.volumes.find((volume) => volume.id === 'okra-data');
  const capabilityNetworks = [
    ...new Set(capabilityServices.flatMap((service) => service.networkRefs)),
  ];
  const integrationNetworks = [
    ...new Set(externalServices.flatMap((service) => service.networkRefs)),
  ];
  const capabilityBootstrap = [
    ...plan.dockerNetworks
      .filter((network) => capabilityNetworks.includes(network.id))
      .map(dockerNetworkCreateCommand),
    ...(okraData ? [dockerVolumeCreateCommand(`okrapdf-self-host_${okraData.id}`)] : []),
  ];
  const integrationBootstrap = plan.dockerNetworks
    .filter((network) => integrationNetworks.includes(network.id))
    .map(dockerNetworkCreateCommand);
  const separatedLaunches: SelfHostDockerNetworkSeparatedLaunch[] = [
    ...(capabilityServices.length > 0
      ? [{
          id: 'capability-services',
          kind: 'capability_services' as const,
          composeFile: 'docker-compose.capabilities.yml',
          services: capabilityServices.map((service) => service.id),
          networks: capabilityNetworks,
          requiredBootstrap: capabilityBootstrap,
          launchCommand: 'docker compose -f docker-compose.capabilities.yml up -d',
          notes: [
            'Use this when parser/audit/redaction services should run as a separate Docker project.',
            'Set OKRA_CAPABILITY_*_URL on okra-app to the service DNS names on okra-capabilities.',
          ],
        }]
      : []),
    ...(externalServices.length > 0
      ? [{
          id: 'external-integrations',
          kind: 'external_integrations' as const,
          composeFile: 'docker-compose.integrations.yml',
          services: externalServices.map((service) => service.id),
          networks: integrationNetworks,
          requiredBootstrap: integrationBootstrap,
          launchCommand: 'docker compose -f docker-compose.integrations.yml up -d',
          notes: [
            'Use this for n8n or other workflow runners that call Okra through API/webhook recipes.',
            'Attach external services only to okra-integrations; keep them off okra-core and okra-capabilities.',
          ],
        }]
      : []),
  ];

  return {
    object: 'docker_network_handoff',
    schema_version: 'okra-docker-network-handoff/v1',
    name: 'okraPDF Self-Host Docker Network Handoff',
    source_manifest: 'runtime.manifest.json',
    status: 'handoff_ready',
    summary: {
      networks: plan.dockerNetworks.length,
      internalNetworks: plan.dockerNetworks.filter((network) => network.internal).length,
      externalNetworks: plan.dockerNetworks.filter((network) => network.external).length,
      attachableNetworks: plan.dockerNetworks.filter((network) => network.attachable).length,
      publicServices: plan.services.filter((service) => service.public).length,
      privateServices: plan.services.filter((service) => !service.public).length,
      capabilityServices: capabilityServices.length,
      externalServices: externalServices.length,
      separatedLaunches: separatedLaunches.length,
    },
    networks: plan.dockerNetworks.map((network) => ({
      id: network.id,
      name: network.name,
      dockerName: network.dockerName,
      kind: network.kind,
      driver: network.driver,
      internal: network.internal,
      external: network.external,
      attachable: network.attachable,
      owner: dockerNetworkOwner(network),
      composeModes: dockerNetworkComposeModes(network),
      allowedServices: network.services,
      capabilityRefs: network.capabilities,
      bootstrapCommand: dockerNetworkCreateCommand(network),
      notes: dockerNetworkNotes(network),
    })),
    serviceAttachments: plan.services.map((service) => ({
      serviceId: service.id,
      serviceName: service.name,
      kind: service.kind,
      public: service.public,
      required: service.required,
      networkRefs: service.networkRefs,
      launchBoundary: serviceLaunchBoundary(service),
      ...(service.capabilityRef ? { capabilityRef: service.capabilityRef } : {}),
      ...(service.recipeCatalogRef ? { recipeCatalogRef: service.recipeCatalogRef } : {}),
    })),
    separatedLaunches,
    composeFiles: [
      {
        path: 'docker-compose.yml',
        purpose: 'Full local stack with public okra-app, private state, optional capabilities, and integration bridge.',
      },
      {
        path: 'docker-compose.capabilities.yml',
        purpose: 'Separated parser/audit/redaction capability services on okra-capabilities.',
      },
      {
        path: 'docker-compose.integrations.yml',
        purpose: 'Separated external workflow services on okra-integrations.',
      },
      {
        path: 'docker-compose.networks.yml',
        purpose: 'Topology-only named network contract for pre-creating shared networks.',
      },
    ],
    guardrails: [
      'Publish host ports only from okra-app or explicitly external integration UIs such as n8n.',
      'Keep okra-core and okra-capabilities Docker-internal.',
      'Attach external services only through okra-integrations.',
      'Keep capability services off okra-edge and route them through OKRA_CAPABILITY_*_URL variables.',
      'Do not use host networking to connect recipe runners or model containers.',
    ],
    docs: [
      'runtime/README.md',
      'runtime/RAILWAY.md',
      'runtime/docker-compose.networks.yml',
    ],
  };
}

function attachCapabilityEnvConsumers(
  values: SelfHostPlanEnvVar[],
  capabilities: CapabilityManifest[],
): SelfHostPlanEnvVar[] {
  const byName = new Map(values.map((value) => [value.name, value]));
  for (const capability of capabilities) {
    for (const ref of [...capability.env, ...capability.secrets]) {
      const env = byName.get(ref);
      if (env && !env.consumers.includes(capability.id)) {
        env.consumers.push(capability.id);
      }
    }
  }
  return values;
}

function createRailwayPlan(root: string, validation: SelfHostValidationResult): SelfHostDeploymentPlan | null {
  if (!validation.ok) return null;

  const errors: SelfHostValidationIssue[] = [];
  const warnings: SelfHostValidationIssue[] = [];
  const bundle = createLoadedBundle(root, errors, warnings);
  if (!bundle || errors.length > 0) return null;

  const services = runtimeServices(bundle.runtime.services);
  const dockerNetworkPlan = createDockerNetworkPlan(
    dockerNetworks(bundle.runtime.docker_networks),
    services,
  );
  const servicePlan = services.map((service): SelfHostPlanService => ({
    id: service.id,
    name: service.name,
    kind: service.kind,
    runtime: service.runtime,
    ...(service.image ? { image: service.image } : {}),
    ...(service.startCommand ? { startCommand: service.startCommand } : {}),
    public: service.public,
    required: service.required,
    dependsOn: service.dependsOn,
    env: service.env,
    volumes: service.volumes,
    networkRefs: service.networkRefs,
    ...(service.capability_ref ? { capabilityRef: service.capability_ref } : {}),
    ...(service.recipe_catalog_ref ? { recipeCatalogRef: service.recipe_catalog_ref } : {}),
    ...(service.railway ? { railway: service.railway } : {}),
  }));
  const envPlan = attachCapabilityEnvConsumers(
    attachConsumers(envVars(bundle.runtime.env), services, (service) => service.env),
    bundle.capabilities,
  );
  const volumePlan = attachVolumeConsumers(volumes(bundle.runtime.volumes), services);
  const capabilities = bundle.capabilities.map((capability): SelfHostPlanCapability => ({
    id: capability.id,
    namespace: typeof capability.isolation?.namespace === 'string' ? capability.isolation.namespace : '',
    networkNamespace:
      typeof capability.isolation?.network_namespace === 'string'
        ? capability.isolation.network_namespace
        : '',
    outboundHttp: capability.network_policy.outbound_http === true,
  }));
  const recipeCatalogs = catalogRefs(bundle.runtime.recipe_catalogs).map((catalog) => ({
    id: catalog.id,
    ...(catalog.path ? { path: catalog.path } : {}),
    required: catalog.required,
  }));
  const publicServices = services.filter((service) => service.public).map((service) => service.id);
  const requiredSecrets = envPlan.filter((env) => env.required && env.secret).map((env) => env.name);
  const requiredEnv = envPlan.filter((env) => env.required && !env.secret).map((env) => env.name);

  return {
    target: 'railway',
    services: servicePlan,
    dockerNetworks: dockerNetworkPlan,
    env: envPlan,
    volumes: volumePlan,
    recipes: bundle.recipes.map((recipe) => recipe.id).sort(),
    recipeCatalogs,
    capabilities,
    smokeTests: smokeTests(bundle.runtime.smoke_tests),
    steps: [
      'Create Railway project from the Okra self-host template repository.',
      'Attach the okra-data volume to services that declare it (filesystem state, no database required).',
      'Optional: provision managed Postgres and attach DATABASE_URL to okra-app only if you add a Postgres-backed store.',
      'Create or map Docker networks for public ingress, private runtime, capability mesh, and external integrations.',
      `Expose public services: ${publicServices.join(', ') || 'none'}.`,
      `Set required secrets: ${requiredSecrets.join(', ') || 'none'}.`,
      `Set required env vars: ${requiredEnv.join(', ') || 'none'}.`,
      'Deploy app and optional capability services with declared health checks.',
      'Run `okra self-host validate <bundleDir>` before deploy and smoke tests after deploy.',
    ],
  };
}

function dotenvValue(value: string | undefined): string {
  if (!value) return '';
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function createDotenvTemplate(env: SelfHostPlanEnvVar[]): string {
  const lines = [
    '# okraPDF self-host environment',
    '# Generated from runtime.manifest.json. Fill secrets before deploy.',
  ];

  for (const item of env) {
    const flags = [item.required ? 'required' : 'optional', item.secret ? 'secret' : 'plain'];
    lines.push('', `# ${flags.join(', ')}; consumers: ${item.consumers.join(', ') || 'unconsumed'}`);
    if (item.example) lines.push(`# example: ${item.example}`);
    const value = item.secret ? '' : item.default ?? item.example ?? '';
    lines.push(`${item.name}=${dotenvValue(value)}`);
  }

  return `${lines.join('\n')}\n`;
}

export function createSelfHostEnvArtifact(
  bundleDir: string,
  target = 'railway',
): SelfHostEnvArtifactResult {
  const root = resolve(bundleDir);
  if (target !== 'railway') {
    const validation = validateSelfHostBundle(bundleDir);
    return {
      object: 'self_host_env_artifact',
      ok: false,
      root,
      target: 'railway',
      validation: {
        ...validation,
        errors: [
          ...validation.errors,
          { path: 'target', message: `unsupported self-host env target "${target}"` },
        ],
      },
      env: [],
      dotenv: null,
    };
  }

  const deployment = createSelfHostDeploymentPlan(bundleDir, target);
  return {
    object: 'self_host_env_artifact',
    ok: deployment.ok && deployment.plan !== null,
    root,
    target: 'railway',
    validation: deployment.validation,
    env: deployment.plan?.env ?? [],
    dotenv: deployment.plan ? createDotenvTemplate(deployment.plan.env) : null,
  };
}

function yamlScalar(value: string): string {
  if (/^[A-Za-z0-9_.:/@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function yamlInlineArray(values: string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(', ')}]`;
}

const OKRA_DOCKER_CLI_ENTRY = 'packages/okrapdf/dist/cli/bin.js';

function dockerSafeOkraCommandArgs(args: string[]): string[] {
  return ['node', OKRA_DOCKER_CLI_ENTRY, ...args];
}

function dockerSafeOkraShellCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed.startsWith('okra ')) return command;
  return `node ${OKRA_DOCKER_CLI_ENTRY} ${trimmed.slice('okra '.length)}`;
}

function dockerSafeOkraComposeCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed.startsWith('okra ')) return yamlScalar(command);
  return yamlInlineArray(dockerSafeOkraCommandArgs(trimmed.slice('okra '.length).split(/\s+/)));
}

function normalizeComposeMode(mode: string): SelfHostComposeMode | null {
  return mode === 'networks' || mode === 'stack' || mode === 'capabilities' || mode === 'integrations'
    ? mode
    : null;
}

function createComposeNetworksFragment(networks: SelfHostPlanDockerNetwork[]): string {
  const lines = [
    'name: okrapdf-self-host',
    '',
    'x-okrapdf-runtime:',
    '  source: runtime.manifest.json',
    '  purpose: topology-only',
    '',
    'x-okrapdf-network-consumers:',
  ];

  if (networks.length === 0) {
    lines.push('  {}');
  } else {
    for (const network of networks) {
      lines.push(
        `  ${network.id}:`,
        `    services: ${yamlInlineArray(network.services)}`,
        `    capabilities: ${yamlInlineArray(network.capabilities)}`,
        `    kind: ${yamlScalar(network.kind)}`,
      );
    }
  }

  lines.push('', 'networks:');
  if (networks.length === 0) {
    lines.push('  {}');
  } else {
    for (const network of networks) {
      lines.push(`  ${network.id}:`, `    name: ${yamlScalar(network.dockerName)}`);
      if (network.external) {
        lines.push('    external: true');
        continue;
      }

      lines.push(`    driver: ${yamlScalar(network.driver)}`);
      if (network.internal) lines.push('    internal: true');
      if (network.attachable) lines.push('    attachable: true');
    }
  }

  return `${lines.join('\n')}\n`;
}

function planEnvDefault(plan: SelfHostDeploymentPlan, name: string, fallback = ''): string {
  const env = plan.env.find((item) => item.name === name);
  return env?.default ?? env?.example ?? fallback;
}

function composeEnvReference(name: string, fallback?: string, required = false): string {
  if (required) return `\${${name}:?set ${name}}`;
  if (fallback !== undefined && fallback !== '') return `\${${name}:-${fallback}}`;
  return `\${${name}:-}`;
}

function capabilityUrlEnvName(capabilityRef: string): string {
  return `OKRA_CAPABILITY_${capabilityRef.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_URL`;
}

function pushYamlMap(lines: string[], indent: string, values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${indent}${key}: ${yamlScalar(value)}`);
  }
}

function capabilityServicesForPlan(plan: SelfHostDeploymentPlan): SelfHostPlanService[] {
  return plan.services.filter((service) => service.kind === 'capability_service' && service.capabilityRef);
}

function pushCapabilityService(
  lines: string[],
  plan: SelfHostDeploymentPlan,
  service: SelfHostPlanService,
  okraData: SelfHostPlanVolume | undefined,
  appDockerfile: string,
  includeProfile: boolean,
): void {
  lines.push('', `  ${service.id}:`);
  if (service.runtime === 'dockerfile') {
    lines.push(
      '    build:',
      '      context: ../..',
      `      dockerfile: ${yamlScalar(service.railway?.dockerfilePath ?? appDockerfile)}`,
    );
  } else {
    lines.push(`    image: ${yamlScalar(service.image ?? `ghcr.io/okrapdf/${service.id}:latest`)}`);
  }
  lines.push(
    `    command: ${dockerSafeOkraComposeCommand(
      service.startCommand ?? `okra capability serve ${service.capabilityRef ?? service.id} --host 0.0.0.0 --port 8080`,
    )}`,
  );
  if (includeProfile) {
    lines.push('    profiles: ["capabilities"]');
  }
  lines.push('    environment:');
  const serviceEnv: Record<string, string> = {};
  for (const name of service.env) {
    serviceEnv[name] = composeEnvReference(name, planEnvDefault(plan, name));
  }
  pushYamlMap(lines, '      ', serviceEnv);
  if (okraData && service.volumes.includes(okraData.id)) {
    lines.push('    volumes:', `      - ${okraData.id}:${okraData.mountPath}`);
  }
  lines.push(
    '    expose:',
    '      - "8080"',
    '    networks:',
    ...service.networkRefs.map((networkRef) => `      - ${networkRef}`),
  );
}

function createComposeStack(plan: SelfHostDeploymentPlan): string {
  const services = new Map(plan.services.map((service) => [service.id, service]));
  const app = services.get('okra-app') ?? plan.services.find((service) => service.public);
  const postgres = services.get('okra-postgres') ?? plan.services.find((service) => service.kind === 'postgres');
  const capabilityServices = capabilityServicesForPlan(plan);
  const externalServices = plan.services.filter((service) => service.kind === 'external_service');
  const okraData = plan.volumes.find((volume) => volume.id === 'okra-data');
  const postgresDataVolume = postgres ? `${postgres.id}-data` : 'okra-postgres-data';
  const appDockerfile = app?.railway?.dockerfilePath ?? 'runtime/Dockerfile';

  const lines = [
    'name: okrapdf-self-host',
    '',
    'x-okrapdf-runtime:',
    '  source: runtime.manifest.json',
    '  purpose: local-stack',
    '',
    'x-okrapdf-external-services:',
  ];

  if (externalServices.length === 0) {
    lines.push('  {}');
  } else {
    for (const service of externalServices) {
      lines.push(
        `  ${service.id}:`,
        `    attach_networks: ${yamlInlineArray(service.networkRefs)}`,
        `    env: ${yamlInlineArray(service.env)}`,
        `    capability: ${yamlScalar(service.capabilityRef ?? '')}`,
      );
    }
  }

  if (capabilityServices.length > 0) {
    lines.push(
      '',
      'x-okrapdf-capability-services:',
    );
    for (const service of capabilityServices) {
      lines.push(
        `  ${service.id}:`,
        `    attach_networks: ${yamlInlineArray(service.networkRefs)}`,
        `    capability: ${yamlScalar(service.capabilityRef ?? '')}`,
        '    protocol: okra-capability-http/v1',
        `    app_env: ${yamlScalar(capabilityUrlEnvName(service.capabilityRef ?? service.id))}`,
      );
    }
  }

  lines.push('', 'services:');

  if (app) {
    lines.push(
      `  ${app.id}:`,
      '    build:',
      '      context: ../..',
      `      dockerfile: ${yamlScalar(appDockerfile)}`,
      `    command: ${yamlInlineArray(dockerSafeOkraCommandArgs([
        'serve',
        '/app/runtime',
        '--host',
        '0.0.0.0',
        '--port',
        '8787',
      ]))}`,
      '    ports:',
      '      - "${PORT:-8787}:8787"',
      '    environment:',
    );
    const appEnv: Record<string, string> = {
      OKRA_BASE_URL: composeEnvReference('OKRA_BASE_URL', 'http://localhost:8787'),
      OKRA_RECIPE_CATALOG_DIR: composeEnvReference(
        'OKRA_RECIPE_CATALOG_DIR',
        '/app/runtime/recipes',
      ),
      OKRA_DATA_DIR: composeEnvReference('OKRA_DATA_DIR', planEnvDefault(plan, 'OKRA_DATA_DIR', '/data/okrapdf')),
      OKRA_AUTH_MODE: composeEnvReference('OKRA_AUTH_MODE', planEnvDefault(plan, 'OKRA_AUTH_MODE', 'single_owner')),
      OKRA_REGISTRATION_MODE: composeEnvReference(
        'OKRA_REGISTRATION_MODE',
        planEnvDefault(plan, 'OKRA_REGISTRATION_MODE', 'invite_only'),
      ),
      OKRA_FIRST_OWNER_EMAIL: composeEnvReference(
        'OKRA_FIRST_OWNER_EMAIL',
        planEnvDefault(plan, 'OKRA_FIRST_OWNER_EMAIL', 'owner@example.com'),
      ),
      OKRA_API_KEY: composeEnvReference('OKRA_API_KEY', undefined, true),
      OKRA_CAPABILITY_ENDPOINTS: composeEnvReference('OKRA_CAPABILITY_ENDPOINTS', planEnvDefault(plan, 'OKRA_CAPABILITY_ENDPOINTS', '{}')),
    };
    for (const service of capabilityServices) {
      if (!service.capabilityRef) continue;
      const name = capabilityUrlEnvName(service.capabilityRef);
      appEnv[name] = composeEnvReference(name);
    }
    // DATABASE_URL / OKRA_SECRET_KEY are only relevant when a Postgres-backed
    // state store is declared. The default runtime persists state on the
    // filesystem (OKRA_DATA_DIR), so we do not gate startup on an unused secret.
    if (postgres) {
      appEnv.DATABASE_URL = composeEnvReference('DATABASE_URL', `postgresql://okra:okra@${postgres.id}:5432/okra`);
      appEnv.OKRA_SECRET_KEY = composeEnvReference('OKRA_SECRET_KEY', undefined, true);
    }
    pushYamlMap(lines, '      ', appEnv);
    if (postgres) {
      lines.push(
        '    depends_on:',
        `      ${postgres.id}:`,
        '        condition: service_healthy',
      );
    }
    if (okraData) {
      lines.push('    volumes:', `      - ${okraData.id}:${okraData.mountPath}`);
    }
    lines.push(
      '    networks:',
      ...app.networkRefs.map((networkRef) => `      - ${networkRef}`),
      '    healthcheck:',
      '      test: ["CMD", "node", "-e", "fetch(\'http://127.0.0.1:8787/health\').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]',
      '      interval: 30s',
      '      timeout: 5s',
      '      retries: 5',
    );
  }

  if (postgres) {
    lines.push(
      '',
      `  ${postgres.id}:`,
      '    image: postgres:16-alpine',
      '    environment:',
      '      POSTGRES_DB: okra',
      '      POSTGRES_USER: okra',
      '      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:-okra}"',
      '    volumes:',
      `      - ${postgresDataVolume}:/var/lib/postgresql/data`,
      '    networks:',
      ...postgres.networkRefs.map((networkRef) => `      - ${networkRef}`),
      '    healthcheck:',
      '      test: ["CMD-SHELL", "pg_isready -U okra -d okra"]',
      '      interval: 10s',
      '      timeout: 5s',
      '      retries: 5',
    );
  }

  for (const service of capabilityServices) {
    pushCapabilityService(lines, plan, service, okraData, appDockerfile, true);
  }

  lines.push('', 'networks:');
  for (const network of plan.dockerNetworks) {
    lines.push(`  ${network.id}:`, `    name: ${yamlScalar(network.dockerName)}`);
    // The full stack OWNS/creates every network (including external-bridge ones)
    // so a clean `docker compose up` works without pre-creating networks. Bridge
    // networks are attachable so independently-launched services (e.g. n8n via
    // docker-compose.integrations.yml, which references them as external) can join.
    if (network.external) {
      lines.push(`    driver: ${yamlScalar(network.driver)}`, '    attachable: true');
      continue;
    }
    lines.push(`    driver: ${yamlScalar(network.driver)}`);
    if (network.internal) lines.push('    internal: true');
    if (network.attachable) lines.push('    attachable: true');
  }

  lines.push('', 'volumes:');
  for (const volume of plan.volumes) {
    lines.push(`  ${volume.id}:`);
  }
  if (postgres) {
    lines.push(`  ${postgresDataVolume}:`);
  }

  return `${lines.join('\n')}\n`;
}

function createComposeCapabilityServices(plan: SelfHostDeploymentPlan): string {
  const app = plan.services.find((service) => service.id === 'okra-app') ?? plan.services.find((service) => service.public);
  const capabilityServices = capabilityServicesForPlan(plan);
  const okraData = plan.volumes.find((volume) => volume.id === 'okra-data');
  const appDockerfile = app?.railway?.dockerfilePath ?? 'runtime/Dockerfile';
  const usedNetworks = new Set(capabilityServices.flatMap((service) => service.networkRefs));

  const lines = [
    'name: okrapdf-capabilities',
    '',
    'x-okrapdf-runtime:',
    '  source: runtime.manifest.json',
    '  purpose: capability-services',
    '',
    'x-okrapdf-capability-services:',
  ];

  if (capabilityServices.length === 0) {
    lines.push('  {}');
  } else {
    for (const service of capabilityServices) {
      lines.push(
        `  ${service.id}:`,
        `    attach_networks: ${yamlInlineArray(service.networkRefs)}`,
        `    capability: ${yamlScalar(service.capabilityRef ?? '')}`,
        '    protocol: okra-capability-http/v1',
        `    app_env: ${yamlScalar(capabilityUrlEnvName(service.capabilityRef ?? service.id))}`,
      );
    }
  }

  lines.push('', 'services:');
  if (capabilityServices.length === 0) {
    lines.push('  {}');
  } else {
    for (const service of capabilityServices) {
      pushCapabilityService(lines, plan, service, okraData, appDockerfile, false);
    }
  }

  lines.push('', 'networks:');
  for (const network of plan.dockerNetworks.filter((item) => usedNetworks.has(item.id))) {
    lines.push(
      `  ${network.id}:`,
      `    name: ${yamlScalar(network.dockerName)}`,
      '    external: true',
    );
  }

  if (okraData && capabilityServices.some((service) => service.volumes.includes(okraData.id))) {
    lines.push(
      '',
      'volumes:',
      `  ${okraData.id}:`,
      `    name: okrapdf-self-host_${okraData.id}`,
      '    external: true',
    );
  }

  return `${lines.join('\n')}\n`;
}

function createComposeIntegrations(plan: SelfHostDeploymentPlan): string {
  const externalServices = plan.services.filter((service) => service.kind === 'external_service');
  const usedNetworks = new Set(externalServices.flatMap((service) => service.networkRefs));
  const n8n = externalServices.find((service) => service.id === 'external-n8n');

  const lines = [
    'name: okrapdf-integrations',
    '',
    'x-okrapdf-runtime:',
    '  source: runtime.manifest.json',
    '  purpose: external-integrations',
    '',
    'x-okrapdf-external-services:',
  ];

  if (externalServices.length === 0) {
    lines.push('  {}');
  } else {
    for (const service of externalServices) {
      lines.push(
        `  ${service.id}:`,
        `    attach_networks: ${yamlInlineArray(service.networkRefs)}`,
        `    env: ${yamlInlineArray(service.env)}`,
        `    capability: ${yamlScalar(service.capabilityRef ?? '')}`,
        ...(service.recipeCatalogRef ? [`    recipe_catalog: ${yamlScalar(service.recipeCatalogRef)}`] : []),
      );
    }
  }

  lines.push('', 'services:');
  if (!n8n) {
    lines.push('  {}');
  } else {
    lines.push(
      '  n8n:',
      '    image: n8nio/n8n:latest',
      '    ports:',
      '      - "${N8N_PORT:-5678}:5678"',
      '    environment:',
      '      N8N_ENCRYPTION_KEY: "${N8N_ENCRYPTION_KEY:?set N8N_ENCRYPTION_KEY}"',
      '      WEBHOOK_URL: "${N8N_WEBHOOK_URL:-http://localhost:5678/}"',
      '      OKRA_BASE_URL: "${OKRA_BASE_URL:?set OKRA_BASE_URL}"',
      '      OKRA_API_KEY: "${OKRA_API_KEY:?set OKRA_API_KEY}"',
      '      OKRA_N8N_WEBHOOK_SECRET: "${OKRA_N8N_WEBHOOK_SECRET:?set OKRA_N8N_WEBHOOK_SECRET}"',
      '    volumes:',
      '      - n8n-data:/home/node/.n8n',
      '    networks:',
      ...n8n.networkRefs.map((networkRef) => `      - ${networkRef}`),
    );
  }

  lines.push('', 'networks:');
  for (const network of plan.dockerNetworks.filter((item) => usedNetworks.has(item.id))) {
    lines.push(
      `  ${network.id}:`,
      `    name: ${yamlScalar(network.dockerName)}`,
      '    external: true',
    );
  }

  if (n8n) {
    lines.push('', 'volumes:', '  n8n-data:');
  }

  return `${lines.join('\n')}\n`;
}

function dockerNetworkCreateCommand(network: SelfHostPlanDockerNetwork): string {
  const flags = [
    network.driver && network.driver !== 'bridge' ? `--driver ${network.driver}` : '',
    network.internal ? '--internal' : '',
    network.attachable ? '--attachable' : '',
  ].filter(Boolean);
  const create = ['docker network create', ...flags, network.dockerName].join(' ');
  return `docker network inspect ${network.dockerName} >/dev/null 2>&1 || ${create}`;
}

function dockerVolumeCreateCommand(volumeName: string): string {
  return `docker volume inspect ${volumeName} >/dev/null 2>&1 || docker volume create ${volumeName}`;
}

export function createSelfHostComposeArtifact(
  bundleDir: string,
  modeInput = 'networks',
): SelfHostComposeArtifactResult {
  const root = resolve(bundleDir);
  const validation = validateSelfHostBundle(bundleDir);
  const mode = normalizeComposeMode(modeInput);

  if (!validation.ok) {
    return {
      object: 'self_host_compose_artifact',
      ok: false,
      root,
      mode: mode ?? 'networks',
      validation,
      services: [],
      networks: [],
      volumes: [],
      compose: null,
      commands: [],
    };
  }

  if (!mode) {
    return {
      object: 'self_host_compose_artifact',
      ok: false,
      root,
      mode: 'networks',
      validation: {
        ...validation,
        ok: false,
        errors: [
          ...validation.errors,
          { path: 'mode', message: `unsupported Docker Compose mode "${modeInput}"` },
        ],
      },
      services: [],
      networks: [],
      volumes: [],
      compose: null,
      commands: [],
    };
  }

  const errors: SelfHostValidationIssue[] = [];
  const warnings: SelfHostValidationIssue[] = [];
  const bundle = createLoadedBundle(root, errors, warnings);
  const plan = createRailwayPlan(root, validation);
  const planNetworks = bundle
    ? createDockerNetworkPlan(dockerNetworks(bundle.runtime.docker_networks), runtimeServices(bundle.runtime.services))
    : [];
  const artifactValidation: SelfHostValidationResult = {
    ...validation,
    ok: errors.length === 0,
    errors: [...validation.errors, ...errors],
    warnings: [...validation.warnings, ...warnings],
  };

  if (!bundle || errors.length > 0) {
    return {
      object: 'self_host_compose_artifact',
      ok: false,
      root,
      mode,
      validation: artifactValidation,
      services: plan?.services ?? [],
      networks: planNetworks,
      volumes: plan?.volumes ?? [],
      compose: null,
      commands: [],
    };
  }

  const externalNetworkCommands = planNetworks.filter((network) => network.external).map(dockerNetworkCreateCommand);
  const capabilityNetworkCommands = planNetworks
    .filter((network) => network.kind === 'capability_mesh')
    .map(dockerNetworkCreateCommand);
  const integrationNetworkCommands = planNetworks
    .filter((network) => network.kind === 'external_bridge')
    .map(dockerNetworkCreateCommand);
  const okraData = plan?.volumes.find((volume) => volume.id === 'okra-data');
  const capabilityCommands = [
    ...capabilityNetworkCommands,
    ...(okraData ? [dockerVolumeCreateCommand(`okrapdf-self-host_${okraData.id}`)] : []),
  ];
  const compose = mode === 'stack' && plan
    ? createComposeStack(plan)
    : mode === 'capabilities' && plan
      ? createComposeCapabilityServices(plan)
      : mode === 'integrations' && plan
        ? createComposeIntegrations(plan)
        : createComposeNetworksFragment(planNetworks);
  const commands = mode === 'capabilities'
    ? capabilityCommands
    : mode === 'integrations'
      ? integrationNetworkCommands
      : externalNetworkCommands;

  return {
    object: 'self_host_compose_artifact',
    ok: true,
    root,
    mode,
    validation: artifactValidation,
    services: plan?.services ?? [],
    networks: plan?.dockerNetworks ?? planNetworks,
    volumes: plan?.volumes ?? [],
    compose,
    commands,
  };
}

function createRailwayJson(service: SelfHostPlanService): Record<string, unknown> {
  const railway = service.railway;
  return {
    $schema: 'https://railway.com/railway.schema.json',
    build: {
      builder: railway?.builder ?? 'DOCKERFILE',
      dockerfilePath: railway?.dockerfilePath ?? 'Dockerfile',
    },
    deploy: {
      ...(service.startCommand ? { startCommand: dockerSafeOkraShellCommand(service.startCommand) } : {}),
      healthcheckPath: railway?.healthcheckPath ?? '/health',
      healthcheckTimeout: railway?.healthcheckTimeoutSeconds ?? 300,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 3,
      sleepApplication: false,
    },
  };
}

function railwayConfigPath(service: SelfHostPlanService): string {
  return service.id === 'okra-app' || service.public ? 'railway.json' : `railway.${service.id}.json`;
}

function createRailwayTemplateChecklist(plan: SelfHostDeploymentPlan): string[] {
  const publicServices = plan.services.filter((service) => service.public).map((service) => service.id);
  const requiredSecrets = plan.env
    .filter((env) => env.required && env.secret)
    .map((env) => env.name);
  const requiredPlainEnv = plan.env
    .filter((env) => env.required && !env.secret)
    .map((env) => env.name);
  const volumes = plan.volumes.map((volume) => `${volume.id}:${volume.mountPath}`);
  const optionalServices = plan.services
    .filter((service) => !service.required)
    .map((service) => service.id);

  return [
    'Create a Railway template from a public repository or an existing Railway project.',
    'Add okra-app from the repository and set its config-as-code path to railway.json if it is not at the repo root.',
    'For optional capability services, set each Railway config-as-code path to its generated railway.<service>.json file.',
    'Optional: provision managed Postgres and expose DATABASE_URL to okra-app only if you add a Postgres-backed store (the default runtime uses filesystem state).',
    `Attach volumes: ${volumes.join(', ') || 'none'}.`,
    `Expose public services: ${publicServices.join(', ') || 'none'}.`,
    `Mark required secrets: ${requiredSecrets.join(', ') || 'none'}.`,
    `Mark required plain env vars: ${requiredPlainEnv.join(', ') || 'none'}.`,
    `Keep optional services opt-in: ${optionalServices.join(', ') || 'none'}.`,
    'Document n8n as an external recipe/bridge integration rather than an embedded runtime service.',
    'After deploy, run the manifest validation smoke test and the HTTP healthcheck.',
  ];
}

const RAILWAY_TEMPLATE_PUBLICATION_REQUIRED_CHECKS = [
  'template_url_published',
  'deploy_button_ready',
  'service_config_paths_attached',
  'required_env_documented',
  'public_app_networking_configured',
];

function envForService(
  service: SelfHostPlanService,
  envPlan: SelfHostPlanEnvVar[],
): SelfHostRailwayTemplateService['env'] {
  const envByName = new Map(envPlan.map((env) => [env.name, env]));
  return service.env.flatMap((name) => {
    const env = envByName.get(name);
    if (!env) return [];
    return [{
      name: env.name,
      required: env.required,
      secret: env.secret,
      ...(env.default ? { default: env.default } : {}),
      ...(env.example ? { example: env.example } : {}),
    }];
  });
}

function volumesForService(
  service: SelfHostPlanService,
  volumesPlan: SelfHostPlanVolume[],
): Array<{ id: string; mountPath: string }> {
  const volumesById = new Map(volumesPlan.map((volume) => [volume.id, volume]));
  return service.volumes.flatMap((id) => {
    const volume = volumesById.get(id);
    return volume ? [{ id: volume.id, mountPath: volume.mountPath }] : [];
  });
}

function createRailwayTemplateHandoff(plan: SelfHostDeploymentPlan): SelfHostRailwayTemplateHandoff {
  const docs = [
    'https://docs.railway.com/templates/create',
    'https://docs.railway.com/templates/publish-and-share',
    'https://docs.railway.com/config-as-code',
    'https://docs.railway.com/config-as-code/reference',
  ];
  const appServices = plan.services.filter((service) =>
    !['postgres', 'redis', 'valkey', 'object_store', 'external_service'].includes(service.kind),
  );
  const managedServices = plan.services
    .filter((service) => ['postgres', 'redis', 'valkey', 'object_store'].includes(service.kind))
    .map((service) => ({ id: service.id, kind: service.kind, required: service.required }));
  const externalServices = plan.services
    .filter((service) => service.kind === 'external_service')
    .map((service) => ({
      id: service.id,
      ...(service.capabilityRef ? { capabilityRef: service.capabilityRef } : {}),
      ...(service.recipeCatalogRef ? { recipeCatalogRef: service.recipeCatalogRef } : {}),
      notes: 'Keep this service outside the core Okra template; connect through declared bridge env and external integration network.',
    }));

  return {
    object: 'railway_template_handoff',
    schema_version: 'okra-railway-template-handoff/v1',
    name: 'okraPDF Self-Host Runtime',
    source_manifest: 'runtime.manifest.json',
    status: 'handoff_ready',
    publication: {
      state: 'not_published',
      reason: 'Railway templates are created and published from a Railway workspace or an existing Railway project; this artifact is the machine-readable composer handoff.',
      required_external_actions: [
        'Create a Railway project from the public okraPDF self-host repository.',
        'Add services from this handoff in the Railway template composer or convert the prepared project into a template.',
        'Publish the template from the Railway workspace and copy the resulting template URL.',
        'Replace deployButton.markdown after Railway issues a template URL.',
      ],
    },
    services: appServices.map((service) => ({
      id: service.id,
      name: service.name,
      kind: service.kind,
      required: service.required,
      public: service.public,
      ...(service.startCommand ? { startCommand: dockerSafeOkraShellCommand(service.startCommand) } : {}),
      configPath: railwayConfigPath(service),
      ...(service.railway?.dockerfilePath ? { dockerfilePath: service.railway.dockerfilePath } : {}),
      ...(service.railway?.healthcheckPath ? { healthcheckPath: service.railway.healthcheckPath } : {}),
      ...(service.railway?.healthcheckTimeoutSeconds
        ? { healthcheckTimeoutSeconds: service.railway.healthcheckTimeoutSeconds }
        : {}),
      env: envForService(service, plan.env),
      volumes: volumesForService(service, plan.volumes),
      privateNetworks: service.networkRefs.filter((networkRef) =>
        plan.dockerNetworks.some((network) => network.id === networkRef && network.internal),
      ),
      publicNetworking: service.public,
      ...(service.capabilityRef ? { capabilityRef: service.capabilityRef } : {}),
      ...(service.recipeCatalogRef ? { recipeCatalogRef: service.recipeCatalogRef } : {}),
    })),
    managedServices,
    externalServices,
    volumes: plan.volumes,
    dockerNetworks: plan.dockerNetworks,
    smokeTests: plan.smokeTests,
    templateChecklist: createRailwayTemplateChecklist(plan),
    deployButton: {
      state: 'pending_template_url',
      markdown: null,
      docs: 'https://docs.railway.com/templates/publish-and-share#deploy-on-railway-button',
    },
    docs,
  };
}

const RAILWAY_TEMPLATE_REFERENCE_TEMPLATES: SelfHostRailwayTemplateListingReference[] = [
  {
    name: 'Postiz',
    url: 'https://railway.com/deploy/deploy-postiz',
    pattern: 'Polished multi-service app template with clear operator expectations.',
    appliedAs: 'Use the same one-click SaaS template posture for a document tool suite.',
  },
  {
    name: 'Stirling PDF',
    url: 'https://railway.com/deploy/Rn4VSj',
    pattern: 'Self-hosted PDF utility surface packaged as a practical document toolbox.',
    appliedAs: 'Frame okraPDF as a PDF toolset, not a narrow parser demo.',
  },
  {
    name: 'MinerU',
    url: 'https://railway.com/deploy/mineru',
    pattern: 'Model-backed document parsing service template.',
    appliedAs: 'Keep MinerU-style parsing as an optional private capability service.',
  },
  {
    name: 'n8n',
    url: 'https://railway.com/deploy/n8n',
    pattern: 'External workflow automation template with explicit secrets and webhook URLs.',
    appliedAs: 'Keep n8n outside the core runtime and connect through recipes/webhooks.',
  },
  {
    name: 'n8n workers',
    url: 'https://railway.com/deploy/n8n-with-workers',
    pattern: 'Separated worker topology for scaling orchestration independently.',
    appliedAs: 'Mirror the split with isolated capability services and external integrations.',
  },
  {
    name: 'PostHog',
    url: 'https://railway.com/deploy/posthog-1',
    pattern: 'Large self-hosted product template with managed services and explicit deploy checks.',
    appliedAs: 'Use a full publication pack with env, volumes, services, checks, and evidence.',
  },
];

function createRailwayTemplateListing(plan: SelfHostDeploymentPlan): SelfHostRailwayTemplateListing {
  const handoff = createRailwayTemplateHandoff(plan);
  const requiredSecrets = plan.env
    .filter((env) => env.required && env.secret)
    .map((env) => env.name);
  const requiredPlain = plan.env
    .filter((env) => env.required && !env.secret)
    .map((env) => env.name);
  const optional = plan.env
    .filter((env) => !env.required)
    .map((env) => env.name);

  return {
    object: 'railway_template_listing',
    schema_version: 'okra-railway-template-listing/v1',
    name: 'okraPDF Railway Template Listing',
    source_manifest: 'runtime.manifest.json',
    status: 'listing_ready',
    template: {
      name: 'okraPDF Self-Host Runtime',
      slug: 'okrapdf-self-host-runtime',
      category: 'Document AI / PDF Tools',
      tagline: 'Postiz for PDFs: a self-hostable agent PDF toolset on Railway.',
      description:
        'Deploy okraPDF as a self-hostable document tool suite with upload, parse, audit, redact, graph review, optional private parser/audit/redaction capability services, external workflow recipes, and a live smoke evidence path.',
      tags: ['pdf', 'document-ai', 'ocr', 'self-hosted', 'agents', 'railway', 'n8n'],
      repository: 'https://github.com/okrapdf/server',
      rootDirectory: '.',
      deployButton: {
        state: 'pending_template_url',
        markdown: null,
        evidencePath: 'railway-template.evidence.json',
      },
    },
    positioning: [
      'A Railway template for teams that want a Postiz-like self-host product surface for PDFs.',
      'The browser runtime is static-first: Vite/static assets, Cloudflare-compatible hosting, or Railway without a Next.js server target.',
      'The public app service stays small while OCR/parser, audit, and redaction capabilities can run as isolated private services.',
      'Recipes/workflows stay external and swappable so OCR + hybrid + agent techniques do not become a monolith.',
      'n8n is an integration and recipe source, not embedded orchestration in the core Okra runtime.',
      'Docker lanes separate public ingress, core app state, private capability services, and external workflow bridges.',
    ],
    referenceTemplates: RAILWAY_TEMPLATE_REFERENCE_TEMPLATES,
    services: handoff.services,
    managedServices: handoff.managedServices,
    externalServices: handoff.externalServices,
    environmentPrompts: {
      requiredSecrets,
      requiredPlain,
      optional,
    },
    volumes: handoff.volumes,
    postDeployChecks: [
      'GET /health',
      'GET /v1/self-host/status',
      'GET /v1/workflows/catalog',
      'okra self-host smoke $OKRA_BASE_URL --workflow both --evidence-out railway-smoke.evidence.json',
      'Regenerate railway-publish.evidence.json and railway-publish.readiness.json after smoke passes.',
    ],
    publicationEvidencePath: 'railway-template.evidence.json',
    docs: [
      'runtime/README.md',
      'runtime/RAILWAY.md',
      'runtime/railway-template.handoff.json',
      'runtime/railway-publish.pack.json',
      'https://docs.railway.com/templates/create',
      'https://docs.railway.com/templates/publish-and-share',
    ],
  };
}

function createRailwayTemplatePublicationEvidence(
  plan: SelfHostDeploymentPlan,
  generatedAt = 'pending',
): SelfHostRailwayTemplatePublicationEvidence {
  const handoff = createRailwayTemplateHandoff(plan);
  return {
    object: 'railway_template_publication_evidence',
    schema_version: 'okra-railway-template-publication-evidence/v1',
    name: 'okraPDF Self-Host Railway Template Publication Evidence',
    source_manifest: 'runtime.manifest.json',
    status: 'pending',
    generated_at: generatedAt,
    templateUrl: null,
    deployButtonMarkdown: null,
    railwayProjectId: null,
    railwayTemplateId: null,
    serviceConfigFiles: handoff.services.flatMap((service) => service.configPath ? [service.configPath] : []),
    requiredChecks: RAILWAY_TEMPLATE_PUBLICATION_REQUIRED_CHECKS,
    passedChecks: [],
    missingChecks: RAILWAY_TEMPLATE_PUBLICATION_REQUIRED_CHECKS,
    readiness: {
      eligible: false,
      reason: 'Fill this artifact after the Railway template is published and the deploy button/config paths are verified.',
    },
    requiredExternalActions: handoff.publication.required_external_actions,
    docs: [
      'runtime/README.md',
      'runtime/RAILWAY.md',
      'runtime/railway-template.handoff.json',
      'https://docs.railway.com/templates/create',
      'https://docs.railway.com/templates/publish-and-share',
    ],
  };
}

function isProductionBackedCapabilityStatus(status: string): boolean {
  return ['model_backed', 'policy_backed', 'agent_backed', 'external_bridge'].includes(status);
}

const CAPABILITY_PROMOTION_REQUIRED_CHECKS = [
  'image_published',
  'capability_health',
  'capability_run_smoke',
  'graph_contract_output',
  'private_network_route',
];

function createCapabilityImplementationsHandoff(
  root: string,
  plan: SelfHostDeploymentPlan,
): SelfHostCapabilityImplementationsHandoff {
  const runtimeManifest = readJson(join(root, 'runtime.manifest.json'));
  const runtimeServicesFromManifest = isRecord(runtimeManifest)
    ? runtimeServices(runtimeManifest.services)
    : [];
  const implementations = isRecord(runtimeManifest)
    ? capabilityImplementations(runtimeManifest.capability_implementations, runtimeServicesFromManifest)
    : [];
  const implementationServiceIds = new Set(implementations.map((implementation) => implementation.serviceId));
  const implementationNetworkIds = new Set(implementations.flatMap((implementation) => implementation.networkRefs));
  const implementationNetworks = plan.dockerNetworks.filter((network) =>
    implementationNetworkIds.has(network.id),
  );

  return {
    object: 'capability_implementations_handoff',
    schema_version: 'okra-capability-implementations-handoff/v1',
    name: 'okraPDF Self-Host Capability Implementations',
    source_manifest: 'runtime.manifest.json',
    status: 'handoff_ready',
    summary: {
      implementations: implementations.length,
      starterAdapters: implementations.filter((implementation) => implementation.status === 'starter_adapter').length,
      productionBacked: implementations.filter((implementation) =>
        isProductionBackedCapabilityStatus(implementation.status),
      ).length,
      services: implementationServiceIds.size,
      privateNetworks: implementationNetworks.filter((network) => network.internal).length,
    },
    implementations,
    dockerNetworks: implementationNetworks,
    docs: [
      'runtime/README.md',
      'runtime/RAILWAY.md',
      'https://docs.railway.com/templates/create',
    ],
  };
}

function createCapabilityPromotionEvidence(
  root: string,
  plan: SelfHostDeploymentPlan,
  generatedAt = 'pending',
): SelfHostCapabilityPromotionEvidence {
  const handoff = createCapabilityImplementationsHandoff(root, plan);
  const capabilities = handoff.implementations.map((implementation) => ({
    capabilityRef: implementation.capabilityRef,
    serviceId: implementation.serviceId,
    targetStatus: implementation.targetStatus,
    status: 'pending' as const,
    protocol: implementation.protocol,
    endpointPath: implementation.endpointPath,
    imageRef: implementation.image ?? null,
    imageDigest: null,
    sourceRevision: null,
    networkRefs: implementation.networkRefs,
    requiredChecks: CAPABILITY_PROMOTION_REQUIRED_CHECKS,
    passedChecks: [],
    missingChecks: CAPABILITY_PROMOTION_REQUIRED_CHECKS,
    promotionActions: implementation.promotionActions,
  }));

  return {
    object: 'capability_promotion_evidence',
    schema_version: 'okra-capability-promotion-evidence/v1',
    name: 'okraPDF Self-Host Capability Promotion Evidence',
    source_manifest: 'runtime.manifest.json',
    status: 'pending',
    generated_at: generatedAt,
    summary: {
      capabilities: capabilities.length,
      passed: 0,
      pending: capabilities.length,
      failed: 0,
      productionBacked: 0,
    },
    required: {
      parser: true,
      auditOrRedact: true,
    },
    readiness: {
      eligible: false,
      reason: 'Fill this artifact after model-backed parser and audit/redact service images are published and HTTP capability smoke passes.',
      productionBackedCapabilities: [],
    },
    capabilities,
    docs: [
      'runtime/README.md',
      'runtime/RAILWAY.md',
      'runtime/capability-implementations.handoff.json',
    ],
  };
}

function readinessGate(
  id: string,
  label: string,
  status: SelfHostRailwayPublishReadinessGateStatus,
  evidence: string[],
  actions: string[] = [],
): SelfHostRailwayPublishReadinessGate {
  return { id, label, status, evidence, actions };
}

function isHttpUrl(value: string | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\//.test(value);
}

interface SelfHostLoadedSmokeEvidence {
  path: string;
  passed: boolean;
  baseUrl: string | null;
  workflow: string | null;
  status: string;
  checks: string[];
  reason: string;
}

interface SelfHostLoadedCapabilityPromotionEvidence {
  path: string;
  passed: boolean;
  status: string;
  capabilities: string[];
  productionBackedCapabilities: string[];
  reason: string;
}

interface SelfHostLoadedTemplatePublicationEvidence {
  path: string;
  published: boolean;
  status: string;
  templateUrl: string | null;
  checks: string[];
  reason: string;
}

interface SelfHostLoadedRailwayPublishEvidenceBundle {
  path: string;
  status: string;
  templateEvidencePath?: string;
  capabilityEvidencePath?: string;
  smokeEvidencePath?: string;
  reason: string;
}

function isRailwayTemplateUrl(value: string | null): value is string {
  if (!value || !isHttpUrl(value)) return false;
  try {
    const url = new URL(value);
    return url.hostname === 'railway.com' && url.pathname.startsWith('/deploy/');
  } catch {
    return false;
  }
}

function loadTemplatePublicationEvidence(
  templateEvidencePath: string | undefined,
): SelfHostLoadedTemplatePublicationEvidence | null {
  if (!templateEvidencePath) return null;

  const evidencePath = resolve(templateEvidencePath);
  try {
    const raw = readJson(evidencePath);
    if (!isRecord(raw) || raw.object !== 'railway_template_publication_evidence') {
      return {
        path: evidencePath,
        published: false,
        status: 'invalid',
        templateUrl: null,
        checks: [],
        reason: 'Template evidence must be a railway_template_publication_evidence JSON object.',
      };
    }

    const status = typeof raw.status === 'string' ? raw.status : 'invalid';
    const templateUrl = fieldString(raw, 'templateUrl', 'template_url');
    const passedChecks = fieldStringArray(raw, 'passedChecks', 'passed_checks', 'checks');
    const missingChecks = RAILWAY_TEMPLATE_PUBLICATION_REQUIRED_CHECKS.filter((check) =>
      !passedChecks.includes(check),
    );
    const hasValidTemplateUrl = isRailwayTemplateUrl(templateUrl);
    const published = status === 'published' && hasValidTemplateUrl && missingChecks.length === 0;
    const reason = published
      ? 'Template evidence proves a published Railway template URL and deploy button/config checks.'
      : status !== 'published'
        ? `Template evidence status is ${status}.`
        : !hasValidTemplateUrl
          ? 'Template evidence is missing a valid https://railway.com/deploy/... URL.'
          : missingChecks.length > 0
            ? `Template evidence is missing checks: ${missingChecks.join(', ')}.`
            : 'Template evidence is incomplete.';

    return {
      path: evidencePath,
      published,
      status,
      templateUrl: hasValidTemplateUrl ? templateUrl : null,
      checks: passedChecks,
      reason,
    };
  } catch (error) {
    return {
      path: evidencePath,
      published: false,
      status: 'unreadable',
      templateUrl: null,
      checks: [],
      reason: formatUnknownError(error),
    };
  }
}

function smokeRecordFromEvidence(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  if (raw.object === 'self_host_smoke') return raw;
  if (raw.object === 'self_host_smoke_evidence' && isRecord(raw.smoke)) return raw.smoke;
  return null;
}

function fieldString(record: Record<string, unknown>, ...names: string[]): string | null {
  for (const name of names) {
    const value = record[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function fieldStringArray(record: Record<string, unknown>, ...names: string[]): string[] {
  for (const name of names) {
    const value = record[name];
    const values = stringArray(value);
    if (values.length > 0) return values;
  }
  return [];
}

function resolveEvidencePath(baseDir: string, path: string | undefined): string | undefined {
  if (!path || !path.trim()) return undefined;
  return resolve(baseDir, path);
}

function resolvePublishReadinessOptions(
  root: string,
  options: SelfHostRailwayPublishReadinessOptions = {},
): SelfHostRailwayPublishReadinessOptions {
  return {
    ...options,
    evidenceBundlePath: resolveEvidencePath(root, options.evidenceBundlePath),
    templateEvidencePath: resolveEvidencePath(root, options.templateEvidencePath),
    capabilityEvidencePath: resolveEvidencePath(root, options.capabilityEvidencePath),
    smokeEvidencePath: resolveEvidencePath(root, options.smokeEvidencePath),
  };
}

function evidenceBundlePathValue(
  raw: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const evidencePaths = isRecord(raw.evidencePaths) ? raw.evidencePaths : {};
  const value = evidencePaths[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function loadRailwayPublishEvidenceBundle(
  evidenceBundlePath: string | undefined,
): SelfHostLoadedRailwayPublishEvidenceBundle | null {
  if (!evidenceBundlePath) return null;

  const bundlePath = resolve(evidenceBundlePath);
  const baseDir = dirname(bundlePath);
  try {
    const raw = readJson(bundlePath);
    if (!isRecord(raw) || raw.object !== 'railway_publish_evidence_bundle') {
      return {
        path: bundlePath,
        status: 'invalid',
        reason: 'Evidence bundle must be a railway_publish_evidence_bundle JSON object.',
      };
    }

    const status = typeof raw.status === 'string' ? raw.status : 'invalid';
    const templateEvidencePath = resolveEvidencePath(
      baseDir,
      evidenceBundlePathValue(raw, 'templatePublication', 'railway-template.evidence.json'),
    );
    const capabilityEvidencePath = resolveEvidencePath(
      baseDir,
      evidenceBundlePathValue(raw, 'capabilityPromotion', 'capability-promotion.evidence.json'),
    );
    const smokeEvidencePath = resolveEvidencePath(
      baseDir,
      evidenceBundlePathValue(raw, 'liveDeploySmoke', 'railway-smoke.evidence.json'),
    );

    return {
      path: bundlePath,
      status,
      ...(templateEvidencePath ? { templateEvidencePath } : {}),
      ...(capabilityEvidencePath ? { capabilityEvidencePath } : {}),
      ...(smokeEvidencePath ? { smokeEvidencePath } : {}),
      reason: status === 'ready'
        ? 'Evidence bundle points at ready template, capability, and smoke evidence.'
        : 'Evidence bundle is a path bundle; individual evidence files still decide readiness.',
    };
  } catch (error) {
    return {
      path: bundlePath,
      status: 'unreadable',
      reason: formatUnknownError(error),
    };
  }
}

function loadCapabilityPromotionEvidence(
  capabilityEvidencePath: string | undefined,
): SelfHostLoadedCapabilityPromotionEvidence | null {
  if (!capabilityEvidencePath) return null;

  const evidencePath = resolve(capabilityEvidencePath);
  try {
    const raw = readJson(evidencePath);
    if (!isRecord(raw) || raw.object !== 'capability_promotion_evidence') {
      return {
        path: evidencePath,
        passed: false,
        status: 'invalid',
        capabilities: [],
        productionBackedCapabilities: [],
        reason: 'Capability evidence must be a capability_promotion_evidence JSON object.',
      };
    }

    const status = typeof raw.status === 'string' ? raw.status : 'invalid';
    const entries = Array.isArray(raw.capabilities) ? raw.capabilities.filter(isRecord) : [];
    const capabilityRefs: string[] = [];
    const passedRefs: string[] = [];
    const entryFailures: string[] = [];

    for (const entry of entries) {
      const capabilityRef = fieldString(entry, 'capabilityRef', 'capability_ref');
      if (!capabilityRef) continue;
      capabilityRefs.push(capabilityRef);

      const entryStatus = fieldString(entry, 'status') ?? 'missing';
      const targetStatus = fieldString(entry, 'targetStatus', 'target_status') ?? '';
      const protocol = fieldString(entry, 'protocol') ?? '';
      const imageRef = fieldString(entry, 'imageRef', 'image_ref', 'image');
      const imageDigest = fieldString(entry, 'imageDigest', 'image_digest');
      const sourceRevision = fieldString(entry, 'sourceRevision', 'source_revision');
      const passedChecks = fieldStringArray(entry, 'passedChecks', 'passed_checks', 'checks');
      const missingChecks = CAPABILITY_PROMOTION_REQUIRED_CHECKS.filter((check) => !passedChecks.includes(check));
      const hasImageProvenance = imageRef !== null && (imageDigest !== null || sourceRevision !== null);
      const entryPassed = entryStatus === 'passed'
        && isProductionBackedCapabilityStatus(targetStatus)
        && protocol === 'okra-capability-http/v1'
        && hasImageProvenance
        && missingChecks.length === 0;

      if (entryPassed) {
        passedRefs.push(capabilityRef);
      } else {
        entryFailures.push(
          `${capabilityRef}: status=${entryStatus}, target=${targetStatus || 'missing'}, protocol=${protocol || 'missing'}, image=${imageRef ? 'present' : 'missing'}, provenance=${imageDigest ?? sourceRevision ?? 'missing'}, missingChecks=${missingChecks.join(',') || 'none'}`,
        );
      }
    }

    const hasParser = passedRefs.some((capability) => capability.startsWith('parser.'));
    const hasAuditOrRedact = passedRefs.some((capability) =>
      capability.startsWith('auditor.') || capability.startsWith('redactor.'),
    );
    const passed = status === 'passed' && hasParser && hasAuditOrRedact;
    const reason = passed
      ? 'Capability evidence proves production-backed parser and audit/redact services.'
      : status !== 'passed'
        ? `Capability evidence status is ${status}.`
        : !hasParser
          ? 'Capability evidence does not include a passed parser capability.'
          : !hasAuditOrRedact
            ? 'Capability evidence does not include a passed audit or redaction capability.'
            : entryFailures.join('; ') || 'Capability evidence is incomplete.';

    return {
      path: evidencePath,
      passed,
      status,
      capabilities: capabilityRefs,
      productionBackedCapabilities: passed ? passedRefs : [],
      reason,
    };
  } catch (error) {
    return {
      path: evidencePath,
      passed: false,
      status: 'unreadable',
      capabilities: [],
      productionBackedCapabilities: [],
      reason: formatUnknownError(error),
    };
  }
}

function loadSmokeEvidence(smokeEvidencePath: string | undefined): SelfHostLoadedSmokeEvidence | null {
  if (!smokeEvidencePath) return null;

  const evidencePath = resolve(smokeEvidencePath);
  try {
    const raw = readJson(evidencePath);
    const smoke = smokeRecordFromEvidence(raw);
    if (!smoke) {
      return {
        path: evidencePath,
        passed: false,
        baseUrl: null,
        workflow: null,
        status: 'invalid',
        checks: [],
        reason: 'Smoke evidence must be a self_host_smoke or self_host_smoke_evidence JSON object.',
      };
    }

    const checks = Array.isArray(smoke.checks)
      ? smoke.checks.flatMap((item) =>
          isRecord(item) && typeof item.name === 'string' && item.status === 'passed' ? [item.name] : [],
        )
      : [];
    const workflow = typeof smoke.workflow === 'string' ? smoke.workflow : null;
    const baseUrl = typeof smoke.base_url === 'string' && isHttpUrl(smoke.base_url) ? smoke.base_url : null;
    const requiredChecks = ['health', 'status', 'upload', 'parse', 'audit', 'redact', 'graph', 'open'];
    const missingChecks = requiredChecks.filter((check) => !checks.includes(check));
    const passed = smoke.ok === true && workflow === 'both' && baseUrl !== null && missingChecks.length === 0;
    const reason = passed
      ? 'Smoke evidence proves live upload, parse, audit, redact, graph, and review URL checks.'
      : workflow !== 'both'
        ? 'Smoke evidence must be generated with --workflow both.'
        : baseUrl === null
          ? 'Smoke evidence is missing a valid HTTP base_url.'
          : missingChecks.length > 0
            ? `Smoke evidence is missing checks: ${missingChecks.join(', ')}.`
            : 'Smoke evidence did not pass.';

    return {
      path: evidencePath,
      passed,
      baseUrl,
      workflow,
      status: smoke.ok === true ? 'passed' : 'failed',
      checks,
      reason,
    };
  } catch (error) {
    return {
      path: evidencePath,
      passed: false,
      baseUrl: null,
      workflow: null,
      status: 'unreadable',
      checks: [],
      reason: formatUnknownError(error),
    };
  }
}

const RAILWAY_PUBLISH_EVIDENCE_BUNDLE_DEFAULT_PATH = 'railway-publish.evidence.json';

function createRailwayPublishEvidenceBundleEntry(
  id: SelfHostRailwayPublishEvidenceBundleEntry['id'],
  path: string,
  loaded:
    | SelfHostLoadedTemplatePublicationEvidence
    | SelfHostLoadedCapabilityPromotionEvidence
    | SelfHostLoadedSmokeEvidence
    | null,
): SelfHostRailwayPublishEvidenceBundleEntry {
  if (!loaded) {
    return {
      id,
      path,
      status: 'missing',
      passed: false,
      reason: 'Evidence path is not configured.',
      checks: [],
    };
  }

  return {
    id,
    path,
    status: loaded.status,
    passed: 'published' in loaded ? loaded.published : loaded.passed,
    reason: loaded.status === 'unreadable'
      ? `Evidence file is not readable yet: ${path}.`
      : loaded.reason,
    checks: 'checks' in loaded ? loaded.checks : [],
  };
}

function createRailwayPublishEvidenceBundle(
  root: string,
  options: SelfHostRailwayPublishEvidenceBundleOptions = {},
  generatedAt = 'pending',
): SelfHostRailwayPublishEvidenceBundle {
  const evidencePaths = {
    templatePublication: options.templateEvidencePath ?? 'railway-template.evidence.json',
    capabilityPromotion: options.capabilityEvidencePath ?? 'capability-promotion.evidence.json',
    liveDeploySmoke: options.smokeEvidencePath ?? 'railway-smoke.evidence.json',
    readiness: options.readinessPath ?? 'railway-publish.readiness.json',
    publishPack: options.publishPackPath ?? 'railway-publish.pack.json',
  };
  const templatePublication = loadTemplatePublicationEvidence(
    resolveEvidencePath(root, evidencePaths.templatePublication),
  );
  const capabilityPromotion = loadCapabilityPromotionEvidence(
    resolveEvidencePath(root, evidencePaths.capabilityPromotion),
  );
  const liveDeploySmoke = loadSmokeEvidence(resolveEvidencePath(root, evidencePaths.liveDeploySmoke));
  const entries = [
    createRailwayPublishEvidenceBundleEntry(
      'template_publication',
      evidencePaths.templatePublication,
      templatePublication,
    ),
    createRailwayPublishEvidenceBundleEntry(
      'capability_promotion',
      evidencePaths.capabilityPromotion,
      capabilityPromotion,
    ),
    createRailwayPublishEvidenceBundleEntry(
      'live_deploy_smoke',
      evidencePaths.liveDeploySmoke,
      liveDeploySmoke,
    ),
  ];
  const ready = entries.every((entry) => entry.passed);
  const failed = entries.some((entry) => entry.status === 'failed' || entry.status === 'invalid');
  const status: SelfHostRailwayPublishEvidenceBundleStatus = ready ? 'ready' : failed ? 'failed' : 'pending';
  const nextActions = [
    ...(!entries[0].passed
      ? ['Publish the Railway template and fill railway-template.evidence.json with the template URL and required checks.']
      : []),
    ...(!entries[1].passed
      ? ['Promote parser plus audit/redact capability images and fill capability-promotion.evidence.json.']
      : []),
    ...(!entries[2].passed
      ? ['Deploy the template and run okra self-host smoke $OKRA_BASE_URL --workflow both --evidence-out railway-smoke.evidence.json.']
      : []),
  ];

  return {
    object: 'railway_publish_evidence_bundle',
    schema_version: 'okra-railway-publish-evidence-bundle/v1',
    name: 'okraPDF Self-Host Railway Publish Evidence Bundle',
    source_manifest: 'runtime.manifest.json',
    status,
    generated_at: generatedAt,
    evidencePaths,
    evidence: {
      templatePublication: entries[0],
      capabilityPromotion: entries[1],
      liveDeploySmoke: entries[2],
    },
    readiness: {
      eligible: ready,
      reason: ready
        ? 'Template publication, production capability, and live deploy smoke evidence are all ready.'
        : 'Fill the pending external evidence files, then rerun readiness with this evidence bundle.',
      command: `okra self-host readiness ./runtime --evidence-bundle ${RAILWAY_PUBLISH_EVIDENCE_BUNDLE_DEFAULT_PATH}`,
    },
    nextActions,
    docs: [
      'runtime/README.md',
      'runtime/RAILWAY.md',
      'runtime/railway-template.evidence.json',
      'runtime/capability-promotion.evidence.json',
    ],
  };
}

function createRailwayPublishReadiness(
  root: string,
  plan: SelfHostDeploymentPlan,
  options: SelfHostRailwayPublishReadinessOptions = {},
): SelfHostRailwayPublishReadiness {
  const app = plan.services.find((service) => service.id === 'okra-app')
    ?? plan.services.find((service) => service.public);
  const publicServices = plan.services.filter((service) => service.public);
  const postgres = plan.services.find((service) => service.kind === 'postgres');
  const okraData = plan.volumes.find((volume) => volume.id === 'okra-data');
  const capabilityServices = capabilityServicesForPlan(plan);
  const capabilityNetwork = plan.dockerNetworks.find((network) => network.kind === 'capability_mesh');
  const integrationNetwork = plan.dockerNetworks.find((network) => network.kind === 'external_bridge');
  const externalServices = plan.services.filter((service) => service.kind === 'external_service');
  const runtimeManifest = readJson(join(root, 'runtime.manifest.json'));
  const runtimeServicesFromManifest = isRecord(runtimeManifest)
    ? runtimeServices(runtimeManifest.services)
    : [];
  const implementations = isRecord(runtimeManifest)
    ? capabilityImplementations(runtimeManifest.capability_implementations, runtimeServicesFromManifest)
    : [];
  const parserImplementations = implementations.filter((implementation) =>
    implementation.capabilityRef.startsWith('parser.'),
  );
  const auditRedactImplementations = implementations.filter((implementation) =>
    implementation.capabilityRef.startsWith('auditor.') || implementation.capabilityRef.startsWith('redactor.'),
  );
  const implementationHandoffPass = parserImplementations.length > 0
    && auditRedactImplementations.length > 0
    && implementations.every((implementation) =>
      implementation.protocol === 'okra-capability-http/v1'
      && implementation.networkRefs.every((networkRef) => networkRef === 'okra-capabilities'),
    );
  const staticRequiredFiles = [
    'Dockerfile',
    'railway.json',
    'railway-template.handoff.json',
    'railway-template.listing.json',
    'railway-template.evidence.json',
    RAILWAY_PUBLISH_EVIDENCE_BUNDLE_DEFAULT_PATH,
    'docker-network.handoff.json',
    'capability-implementations.handoff.json',
    'capability-promotion.evidence.json',
    'docker-compose.yml',
    'docker-compose.capabilities.yml',
    'docker-compose.integrations.yml',
    'docker-compose.networks.yml',
    'public/index.html',
  ];
  const implementationDockerfiles = implementations.flatMap((implementation) =>
    implementation.dockerfilePath ? [implementation.dockerfilePath] : [],
  );
  const railwayConfigFiles = plan.services.flatMap((service) =>
    service.railway ? [railwayConfigPath(service)] : [],
  );
  const requiredFiles = [...new Set([
    ...staticRequiredFiles,
    ...railwayConfigFiles,
    ...implementationDockerfiles,
  ])];
  const missingFiles = requiredFiles.filter((file) => !bundleLocalPathExists(root, file));
  const authBootstrap = isRecord(runtimeManifest) && isRecord(runtimeManifest.auth_bootstrap)
    ? runtimeManifest.auth_bootstrap
    : {};
  const ownerEmailEnv = typeof authBootstrap.owner_email_env === 'string'
    ? authBootstrap.owner_email_env
    : 'OKRA_FIRST_OWNER_EMAIL';
  const bootstrapMode = typeof authBootstrap.mode === 'string' ? authBootstrap.mode : '';
  const bootstrapRegistrationMode = typeof authBootstrap.registration_mode === 'string'
    ? authBootstrap.registration_mode
    : '';
  const bootstrapApiKeyEnv = typeof authBootstrap.api_key_env === 'string'
    ? authBootstrap.api_key_env
    : '';
  const requiredSecretNames = new Set(
    plan.env.filter((env) => env.required && env.secret).map((env) => env.name),
  );
  const requiredPlainNames = new Set(
    plan.env.filter((env) => env.required && !env.secret).map((env) => env.name),
  );
  const evidenceBundle = loadRailwayPublishEvidenceBundle(options.evidenceBundlePath);
  const templateEvidencePath = options.templateEvidencePath ?? evidenceBundle?.templateEvidencePath;
  const capabilityEvidencePath = options.capabilityEvidencePath ?? evidenceBundle?.capabilityEvidencePath;
  const smokeEvidencePath = options.smokeEvidencePath ?? evidenceBundle?.smokeEvidencePath;
  const evidenceBundleLine = evidenceBundle
    ? `evidenceBundle=${evidenceBundle.path} status=${evidenceBundle.status} reason=${evidenceBundle.reason}`
    : null;
  const capabilityPromotionEvidence = loadCapabilityPromotionEvidence(capabilityEvidencePath);
  const productionBacked = new Set([
    ...(options.modelBackedCapabilities ?? []),
    ...(capabilityPromotionEvidence?.productionBackedCapabilities ?? []),
    ...implementations
      .filter((implementation) => isProductionBackedCapabilityStatus(implementation.status))
      .map((implementation) => implementation.capabilityRef),
  ]);
  const hasProductionBackedParser = [...productionBacked].some((capability) => capability.startsWith('parser.'));
  const hasProductionBackedAuditOrRedact = [...productionBacked].some(
    (capability) => capability.startsWith('auditor.') || capability.startsWith('redactor.'),
  );
  const templatePublicationEvidence = loadTemplatePublicationEvidence(templateEvidencePath);
  const smokeEvidence = loadSmokeEvidence(smokeEvidencePath);
  const templateUrl = isHttpUrl(options.templateUrl)
    ? options.templateUrl
    : templatePublicationEvidence?.templateUrl ?? null;
  const templatePublicationPass = templateUrl !== null
    && (isHttpUrl(options.templateUrl) || templatePublicationEvidence?.published === true);
  const deploymentBaseUrl = isHttpUrl(options.deploymentBaseUrl)
    ? options.deploymentBaseUrl
    : smokeEvidence?.baseUrl ?? null;
  const liveSmokePassed = deploymentBaseUrl !== null && (options.smokePassed === true || smokeEvidence?.passed === true);
  // Filesystem-state runtime: OKRA_API_KEY (auth) + OKRA_BASE_URL are the only
  // hard requirements. DATABASE_URL / OKRA_SECRET_KEY are no longer modeled.
  const envGatePass = requiredSecretNames.has('OKRA_API_KEY')
    && requiredPlainNames.has('OKRA_BASE_URL');
  const firstOwnerBootstrapPass = bootstrapMode === 'single_owner_api_key'
    && bootstrapRegistrationMode === 'invite_only'
    && bootstrapApiKeyEnv === 'OKRA_API_KEY'
    && ownerEmailEnv === 'OKRA_FIRST_OWNER_EMAIL'
    && requiredPlainNames.has(ownerEmailEnv);
  const capabilityIsolationPass = capabilityServices.length >= 3
    && Boolean(capabilityNetwork?.internal)
    && capabilityServices.every((service) => !service.public && service.networkRefs.every((ref) => ref === 'okra-capabilities'));
  const n8nExternalPass = externalServices.length > 0
    && Boolean(integrationNetwork?.external)
    && externalServices.every((service) => service.networkRefs.every((ref) => ref === 'okra-integrations'));

  const gates: SelfHostRailwayPublishReadinessGate[] = [
    readinessGate(
      'bundle_contracts',
      'Self-host manifest validates',
      'pass',
      [
        `${plan.services.length} services`,
        `${plan.recipes.length} recipes`,
        `${plan.capabilities.length} capabilities`,
        `${plan.dockerNetworks.length} Docker networks`,
      ],
    ),
    readinessGate(
      'public_app_service',
      'One public okra-app service is defined',
      app && app.public && publicServices.length === 1 && app.railway?.builder === 'DOCKERFILE'
        ? 'pass'
        : 'blocked',
      [
        app ? `${app.id} public=${app.public}` : 'No public app service found',
        `public services: ${publicServices.map((service) => service.id).join(', ') || 'none'}`,
        app?.railway ? `builder=${app.railway.builder ?? 'default'}` : 'No Railway service config',
      ],
      app && app.public && publicServices.length === 1
        ? []
        : ['Expose exactly one public app service for the Railway template.'],
    ),
    readinessGate(
      'state_and_volume_boundary',
      'Persistent state volume is declared',
      okraData ? 'pass' : 'blocked',
      [
        // The default runtime persists state on the filesystem (OKRA_DATA_DIR in
        // the okra-data volume). A managed Postgres service is optional.
        okraData ? `state volume: ${okraData.id}:${okraData.mountPath}` : 'No okra-data volume found',
        postgres ? `managed state (optional): ${postgres.id}` : 'filesystem state (no managed Postgres)',
      ],
      okraData ? [] : ['Declare an okra-data persistent volume before publishing.'],
    ),
    readinessGate(
      'env_and_auth',
      'Required env vars and secrets are modeled',
      envGatePass && requiredPlainNames.has('OKRA_FIRST_OWNER_EMAIL') ? 'pass' : 'blocked',
      [
        `required secrets: ${[...requiredSecretNames].join(', ') || 'none'}`,
        `required plain env: ${[...requiredPlainNames].join(', ') || 'none'}`,
      ],
      envGatePass && requiredPlainNames.has('OKRA_FIRST_OWNER_EMAIL')
        ? []
        : ['Mark missing required env/secrets before publishing the Railway template.'],
    ),
    readinessGate(
      'first_owner_bootstrap',
      'First-owner bootstrap posture is explicit',
      firstOwnerBootstrapPass ? 'pass' : 'blocked',
      [
        `mode=${bootstrapMode || 'missing'}`,
        `owner_email_env=${ownerEmailEnv}`,
        `api_key_env=${bootstrapApiKeyEnv || 'missing'}`,
        `registration_mode=${bootstrapRegistrationMode || 'missing'}`,
      ],
      firstOwnerBootstrapPass
        ? []
        : ['Declare single-owner API-key bootstrap with invite-only registration and OKRA_FIRST_OWNER_EMAIL.'],
    ),
    readinessGate(
      'capability_isolation',
      'Parser/audit/redaction capability services are private',
      capabilityIsolationPass ? 'pass' : 'blocked',
      [
        `capability services: ${capabilityServices.map((service) => service.id).join(', ') || 'none'}`,
        capabilityNetwork
          ? `capability network: ${capabilityNetwork.id}, internal=${capabilityNetwork.internal}`
          : 'No capability mesh network found',
      ],
      capabilityIsolationPass ? [] : ['Keep parser/audit/redaction services off public ingress and on okra-capabilities.'],
    ),
    readinessGate(
      'n8n_external_bridge',
      'n8n is external integration, not embedded orchestration',
      n8nExternalPass ? 'pass' : 'blocked',
      [
        `external services: ${externalServices.map((service) => service.id).join(', ') || 'none'}`,
        integrationNetwork
          ? `integration network: ${integrationNetwork.id}, external=${integrationNetwork.external}, attachable=${integrationNetwork.attachable}`
          : 'No external integration network found',
      ],
      n8nExternalPass ? [] : ['Keep n8n outside the core service graph and attached only through okra-integrations.'],
    ),
    readinessGate(
      'capability_implementation_handoff',
      'Parser/audit/redaction implementation handoff is explicit',
      implementationHandoffPass ? 'pass' : 'blocked',
      implementations.length > 0
        ? implementations.map((implementation) =>
            `${implementation.capabilityRef}: ${implementation.status} -> ${implementation.targetStatus} on ${implementation.serviceId} via ${implementation.networkRefs.join(', ') || 'no network'}`,
          )
        : ['No capability implementations declared'],
      implementationHandoffPass
        ? []
        : ['Declare parser plus audit/redact implementations on the private okra-capabilities network.'],
    ),
    readinessGate(
      'generated_artifacts',
      'Generated deploy and Docker artifacts are present',
      missingFiles.length === 0 ? 'pass' : 'blocked',
      missingFiles.length === 0
        ? requiredFiles.map((file) => `${file}: present`)
        : missingFiles.map((file) => `${file}: missing`),
      missingFiles.length === 0 ? [] : ['Regenerate missing artifacts from `okra self-host ...` commands.'],
    ),
    readinessGate(
      'template_publication',
      'Railway template URL is published',
      templatePublicationPass ? 'pass' : 'blocked',
      [
        ...(evidenceBundleLine ? [evidenceBundleLine] : []),
        templateUrl ? `templateUrl=${templateUrl}` : 'railway-template.handoff.json marks publication as not_published',
        templatePublicationEvidence
          ? `templateEvidence=${templatePublicationEvidence.path} status=${templatePublicationEvidence.status} checks=${templatePublicationEvidence.checks.join(', ') || 'none'}`
          : 'No template publication evidence file supplied',
        templatePublicationEvidence
          ? `templateEvidenceReason=${templatePublicationEvidence.reason}`
          : 'Generate evidence with `okra self-host template-evidence` and fill it after Railway publication.',
      ],
      templatePublicationPass
        ? []
        : ['Create/publish the Railway template, update `railway-template.evidence.json`, regenerate `railway-publish.evidence.json`, then rerun with --evidence-bundle railway-publish.evidence.json.'],
    ),
    readinessGate(
      'model_backed_capabilities',
      'Parser and audit/redact services are production-backed',
      hasProductionBackedParser && hasProductionBackedAuditOrRedact ? 'pass' : 'blocked',
      [
        ...(evidenceBundleLine ? [evidenceBundleLine] : []),
        `declared production-backed capabilities: ${[...productionBacked].join(', ') || 'none'}`,
        capabilityPromotionEvidence
          ? `capabilityEvidence=${capabilityPromotionEvidence.path} status=${capabilityPromotionEvidence.status} capabilities=${capabilityPromotionEvidence.capabilities.join(', ') || 'none'}`
          : 'No capability promotion evidence file supplied',
        capabilityPromotionEvidence
          ? `capabilityEvidenceReason=${capabilityPromotionEvidence.reason}`
          : 'Generate evidence with `okra self-host capability-evidence` and fill it after image promotion.',
        `implementation targets: ${implementations.map((implementation) => `${implementation.capabilityRef}:${implementation.status}->${implementation.targetStatus}`).join(', ') || 'none'}`,
        `starter capability services: ${capabilityServices.map((service) => service.capabilityRef).filter(Boolean).join(', ')}`,
      ],
      hasProductionBackedParser && hasProductionBackedAuditOrRedact
        ? []
        : ['Promote starter adapters to production-backed parser and audit/redact images, update `capability-promotion.evidence.json`, regenerate `railway-publish.evidence.json`, then rerun with --evidence-bundle railway-publish.evidence.json.'],
    ),
    readinessGate(
      'live_deploy_smoke',
      'Live deploy smoke has passed',
      liveSmokePassed ? 'pass' : 'blocked',
      [
        ...(evidenceBundleLine ? [evidenceBundleLine] : []),
        deploymentBaseUrl ? `deploymentBaseUrl=${deploymentBaseUrl}` : 'No deployed base URL supplied',
        options.smokePassed ? 'Smoke marked passed' : 'Smoke not marked passed',
        smokeEvidence
          ? `smokeEvidence=${smokeEvidence.path} status=${smokeEvidence.status} workflow=${smokeEvidence.workflow ?? 'missing'} checks=${smokeEvidence.checks.join(', ') || 'none'}`
          : 'No smoke evidence file supplied',
        smokeEvidence ? `smokeEvidenceReason=${smokeEvidence.reason}` : 'Generate evidence with --evidence-out',
        'expected smoke: okra self-host smoke $OKRA_BASE_URL --workflow both --evidence-out railway-smoke.evidence.json',
      ],
      liveSmokePassed
        ? []
        : ['Deploy the template, run `okra self-host smoke $OKRA_BASE_URL --workflow both --evidence-out railway-smoke.evidence.json`, regenerate `railway-publish.evidence.json`, then rerun with --evidence-bundle railway-publish.evidence.json.'],
    ),
  ];

  const blockers = gates
    .filter((gate) => gate.status === 'blocked')
    .map((gate) => `${gate.id}: ${gate.actions[0] ?? gate.label}`);
  const warnings = gates
    .filter((gate) => gate.status === 'warning')
    .map((gate) => `${gate.id}: ${gate.actions[0] ?? gate.label}`);
  const nextActions = gates
    .filter((gate) => gate.status === 'blocked')
    .flatMap((gate) => gate.actions)
    .filter((action, index, actions) => actions.indexOf(action) === index);

  return {
    object: 'railway_publish_readiness',
    schema_version: 'okra-railway-publish-readiness/v1',
    name: 'okraPDF Self-Host Runtime',
    source_manifest: 'runtime.manifest.json',
    status: blockers.length === 0 ? 'ready' : 'blocked',
    publishable: blockers.length === 0,
    templateUrl,
    deploymentBaseUrl,
    summary: {
      passed: gates.filter((gate) => gate.status === 'pass').length,
      warnings: gates.filter((gate) => gate.status === 'warning').length,
      blocked: blockers.length,
      services: plan.services.length,
      recipes: plan.recipes.length,
      capabilities: plan.capabilities.length,
      dockerNetworks: plan.dockerNetworks.length,
    },
    gates,
    blockers,
    warnings,
    nextActions,
    docs: [
      'https://docs.railway.com/templates/create',
      'https://docs.railway.com/templates/publish-and-share',
      'runtime/RAILWAY.md',
    ],
  };
}

function createRailwayPublishPack(
  root: string,
  plan: SelfHostDeploymentPlan,
  readiness: SelfHostRailwayPublishReadiness,
): SelfHostRailwayPublishPack {
  const template = createRailwayTemplateHandoff(plan);
  const networkHandoff = createDockerNetworkHandoff(plan);
  const implementationHandoff = createCapabilityImplementationsHandoff(root, plan);
  const appServices = plan.services.filter((service) =>
    !['postgres', 'redis', 'valkey', 'object_store', 'external_service'].includes(service.kind),
  );
  const optionalCapabilityServices = plan.services.filter((service) =>
    service.kind === 'capability_service' && !service.required,
  );
  const publicService = plan.services.find((service) => service.public) ?? null;
  const requiredSecrets = plan.env
    .filter((env) => env.required && env.secret)
    .map((env) => env.name);
  const requiredPlain = plan.env
    .filter((env) => env.required && !env.secret)
    .map((env) => env.name);
  const optionalEnv = plan.env
    .filter((env) => !env.required)
    .map((env) => env.name);
  const serviceConfigFiles = plan.services.flatMap((service) => {
    if (!service.railway) return [];
    return [{
      serviceId: service.id,
      serviceName: service.railway.serviceName,
      required: service.required,
      public: service.public,
      configPath: railwayConfigPath(service),
      ...(service.railway.dockerfilePath ? { dockerfilePath: service.railway.dockerfilePath } : {}),
      ...(service.startCommand ? { startCommand: dockerSafeOkraShellCommand(service.startCommand) } : {}),
      ...(service.railway.healthcheckPath ? { healthcheckPath: service.railway.healthcheckPath } : {}),
    }];
  });
  const capabilityNetwork = plan.dockerNetworks.find((network) => network.kind === 'capability_mesh') ?? null;
  const baseArtifacts: SelfHostRailwayPublishPackArtifact[] = [
    { path: 'runtime.manifest.json', kind: 'source_manifest', required: true },
    { path: 'Dockerfile', kind: 'app_dockerfile', serviceId: 'okra-app', required: true },
    { path: 'railway-template.handoff.json', kind: 'railway_template_handoff', required: true },
    { path: 'railway-template.listing.json', kind: 'railway_template_listing', required: true },
    { path: 'self-host-draft.proof.json', kind: 'self_host_draft_proof', required: false },
    { path: 'railway-template.evidence.json', kind: 'railway_template_publication_evidence', required: false },
    { path: RAILWAY_PUBLISH_EVIDENCE_BUNDLE_DEFAULT_PATH, kind: 'railway_publish_evidence_bundle', required: false },
    { path: 'docker-network.handoff.json', kind: 'docker_network_handoff', required: true },
    { path: 'capability-implementations.handoff.json', kind: 'capability_implementations_handoff', required: true },
    { path: 'capability-promotion.evidence.json', kind: 'capability_promotion_evidence', required: false },
    { path: 'railway-publish.readiness.json', kind: 'railway_publish_readiness', required: true },
    { path: 'railway-publish.pack.json', kind: 'railway_publish_pack', required: true },
    { path: 'docker-compose.yml', kind: 'compose_full_stack', required: true },
    { path: 'docker-compose.capabilities.yml', kind: 'compose_capabilities_overlay', required: true },
    { path: 'docker-compose.integrations.yml', kind: 'compose_integrations_overlay', required: true },
    { path: 'docker-compose.networks.yml', kind: 'compose_networks_fragment', required: true },
    { path: 'public/index.html', kind: 'static_shell', required: true },
  ];
  const railwayArtifacts = serviceConfigFiles.map((service) => ({
    path: service.configPath,
    kind: 'railway_config',
    serviceId: service.serviceId,
    required: true,
  }));
  const implementationArtifacts = implementationHandoff.implementations.flatMap((implementation) =>
    implementation.dockerfilePath
      ? [{
          path: implementation.dockerfilePath,
          kind: 'capability_dockerfile',
          serviceId: implementation.serviceId,
          required: true,
        }]
      : [],
  );
  const artifacts = [...baseArtifacts, ...railwayArtifacts, ...implementationArtifacts];
  const bootstrapCommands = [
    ...plan.dockerNetworks.map(dockerNetworkCreateCommand),
    ...plan.volumes.map((volume) => dockerVolumeCreateCommand(`okrapdf-self-host_${volume.id}`)),
  ];

  return {
    object: 'railway_publish_pack',
    schema_version: 'okra-railway-publish-pack/v1',
    name: 'okraPDF Self-Host Runtime',
    source_manifest: 'runtime.manifest.json',
    status: 'pack_ready',
    summary: {
      services: plan.services.length,
      appServices: appServices.length,
      optionalCapabilityServices: optionalCapabilityServices.length,
      managedServices: template.managedServices.length,
      externalServices: template.externalServices.length,
      configFiles: serviceConfigFiles.length,
      requiredSecrets: requiredSecrets.length,
      requiredPlainEnv: requiredPlain.length,
      volumes: plan.volumes.length,
      dockerNetworks: plan.dockerNetworks.length,
      readinessStatus: readiness.status,
      blockers: readiness.blockers.length,
    },
    artifacts,
    railway: {
      composerMode: 'project_to_template',
      publicServiceId: publicService?.id ?? null,
      serviceConfigFiles,
      managedServices: template.managedServices,
      env: {
        requiredSecrets,
        requiredPlain,
        optional: optionalEnv,
      },
      templatePublicationEvidenceRequiredChecks: RAILWAY_TEMPLATE_PUBLICATION_REQUIRED_CHECKS,
      volumes: plan.volumes,
      templateChecklist: template.templateChecklist,
      deployButton: template.deployButton,
    },
    docker: {
      organization: 'separated_compose_overlays',
      networkHandoffPath: 'docker-network.handoff.json',
      composeFiles: [
        {
          path: 'docker-compose.yml',
          purpose: 'Full local stack with public okra-app, private state, optional capabilities, and integration bridge.',
        },
        {
          path: 'docker-compose.capabilities.yml',
          purpose: 'Launch parser/audit/redaction capability services against okra-capabilities and okra-data.',
        },
        {
          path: 'docker-compose.integrations.yml',
          purpose: 'Launch external n8n bridge services against okra-integrations only.',
        },
        {
          path: 'docker-compose.networks.yml',
          purpose: 'Create or share named Docker networks for independently launched services.',
        },
      ],
      networks: networkHandoff.networks,
      bootstrapCommands,
      stackLaunchCommand: 'docker compose -f docker-compose.yml --profile capabilities up -d',
      capabilityLaunchCommand: 'docker compose -f docker-compose.capabilities.yml up -d',
      integrationLaunchCommand: 'docker compose -f docker-compose.integrations.yml up -d',
    },
    capabilities: {
      protocol: 'okra-capability-http/v1',
      privateNetwork: capabilityNetwork?.id ?? null,
      promotionEvidenceRequiredChecks: CAPABILITY_PROMOTION_REQUIRED_CHECKS,
      implementations: implementationHandoff.implementations,
    },
    externalIntegrations: template.externalServices,
    publication: {
      state: readiness.publishable ? 'ready' : 'blocked_external_evidence',
      templateUrl: readiness.templateUrl,
      deploymentBaseUrl: readiness.deploymentBaseUrl,
      blockers: readiness.blockers,
      nextActions: readiness.nextActions,
      requiredExternalActions: template.publication.required_external_actions,
    },
    docs: [
      'runtime/README.md',
      'runtime/RAILWAY.md',
      'https://docs.railway.com/templates/create',
      'https://docs.railway.com/templates/publish-and-share',
      'https://docs.railway.com/config-as-code/reference',
    ],
  };
}

export function createSelfHostRailwayConfigArtifact(
  bundleDir: string,
  serviceId?: string,
): SelfHostRailwayConfigArtifactResult {
  const root = resolve(bundleDir);
  const deployment = createSelfHostDeploymentPlan(bundleDir, 'railway');
  const requestedService = serviceId?.trim();
  const service = requestedService
    ? deployment.plan?.services.find((item) => item.id === requestedService) ?? null
    : deployment.plan?.services.find((item) => item.id === 'okra-app')
      ?? deployment.plan?.services.find((item) => item.public)
      ?? null;
  const serviceError = requestedService && !service
    ? { path: 'service', message: `unknown Railway service "${requestedService}"` }
    : service && !service.railway
      ? { path: 'service', message: `service "${service.id}" has no Railway config` }
      : null;
  const validation = serviceError
    ? {
        ...deployment.validation,
        ok: false,
        errors: [...deployment.validation.errors, serviceError],
      }
    : deployment.validation;
  const ok = deployment.ok && service !== null && service.railway !== undefined && serviceError === null;

  return {
    object: 'self_host_railway_config_artifact',
    ok,
    root,
    validation,
    service,
    configPath: ok && service ? railwayConfigPath(service) : null,
    railwayJson: ok && service ? createRailwayJson(service) : null,
    templateChecklist: deployment.plan ? createRailwayTemplateChecklist(deployment.plan) : [],
    docs: [
      'https://docs.railway.com/config-as-code',
      'https://docs.railway.com/config-as-code/reference',
      'https://docs.railway.com/templates/create',
      'https://docs.railway.com/templates/publish-and-share',
    ],
  };
}

export function createSelfHostDockerNetworkHandoffArtifact(
  bundleDir: string,
): SelfHostDockerNetworkHandoffArtifactResult {
  const root = resolve(bundleDir);
  const deployment = createSelfHostDeploymentPlan(bundleDir, 'railway');
  return {
    object: 'self_host_docker_network_handoff_artifact',
    ok: deployment.ok && deployment.plan !== null,
    root,
    validation: deployment.validation,
    handoff: deployment.plan ? createDockerNetworkHandoff(deployment.plan) : null,
  };
}

export function createSelfHostRailwayTemplateArtifact(
  bundleDir: string,
): SelfHostRailwayTemplateArtifactResult {
  const root = resolve(bundleDir);
  const deployment = createSelfHostDeploymentPlan(bundleDir, 'railway');
  return {
    object: 'self_host_railway_template_artifact',
    ok: deployment.ok && deployment.plan !== null,
    root,
    validation: deployment.validation,
    handoff: deployment.plan ? createRailwayTemplateHandoff(deployment.plan) : null,
  };
}

export function createSelfHostRailwayTemplateListingArtifact(
  bundleDir: string,
): SelfHostRailwayTemplateListingArtifactResult {
  const root = resolve(bundleDir);
  const deployment = createSelfHostDeploymentPlan(bundleDir, 'railway');
  return {
    object: 'self_host_railway_template_listing_artifact',
    ok: deployment.ok && deployment.plan !== null,
    root,
    validation: deployment.validation,
    listing: deployment.plan ? createRailwayTemplateListing(deployment.plan) : null,
  };
}

export function createSelfHostRailwayTemplatePublicationEvidenceArtifact(
  bundleDir: string,
): SelfHostRailwayTemplatePublicationEvidenceArtifactResult {
  const root = resolve(bundleDir);
  const deployment = createSelfHostDeploymentPlan(bundleDir, 'railway');
  return {
    object: 'self_host_railway_template_publication_evidence_artifact',
    ok: deployment.ok && deployment.plan !== null,
    root,
    validation: deployment.validation,
    evidence: deployment.plan ? createRailwayTemplatePublicationEvidence(deployment.plan) : null,
  };
}

export function createSelfHostCapabilityImplementationsArtifact(
  bundleDir: string,
): SelfHostCapabilityImplementationsArtifactResult {
  const root = resolve(bundleDir);
  const deployment = createSelfHostDeploymentPlan(bundleDir, 'railway');
  return {
    object: 'self_host_capability_implementations_artifact',
    ok: deployment.ok && deployment.plan !== null,
    root,
    validation: deployment.validation,
    handoff: deployment.plan ? createCapabilityImplementationsHandoff(root, deployment.plan) : null,
  };
}

export function createSelfHostCapabilityPromotionEvidenceArtifact(
  bundleDir: string,
): SelfHostCapabilityPromotionEvidenceArtifactResult {
  const root = resolve(bundleDir);
  const deployment = createSelfHostDeploymentPlan(bundleDir, 'railway');
  return {
    object: 'self_host_capability_promotion_evidence_artifact',
    ok: deployment.ok && deployment.plan !== null,
    root,
    validation: deployment.validation,
    evidence: deployment.plan ? createCapabilityPromotionEvidence(root, deployment.plan) : null,
  };
}

export function createSelfHostRailwayPublishEvidenceBundleArtifact(
  bundleDir: string,
  options: SelfHostRailwayPublishEvidenceBundleOptions = {},
): SelfHostRailwayPublishEvidenceBundleArtifactResult {
  const root = resolve(bundleDir);
  const deployment = createSelfHostDeploymentPlan(bundleDir, 'railway');
  return {
    object: 'self_host_railway_publish_evidence_bundle_artifact',
    ok: deployment.ok && deployment.plan !== null,
    root,
    validation: deployment.validation,
    evidenceBundle: deployment.plan ? createRailwayPublishEvidenceBundle(root, options) : null,
  };
}

export function createSelfHostRailwayPublishReadinessArtifact(
  bundleDir: string,
  options: SelfHostRailwayPublishReadinessOptions = {},
): SelfHostRailwayPublishReadinessArtifactResult {
  const root = resolve(bundleDir);
  const deployment = createSelfHostDeploymentPlan(bundleDir, 'railway');
  const resolvedOptions = resolvePublishReadinessOptions(root, options);
  return {
    object: 'self_host_railway_publish_readiness_artifact',
    ok: deployment.ok && deployment.plan !== null,
    root,
    validation: deployment.validation,
    readiness: deployment.plan ? createRailwayPublishReadiness(root, deployment.plan, resolvedOptions) : null,
  };
}

export function createSelfHostRailwayPublishPackArtifact(
  bundleDir: string,
  options: SelfHostRailwayPublishReadinessOptions = {},
): SelfHostRailwayPublishPackArtifactResult {
  const root = resolve(bundleDir);
  const deployment = createSelfHostDeploymentPlan(bundleDir, 'railway');
  const resolvedOptions = resolvePublishReadinessOptions(root, options);
  const readiness = deployment.plan ? createRailwayPublishReadiness(root, deployment.plan, resolvedOptions) : null;
  return {
    object: 'self_host_railway_publish_pack_artifact',
    ok: deployment.ok && deployment.plan !== null,
    root,
    validation: deployment.validation,
    pack: deployment.plan && readiness ? createRailwayPublishPack(root, deployment.plan, readiness) : null,
  };
}

function materializedJsonContent(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function materializedTextContent(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function writeMaterializedArtifact(
  root: string,
  path: string,
  kind: string,
  required: boolean,
  content: string,
): SelfHostMaterializedArtifact {
  const absolutePath = resolve(root, path);
  const previous = existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : null;
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  return {
    path,
    kind,
    required,
    changed: previous !== content,
    bytes: content.length,
  };
}

export function materializeSelfHostPublishArtifacts(bundleDir: string): SelfHostMaterializeArtifactsResult {
  const root = resolve(bundleDir);
  const deployment = createSelfHostDeploymentPlan(bundleDir, 'railway');
  if (!deployment.ok || !deployment.plan) {
    return {
      object: 'self_host_materialize_artifacts',
      ok: false,
      root,
      validation: deployment.validation,
      artifacts: [],
      readinessStatus: null,
      blockers: deployment.validation.errors.map((error) => `${error.path}: ${error.message}`),
      nextActions: ['Fix self-host bundle validation errors before materializing publish artifacts.'],
    };
  }

  const plan = deployment.plan;
  const artifacts: SelfHostMaterializedArtifact[] = [];
  const writeJson = (path: string, kind: string, value: unknown, required = true) => {
    artifacts.push(writeMaterializedArtifact(root, path, kind, required, materializedJsonContent(value)));
  };
  const writeText = (path: string, kind: string, value: string, required = true) => {
    artifacts.push(writeMaterializedArtifact(root, path, kind, required, materializedTextContent(value)));
  };

  for (const service of plan.services) {
    if (!service.railway) continue;
    writeJson(railwayConfigPath(service), 'railway_config', createRailwayJson(service));
  }

  writeJson('railway-template.handoff.json', 'railway_template_handoff', createRailwayTemplateHandoff(plan));
  writeJson('railway-template.listing.json', 'railway_template_listing', createRailwayTemplateListing(plan));
  writeJson(
    'railway-template.evidence.json',
    'railway_template_publication_evidence',
    createRailwayTemplatePublicationEvidence(plan),
    false,
  );
  writeJson(
    'capability-implementations.handoff.json',
    'capability_implementations_handoff',
    createCapabilityImplementationsHandoff(root, plan),
  );
  writeJson(
    'capability-promotion.evidence.json',
    'capability_promotion_evidence',
    createCapabilityPromotionEvidence(root, plan),
    false,
  );
  writeJson('docker-network.handoff.json', 'docker_network_handoff', createDockerNetworkHandoff(plan));
  writeText('docker-compose.yml', 'compose_full_stack', createComposeStack(plan));
  writeText('docker-compose.capabilities.yml', 'compose_capabilities_overlay', createComposeCapabilityServices(plan));
  writeText('docker-compose.integrations.yml', 'compose_integrations_overlay', createComposeIntegrations(plan));
  writeText('docker-compose.networks.yml', 'compose_networks_fragment', createComposeNetworksFragment(plan.dockerNetworks));

  writeJson(
    RAILWAY_PUBLISH_EVIDENCE_BUNDLE_DEFAULT_PATH,
    'railway_publish_evidence_bundle',
    createRailwayPublishEvidenceBundle(root),
    false,
  );

  const evidenceBundlePath = resolve(root, RAILWAY_PUBLISH_EVIDENCE_BUNDLE_DEFAULT_PATH);
  const readiness = createRailwayPublishReadiness(root, plan, { evidenceBundlePath });
  writeJson('railway-publish.readiness.json', 'railway_publish_readiness', readiness);
  writeJson('railway-publish.pack.json', 'railway_publish_pack', createRailwayPublishPack(root, plan, readiness));

  return {
    object: 'self_host_materialize_artifacts',
    ok: true,
    root,
    validation: deployment.validation,
    artifacts,
    readinessStatus: readiness.status,
    blockers: readiness.blockers,
    nextActions: readiness.nextActions,
  };
}

export function createSelfHostDeploymentPlan(
  bundleDir: string,
  target = 'railway',
): SelfHostDeploymentPlanResult {
  const root = resolve(bundleDir);
  if (target !== 'railway') {
    const validation = validateSelfHostBundle(bundleDir);
    return {
      object: 'self_host_deployment_plan',
      ok: false,
      root,
      target: 'railway',
      validation: {
        ...validation,
        errors: [
          ...validation.errors,
          { path: 'target', message: `unsupported self-host deploy target "${target}"` },
        ],
      },
      plan: null,
    };
  }

  const validation = validateSelfHostBundle(bundleDir);
  const plan = createRailwayPlan(root, validation);
  return {
    object: 'self_host_deployment_plan',
    ok: validation.ok && plan !== null,
    root,
    target: 'railway',
    validation,
    plan,
  };
}

export function formatSelfHostEnvArtifactResult(
  result: SelfHostEnvArtifactResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok || !result.dotenv) {
    const lines = ['Self-host env artifact blocked', `Root: ${result.root}`, '', 'Validation errors:'];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  return result.dotenv;
}

export function formatSelfHostComposeArtifactResult(
  result: SelfHostComposeArtifactResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok || !result.compose) {
    const lines = [
      'Self-host compose artifact blocked',
      `Root: ${result.root}`,
      '',
      'Validation errors:',
    ];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  return result.compose;
}

export function formatSelfHostDockerNetworkHandoffArtifactResult(
  result: SelfHostDockerNetworkHandoffArtifactResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok || !result.handoff) {
    const lines = [
      'Self-host Docker network handoff blocked',
      `Root: ${result.root}`,
      '',
      'Validation errors:',
    ];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  return `${JSON.stringify(result.handoff, null, 2)}\n`;
}

export function formatSelfHostRailwayConfigArtifactResult(
  result: SelfHostRailwayConfigArtifactResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok || !result.railwayJson) {
    const lines = [
      'Self-host railway config artifact blocked',
      `Root: ${result.root}`,
      '',
      'Validation errors:',
    ];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  return `${JSON.stringify(result.railwayJson, null, 2)}\n`;
}

export function formatSelfHostRailwayTemplateArtifactResult(
  result: SelfHostRailwayTemplateArtifactResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok || !result.handoff) {
    const lines = [
      'Self-host railway template handoff blocked',
      `Root: ${result.root}`,
      '',
      'Validation errors:',
    ];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  return `${JSON.stringify(result.handoff, null, 2)}\n`;
}

export function formatSelfHostRailwayTemplateListingArtifactResult(
  result: SelfHostRailwayTemplateListingArtifactResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok || !result.listing) {
    const lines = [
      'Self-host railway template listing blocked',
      `Root: ${result.root}`,
      '',
      'Validation errors:',
    ];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  return `${JSON.stringify(result.listing, null, 2)}\n`;
}

export function formatSelfHostRailwayTemplatePublicationEvidenceArtifactResult(
  result: SelfHostRailwayTemplatePublicationEvidenceArtifactResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok || !result.evidence) {
    const lines = [
      'Self-host railway template publication evidence blocked',
      `Root: ${result.root}`,
      '',
      'Validation errors:',
    ];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  return `${JSON.stringify(result.evidence, null, 2)}\n`;
}

export function formatSelfHostCapabilityImplementationsArtifactResult(
  result: SelfHostCapabilityImplementationsArtifactResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok || !result.handoff) {
    const lines = [
      'Self-host capability implementations handoff blocked',
      `Root: ${result.root}`,
      '',
      'Validation errors:',
    ];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  return `${JSON.stringify(result.handoff, null, 2)}\n`;
}

export function formatSelfHostCapabilityPromotionEvidenceArtifactResult(
  result: SelfHostCapabilityPromotionEvidenceArtifactResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok || !result.evidence) {
    const lines = [
      'Self-host capability promotion evidence blocked',
      `Root: ${result.root}`,
      '',
      'Validation errors:',
    ];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  return `${JSON.stringify(result.evidence, null, 2)}\n`;
}

export function formatSelfHostRailwayPublishEvidenceBundleArtifactResult(
  result: SelfHostRailwayPublishEvidenceBundleArtifactResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok || !result.evidenceBundle) {
    const lines = [
      'Self-host railway publish evidence bundle blocked',
      `Root: ${result.root}`,
      '',
      'Validation errors:',
    ];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  return `${JSON.stringify(result.evidenceBundle, null, 2)}\n`;
}

export function formatSelfHostRailwayPublishReadinessArtifactResult(
  result: SelfHostRailwayPublishReadinessArtifactResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok || !result.readiness) {
    const lines = [
      'Self-host railway publish readiness blocked',
      `Root: ${result.root}`,
      '',
      'Validation errors:',
    ];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  return `${JSON.stringify(result.readiness, null, 2)}\n`;
}

export function formatSelfHostRailwayPublishPackArtifactResult(
  result: SelfHostRailwayPublishPackArtifactResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok || !result.pack) {
    const lines = [
      'Self-host railway publish pack blocked',
      `Root: ${result.root}`,
      '',
      'Validation errors:',
    ];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  return `${JSON.stringify(result.pack, null, 2)}\n`;
}

export function formatSelfHostMaterializeArtifactsResult(
  result: SelfHostMaterializeArtifactsResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  if (!result.ok) {
    const lines = [
      'Self-host publish artifacts blocked',
      `Root: ${result.root}`,
      '',
      'Validation errors:',
    ];
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  const changed = result.artifacts.filter((artifact) => artifact.changed).length;
  const lines = [
    'Self-host publish artifacts materialized',
    `Root: ${result.root}`,
    `Artifacts: ${result.artifacts.length} (${changed} changed)`,
    `Readiness: ${result.readinessStatus ?? 'unknown'}`,
    '',
    'Files:',
    ...result.artifacts.map((artifact) =>
      `  ${artifact.changed ? 'updated' : 'unchanged'}  ${artifact.path}  ${artifact.kind}  ${artifact.bytes} bytes`,
    ),
  ];

  if (result.blockers.length > 0) {
    lines.push('', 'Remaining blockers:', ...result.blockers.map((blocker) => `  ${blocker}`));
  }

  return `${lines.join('\n')}\n`;
}

export function formatSelfHostDeploymentPlanResult(
  result: SelfHostDeploymentPlanResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  const lines = [
    result.ok ? 'Self-host railway plan ready' : 'Self-host railway plan blocked',
    `Root: ${result.root}`,
  ];

  if (!result.plan) {
    lines.push('', 'Validation errors:');
    for (const error of result.validation.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
    return lines.join('\n');
  }

  lines.push(
    '',
    'Railway services',
    ...result.plan.services.map((service) => {
      const exposure = service.public ? 'public' : 'private';
      const railway = service.railway
        ? ` builder=${service.railway.builder ?? 'default'} health=${service.railway.healthcheckPath ?? 'none'}`
        : '';
      const networks = service.networkRefs.length ? ` networks=${service.networkRefs.join(',')}` : '';
      return `  ${service.id} (${service.kind}/${service.runtime}, ${exposure})${railway}${networks}`;
    }),
    '',
    'Docker networks',
    ...result.plan.dockerNetworks.map((network) => {
      const flags = [
        network.internal ? 'internal' : 'public',
        network.external ? 'external' : 'local',
        network.attachable ? 'attachable' : 'fixed',
      ];
      const services = network.services.join(', ') || 'no services';
      const capabilities = network.capabilities.join(', ') || 'no capabilities';
      return `  ${network.id} (${network.kind}, ${flags.join(', ')}) -> services: ${services}; capabilities: ${capabilities}`;
    }),
    '',
    'Environment',
    ...result.plan.env.map((env) => {
      const flags = [env.required ? 'required' : 'optional', env.secret ? 'secret' : 'plain'];
      return `  ${env.name} (${flags.join(', ')}) -> ${env.consumers.join(', ') || 'unconsumed'}`;
    }),
    '',
    'Volumes',
    ...result.plan.volumes.map((volume) =>
      `  ${volume.id} ${volume.mountPath} -> ${volume.consumers.join(', ') || 'unconsumed'}`,
    ),
    '',
    'Recipes',
    ...result.plan.recipes.map((recipe) => `  ${recipe}`),
    '',
    'Capability namespaces',
    ...result.plan.capabilities.map((capability) =>
      `  ${capability.id} -> ${capability.namespace} (${capability.networkNamespace})`,
    ),
    '',
    'Steps',
    ...result.plan.steps.map((step, index) => `  ${index + 1}. ${step}`),
  );

  return lines.join('\n');
}

export function formatSelfHostValidationResult(
  result: SelfHostValidationResult,
  json?: boolean,
): string {
  if (json) return JSON.stringify(result);

  const lines = [
    result.ok ? 'Self-host bundle valid' : 'Self-host bundle invalid',
    `Root: ${result.root}`,
  ];

  if (result.summary) {
    lines.push(
      `Services: ${result.summary.services}`,
      `Recipes: ${result.summary.recipes}`,
      `n8n workflows: ${result.summary.n8nWorkflows}`,
      `Capabilities: ${result.summary.capabilities}`,
      `Capability namespaces: ${result.summary.capabilityNamespaces}`,
      `Docker networks: ${result.summary.dockerNetworks}`,
      `UI runtime: ${result.summary.uiRuntime}`,
      `API runtime: ${result.summary.apiRuntime}`,
      `Deploy targets: ${result.summary.deploymentTargets.join(', ')}`,
    );
  }

  if (result.errors.length) {
    lines.push('', 'Errors:');
    for (const error of result.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
  }

  if (result.warnings.length) {
    lines.push('', 'Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  ${warning.path}: ${warning.message}`);
    }
  }

  return lines.join('\n');
}
