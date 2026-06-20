import { describe, expect, it } from 'vitest';
import { signDocumentAgentToken, verifyDocumentAgentToken } from './sign.js';

describe('DocumentAgent server token signing', () => {
  it('binds tokens to a document id', async () => {
    const token = await signDocumentAgentToken('secret', {
      docId: 'doc-one',
      ttlSeconds: 60,
      nowSeconds: 100,
    });

    await expect(verifyDocumentAgentToken('secret', token, 'doc-one', { nowSeconds: 120 }))
      .resolves
      .toMatchObject({ valid: true, docId: 'doc-one' });
    await expect(verifyDocumentAgentToken('secret', token, 'doc-two', { nowSeconds: 120 }))
      .resolves
      .toMatchObject({ valid: false, error: 'Token document mismatch' });
  });

  it('rejects tampered tokens', async () => {
    const token = await signDocumentAgentToken('secret', {
      docId: 'doc-one',
      ttlSeconds: 60,
      nowSeconds: 100,
    });
    const tampered = token.replace('doc-one', 'doc-two');

    await expect(verifyDocumentAgentToken('secret', tampered, 'doc-two', { nowSeconds: 120 }))
      .resolves
      .toMatchObject({ valid: false, error: 'Invalid signature' });
  });

  it('rejects expired tokens', async () => {
    const token = await signDocumentAgentToken('secret', {
      docId: 'doc-one',
      ttlSeconds: 10,
      nowSeconds: 100,
    });

    await expect(verifyDocumentAgentToken('secret', token, 'doc-one', { nowSeconds: 171 }))
      .resolves
      .toMatchObject({ valid: false, error: 'Token expired' });
  });

  it('accepts a previous signing key during rotation', async () => {
    const token = await signDocumentAgentToken('old-secret', {
      docId: 'doc-one',
      ttlSeconds: 60,
      nowSeconds: 100,
    });

    await expect(verifyDocumentAgentToken(['new-secret', 'old-secret'], token, 'doc-one', { nowSeconds: 120 }))
      .resolves
      .toMatchObject({ valid: true });
  });
});
