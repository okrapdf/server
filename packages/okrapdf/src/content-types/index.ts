/**
 * `@okrapdf/sdk/content-types` — the content-type registry + manifest grammar as
 * a standalone, dependency-light entry. Import from here (rather than the main
 * `@okrapdf/sdk`) when you only want the typed extraction contracts and not the
 * full client/CLI bundle — e.g. a Cloudflare Worker or a tree-shaking-conscious
 * build that surfaces content types (the manifests are pure data + pure
 * functions, no `commander`/`ws`).
 */
export { listContentTypes, getContentType } from './registry';
export type { ContentTypeSummary } from './registry';
export {
  contentTypeManifestViolations,
  isContentTypeManifest,
  RESERVED_NOUNS,
} from './manifest';
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
} from './manifest';
export { invoiceContentType } from './invoice';
export { receiptContentType } from './receipt';
