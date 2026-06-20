import type { ContentTypeManifest } from './manifest';

/**
 * `receipt` content-type manifest (#331) — the second built-in typed contract,
 * for the same finance/AP ICP as `invoice`. Merchant + date + totals/tax +
 * payment method + repeating line items, each typed and evidence-bound. Validated
 * clean by `manifest.test.ts`; auto-surfaced as `okra receipt extract`,
 * `okra extract --content-type receipt`, and `okra content-types show receipt`.
 */
export const receiptContentType: ContentTypeManifest = {
  id: 'receipt',
  label: 'Receipt',
  version: '0.1.0',
  schema: {
    type: 'object',
    properties: {
      merchant: { type: 'string', description: 'Merchant / store name as printed' },
      date: { type: 'string', description: 'Transaction date as printed' },
      currency: { type: 'string', description: 'Currency symbol or code if shown' },
      payment_method: { type: 'string', description: 'How it was paid (cash, card, last-4, …)' },
      line_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            qty: { type: 'string' },
            amount: { type: 'string' },
          },
        },
      },
      subtotal: { type: 'string', description: 'Subtotal before tax' },
      tax: { type: 'string', description: 'Tax amount' },
      total: { type: 'string', description: 'Grand total paid' },
    },
  },
  fields: [
    { path: 'merchant', label: 'Merchant', type: 'string', required: true },
    { path: 'date', label: 'Date', type: 'date', required: true },
    { path: 'currency', label: 'Currency', type: 'string', required: false },
    { path: 'payment_method', label: 'Payment Method', type: 'string', required: false },
    { path: 'line_items', label: 'Line Items', type: 'array', required: false, repeating: true },
    { path: 'line_items[].description', label: 'Description', type: 'string', required: true, repeating: true },
    { path: 'line_items[].amount', label: 'Amount', type: 'money', required: true, repeating: true },
    { path: 'subtotal', label: 'Subtotal', type: 'money', required: false },
    { path: 'tax', label: 'Tax', type: 'money', required: false },
    { path: 'total', label: 'Total', type: 'money', required: true },
  ],
  evidence: {
    citation_required: true,
    bbox_required: false,
    confidence_threshold: 0.7,
  },
  extraction: {
    instructions:
      'Extract the merchant, transaction date, every line item, the subtotal/tax, the grand total, and the payment method exactly as printed on the receipt. ' +
      'Preserve the printed number formatting. Do not compute or correct totals.',
    fallback: 'review',
  },
  review: {
    threshold: 0.7,
    commit_policy: 'manual',
    allowed_actions: ['correct', 'approve', 'reject'],
  },
  export: { formats: ['csv', 'xlsx', 'json'] },
  cli: { noun: 'receipt', aliases: ['rcpt'], default_output: 'json' },
  sdk: { namespace: 'receipt' },
};
