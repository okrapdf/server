import { describe, expect, it } from 'vitest';
import { handleRequest, type WorkerEnv } from './worker.js';

function makeFetcher() {
  const forwardedUrls: string[] = [];
  const env: WorkerEnv = {
    DOCUMENT_AGENT: {
      idFromName: (name: string) => ({ toString: () => name }),
      get: () => ({
        fetch: async (request: Request) => {
          forwardedUrls.push(request.url);
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      }),
    },
  };

  return {
    fetcher: handleRequest(env),
    forwardedUrls,
  };
}

describe('runtime worker URL alias normalization', () => {
  it('normalizes canonical image extension path to page image endpoint', async () => {
    const { fetcher, forwardedUrls } = makeFetcher();
    const response = await fetcher(
      new Request('https://worker.example.com/v1/documents/ocr-abc123/pages/1/image.png?fit=contain'),
    );

    expect(response.status).toBe(200);
    expect(forwardedUrls).toHaveLength(1);
    expect(forwardedUrls[0]).toBe('https://worker.example.com/document/ocr-abc123/pages/1/image?fit=contain');
  });

  it('normalizes thumbnail-style page alias to page image endpoint', async () => {
    const { fetcher, forwardedUrls } = makeFetcher();
    const response = await fetcher(
      new Request('https://worker.example.com/v1/documents/ocr-abc123/pages/1/f1040_ab12cd.png'),
    );

    expect(response.status).toBe(200);
    expect(forwardedUrls).toHaveLength(1);
    expect(forwardedUrls[0]).toBe('https://worker.example.com/document/ocr-abc123/pages/1/image');
  });

  it('strips filename+token mime alias before forwarding to DO', async () => {
    const { fetcher, forwardedUrls } = makeFetcher();
    const response = await fetcher(
      new Request('https://worker.example.com/v1/documents/ocr-abc123/pages/quarterly-report_ab12cd.json?view=full'),
    );

    expect(response.status).toBe(200);
    expect(forwardedUrls).toHaveLength(1);
    expect(forwardedUrls[0]).toBe('https://worker.example.com/document/ocr-abc123/pages?view=full');
  });

  it('strips marker alias form "/_/{name}_{hint}.ext" before forwarding', async () => {
    const { fetcher, forwardedUrls } = makeFetcher();
    const response = await fetcher(
      new Request('https://worker.example.com/v1/documents/ocr-abc123/pages/1/markdown/_/quarterly-report_ab12cd.md'),
    );

    expect(response.status).toBe(200);
    expect(forwardedUrls).toHaveLength(1);
    expect(forwardedUrls[0]).toBe('https://worker.example.com/document/ocr-abc123/pages/1/markdown');
  });

  it('treats /t_{provider} as a router-only segment and strips it before forwarding', async () => {
    const { fetcher, forwardedUrls } = makeFetcher();
    const response = await fetcher(
      new Request('https://worker.example.com/v1/documents/ocr-abc123/t_llamaparse/pages/2/markdown'),
    );

    expect(response.status).toBe(200);
    expect(forwardedUrls).toHaveLength(1);
    expect(forwardedUrls[0]).toBe('https://worker.example.com/document/ocr-abc123/pages/2/markdown');
  });

  it('handles provider segment plus filename alias without extra DO calls', async () => {
    const { fetcher, forwardedUrls } = makeFetcher();
    const response = await fetcher(
      new Request('https://worker.example.com/v1/documents/ocr-abc123/t_docling/pages/1/markdown/report_xyz789.md?view=full'),
    );

    expect(response.status).toBe(200);
    expect(forwardedUrls).toHaveLength(1);
    expect(forwardedUrls[0]).toBe('https://worker.example.com/document/ocr-abc123/pages/1/markdown?view=full');
  });

  it('maps provider-only doc URLs back to the default status subpath', async () => {
    const { fetcher, forwardedUrls } = makeFetcher();
    const response = await fetcher(
      new Request('https://worker.example.com/v1/documents/ocr-abc123/t_unstructured?format=html'),
    );

    expect(response.status).toBe(200);
    expect(forwardedUrls).toHaveLength(1);
    expect(forwardedUrls[0]).toBe('https://worker.example.com/document/ocr-abc123/status?format=html');
  });
});
