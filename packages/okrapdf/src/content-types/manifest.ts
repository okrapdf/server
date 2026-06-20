/**
 * Content-type manifest grammar (W.4.24d.1 / #330).
 *
 * A content type is a SUPERSET of a JSON schema: the payload shape PLUS the
 * workflow around it — field metadata, per-field evidence policy, extraction
 * config, (P1) review + export config, and the generated CLI noun / SDK
 * namespace. This file is the canonical grammar (a type IS the grammar) and a
 * runtime validator; the generator in #331 consumes manifests that satisfy it.
 *
 * Spec: the okra monorepo.
 */

/** Scalar/structural type of a manifest field. `money`/`date` are scalars with
 *  display semantics; `array`/`object` mark repeating/nested groups. */
export type ContentTypeFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'money'
  | 'array'
  | 'object';

/** Evidence requirement — defaulted on the manifest, overridable per field.
 *  `citation_required` ties to the okra differentiator: a field must carry a
 *  `page_location` citation to be trusted. */
export interface EvidencePolicy {
  citation_required: boolean;
  /** Require a precise element box (`bbox_source: 'node'`), not a page-level fallback. */
  bbox_required: boolean;
  /** 0–1; a grounded value below this routes to review (P1). */
  confidence_threshold: number;
}

export interface ContentTypeField {
  /** JSONPath into `result.data` — matches the grounding field names
   *  (`vendor.name`, `line_items[].amount`). */
  path: string;
  label: string;
  type: ContentTypeFieldType;
  required: boolean;
  /** True for array/line-item fields. */
  repeating?: boolean;
  /** Per-field override of the manifest's default evidence policy. */
  evidence?: Partial<EvidencePolicy>;
}

/** P1 — declarative only; the durable queue / live streaming are out of scope. */
export interface ReviewConfig {
  threshold: number;
  /** Registered review component to bind (see #332). */
  component_id?: string;
  commit_policy?: 'auto' | 'manual';
  allowed_actions?: Array<'correct' | 'approve' | 'reject'>;
}

export type ExportFormat = 'csv' | 'xlsx' | 'webhook' | 'json';

export interface ExtractionConfig {
  /** Prompt/guidance for the extractor. */
  instructions: string;
  /** P1 — default provider + ordering. */
  provider_policy?: { primary?: string; order?: string[] };
  /** P1 — behavior when the primary provider fails / is low-confidence. */
  fallback?: 'none' | 'next_provider' | 'review';
}

export interface CliGenerationHints {
  /** Generated CLI noun (defaults to `id`). */
  noun: string;
  aliases?: string[];
  /** P1. */
  default_output?: 'json' | 'table';
}

export interface SdkGenerationHints {
  /** Generated SDK namespace (`okra.invoice`); must not collide with a built-in
   *  resource noun. */
  namespace: string;
  /** P1 — method-name overrides. */
  methods?: { extract?: string; review?: string; export?: string };
}

export interface ContentTypeManifest {
  // ── identity (P0) ──
  id: string;
  label: string;
  version: string;
  /** JSON Schema for the payload (`result.data`). */
  schema: Record<string, unknown>;

  // ── shape + evidence (P0) ──
  fields: ContentTypeField[];
  evidence: EvidencePolicy;
  extraction: ExtractionConfig;

  // ── lifecycle (P1) ──
  review?: ReviewConfig;
  export?: { formats: ExportFormat[] };

  // ── generated interfaces (P0 names, P1 method overrides) ──
  cli: CliGenerationHints;
  sdk: SdkGenerationHints;
}

