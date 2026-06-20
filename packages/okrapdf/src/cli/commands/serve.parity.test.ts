import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { createSelfHostApp, handleSelfHostRuntimeRequest } from './serve.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const selfHostExampleRoot = join(repoRoot, 'runtime');
// Single source of truth for the cloud API surface: the generator the hosted
// Worker serves from getApiResourceCatalog(). We parse the source so this test
// re-derives parity from the LIVE cloud catalog instead of a hand-copied list.
const cloudCatalogSource = join(
  repoRoot,
  'apps/api/packages/server/src/http/routes/resource-routes.ts',
);

function canonicalPath(path: string): string {
  return path
    .replace(/\{[^}]+\}/g, ':p') // cloud {document_id} -> :p
    .replace(/:[A-Za-z0-9_]+/g, ':p'); // hono :id -> :p
}

function sig(method: string, path: string): string {
  return `${method.toUpperCase()} ${canonicalPath(path)}`;
}

/** Every {method, path} operation declared in the cloud resource catalog. */
function cloudRouteSignatures(): Set<string> {
  const src = readFileSync(cloudCatalogSource, 'utf8');
  const re = /method:\s*'([A-Z]+)',\s*path:\s*'([^']+)'/g;
  const sigs = new Set<string>();
  for (const match of src.matchAll(re)) {
    sigs.add(sig(match[1], match[2]));
  }
  return sigs;
}

/** The /v1 routes the self-host Hono app actually registers. */
function selfHostV1Signatures(): Set<string> {
  const app = createSelfHostApp({ bundleDir: selfHostExampleRoot, env: {} });
  const sigs = new Set<string>();
  for (const route of app.routes) {
    if (!route.path.startsWith('/v1/')) continue;
    if (route.method === 'ALL') continue; // middleware, not a leaf route
    sigs.add(sig(route.method, route.path));
  }
  return sigs;
}

// Self-host-only runtime surface the cloud has no equivalent for. Every entry
// is a CONSCIOUS extension of the resource model, not silent drift: runtime
// introspection, the engine/capability registry, and the document-graph
// projections that ARE the self-host's representation of the `documents`
// resource. Anything here is exempt from cloud-signature parity.
const SELF_HOST_EXTENSIONS = new Set(
  [
    'GET /v1/self-host/status',
    'GET /v1/runtime/manifest',
    'GET /v1/capabilities',
    'GET /v1/capability-runs/:p',
    'GET /v1/documents/:p/graph',
    'GET /v1/documents/:p/status',
    'GET /v1/documents/:p/pages',
    'GET /v1/documents/:p/nodes',
    'GET /v1/documents/:p/reviews',
    'GET /v1/documents/:p/findings',
    'GET /v1/documents/:p/redactions',
    // n8n ingest bridge — backs the n8n recipe, not a cloud noun. Flagged as a
    // fold-into-/v1/workflows candidate, kept for now.
    'POST /v1/sources/n8n',
  ].map((s) => sig(s.split(' ')[0], s.split(' ')[1])),
);

// Confusing self-host-only duplicates the cloud does NOT serve. These return
// 410 Gone with a successor pointer instead of silently shadowing a canonical
// resource route.
const DEPRECATED = new Map<string, string>([
  [sig('GET', '/v1/recipes'), '/v1/workflows/catalog'],
]);

describe('self-host ↔ cloud route parity', () => {
  it('serves at least the core cloud-parity resource routes', () => {
    const cloud = cloudRouteSignatures();
    const selfHost = selfHostV1Signatures();
    const parity = [...selfHost].filter(
      (s) => cloud.has(s) && !DEPRECATED.has(s),
    );
    // The routes the self-host genuinely shares with the cloud catalog.
    expect(parity).toEqual(
      expect.arrayContaining([
        sig('GET', '/v1/workflows/catalog'),
        sig('POST', '/v1/workflows'),
        sig('GET', '/v1/runs/:p'),
        sig('GET', '/v1/documents/:p/full.md'),
      ]),
    );
  });

  it('never exposes a /v1 route that silently diverges from the cloud catalog', () => {
    const cloud = cloudRouteSignatures();
    const selfHost = selfHostV1Signatures();
    const divergent = [...selfHost].filter(
      (s) => !cloud.has(s) && !SELF_HOST_EXTENSIONS.has(s) && !DEPRECATED.has(s),
    );
    // Every self-host /v1 route must be one of: a cloud-catalog route, a
    // declared self-host extension, or an explicitly deprecated alias. A new
    // route that fits none of these fails here until it's classified.
    expect(divergent).toEqual([]);
  });

  it('every declared cloud-parity route matches a real cloud-catalog signature', () => {
    const cloud = cloudRouteSignatures();
    const selfHost = selfHostV1Signatures();
    for (const s of selfHost) {
      if (SELF_HOST_EXTENSIONS.has(s) || DEPRECATED.has(s)) continue;
      expect(cloud, `${s} must exist in the cloud resource catalog`).toContain(s);
    }
  });

  it('deprecates confusing self-host-only aliases with 410 + successor pointer', async () => {
    for (const [signature, successor] of DEPRECATED) {
      const [method, path] = signature.split(' ');
      const response = await handleSelfHostRuntimeRequest(
        new Request(`http://localhost${path.replace(/:p/g, 'x')}`, { method }),
        { bundleDir: selfHostExampleRoot, env: {} },
      );
      expect(response.status, `${signature} should be Gone`).toBe(410);
      expect(response.headers.get('deprecation')).toBe('true');
      expect(response.headers.get('link') ?? '').toContain(successor);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ object: 'error', code: 'GONE', successor });
    }
  });

  it('still serves the canonical successor of every deprecated alias', async () => {
    for (const successor of DEPRECATED.values()) {
      const response = await handleSelfHostRuntimeRequest(
        new Request(`http://localhost${successor}`),
        { bundleDir: selfHostExampleRoot, env: {} },
      );
      expect(response.status, `${successor} should still work`).toBe(200);
    }
  });
});
