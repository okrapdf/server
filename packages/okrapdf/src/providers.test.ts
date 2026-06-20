import { describe, expect, it } from 'vitest';
import { createOkra, withCache, type OkraProvider } from './providers.js';

const azureDocAI: OkraProvider = {
  name: 'azureDocAI',
  supportedPhases: ['ocr'],
};

const llamaparse: OkraProvider = {
  name: 'llamaparse',
  supportedPhases: ['ocr'],
};

describe('createOkra capability forwarding', () => {
  it('applies provider/middleware capabilities by default on upload', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const fetchMock: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ phase: 'uploading' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = createOkra({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
      providers: { azureDocAI },
      extraction: { ocr: 'azureDocAI' },
      middleware: [withCache({ by: 'pdf-hash' })],
    });

    await client.upload('https://example.com/invoice.pdf', { documentId: 'ocr-cap-test' });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody?.capabilities).toMatchObject({
      phases: {
        ocr: {
          vendor: 'azureDocAI',
          enabled: true,
        },
      },
      middleware: [
        { name: 'cache', strategy: 'pdf-hash' },
      ],
    });
  });

  it('merges per-upload capabilities over defaults', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const fetchMock: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ phase: 'uploading' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = createOkra({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
      providers: { azureDocAI, llamaparse },
      extraction: { ocr: 'azureDocAI' },
      middleware: [withCache({ by: 'pdf-hash' })],
    });

    await client.upload('https://example.com/invoice.pdf', {
      documentId: 'ocr-cap-override',
      capabilities: {
        phases: {
          ocr: {
            vendor: 'llamaparse',
          },
        },
        customFlag: true,
      },
    });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody?.capabilities).toMatchObject({
      phases: {
        ocr: {
          vendor: 'llamaparse',
          enabled: true,
        },
      },
      middleware: [
        { name: 'cache', strategy: 'pdf-hash' },
      ],
      customFlag: true,
    });
  });

  it('supports workflow preset defaults with explicit overrides', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const fetchMock: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ phase: 'uploading' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = createOkra({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
      workflow: {
        preset: 'llamaparse_ocr',
        capabilities: {
          search: true,
        },
      },
    });

    await client.upload('https://example.com/invoice.pdf', { documentId: 'ocr-workflow-preset' });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody?.capabilities).toMatchObject({
      search: true,
      phases: {
        ocr: {
          vendor: 'llamaparse',
          enabled: true,
        },
      },
    });
  });
});