const FIELD_TYPES: ReadonlySet<string> = new Set<ContentTypeFieldType>([
  'string', 'number', 'boolean', 'date', 'money', 'array', 'object',
]);
const EXPORT_FORMATS: ReadonlySet<string> = new Set<ExportFormat>(['csv', 'xlsx', 'webhook', 'json']);
/** Built-in CLI/SDK resource nouns a generated content type must not shadow. */
export const RESERVED_NOUNS: ReadonlySet<string> = new Set([
  'context', 'documents', 'collections', 'files', 'jobs', 'facet', 'lens',
  'agents', 'resources', 'workflows', 'self-host', 'extract', 'parse', 'upload',
  'audit', 'redact', 'render', 'find', 'read', 'search', 'ask', 'chat', 'open', 'auth',
]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
function isFraction(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

function evidenceViolations(e: unknown, scope: string): string[] {
  const v: string[] = [];
  if (e === null || typeof e !== 'object') return [`${scope} must be an object`];
  const p = e as Record<string, unknown>;
  if (typeof p.citation_required !== 'boolean') v.push(`${scope}.citation_required must be a boolean`);
  if (typeof p.bbox_required !== 'boolean') v.push(`${scope}.bbox_required must be a boolean`);
  if (!isFraction(p.confidence_threshold)) v.push(`${scope}.confidence_threshold must be a number in [0,1]`);
  return v;
}

/**
 * Return the list of grammar violations for a candidate manifest (empty = valid).
 * Use as the TDD gate: `expect(contentTypeManifestViolations(m)).toEqual([])`.
 * Enforces P0 required fields, field/type vocabularies, the evidence policy, and
 * that the generated CLI noun / SDK namespace don't shadow a built-in resource.
 */
export function contentTypeManifestViolations(value: unknown): string[] {
  const v: string[] = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return ['manifest is not an object'];
  }
  const m = value as Record<string, unknown>;

  // identity (P0)
  if (!isNonEmptyString(m.id)) v.push('id must be a non-empty string');
  if (!isNonEmptyString(m.label)) v.push('label must be a non-empty string');
  if (!isNonEmptyString(m.version)) v.push('version must be a non-empty string');
  if (m.schema === null || typeof m.schema !== 'object' || Array.isArray(m.schema)) {
    v.push('schema must be a JSON Schema object');
  }

  // fields (P0)
  if (!Array.isArray(m.fields) || m.fields.length === 0) {
    v.push('fields must be a non-empty array');
  } else {
    const seen = new Set<string>();
    m.fields.forEach((f, i) => {
      if (f === null || typeof f !== 'object') {
        v.push(`fields[${i}] must be an object`);
        return;
      }
      const field = f as Record<string, unknown>;
      if (!isNonEmptyString(field.path)) v.push(`fields[${i}].path must be a non-empty string`);
      else if (seen.has(field.path)) v.push(`fields[${i}].path "${field.path}" is duplicated`);
      else seen.add(field.path);
      if (!isNonEmptyString(field.label)) v.push(`fields[${i}].label must be a non-empty string`);
      if (typeof field.type !== 'string' || !FIELD_TYPES.has(field.type)) {
        v.push(`fields[${i}].type must be one of ${[...FIELD_TYPES].join('|')}`);
      }
      if (typeof field.required !== 'boolean') v.push(`fields[${i}].required must be a boolean`);
      if ('repeating' in field && field.repeating !== undefined && typeof field.repeating !== 'boolean') {
        v.push(`fields[${i}].repeating, when present, must be a boolean`);
      }
    });
  }

  // evidence (P0)
  v.push(...evidenceViolations(m.evidence, 'evidence'));

  // extraction (P0)
  if (m.extraction === null || typeof m.extraction !== 'object') {
    v.push('extraction must be an object');
  } else if (!isNonEmptyString((m.extraction as Record<string, unknown>).instructions)) {
    v.push('extraction.instructions must be a non-empty string');
  }

  // export (P1) — when present, formats must be a non-empty subset of the vocab
  if (m.export !== undefined) {
    const formats = (m.export as Record<string, unknown>)?.formats;
    if (!Array.isArray(formats) || formats.length === 0 || !formats.every((f) => EXPORT_FORMATS.has(f as string))) {
      v.push(`export.formats must be a non-empty array of ${[...EXPORT_FORMATS].join('|')}`);
    }
  }

  // generated CLI noun (P0) — must not shadow a built-in resource
  const cli = m.cli as Record<string, unknown> | undefined;
  if (!cli || !isNonEmptyString(cli.noun)) v.push('cli.noun must be a non-empty string');
  else if (RESERVED_NOUNS.has(cli.noun)) v.push(`cli.noun "${cli.noun}" collides with a built-in resource noun`);

  // generated SDK namespace (P0) — must not shadow a built-in resource
  const sdk = m.sdk as Record<string, unknown> | undefined;
  if (!sdk || !isNonEmptyString(sdk.namespace)) v.push('sdk.namespace must be a non-empty string');
  else if (RESERVED_NOUNS.has(sdk.namespace)) v.push(`sdk.namespace "${sdk.namespace}" collides with a built-in resource noun`);

  return v;
}

/** Convenience boolean wrapper around {@link contentTypeManifestViolations}. */
export function isContentTypeManifest(value: unknown): value is ContentTypeManifest {
  return contentTypeManifestViolations(value).length === 0;
}
