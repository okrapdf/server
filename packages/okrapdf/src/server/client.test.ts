import { describe, expect, it, vi } from 'vitest';
import { createOkraServerClient } from './client.js';

describe('createOkraServerClient', () => {
  it('does not require a customer signing key for agent token creation', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          token: 'doc-123.999.signature',
          documentId: 'doc-123',
          expires_in: 3600,
          expires_at: '2026-04-23T22:00:00.000Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const okra = createOkraServerClient({
      apiKey: 'okra_sk_test',
      host: 'https://api.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const token = await okra.documents.createAgentToken('doc-123', { ttlSeconds: 120 });

    expect(token).toEqual({
      token: 'doc-123.999.signature',
      documentId: 'doc-123',
      expiresIn: 3600,
      expiresAt: '2026-04-23T22:00:00.000Z',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/documents/doc-123/agent-token', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer okra_sk_test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttlSeconds: 120 }),
      signal: undefined,
    });
  });

  it('keeps local signing as an explicit advanced path', async () => {
    const okra = createOkraServerClient({
      apiKey: 'okra_sk_test',
      host: 'https://api.example.com',
      fetch: vi.fn() as unknown as typeof fetch,
    });

    expect(() => okra.sign.documentAgentToken('doc-123')).toThrow('requires signingKey');
  });

  it('passes publish config through renders and returns delivery URLs', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const fetchMock = vi.fn(async () =>
      new Response(pdfBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'X-Okra-Render-Id': 'rnd_123',
          'X-Okra-Pdf-Sha256': 'abc123',
          'X-Okra-Pdf-Size': '4',
          'X-Okra-Document-Id': 'doc-r123',
          'X-Okra-Download-Url': 'https://api.example.com/document/doc-r123/download',
          'X-Okra-Publish-Url': 'https://res.okrapdf.com/pdf/upload/v1/doc-r123.pdf',
          'X-Okra-Publish-Base-Url': 'https://res.okrapdf.com/pdf/upload/v1/doc-r123',
          'X-Okra-Publish-Source-Url': 'https://res.okrapdf.com/pdf/upload/v1/doc-r123/source',
          'X-Okra-File-Name': 'brief.pdf',
        },
      }),
    );
    const okra = createOkraServerClient({
      apiKey: 'okra_sk_test',
      host: 'https://api.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await okra.renders.exec({
      code: 'export default async function ({ pdf }) { return pdf.render({ title: "Brief", type: "report", content: [] }); }',
      fileName: 'brief.pdf',
      publish: {
        publicId: 'doc-r123',
        source: {
          includeInput: true,
          includeModules: true,
        },
      },
    });

    expect(result).toMatchObject({
      renderId: 'rnd_123',
      sha256: 'abc123',
      size: 4,
      documentId: 'doc-r123',
      downloadUrl: 'https://api.example.com/document/doc-r123/download',
      publicUrl: 'https://res.okrapdf.com/pdf/upload/v1/doc-r123.pdf',
      publishedUrl: 'https://res.okrapdf.com/pdf/upload/v1/doc-r123.pdf',
      publishBaseUrl: 'https://res.okrapdf.com/pdf/upload/v1/doc-r123',
      sourceUrl: 'https://res.okrapdf.com/pdf/upload/v1/doc-r123/source',
      fileName: 'brief.pdf',
    });
    expect(result.pdfBytes).toEqual(pdfBytes);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/renders?format=pdf', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer okra_sk_test',
        'Content-Type': 'application/json',
        Accept: 'application/pdf',
        'User-Agent': 'okrapdf-sdk-server/0.14.4',
      },
      body: JSON.stringify({
        mode: 'exec',
        code: 'export default async function ({ pdf }) { return pdf.render({ title: "Brief", type: "report", content: [] }); }',
        fileName: 'brief.pdf',
        publish: {
          publicId: 'doc-r123',
          source: {
            includeInput: true,
            includeModules: true,
          },
        },
      }),
      signal: undefined,
    });
  });
});
