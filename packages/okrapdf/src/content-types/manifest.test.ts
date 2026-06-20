import { describe, expect, it } from 'vitest';
import {
  contentTypeManifestViolations,
  isContentTypeManifest,
  RESERVED_NOUNS,
  type ContentTypeManifest,
} from './manifest';
import { invoiceContentType } from './invoice';
import { receiptContentType } from './receipt';
import { listContentTypes, getContentType } from './registry';

describe('content-type manifest grammar (#330)', () => {
  it('accepts the canonical invoice manifest', () => {
    expect(contentTypeManifestViolations(invoiceContentType)).toEqual([]);
    expect(isContentTypeManifest(invoiceContentType)).toBe(true);
  });

  it('accepts the receipt manifest and registers it as a second content type (#331)', () => {
    expect(contentTypeManifestViolations(receiptContentType)).toEqual([]);
    expect(receiptContentType.cli.noun).toBe('receipt');
    expect(receiptContentType.cli.aliases).toContain('rcpt');
    // The registry is multi-type: both invoice and receipt resolve, no collision.
    const ids = listContentTypes().map((c) => c.id);
    expect(ids).toContain('invoice');
    expect(ids).toContain('receipt');
    expect(getContentType('receipt')).toBe(receiptContentType);
    expect(getContentType('rcpt')).toBe(receiptContentType); // alias resolves
  });

  it('invoice declares the P0 contract (identity + schema + fields + evidence + extraction + generated names)', () => {
    expect(invoiceContentType.id).toBe('invoice');
    expect(invoiceContentType.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(invoiceContentType.evidence.citation_required).toBe(true);
    expect(invoiceContentType.fields.length).toBeGreaterThan(0);
    // The grounding field names match the JSONPath convention used by extract --cite.
    expect(invoiceContentType.fields.some((f) => f.path === 'line_items[].amount')).toBe(true);
    // High-stakes IBAN overrides the default evidence policy to demand a node bbox.
    const iban = invoiceContentType.fields.find((f) => f.path === 'iban');
    expect(iban?.evidence?.bbox_required).toBe(true);
    expect(invoiceContentType.cli.noun).toBe('invoice');
    expect(invoiceContentType.sdk.namespace).toBe('invoice');
  });

  const base = (): ContentTypeManifest => ({
    id: 'receipt',
    label: 'Receipt',
    version: '0.1.0',
    schema: { type: 'object' },
    fields: [{ path: 'total', label: 'Total', type: 'money', required: true }],
    evidence: { citation_required: true, bbox_required: false, confidence_threshold: 0.5 },
    extraction: { instructions: 'Extract the total.' },
    cli: { noun: 'receipt' },
    sdk: { namespace: 'receipt' },
  });

  it('accepts a minimal P0-only manifest (no review/export)', () => {
    expect(contentTypeManifestViolations(base())).toEqual([]);
  });

  it('rejects missing P0 identity fields', () => {
    const m = base();
    delete (m as Record<string, unknown>).version;
    expect(contentTypeManifestViolations(m)).toContain('version must be a non-empty string');
  });

  it('rejects an unknown field type', () => {
    const m = base();
    (m.fields[0] as Record<string, unknown>).type = 'currency';
    expect(contentTypeManifestViolations(m).some((x) => x.startsWith('fields[0].type'))).toBe(true);
  });

  it('rejects a duplicate field path', () => {
    const m = base();
    m.fields.push({ path: 'total', label: 'Total again', type: 'money', required: false });
    expect(contentTypeManifestViolations(m)).toContain('fields[1].path "total" is duplicated');
  });

  it('rejects an out-of-range confidence threshold', () => {
    const m = base();
    m.evidence.confidence_threshold = 1.5;
    expect(contentTypeManifestViolations(m)).toContain('evidence.confidence_threshold must be a number in [0,1]');
  });

  it('rejects an empty fields array', () => {
    const m = base();
    m.fields = [];
    expect(contentTypeManifestViolations(m)).toContain('fields must be a non-empty array');
  });

  it('rejects a bad export format', () => {
    const m = base();
    m.export = { formats: ['pdf' as never] };
    expect(contentTypeManifestViolations(m).some((x) => x.startsWith('export.formats'))).toBe(true);
  });

  it('rejects a generated noun/namespace that shadows a built-in resource', () => {
    const noun = base();
    noun.cli.noun = 'documents';
    expect(contentTypeManifestViolations(noun)).toContain('cli.noun "documents" collides with a built-in resource noun');
    const ns = base();
    ns.sdk.namespace = 'context';
    expect(contentTypeManifestViolations(ns)).toContain('sdk.namespace "context" collides with a built-in resource noun');
    // sanity: the reserved set is what the CLI actually exposes
    expect(RESERVED_NOUNS.has('extract')).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(contentTypeManifestViolations(null)).toEqual(['manifest is not an object']);
    expect(contentTypeManifestViolations([])).toEqual(['manifest is not an object']);
  });
});

describe('@okrapdf/sdk/content-types subpath barrel (#331)', () => {
  it('re-exports the registry, manifest gate, and built-in manifests for a dependency-light import', async () => {
    const barrel = await import('./index');
    expect(typeof barrel.getContentType).toBe('function');
    expect(typeof barrel.listContentTypes).toBe('function');
    expect(typeof barrel.contentTypeManifestViolations).toBe('function');
    expect(barrel.invoiceContentType.id).toBe('invoice');
    expect(barrel.receiptContentType.id).toBe('receipt');
    expect(barrel.listContentTypes().map((c) => c.id).sort()).toEqual(['invoice', 'receipt']);
  });
});

describe('content types are reachable from the SDK public API (#331)', () => {
  it('re-exports getContentType / listContentTypes / invoiceContentType / the manifest gate', async () => {
    const sdk = await import('../index');
    expect(typeof sdk.getContentType).toBe('function');
    expect(typeof sdk.listContentTypes).toBe('function');
    expect(typeof sdk.contentTypeManifestViolations).toBe('function');
    // Resolving by id returns the canonical manifest object.
    expect(sdk.getContentType('invoice')).toBe(sdk.invoiceContentType);
    expect(sdk.listContentTypes().some((c) => c.id === 'invoice')).toBe(true);
    // An SDK user can validate a manifest with the exported gate.
    expect(sdk.contentTypeManifestViolations(sdk.invoiceContentType)).toEqual([]);
  });
});
