import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLens, invokeFacet, listRuns, type FacetCliCtx } from './facet';
import { OkraRuntimeError } from '../../errors';

const ctx: FacetCliCtx = {
  apiKey: 'okra_sk_test',
  baseUrl: 'https://api.okrapdf.com',
};

describe('facet CLI requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves invoke envelopes returned with non-2xx HTTP status for old servers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            run_id: 'fr_error',
            status: 'error',
            duration_ms: 4,
            error: 'Facet returned HTTP 422',
            logs: [],
          },
          { status: 500 },
        ),
      ),
    );

    await expect(invokeFacet(ctx, 'invoice-dedup', { invoice_id: 'inv_1' })).resolves.toMatchObject({
      run_id: 'fr_error',
      status: 'error',
      error: 'Facet returned HTTP 422',
    });
  });

  it('applies lenses through the lens endpoint', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.okrapdf.com/v1/lenses/density/apply');
      expect(init?.body ? JSON.parse(String(init.body)) : null).toEqual({
        document_id: 'doc_123',
        payload: { pages: [] },
        reset: true,
      });
      return Response.json({
        object: 'lens.apply',
        run_id: 'fr_lens',
        status: 'ok',
        duration_ms: 3,
        lens_slug: 'density',
        document_id: 'doc_123',
        annotations: [],
        view: { title: 'Density' },
        state: { runs: 1 },
        cursor: null,
        done: true,
        logs: [],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(applyLens(ctx, 'density', {
      documentId: 'doc_123',
      payload: { pages: [] },
      reset: true,
    })).resolves.toMatchObject({
      object: 'lens.apply',
      run_id: 'fr_lens',
      state: { runs: 1 },
    });
  });

  // A non-2xx WITHOUT the run_id/status:error envelope must throw an
  // OkraRuntimeError carrying the real HTTP status (was a plain Error that
  // collapsed to code:1 / error:"error" in handleError, unlike every other
  // command). Mirrors OkraClient.requestJson. Repro: the live facet-list 500
  // (#663, D1 user_facets missing `kind`).
  it('throws OkraRuntimeError with the HTTP status on a server 500 (was code:1)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'D1_ERROR: no such column: kind' }, { status: 500 }),
      ),
    );
    const err = await listRuns(ctx, 'invoice-dedup').catch((e) => e);
    expect(err).toBeInstanceOf(OkraRuntimeError);
    expect(err.status).toBe(500);
    expect(err.code).toBe('HTTP_ERROR');
    expect(err.message).toContain('no such column: kind');
  });

  it('maps a 401 to the UNAUTHORIZED runtime code (parity with other commands)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'invalid api key' }, { status: 401 })),
    );
    const err = await listRuns(ctx, 'invoice-dedup').catch((e) => e);
    expect(err).toBeInstanceOf(OkraRuntimeError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });
});
