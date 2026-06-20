import { describe, expect, it } from 'vitest';
import {
  mergeDocumentAssetPlugins,
  normalizeDocumentAsset,
  normalizeDocumentPluginState,
  normalizeTocAssetOutput,
} from './assets.js';
import type { DocumentPluginState, DocumentSpec } from './types.js';

function makeSpec(): DocumentSpec {
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
  };
}

describe('document asset helpers', () => {
  it('normalizes toc plugin output into the public toc asset shape', () => {
    expect(
      normalizeTocAssetOutput({
        toc: [
          { text: 'Introduction', page: 1, level: 1 },
          { text: 'Financial Overview', page: 3, level: 2 },
        ],
        pageCount: 12,
        generatedAt: 1712345678,
      }),
    ).toEqual({
      items: [
        { id: 'introduction-p1-0', title: 'Introduction', page: 1, level: 1 },
        { id: 'financial-overview-p3-1', title: 'Financial Overview', page: 3, level: 2 },
      ],
      pageCount: 12,
      generatedAt: 1712345678,
    });
  });

  it('normalizes plugin state rows and wraps them as document assets', () => {
    const plugin = normalizeDocumentPluginState({
      plugin_name: 'toc',
      desired_spec_version: 1,
      desired_fingerprint: null,
      applied_spec_version: 1,
      applied_fingerprint: null,
      status: 'completed',
      trigger: 'ready',
      workflow_id: 'wf_123',
      output: {
        toc: [{ text: 'Introduction', page: 1, level: 1 }],
        pageCount: 8,
        generatedAt: 1712345678,
      },
      error: null,
      last_run_at: 1712345000,
      completed_at: 1712345678,
      created_at: 1712344000,
      updated_at: 1712345678,
    }) as DocumentPluginState;

    expect(normalizeDocumentAsset(plugin)).toEqual({
      assetId: 'toc',
      status: 'completed',
      data: {
        items: [{ id: 'introduction-p1-0', title: 'Introduction', page: 1, level: 1 }],
        pageCount: 8,
        generatedAt: 1712345678,
      },
      error: null,
      updatedAt: 1712345678,
      raw: plugin,
    });
  });

  it('merges required asset plugins without clobbering the existing document spec', () => {
    const original = {
      ...makeSpec(),
      access: {
        default_effect: 'deny' as const,
        grants: [
          { principal: { type: 'owner' as const }, actions: ['admin'] },
          { principal: { type: 'project' as const, id: 'proj_123' }, actions: ['read_content', 'query'] },
        ],
      },
    };

    const merged = mergeDocumentAssetPlugins(original, ['toc']);

    expect(merged.changed).toBe(true);
    expect(merged.spec.access).toEqual(original.access);
    expect(merged.spec.plugins).toEqual([{ name: 'toc' }]);
  });
});
