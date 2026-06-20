import type { ContentTypeManifest } from './manifest';
import { invoiceContentType } from './invoice';
import { receiptContentType } from './receipt';

/**
 * Registry of built-in content types (W.4.24d.2 / #331). The discovery surface
 * (`okra content-types list` / `show`) and, later, the generated `okra <noun>
 * extract` commands read from here. Keyed by `id` (== the generated CLI noun
 * unless `cli.noun` overrides). Today this is the single canonical `invoice`;
 * the codegen ticket extends it.
 */
const BUILTIN_CONTENT_TYPES: Record<string, ContentTypeManifest> = {
  [invoiceContentType.id]: invoiceContentType,
  [receiptContentType.id]: receiptContentType,
};

/** A compact, list-friendly view of a content type (no schema/fields dump). */
export interface ContentTypeSummary {
  id: string;
  label: string;
  version: string;
  cli_noun: string;
  sdk_namespace: string;
  fields: number;
  citation_required: boolean;
}

function summarize(m: ContentTypeManifest): ContentTypeSummary {
  return {
    id: m.id,
    label: m.label,
    version: m.version,
    cli_noun: m.cli.noun,
    sdk_namespace: m.sdk.namespace,
    fields: m.fields.length,
    citation_required: m.evidence.citation_required,
  };
}

/** All registered content types as compact summaries (stable id order). */
export function listContentTypes(): ContentTypeSummary[] {
  return Object.values(BUILTIN_CONTENT_TYPES)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(summarize);
}

/** Resolve a content type by id (or its CLI noun / aliases). Undefined if unknown. */
export function getContentType(idOrNoun: string): ContentTypeManifest | undefined {
  const key = idOrNoun.trim().toLowerCase();
  const direct = BUILTIN_CONTENT_TYPES[key];
  if (direct) return direct;
  return Object.values(BUILTIN_CONTENT_TYPES).find(
    (m) => m.cli.noun === key || (m.cli.aliases ?? []).includes(key),
  );
}
