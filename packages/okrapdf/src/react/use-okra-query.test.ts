/** @vitest-environment jsdom */

import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { OkraClient } from '../client.js';
import type { DocumentSpec, OkraSession } from '../types.js';
import { OkraProvider, useOkraDocument } from './provider.js';
import { useDocumentQuery } from './use-document-query.js';
import { clearOkraQueryCache } from './use-okra-query.js';
import { useOkraQuery } from './use-okra-query.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '..', '..', '..', '..');
const reactDom18Dir = resolveReactDom18Dir();
const { createRoot } = (await import(resolve(reactDom18Dir, 'client.js'))) as {
  createRoot: (container: Element) => {
    render: (node: React.ReactNode) => void;
    unmount: () => void;
  };
};
(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

const TocSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      page: z.number(),
      level: z.number(),
    }),
  ),
  pageCount: z.number(),
  generatedAt: z.number(),
});

afterEach(() => {
  cleanup();
  clearOkraQueryCache();
  vi.useRealTimers();
});

describe('OkraProvider + useOkraQuery', () => {
  it('requires exactly one bound document source', async () => {
    const session = makeSession('doc-validation');
    const client = makeClient({ createSession: session.session, fromSession: session.session });
    const file = new File([new Uint8Array([37, 80, 68, 70])], 'report.pdf', { type: 'application/pdf' });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        renderWithProvider(
          { client: client.client } as React.ComponentProps<typeof OkraProvider>,
          React.createElement(DocumentProbe),
        ),
      ).rejects.toThrow('OkraProvider requires exactly one of `file`, `url`, or `documentId`.');

      await expect(
        renderWithProvider(
          { client: client.client, file, documentId: 'doc-validation' } as React.ComponentProps<typeof OkraProvider>,
          React.createElement(DocumentProbe),
        ),
      ).rejects.toThrow('OkraProvider requires exactly one of `file`, `url`, or `documentId`.');
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('resolves file, url, and documentId sources through the bound provider', async () => {
    const fileSession = makeSession('doc-file');
    const fileClient = makeClient({ createSession: fileSession.session, fromSession: fileSession.session });
    const file = new File([new Uint8Array([37, 80, 68, 70])], 'report.pdf', { type: 'application/pdf' });

    await renderWithProvider(
      { client: fileClient.client, file },
      React.createElement(DocumentProbe),
    );

    await waitFor(() => {
      expect(readJson('doc')).toMatchObject({ documentId: 'doc-file', status: 'ready', isReady: true });
    });
    expect(fileClient.createSpy).toHaveBeenCalledWith(file, { wait: false, upload: undefined });

    cleanup();

    const urlSession = makeSession('doc-url');
    const urlClient = makeClient({ createSession: urlSession.session, fromSession: urlSession.session });
    await renderWithProvider(
      { client: urlClient.client, url: 'https://example.com/report.pdf' },
      React.createElement(DocumentProbe),
    );

    await waitFor(() => {
      expect(readJson('doc')).toMatchObject({ documentId: 'doc-url', status: 'ready', isReady: true });
    });
    expect(urlClient.createSpy).toHaveBeenCalledWith('https://example.com/report.pdf', { wait: false, upload: undefined });

    cleanup();

    const attachedSession = makeSession('doc-existing');
    const attachedClient = makeClient({ createSession: attachedSession.session, fromSession: attachedSession.session });
    await renderWithProvider(
      { client: attachedClient.client, documentId: 'doc-existing' },
      React.createElement(DocumentProbe),
    );

    await waitFor(() => {
      expect(readJson('doc')).toMatchObject({ documentId: 'doc-existing', status: 'ready', isReady: true });
    });
    expect(attachedClient.fromSpy).toHaveBeenCalledWith('doc-existing');
    expect(attachedClient.createSpy).not.toHaveBeenCalled();
  });

  it('merges required asset plugins without clobbering the existing document spec', async () => {
    const session = makeSession('doc-merge');
    const existingSpec = makeDocumentSpec({
      access: {
        default_effect: 'deny',
        grants: [
          { principal: { type: 'owner' }, actions: ['admin'] },
          { principal: { type: 'project', id: 'proj_123' }, actions: ['read_content', 'query'] },
        ],
      },
    });
    const client = makeClient({
      createSession: session.session,
      fromSession: session.session,
      configSpec: existingSpec,
    });

    await renderWithProvider(
      { client: client.client, documentId: 'doc-merge' },
      React.createElement(QueryProbe, { pollInterval: 25 }),
    );

    await waitFor(() => {
      expect(client.updateConfigSpy).toHaveBeenCalledTimes(1);
    });

    const mergedSpec = client.updateConfigSpy.mock.calls[0]?.[1] as DocumentSpec;
    expect(mergedSpec.access).toEqual(existingSpec.access);
    expect(mergedSpec.plugins).toEqual([{ name: 'toc' }]);
  });

  it('caches by key and polls pending assets until they complete', async () => {
    vi.useFakeTimers();

    const pendingThenReadySession = makeSession('doc-cache', {
      assetResults: [
        null,
        {
          assetId: 'toc',
          status: 'completed',
          data: {
            items: [{ id: 'intro-p1-0', title: 'Intro', page: 1, level: 1 }],
            pageCount: 5,
            generatedAt: 123,
          },
          error: null,
          updatedAt: 123,
          raw: makePluginState(),
        },
      ],
    });
    const client = makeClient({
      createSession: pendingThenReadySession.session,
      fromSession: pendingThenReadySession.session,
      configSpec: makeDocumentSpec({ plugins: [{ name: 'toc' }] }),
    });

    const firstRender = await renderWithProvider(
      { client: client.client, documentId: 'doc-cache' },
      React.createElement(QueryProbe, { pollInterval: 25 }),
    );

    await waitFor(() => {
      expect(readJson('query').assetStatus).toBe('pending');
    });
    await waitFor(() => {
      expect(pendingThenReadySession.assetSpy).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(30);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(pendingThenReadySession.assetSpy).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(readJson('query')).toMatchObject({
        assetStatus: 'completed',
        data: {
          items: [{ id: 'intro-p1-0', title: 'Intro', page: 1, level: 1 }],
          pageCount: 5,
          generatedAt: 123,
        },
      });
    });

    firstRender.unmount();

    await renderWithProvider(
      { client: client.client, documentId: 'doc-cache' },
      React.createElement(QueryProbe, { pollInterval: 25 }),
    );

    await waitFor(() => {
      expect(readJson('query').assetStatus).toBe('completed');
    });

    expect(pendingThenReadySession.assetSpy).toHaveBeenCalledTimes(2);
  });

  it('surfaces schema validation failures from completed assets', async () => {
    const invalidSession = makeSession('doc-invalid', {
      assetResults: [
        {
          assetId: 'toc',
          status: 'completed',
          data: {
            items: [{ id: 'broken', page: 1, level: 1 }],
            pageCount: 5,
            generatedAt: 123,
          },
          error: null,
          updatedAt: 123,
          raw: makePluginState(),
        },
      ],
    });
    const client = makeClient({
      createSession: invalidSession.session,
      fromSession: invalidSession.session,
      configSpec: makeDocumentSpec({ plugins: [{ name: 'toc' }] }),
    });

    await renderWithProvider(
      { client: client.client, documentId: 'doc-invalid' },
      React.createElement(QueryProbe, { pollInterval: 25 }),
    );

    await waitFor(() => {
      expect(readJson('query').assetStatus).toBe('failed');
      expect(readJson('query').error).toContain('schema validation');
    });
  });

  it('keeps prompt-based useDocumentQuery working with a bound document', async () => {
    const promptSession = makeSession('doc-prompt', {
      promptResult: {
        answer: '',
        data: {
          items: [{ id: 'intro', title: 'Intro', page: 1, level: 1 }],
          pageCount: 1,
          generatedAt: 123,
        },
      },
    });
    const client = makeClient({
      createSession: promptSession.session,
      fromSession: promptSession.session,
    });

    await renderWithProvider(
      { client: client.client, documentId: 'doc-prompt' },
      React.createElement(PromptQueryProbe),
    );

    await waitFor(() => {
      expect(readJson('prompt')).toMatchObject({
        documentId: 'doc-prompt',
        data: {
          items: [{ id: 'intro', title: 'Intro', page: 1, level: 1 }],
          pageCount: 1,
          generatedAt: 123,
        },
      });
    });

    expect(promptSession.promptSpy).toHaveBeenCalledTimes(1);
  });
});

function DocumentProbe() {
  const value = useOkraDocument();
  return React.createElement('pre', { 'data-testid': 'doc' }, JSON.stringify({
    documentId: value.documentId,
    status: value.status,
    isReady: value.isReady,
    error: value.error?.message ?? null,
  }));
}

function QueryProbe(props: { pollInterval: number }) {
  const value = useOkraQuery(TocSchema, {
    asset: 'toc',
    key: 'toc',
    pollInterval: props.pollInterval,
  });

  return React.createElement('pre', { 'data-testid': 'query' }, JSON.stringify({
    data: value.data,
    assetStatus: value.assetStatus,
    error: value.error?.message ?? null,
    isLoading: value.isLoading,
  }));
}

function PromptQueryProbe() {
  const { documentId } = useOkraDocument();
  const query = useDocumentQuery({
    documentId,
    query: 'Read the table of contents',
    schema: TocSchema,
    skip: !documentId,
  });

  return React.createElement('pre', { 'data-testid': 'prompt' }, JSON.stringify({
    documentId,
    data: query.data,
  }));
}

async function renderWithProvider(
  props: React.ComponentProps<typeof OkraProvider>,
  child: React.ReactElement,
) {
  return render(React.createElement(OkraProvider, props, child));
}

function readJson(testId: string) {
  return JSON.parse(getByTestId(testId).textContent || '{}');
}

function makeClient(options: {
  createSession: ReturnType<typeof makeSession>['session'];
  fromSession: ReturnType<typeof makeSession>['session'];
  configSpec?: DocumentSpec;
}) {
  const createSpy = vi.fn(async (..._args: unknown[]) => options.createSession);
  const fromSpy = vi.fn((..._args: unknown[]) => options.fromSession);
  const getConfigSpy = vi.fn(async () => ({
    document_id: options.fromSession.id,
    spec_version: 1,
    spec: options.configSpec ?? makeDocumentSpec(),
  }));
  const updateConfigSpy = vi.fn(async (_documentId: string, spec: DocumentSpec) => ({
    document_id: options.fromSession.id,
    spec_version: 2,
    spec,
    phase: 'complete',
  }));

  return {
    client: {
      sessions: {
        create: createSpy,
        from: fromSpy,
      },
      getConfig: getConfigSpy,
      updateConfig: updateConfigSpy,
    } as unknown as OkraClient,
    createSpy,
    fromSpy,
    getConfigSpy,
    updateConfigSpy,
  };
}

function makeSession(
  id: string,
  options: {
    statusResult?: Record<string, unknown>;
    assetResults?: Array<unknown>;
    promptResult?: Record<string, unknown>;
  } = {},
) {
  const statusSpy = vi.fn(async () => ({
    phase: 'complete',
    ...(options.statusResult ?? {}),
  }));
  const assetQueue = [...(options.assetResults ?? [completedTocAsset()])];
  const assetSpy = vi.fn(async () => {
    if (assetQueue.length === 0) {
      return completedTocAsset();
    }
    return assetQueue.shift();
  });
  const promptSpy = vi.fn(async () => ({
    answer: '',
    ...(options.promptResult ?? { data: completedTocAsset().data }),
  }));

  const session = {
    id,
    modelEndpoint: `https://example.com/${id}`,
    model: undefined,
    state: () => ({ id, modelEndpoint: `https://example.com/${id}` }),
    setModel: async () => undefined,
    status: statusSpy,
    wait: statusSpy,
    pages: async () => [],
    page: async () => ({ page: 1, content: '', blocks: [], entities: [] }),
    entities: async () => ({ nodes: [] }),
    downloadUrl: () => `https://example.com/${id}.pdf`,
    query: async () => ({ rows: [], columns: [] }),
    logs: async () => [],
    publish: async () => ({
      published: true,
      documentId: id,
      version: '1',
      publicUrl: `https://example.com/${id}`,
      url: `https://example.com/${id}`,
      hash: 'hash',
      slug: id,
      canonicalPath: `/documents/${id}`,
    }),
    shareLink: async () => ({
      documentId: id,
      token: 'token',
      tokenHint: 'token',
      links: { markdown: null, pdf: null, completion: null },
      capabilities: { canViewPdf: true },
      role: 'viewer',
      expiresAt: Date.now(),
      maxViews: null,
    }),
    assets: async () => [],
    asset: assetSpy,
    prompt: promptSpy,
    stream: async function* () {},
  } as OkraSession & {
    assetSpy: typeof assetSpy;
    promptSpy: typeof promptSpy;
    statusSpy: typeof statusSpy;
  };

  session.assetSpy = assetSpy;
  session.promptSpy = promptSpy;
  session.statusSpy = statusSpy;
  return { session, assetSpy, promptSpy, statusSpy };
}

function makePluginState() {
  return {
    plugin_name: 'toc',
    desired_spec_version: 1,
    desired_fingerprint: null,
    applied_spec_version: 1,
    applied_fingerprint: null,
    status: 'completed' as const,
    trigger: 'ready' as const,
    workflow_id: 'wf_123',
    output: null,
    error: null,
    last_run_at: 100,
    completed_at: 100,
    created_at: 50,
    updated_at: 100,
  };
}

function completedTocAsset() {
  return {
    assetId: 'toc',
    status: 'completed' as const,
    data: {
      items: [{ id: 'intro-p1-0', title: 'Intro', page: 1, level: 1 }],
      pageCount: 5,
      generatedAt: 123,
    },
    error: null,
    updatedAt: 123,
    raw: makePluginState(),
  };
}

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

type MountedRoot = {
  container: HTMLDivElement;
  root: ReturnType<typeof createRoot>;
};

const mountedRoots = new Set<MountedRoot>();

function resolveReactDom18Dir(): string {
  const pnpmStoreDir = resolve(workspaceRoot, 'node_modules/.pnpm');
  const match = readdirSync(pnpmStoreDir).find((entry) => entry.startsWith('react-dom@18.'));
  if (!match) {
    throw new Error('Unable to resolve react-dom@18 for React hook tests.');
  }
  return resolve(pnpmStoreDir, match, 'node_modules', 'react-dom');
}

async function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });

  const mounted = { container, root };
  mountedRoots.add(mounted);

  return {
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
      mountedRoots.delete(mounted);
    },
  };
}

function cleanup() {
  for (const mounted of [...mountedRoots]) {
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
    mountedRoots.delete(mounted);
  }
  document.body.innerHTML = '';
}

function getByTestId(testId: string): HTMLElement {
  const element = document.querySelector(`[data-testid="${testId}"]`);
  if (!element) {
    throw new Error(`Unable to find element with data-testid="${testId}"`);
  }
  return element as HTMLElement;
}

async function waitFor(assertion: () => void, attempts = 200): Promise<void> {
  let lastError: unknown;

  for (let index = 0; index < attempts; index += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
    }

    await act(async () => {
      await Promise.resolve();
    });
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'waitFor timed out'));
}
