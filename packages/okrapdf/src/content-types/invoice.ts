import type { ContentTypeManifest } from './manifest';

/**
 * Canonical `invoice` content-type manifest (W.4.24d.1 / #330).
 *
 * The reference example for the manifest grammar: header fields, repeating
 * `line_items[]`, and `summary` totals, each typed and evidence-bound, with a
 * default evidence policy (citation required), extraction instructions, a P1
 * review config, CSV/XLSX/JSON exports, CLI noun `invoice`, and SDK namespace
 * `invoice`. Validated clean by `manifest.test.ts`.
 *
 * The `schema` mirrors the field set so a generated `okra invoice extract` is
 * exactly `okra extract --schema <this.schema> --cite`.
 */
export const invoiceContentType: ContentTypeManifest = {
  id: 'invoice',
  label: 'Invoice',
  version: '0.1.0',
  schema: {
    type: 'object',
    properties: {
      invoice_no: { type: 'string', description: 'Invoice number / ID printed on the document' },
      invoice_date: { type: 'string', description: 'Issue date as printed (e.g. MM/DD/YYYY)' },
      seller: { type: 'string', description: 'Full seller / vendor name and address' },
      client: { type: 'string', description: 'Full client / buyer name and address' },
      seller_tax_id: { type: 'string' },
      client_tax_id: { type: 'string' },
      iban: { type: 'string' },
      line_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            qty: { type: 'string' },
            net_price: { type: 'string' },
            amount: { type: 'string' },
            vat: { type: 'string' },
          },
        },
      },
      summary: {
        type: 'object',
        properties: {
          total_net_worth: { type: 'string' },
          total_vat: { type: 'string' },
          total_gross_worth: { type: 'string' },
        },
      },
    },
  },
  fields: [
    { path: 'invoice_no', label: 'Invoice #', type: 'string', required: true },
    { path: 'invoice_date', label: 'Date', type: 'date', required: true },
    { path: 'seller', label: 'Seller', type: 'string', required: true },
    { path: 'client', label: 'Client', type: 'string', required: true },
    { path: 'seller_tax_id', label: 'Seller Tax ID', type: 'string', required: false },
    { path: 'client_tax_id', label: 'Client Tax ID', type: 'string', required: false },
    // IBAN is high-stakes and OCR-ambiguous (see the bake-off S/5 homoglyphs) —
    // demand a precise element box, not a page-level fallback.
    { path: 'iban', label: 'IBAN', type: 'string', required: false, evidence: { bbox_required: true } },
    { path: 'line_items', label: 'Line Items', type: 'array', required: true, repeating: true },
    { path: 'line_items[].description', label: 'Description', type: 'string', required: true, repeating: true },
    { path: 'line_items[].qty', label: 'Qty', type: 'number', required: true, repeating: true },
    { path: 'line_items[].amount', label: 'Amount', type: 'money', required: true, repeating: true },
    { path: 'summary.total_gross_worth', label: 'Total', type: 'money', required: true },
  ],
  evidence: {
    citation_required: true,
    bbox_required: false,
    confidence_threshold: 0.7,
  },
  extraction: {
    instructions:
      'Extract the invoice header, every line item, and the summary totals exactly as printed. ' +
      'Preserve the document\'s number formatting (decimal comma vs dot). Do not compute or correct totals.',
    fallback: 'review',
  },
  review: {
    threshold: 0.7,
    commit_policy: 'manual',
    allowed_actions: ['correct', 'approve', 'reject'],
  },
  export: { formats: ['csv', 'xlsx', 'json'] },
  cli: { noun: 'invoice', aliases: ['inv'], default_output: 'json' },
  sdk: { namespace: 'invoice' },
};
