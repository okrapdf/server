import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OkraClient } from './client.js';
import { StructuredOutputError } from './errors.js';
import { createOkra } from './index.js';
import { getDynamicWorkflowExample } from './workflows.js';
import type { DocumentSpec } from './types.js';

function makeDocumentSpec(overrides: Partial<DocumentSpec> = {}): DocumentSpec {
  return {
    version: 1,
    access: {
      default_effect: 'deny',
      grants: [{ principal: { type: 'owner' }, actions: ['admin'] }],
    },
    extract: {
      page_image_strategy: 'cover',
      provider: null,
    },
    features: {
      vlm_qwen: false,
      structural_check: false,
      sandbox_verify: false,
      search: true,
    },
    runtime: {
      self_heal: true,
      workflow_watchdog_timeout_ms: 600000,
      max_auto_reparse: 2,
    },
    agent: {
      agent_id: 'okra/default',
    },
    plugins: [],
    ...overrides,
  };
}

describe('OkraClient runtime client', () => {
  it('createOkra returns an OkraClient with sessions + upload surfaces', () => {
    const okra = createOkra({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
    });

    expect(typeof okra.sessions.create).toBe('function');
    expect(typeof okra.sessions.from).toBe('function');
    expect(typeof okra.upload).toBe('function');
    expect(typeof okra.files.upload).toBe('function');
  });

  it('parses inline PDF bytes through /v1/parse', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toBe('https://worker.example.com/v1/parse');
      expect(init?.method).toBe('POST');
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer test-key');
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return new Response(JSON.stringify({
        id: 'job_abc123',
        object: 'job',
        type: 'parse',
        status: 'queued',
        url: '/v1/jobs/job_abc123',
        request: { parser: 'textlayer' },
        result: null,
        last_error: null,
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      apiKey: 'test-key',
      fetch: fetchMock,
    });

    const result = await client.parse({
      file: new Uint8Array([37, 80, 68, 70]),
      fileName: 'invoice.pdf',
      parser: 'textlayer',
      variant: 'fast-html',
      pages: { from: 1, to: 2 },
      outputs: { html: true, markdown: true },
      publish: { html: true },
      options: { page_range: [1] },
      vendorOptions: { mode: 'fast' },
      metadata: { request_id: 'req_123' },
      schema: {
        type: 'object',
        properties: { total: { type: 'number' } },
      },
    });

    expect(requestBody).toEqual({
      parser: 'textlayer',
      variant: 'fast-html',
      pages: { from: 1, to: 2 },
      outputs: { html: true, markdown: true },
      publish: { html: true },
      options: { page_range: [1] },
      vendor_options: { mode: 'fast' },
      metadata: { request_id: 'req_123' },
      schema: {
        type: 'object',
        properties: { total: { type: 'number' } },
      },
      file: { data: 'JVBERg==' },
      file_name: 'invoice.pdf',
    });
    expect(result.id).toBe('job_abc123');
    expect(result.object).toBe('job');
  });

  it('parses a previously uploaded file id without inlining bytes', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const fetchMock: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        id: 'job_fileid',
        object: 'job',
        type: 'parse',
        status: 'queued',
        request: {
          parser: 'llamaparse',
          file_source: 'file_id',
        },
        result: null,
        last_error: null,
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      apiKey: 'test-key',
      fetch: fetchMock,
    });

    const result = await client.parse({
      fileId: 'doc-file-123',
      parser: {
        id: 'llamaparse',
        variant: 'finance',
        options: { page_separator: true },
        vendorOptions: { parse_mode: 'layout' },
      },
      fileName: 'stored.pdf',
    });

    expect(requestBody).toEqual({
      parser: {
        id: 'llamaparse',
        variant: 'finance',
        options: { page_separator: true },
        vendor_options: { parse_mode: 'layout' },
      },
      file: { id: 'doc-file-123' },
      file_name: 'stored.pdf',
    });
    expect(result.request).toMatchObject({ file_source: 'file_id' });
  });

  it('retrieves and lists jobs through /v1/jobs', async () => {
    const seenUrls: string[] = [];
    const fetchMock: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      seenUrls.push(url);
      if (url.endsWith('/v1/jobs/job_123')) {
        return new Response(JSON.stringify({
          id: 'job_123',
          object: 'job',
          type: 'parse',
          status: 'succeeded',
          result: null,
          last_error: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        object: 'list',
        data: [],
        has_more: false,
        next_cursor: null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      apiKey: 'test-key',
      fetch: fetchMock,
    });

    const job = await client.getJob('job_123');
    const list = await client.listJobs({ type: 'parse', status: 'succeeded', limit: 10 });

    expect(job.id).toBe('job_123');
    expect(list.object).toBe('list');
    expect(seenUrls).toEqual([
      'https://worker.example.com/v1/jobs/job_123',
      'https://worker.example.com/v1/jobs?type=parse&status=succeeded&limit=10',
    ]);
  });

  it('uploads passive PDFs through /v1/files multipart', async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/v1/files');
      expect(init?.method).toBe('POST');

      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer test-key');

      const body = init?.body;
      expect(body).toBeInstanceOf(FormData);
      const file = (body as FormData).get('file');
      expect(file).toBeInstanceOf(File);
      expect((file as File).name).toBe('invoice.pdf');

      return new Response(JSON.stringify({
        id: 'doc-file-multipart',
        file_id: 'doc-file-multipart',
        object: 'file',
        name: 'invoice.pdf',
        mime: 'application/pdf',
        size: 4,
        bytes: 4,
        sha256: 'abc123',
        upload_mode: 'multipart',
        created_at: '2026-04-23T00:00:00.000Z',
        updated_at: '2026-04-23T00:00:00.000Z',
        workflow_bound: false,
        urls: {
          bytes: 'https://worker.example.com/v1/files/doc-file-multipart/bytes',
          document: 'https://worker.example.com/v1/documents/doc-file-multipart',
        },
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      apiKey: 'test-key',
      fetch: fetchMock,
    });

    const file = new File([new Uint8Array([37, 80, 68, 70])], 'invoice.pdf', {
      type: 'application/pdf',
    });
    const uploaded = await client.files.upload(file);

    expect(uploaded.id).toBe('doc-file-multipart');
    expect(uploaded.workflow_bound).toBe(false);
    expect(uploaded.upload_mode).toBe('multipart');
  });

  it('hides presign and finalize behind files.upload for direct uploads', async () => {
    const requests: Array<{ url: string; method?: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      requests.push({ url, method: init?.method });

      if (url === 'https://worker.example.com/v1/files/presign') {
        const body = JSON.parse(String(init?.body));
        expect(body.fileName).toBe('report.pdf');
        expect(body.fileSize).toBe(4);
        expect(body.sha256).toMatch(/^[a-f0-9]{64}$/);
        return new Response(JSON.stringify({
          id: 'doc-file-direct',
          file_id: 'doc-file-direct',
          object: 'file_upload',
          file_name: 'report.pdf',
          r2_key: 'documents/doc-file-direct/original.pdf',
          upload_url: 'https://r2.example.com/upload/doc-file-direct',
          upload_method: 'PUT',
          upload_headers: {
            'Content-Type': 'application/pdf',
            'x-amz-meta-sha256': body.sha256,
          },
          finalize_url: 'https://worker.example.com/v1/files/finalize',
          expires_in: 300,
          max_bytes: 524288000,
          workflow_bound: false,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://r2.example.com/upload/doc-file-direct') {
        const headers = new Headers(init?.headers);
        expect(init?.method).toBe('PUT');
        expect(headers.get('Content-Type')).toBe('application/pdf');
        expect(headers.get('x-amz-meta-sha256')).toMatch(/^[a-f0-9]{64}$/);
        expect(init?.body).toBeInstanceOf(Uint8Array);
        return new Response(null, { status: 200 });
      }

      if (url === 'https://worker.example.com/v1/files/finalize') {
        const body = JSON.parse(String(init?.body));
        expect(body.id).toBe('doc-file-direct');
        expect(body.fileName).toBe('report.pdf');
        expect(body.r2Key).toBe('documents/doc-file-direct/original.pdf');
        expect(body.sha256).toMatch(/^[a-f0-9]{64}$/);
        return new Response(JSON.stringify({
          id: 'doc-file-direct',
          file_id: 'doc-file-direct',
          object: 'file',
          name: 'report.pdf',
          mime: 'application/pdf',
          size: 4,
          bytes: 4,
          sha256: body.sha256,
          upload_mode: 'presigned',
          created_at: '2026-04-23T00:00:00.000Z',
          updated_at: '2026-04-23T00:00:00.000Z',
          workflow_bound: false,
          urls: {
            bytes: 'https://worker.example.com/v1/files/doc-file-direct/bytes',
            document: 'https://worker.example.com/v1/documents/doc-file-direct',
          },
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      apiKey: 'test-key',
      fetch: fetchMock,
    });

    const uploaded = await client.files.upload(
      new Uint8Array([37, 80, 68, 70]),
      { fileName: 'report.pdf', transport: 'direct' },
    );

    expect(uploaded.id).toBe('doc-file-direct');
    expect(uploaded.upload_mode).toBe('presigned');
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST https://worker.example.com/v1/files/presign',
      'PUT https://r2.example.com/upload/doc-file-direct',
      'POST https://worker.example.com/v1/files/finalize',
    ]);
  });

  it('uploads URL sources through /upload-url', async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-test-upload/upload-url');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      expect(body.url).toBe('https://example.com/invoice.pdf');
      return new Response(JSON.stringify({ phase: 'uploading' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const session = await client.upload('https://example.com/invoice.pdf', {
      documentId: 'ocr-test-upload',
    });

    expect(session.id).toBe('ocr-test-upload');
    expect(typeof session.wait).toBe('function');
    expect(typeof session.pages).toBe('function');
  });

  it('passes OpenRedact policy through /upload-url payload', async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-redact-upload/upload-url');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        url: 'https://example.com/sensitive.pdf',
        visibility: 'private',
        redact: {
          pii: {
            preset: 'hipaa',
            patterns: ['SSN', 'EMAIL', 'PHONE_US'],
            includeNames: true,
            includeAddresses: true,
          },
          publicFieldAllowlist: ['Form W-9', 'Part I'],
        },
      });
      return new Response(JSON.stringify({ phase: 'uploading' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const session = await client.upload('https://example.com/sensitive.pdf', {
      documentId: 'ocr-redact-upload',
      redact: {
        pii: {
          preset: 'hipaa',
          patterns: ['SSN', 'EMAIL', 'PHONE_US'],
          includeNames: true,
          includeAddresses: true,
        },
        publicFieldAllowlist: ['Form W-9', 'Part I'],
      },
    });

    expect(session.id).toBe('ocr-redact-upload');
  });

  it('passes document config through /upload-url payload', async () => {
    const spec = makeDocumentSpec({
      plugins: [{ name: 'toc' }],
    });

    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-config-upload/upload-url');
      const body = JSON.parse(String(init?.body));
      expect(body.config).toEqual(spec);
      return new Response(JSON.stringify({ phase: 'uploading' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    await client.upload('https://example.com/spec.pdf', {
      documentId: 'ocr-config-upload',
      config: spec,
    });
  });

  it('uploads browser File objects via binary upload', async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-browser-file/upload');
      expect(init?.method).toBe('POST');

      const headers = new Headers(init?.headers);
      expect(headers.get('Content-Type')).toBe('application/pdf');
      expect(headers.get('X-File-Name')).toBe('invoice.pdf');
      expect(headers.get('Authorization')).toBe('Bearer test-key');

      expect(init?.body).toBeInstanceOf(Uint8Array);
      const body = init?.body as Uint8Array;
      expect(body.length).toBeGreaterThan(0);

      return new Response(JSON.stringify({ phase: 'uploading' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      apiKey: 'test-key',
      fetch: fetchMock,
    });

    const file = new File([new Uint8Array([37, 80, 68, 70])], 'invoice.pdf', {
      type: 'application/pdf',
    });
    const session = await client.upload(file, { documentId: 'ocr-browser-file' });

    expect(session.id).toBe('ocr-browser-file');
    expect(typeof session.wait).toBe('function');
  });

  it('passes document config through X-Document-Config on binary upload', async () => {
    const spec = makeDocumentSpec({
      plugins: [{ name: 'toc' }],
    });

    const fetchMock: typeof fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('X-Document-Config')).toBe(JSON.stringify(spec));
      return new Response(JSON.stringify({ phase: 'uploading' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      apiKey: 'test-key',
      fetch: fetchMock,
    });

    const file = new File([new Uint8Array([37, 80, 68, 70])], 'invoice.pdf', {
      type: 'application/pdf',
    });

    await client.upload(file, {
      documentId: 'ocr-browser-file-config',
      config: spec,
    });
  });

  it('uploads local file paths in Node runtimes', async () => {
    const fixtureDir = await mkdtemp(join(tmpdir(), 'okra-runtime-upload-'));
    const fixturePath = join(fixtureDir, 'local-file.pdf');
    await writeFile(fixturePath, new Uint8Array([37, 80, 68, 70]));

    try {
      const fetchMock: typeof fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        expect(url).toContain('/document/ocr-local-file/upload');
        expect(init?.method).toBe('POST');

        const headers = new Headers(init?.headers);
        expect(headers.get('X-File-Name')).toBe('local-file.pdf');
        expect(headers.get('x-document-agent-secret')).toBe('secret');
        expect(init?.body).toBeInstanceOf(Uint8Array);

        return new Response(JSON.stringify({ phase: 'uploading' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = new OkraClient({
        baseUrl: 'https://worker.example.com',
        sharedSecret: 'secret',
        fetch: fetchMock,
      });

      const session = await client.upload(fixturePath, { documentId: 'ocr-local-file' });
      expect(session.id).toBe('ocr-local-file');
      expect(typeof session.wait).toBe('function');
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('sanitizes Unicode local filenames before sending upload headers', async () => {
    const fixtureDir = await mkdtemp(join(tmpdir(), 'okra-runtime-upload-unicode-'));
    const fixturePath = join(fixtureDir, '盛屯矿业集团股份有限公司2022年年度报告.pdf');
    await writeFile(fixturePath, new Uint8Array([37, 80, 68, 70]));

    try {
      const fetchMock: typeof fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        expect(url).toContain('/document/ocr-unicode-file/upload');
        expect(init?.method).toBe('POST');

        const headers = new Headers(init?.headers);
        expect(headers.get('X-File-Name')).toBe('2022.pdf');
        expect(init?.body).toBeInstanceOf(Uint8Array);

        return new Response(JSON.stringify({ phase: 'uploading' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = new OkraClient({
        baseUrl: 'https://worker.example.com',
        sharedSecret: 'secret',
        fetch: fetchMock,
      });

      const session = await client.upload(fixturePath, { documentId: 'ocr-unicode-file' });
      expect(session.id).toBe('ocr-unicode-file');
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('updates document config via /document/:id/config', async () => {
    const spec = makeDocumentSpec({
      extract: {
        page_image_strategy: 'lazy',
        provider: 'llamaparse',
      },
      plugins: [{ name: 'toc' }],
    });

    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-config-1/config');
      expect(init?.method).toBe('PUT');
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual(spec);
      return new Response(JSON.stringify({ document_id: 'ocr-config-1', spec_version: 2, spec, phase: 'complete', maxPass: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const result = await client.updateConfig('ocr-config-1', spec);

    expect(result.phase).toBe('complete');
    expect(result.spec.plugins).toEqual([{ name: 'toc' }]);
  });

  it('applies workflow override then reparses', async () => {
    const calls: string[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);

      if (url.includes('/document/ocr-workflow-1/config') && init?.method === 'GET') {
        return new Response(
          JSON.stringify({
            document_id: 'ocr-workflow-1',
            spec_version: 1,
            spec: makeDocumentSpec(),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      if (url.includes('/document/ocr-workflow-1/config')) {
        expect(init?.method).toBe('PUT');
        const body = JSON.parse(String(init?.body));
        expect(body.extract.provider).toBe('llamaparse');
        return new Response(JSON.stringify({ phase: 'complete', maxPass: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/document/ocr-workflow-1/reparse?strategy=textlayer')) {
        expect(init?.method).toBe('POST');
        return new Response(JSON.stringify({ message: 'Reparse triggered', phase: 'parsing' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not found', { status: 404 });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const result = await client.applyWorkflow('ocr-workflow-1', {
      capabilities: {
        phases: { ocr: { vendor: 'llamaparse', enabled: true } },
      },
      strategy: 'textlayer',
    });

    expect(result.config.phase).toBe('complete');
    expect(result.reparse?.phase).toBe('parsing');
    expect(calls).toHaveLength(3);
  });

  it('creates dynamic workflow eval plans through /v1/workflows dry runs', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toBe('https://worker.example.com/v1/workflows');
      expect(init?.method).toBe('POST');
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return new Response(JSON.stringify({
        id: 'parsebench-chart-numeric-eval',
        object: 'workflow',
        workflow_id: 'parsebench-chart-numeric-eval',
        name: 'ParseBench chart numeric eval',
        run: null,
        created_at: '2026-06-08T00:00:00.000Z',
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      apiKey: 'test-key',
      fetch: fetchMock,
    });
    const example = getDynamicWorkflowExample('parsebench_chart_numeric_eval')!;
    const result = await client.workflows.run(example.definition, {
      dryRun: true,
      metadata: { source: 'unit-test' },
    });

    expect(requestBody).toMatchObject({
      name: 'ParseBench chart numeric eval',
      definition: {
        code: expect.stringContaining('label: "scoped_vlm_extract"'),
      },
      run: false,
      inputs: {
        workflow: {
          object: 'okra.dynamic_workflow',
          version: '2026-06-08',
          id: 'parsebench-chart-numeric-eval',
        },
        dry_run: true,
        metadata: { source: 'unit-test' },
      },
    });
    expect(requestBody).not.toHaveProperty('params');
    expect(result.id).toBe('parsebench-chart-numeric-eval');
    expect(result.status).toBe('planned');
    expect(result.object).toBe('workflow_plan');
  });

  it('starts dynamic workflow eval runs through /v1/workflows params', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toBe('https://worker.example.com/v1/workflows');
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return new Response(JSON.stringify({
        id: 'parsebench-chart-numeric-eval',
        object: 'workflow',
        workflow_id: 'parsebench-chart-numeric-eval',
        run: {
          object: 'run',
          id: 'run_123',
          run_id: 'run_123',
          workflow_id: 'parsebench-chart-numeric-eval',
          status: 'completed',
          status_url: '/v1/runs/run_123',
        },
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      apiKey: 'test-key',
      fetch: fetchMock,
    });
    const example = getDynamicWorkflowExample('parsebench_chart_numeric_eval')!;
    const result = await client.workflows.run(example.definition, {
      inputs: { item_limit: 2 },
    });

    expect(requestBody).toMatchObject({
      run: true,
      params: {
        inputs: { item_limit: 2 },
        dry_run: false,
      },
    });
    expect(requestBody).not.toHaveProperty('inputs');
    expect(result.id).toBe('run_123');
    expect(result.status).toBe('succeeded');
    expect(result.workflowId).toBe('parsebench-chart-numeric-eval');
  });

  it('reads normalized document assets from plugin state in status', async () => {
    const fetchMock: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/doc-asset-1/status');
      return new Response(
        JSON.stringify({
          phase: 'complete',
          plugins: [
            {
              plugin_name: 'toc',
              desired_spec_version: 1,
              desired_fingerprint: null,
              applied_spec_version: 1,
              applied_fingerprint: null,
              status: 'completed',
              trigger: 'ready',
              workflow_id: 'wf_123',
              output: {
                toc: [
                  { text: 'Introduction', page: 1, level: 1 },
                  { text: 'Risk Factors', page: 12, level: 1 },
                ],
                pageCount: 20,
                generatedAt: 1712345678,
              },
              error: null,
              last_run_at: 1712345000,
              completed_at: 1712345678,
              created_at: 1712344000,
              updated_at: 1712345678,
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const session = client.sessions.from('doc-asset-1');
    const asset = await session.asset('toc');

    expect(asset?.status).toBe('completed');
    expect(asset?.data).toEqual({
      items: [
        { id: 'introduction-p1-0', title: 'Introduction', page: 1, level: 1 },
        { id: 'risk-factors-p12-1', title: 'Risk Factors', page: 12, level: 1 },
      ],
      pageCount: 20,
      generatedAt: 1712345678,
    });
  });

  it('gets and sets API key workflow defaults', async () => {
    let putBody: Record<string, unknown> | null = null;
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/v1/key-workflow');

      if (init?.method === 'GET') {
        return new Response(
          JSON.stringify({
            key_id: 'key_123',
            user_id: 'user_123',
            default_capabilities: null,
            created_at: null,
            updated_at: null,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      if (init?.method === 'PUT') {
        putBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            key_id: 'key_123',
            user_id: 'user_123',
            default_capabilities: (putBody as { default_capabilities: unknown })
              .default_capabilities,
            created_at: '2026-03-05T00:00:00.000Z',
            updated_at: '2026-03-05T00:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      return new Response('Method not allowed', { status: 405 });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const before = await client.getKeyWorkflow();
    expect(before.default_capabilities).toBeNull();

    const after = await client.setKeyWorkflow({
      phases: { ocr: { vendor: 'llamaparse', enabled: true } },
    });

    expect(putBody).toMatchObject({
      default_capabilities: {
        phases: { ocr: { vendor: 'llamaparse', enabled: true } },
      },
    });
    expect(after.default_capabilities).toMatchObject({
      phases: { ocr: { vendor: 'llamaparse', enabled: true } },
    });
  });

  it('returns typed structured output via generate({ schema }) with opt-in grounded citations', async () => {
    let sentHeaders: Record<string, string> = {};
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-123/chat/completions');
      sentHeaders = Object.fromEntries(new Headers(init?.headers).entries());
      return new Response(
        JSON.stringify({
          id: 'chatcmpl_123',
          choices: [
            {
              message: {
                content: JSON.stringify({ vendor: 'Acme', invoiceNumber: 'INV-001', total: 42 }),
              },
            },
          ],
          meta: {
            confidence: 1,
            model: 'kimi-k2p5',
            durationMs: 12,
            // #505: opt-in Anthropic-shaped grounded citations.
            citations: [
              {
                type: 'page_location',
                field: 'vendor',
                cited_text: 'Acme',
                start_page_number: 2,
                end_page_number: 2,
                bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 },
                block_id: 'node_vendor',
                match: 'exact',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const schema = z.object({
      vendor: z.string(),
      invoiceNumber: z.string(),
      total: z.number(),
    });

    const result = await client.generate('ocr-123', 'Extract invoice fields', { schema, cite: true });

    expect(result.data!.vendor).toBe('Acme');
    expect(result.data!.total).toBe(42);
    // cite:true sends the opt-in header and surfaces the Anthropic-shaped citations.
    expect(sentHeaders['x-okra-cite']).toBe('true');
    expect(result.meta?.citations).toEqual([
      {
        type: 'page_location',
        field: 'vendor',
        cited_text: 'Acme',
        start_page_number: 2,
        end_page_number: 2,
        bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 },
        block_id: 'node_vendor',
        match: 'exact',
      },
    ]);
  });

  it('maps structured-output API errors to StructuredOutputError', async () => {
    const fetchMock: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          code: 'SCHEMA_VALIDATION_FAILED',
          message: 'Structured output failed schema validation',
          details: [{ path: '$.total', message: 'expected number' }],
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    await expect(
      client.generate('ocr-123', 'Extract total', {
        schema: { type: 'object', properties: { total: { type: 'number' } }, required: ['total'] },
      }),
    ).rejects.toMatchObject({
      name: 'StructuredOutputError',
      code: 'SCHEMA_VALIDATION_FAILED',
      status: 422,
    });
  });

  it('surfaces nested server error payloads for structured extraction', async () => {
    const fetchMock: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Structured output timed out',
            type: 'server_error',
            details: { timeoutMs: 45000 },
          },
        }),
        { status: 504, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    await expect(
      client.generate('ocr-123', 'Extract total', {
        schema: { type: 'object', properties: { total: { type: 'number' } }, required: ['total'] },
      }),
    ).rejects.toMatchObject({
      name: 'OkraRuntimeError',
      status: 504,
      message: 'Structured output timed out',
      details: { timeoutMs: 45000 },
    });
  });

  it('retries transient structured-output timeout errors', async () => {
    let calls = 0;
    const fetchMock: typeof fetch = async () => {
      calls += 1;

      if (calls < 3) {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Structured output timed out',
              details: { timeoutMs: 45000 },
            },
          }),
          { status: 504, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          id: 'chatcmpl_123',
          choices: [
            {
              message: {
                content: JSON.stringify({ vendor: 'Acme', invoiceNumber: 'INV-001', total: 42 }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const schema = z.object({
      vendor: z.string(),
      invoiceNumber: z.string(),
      total: z.number(),
    });

    const result = await client.generate('ocr-123', 'Extract invoice fields', { schema });

    expect(calls).toBe(3);
    expect(result.data).toMatchObject({ vendor: 'Acme', total: 42 });
  });

  it('starts invoice extraction workflow runs', async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toBe('https://worker.example.com/v1/workflows/invoice-extraction/runs');
      expect(init?.method).toBe('POST');

      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer test-key');

      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        table_id: 'tbl_invoice',
        quality: 'high',
        inputs: [{ file_id: 'doc_invoice' }],
      });

      return new Response(
        JSON.stringify({
          id: 'sess_invoice',
          run_id: 'sess_invoice',
          object: 'run',
          status: 'running',
          workflow_name: 'invoice-extraction',
          workflow_label: 'Invoice extraction',
          workflow_version: 1,
          quality: 'high',
          table_id: 'tbl_invoice',
          agent_id: 'agent_invoice',
          inputs: [{ file_id: 'doc_invoice' }],
          events_url: 'https://worker.example.com/v1/sessions/sess_invoice/turns',
          stream_url: 'https://worker.example.com/v1/sessions/sess_invoice/stream',
          rows_url: 'https://worker.example.com/v1/tables/tbl_invoice/rows',
          exports: {
            csv_url:
              'https://worker.example.com/v1/workflows/invoice-extraction/runs/sess_invoice/results.csv',
            json_url:
              'https://worker.example.com/v1/workflows/invoice-extraction/runs/sess_invoice/results.json',
            xml_url:
              'https://worker.example.com/v1/workflows/invoice-extraction/runs/sess_invoice/results.xml',
            xlsx_url:
              'https://worker.example.com/v1/workflows/invoice-extraction/runs/sess_invoice/results.xlsx',
          },
          created_at: '2026-04-26T00:00:00.000Z',
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      apiKey: 'test-key',
      fetch: fetchMock,
    });

    const run = await client.runInvoiceExtraction({
      tableId: 'tbl_invoice',
      quality: 'high',
      inputs: ['doc_invoice'],
    });

    expect(run).toMatchObject({
      runId: 'sess_invoice',
      workflowName: 'invoice-extraction',
      quality: 'high',
      tableId: 'tbl_invoice',
      inputs: [{ fileId: 'doc_invoice' }],
      exports: {
        csvUrl:
          'https://worker.example.com/v1/workflows/invoice-extraction/runs/sess_invoice/results.csv',
        jsonUrl:
          'https://worker.example.com/v1/workflows/invoice-extraction/runs/sess_invoice/results.json',
        xmlUrl:
          'https://worker.example.com/v1/workflows/invoice-extraction/runs/sess_invoice/results.xml',
        xlsxUrl:
          'https://worker.example.com/v1/workflows/invoice-extraction/runs/sess_invoice/results.xlsx',
      },
    });
  });

  it('lists invoice extraction runs and exceptions', async () => {
    const calls: string[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/v1/workflows/invoice-extraction/runs?limit=5')) {
        return new Response(
          JSON.stringify({
            object: 'list',
            data: [
              {
                id: 'sess_invoice',
                run_id: 'sess_invoice',
                object: 'run',
                status: 'idle',
                workflow_name: 'invoice-extraction',
                workflow_label: 'Invoice extraction',
                workflow_version: 1,
                quality: 'balanced',
                table_id: 'tbl_invoice',
                inputs: [{ file_id: 'doc_invoice' }],
                events_url: 'https://worker.example.com/v1/sessions/sess_invoice/turns',
                stream_url: 'https://worker.example.com/v1/sessions/sess_invoice/stream',
                rows_url: 'https://worker.example.com/v1/tables/tbl_invoice/rows',
                exports: {
                  csv_url:
                    'https://worker.example.com/v1/workflows/invoice-extraction/runs/sess_invoice/results.csv',
                  json_url:
                    'https://worker.example.com/v1/workflows/invoice-extraction/runs/sess_invoice/results.json',
                },
                created_at: '2026-04-26T00:00:00.000Z',
              },
            ],
            has_more: false,
            next_cursor: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/v1/workflows/invoice-extraction/runs/sess_invoice/exceptions')) {
        return new Response(
          JSON.stringify({
            object: 'list',
            data: [
              {
                id: 'iex_1',
                object: 'invoice_exception',
                run_id: 'sess_invoice',
                table_id: 'tbl_invoice',
                row_id: 'row_1',
                file_id: 'doc_invoice',
                field: 'invoice_number',
                code: 'missing_required_field',
                severity: 'error',
                status: 'open',
                message: 'invoice_number is required but missing.',
                created_at: '2026-04-26T00:00:00.000Z',
              },
            ],
            has_more: false,
            next_cursor: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (
        url.endsWith(
          '/v1/workflows/invoice-extraction/runs/sess_invoice/exceptions/iex_1/resolve',
        )
      ) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          row_id: 'row_1',
          field: 'invoice_number',
          value: 'INV-001',
        });
        return new Response(
          JSON.stringify({
            object: 'invoice_exception_resolution',
            id: 'iex_1',
            run_id: 'sess_invoice',
            table_id: 'tbl_invoice',
            row_id: 'row_1',
            status: 'resolved',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      apiKey: 'test-key',
      fetch: fetchMock,
    });

    const runs = await client.listInvoiceExtractionRuns({ limit: 5 });
    const exceptions = await client.listInvoiceExtractionExceptions('sess_invoice');
    const resolution = await client.resolveInvoiceExtractionException(
      'sess_invoice',
      'iex_1',
      {
        rowId: 'row_1',
        field: 'invoice_number',
        value: 'INV-001',
      },
    );

    expect(runs.data[0].runId).toBe('sess_invoice');
    expect(runs.hasMore).toBe(false);
    expect(exceptions.data[0]).toMatchObject({
      runId: 'sess_invoice',
      field: 'invoice_number',
      code: 'missing_required_field',
    });
    expect(resolution).toMatchObject({
      id: 'iex_1',
      runId: 'sess_invoice',
      tableId: 'tbl_invoice',
      rowId: 'row_1',
      status: 'resolved',
    });
    expect(calls).toEqual([
      'GET https://worker.example.com/v1/workflows/invoice-extraction/runs?limit=5',
      'GET https://worker.example.com/v1/workflows/invoice-extraction/runs/sess_invoice/exceptions',
      'POST https://worker.example.com/v1/workflows/invoice-extraction/runs/sess_invoice/exceptions/iex_1/resolve',
    ]);
  });

  it('waits until document reaches complete phase', async () => {
    let calls = 0;
    const fetchMock: typeof fetch = async () => {
      calls++;
      const phase = calls < 2 ? 'parsing' : 'complete';
      return new Response(JSON.stringify({ phase }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const status = await client.wait('ocr-123', { pollIntervalMs: 1, timeoutMs: 100 });
    expect(status.phase).toBe('complete');
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('returns modelEndpoint URL', () => {
    const client = new OkraClient({
      baseUrl: 'https://api.okrapdf.com',
      sharedSecret: 'secret',
    });

    expect(client.modelEndpoint('ocr-abc123')).toBe(
      'https://api.okrapdf.com/document/ocr-abc123',
    );
  });

  it('generates plain Q&A answer', async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-456/chat/completions');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      expect(body.messages).toEqual([{ role: 'user', content: 'What was revenue?' }]);
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: 1234567890,
          model: 'kimi-k2p5',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Revenue was $42M' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const result = await client.generate('ocr-456', 'What was revenue?');
    expect(result.answer).toBe('Revenue was $42M');
  });

  it('creates session handles and binds model for prompt/stream calls', async () => {
    const completionBodies: Array<Record<string, unknown>> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/document/ocr-session-1/upload-url')) {
        return new Response(JSON.stringify({ phase: 'uploading' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/document/ocr-session-1/chat/completions')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        completionBodies.push(body);

        if (body.stream !== true) {
          return new Response(
            JSON.stringify({
              id: 'chatcmpl-1',
              object: 'chat.completion',
              created: 1234567890,
              model: 'kimi-k2p5',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'Revenue is $42M' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        // SSE streaming response
        return new Response(
          `data: ${JSON.stringify({ id: 'chatcmpl-2', object: 'chat.completion.chunk', created: 1234567890, model: 'kimi-k2p5', choices: [{ index: 0, delta: { content: '- Summary bullet' }, finish_reason: null }] })}\n\n` +
            `data: ${JSON.stringify({ id: 'chatcmpl-2', object: 'chat.completion.chunk', created: 1234567890, model: 'kimi-k2p5', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n` +
            `data: [DONE]\n\n`,
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const session = await client.sessions.create('https://example.com/report.pdf', {
      wait: false,
      model: 'kimi-k2p5',
      upload: { documentId: 'ocr-session-1' },
    });

    expect(session.state()).toEqual({
      id: 'ocr-session-1',
      model: 'kimi-k2p5',
      modelEndpoint: 'https://worker.example.com/document/ocr-session-1',
    });

    const first = await session.prompt('What is total revenue?');
    expect(first.answer).toBe('Revenue is $42M');

    const events: Array<Record<string, unknown>> = [];
    for await (const event of session.stream('Summarize in 3 bullets', { maxSteps: 0 })) {
      events.push(event);
    }
    expect(events).toMatchObject([
      { type: 'text_delta', text: '- Summary bullet' },
      { type: 'done', answer: '- Summary bullet' },
    ]);

    await session.setModel('other-model');
    await session.prompt('Use new model');

    expect(completionBodies[0]).toMatchObject({
      messages: [{ role: 'user', content: 'What is total revenue?' }],
      model: 'kimi-k2p5',
    });
    expect(completionBodies[1]).toMatchObject({
      messages: [{ role: 'user', content: 'Summarize in 3 bullets' }],
      model: 'kimi-k2p5',
      stream: true,
      max_steps: 0,
    });
    expect(completionBodies[2]).toMatchObject({
      messages: [{ role: 'user', content: 'Use new model' }],
      model: 'other-model',
    });
  });

  it('hydrates a session from document ID without re-uploading', async () => {
    let uploadCalls = 0;
    let completionCalls = 0;
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/upload-url') || url.includes('/upload')) {
        uploadCalls += 1;
      }

      if (url.includes('/document/ocr-existing/chat/completions')) {
        completionCalls += 1;
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.model).toBe('kimi-k2p5');
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-existing',
            object: 'chat.completion',
            created: 1234567890,
            model: 'kimi-k2p5',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'This is an existing document.' },
                finish_reason: 'stop',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const session = client.sessions.from('ocr-existing', { model: 'kimi-k2p5' });
    const result = await session.prompt('What is this?');

    expect(result.answer).toBe('This is an existing document.');
    expect(uploadCalls).toBe(0);
    expect(completionCalls).toBe(1);
  });

  it('follows session flow: upload-url -> status poll -> completion', async () => {
    const requestLog: Array<{
      method: string;
      path: string;
      body?: Record<string, unknown>;
    }> = [];
    let statusCalls = 0;

    const fetchMock: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const method = init?.method || 'GET';
      const bodyText = typeof init?.body === 'string' ? init.body : null;
      const body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : undefined;
      requestLog.push({ method, path: url.pathname, body });

      if (url.pathname === '/document/ocr-curl-shape/upload-url') {
        return new Response(JSON.stringify({ phase: 'uploading' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/document/ocr-curl-shape/status') {
        statusCalls += 1;
        const phase = statusCalls < 2 ? 'parsing' : 'complete';
        return new Response(JSON.stringify({ phase, pagesTotal: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/document/ocr-curl-shape/chat/completions') {
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-curl',
            object: 'chat.completion',
            created: 1234567890,
            model: 'kimi-k2p5',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Revenue is $42M' },
                finish_reason: 'stop',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      throw new Error(`Unexpected URL: ${url.toString()}`);
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const session = await client.sessions.create('https://example.com/report.pdf', {
      model: 'kimi-k2p5',
      upload: { documentId: 'ocr-curl-shape' },
      waitOptions: { pollIntervalMs: 1, timeoutMs: 100 },
    });

    const result = await session.prompt('What is revenue?');
    expect(result.answer).toBe('Revenue is $42M');
    expect(statusCalls).toBe(2);

    expect(requestLog[0]).toMatchObject({
      method: 'POST',
      path: '/document/ocr-curl-shape/upload-url',
      body: {
        url: 'https://example.com/report.pdf',
        visibility: 'private',
      },
    });
    expect(requestLog[1]).toMatchObject({
      method: 'GET',
      path: '/document/ocr-curl-shape/status',
    });
    expect(requestLog[2]).toMatchObject({
      method: 'GET',
      path: '/document/ocr-curl-shape/status',
    });
    expect(requestLog[3]).toMatchObject({
      method: 'POST',
      path: '/document/ocr-curl-shape/chat/completions',
      body: {
        messages: [{ role: 'user', content: 'What is revenue?' }],
        model: 'kimi-k2p5',
      },
    });
  });

  // TODO: [v0.15.0] Add v1 fallback test when API supports /v1/documents/:id/* rewrites

  it('passes share-link response through from API', async () => {
    const fetchMock: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          documentId: 'ocr-789',
          token: 'tok_test',
          tokenHint: 'tok_***',
          links: {
            markdown: 'https://view.okrapdf.com/s/sig_abc123/q4-report.md',
            pdf: 'https://view.okrapdf.com/s/sig_abc123/q4-report.pdf',
            completion: null,
          },
          capabilities: { canViewPdf: true },
          role: 'viewer',
          expiresAt: 1_700_000_000_000,
          maxViews: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const result = await client.shareLink('ocr-789', { role: 'viewer' });
    expect(result.links).toEqual({
      markdown: 'https://view.okrapdf.com/s/sig_abc123/q4-report.md',
      pdf: 'https://view.okrapdf.com/s/sig_abc123/q4-report.pdf',
      completion: null,
    });
    expect(result.capabilities).toEqual({ canViewPdf: true });
  });

  it('handles ask-role share links with completion URL', async () => {
    const fetchMock: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          documentId: 'ocr-ask',
          token: 'tok_ask',
          tokenHint: 'tok_***',
          links: {
            markdown: 'https://view.okrapdf.com/s/sig_ask123/report.md',
            pdf: 'https://view.okrapdf.com/s/sig_ask123/report.pdf',
            completion: 'https://api.okrapdf.com/document/ocr-ask/completion?token=tok_ask',
          },
          capabilities: { canViewPdf: true },
          role: 'ask',
          expiresAt: 1_700_000_000_000,
          maxViews: 100,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const result = await client.shareLink('ocr-ask', { role: 'ask' });
    expect(result.links).toEqual({
      markdown: 'https://view.okrapdf.com/s/sig_ask123/report.md',
      pdf: 'https://view.okrapdf.com/s/sig_ask123/report.pdf',
      completion: 'https://api.okrapdf.com/document/ocr-ask/completion?token=tok_ask',
    });
    expect(result.capabilities).toEqual({ canViewPdf: true });
  });

  it('sends admin role when creating share links', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/document/ocr-admin/share-link');
      expect(init?.method).toBe('POST');
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          documentId: 'ocr-admin',
          token: 'tok_admin',
          tokenHint: 'tok_***',
          links: {
            markdown: 'https://view.okrapdf.com/s/sig_admin456/financials.md',
            pdf: 'https://view.okrapdf.com/s/sig_admin456/financials.pdf',
            completion: null,
          },
          capabilities: { canViewPdf: true },
          role: 'admin',
          expiresAt: 1_700_000_000_000,
          maxViews: 100,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OkraClient({
      baseUrl: 'https://worker.example.com',
      sharedSecret: 'secret',
      fetch: fetchMock,
    });

    const result = await client.shareLink('ocr-admin', {
      role: 'admin',
      expiresInMs: 3_600_000,
      maxViews: 100,
    });

    expect(requestBody).toEqual({
      role: 'admin',
      label: undefined,
      expiresInMs: 3_600_000,
      maxViews: 100,
    });
    expect(result.role).toBe('admin');
    expect(result.links.markdown).toBe('https://view.okrapdf.com/s/sig_admin456/financials.md');
    expect(result.links.pdf).toBe('https://view.okrapdf.com/s/sig_admin456/financials.pdf');
  });
});
