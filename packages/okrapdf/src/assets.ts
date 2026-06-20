import type {
  DocumentAsset,
  DocumentPluginSpec,
  DocumentPluginState,
  DocumentSpec,
  TocAssetData,
  TocItem,
} from './types';

export function normalizeDocumentPluginState(value: unknown): DocumentPluginState | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const pluginName = asString(raw.plugin_name);
  const desiredSpecVersion = asNumber(raw.desired_spec_version);
  const createdAt = asNumber(raw.created_at);
  const updatedAt = asNumber(raw.updated_at);
  const status = asString(raw.status) as DocumentPluginState['status'] | null;

  if (!pluginName || desiredSpecVersion === null || createdAt === null || updatedAt === null) {
    return null;
  }
  if (!status || !['pending', 'running', 'completed', 'failed'].includes(status)) {
    return null;
  }

  const triggerRaw = asString(raw.trigger);
  const trigger =
    triggerRaw && ['ready', 'config_changed', 'delete'].includes(triggerRaw)
      ? (triggerRaw as DocumentPluginState['trigger'])
      : null;

  return {
    plugin_name: pluginName,
    desired_spec_version: desiredSpecVersion,
    desired_fingerprint: asString(raw.desired_fingerprint),
    applied_spec_version: asNumber(raw.applied_spec_version),
    applied_fingerprint: asString(raw.applied_fingerprint),
    status,
    trigger,
    workflow_id: asString(raw.workflow_id),
    output: asRecord(raw.output),
    error: asString(raw.error),
    last_run_at: asNumber(raw.last_run_at),
    completed_at: asNumber(raw.completed_at),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function normalizeDocumentAsset<T = Record<string, unknown>>(
  pluginState: DocumentPluginState,
): DocumentAsset<T> {
  return {
    assetId: pluginState.plugin_name,
    status: pluginState.status,
    data: normalizeDocumentAssetData(pluginState.plugin_name, pluginState.output) as T | null,
    error: pluginState.error,
    updatedAt: pluginState.updated_at,
    raw: pluginState,
  };
}

export function normalizeDocumentAssets(
  plugins: Iterable<unknown>,
): DocumentAsset[] {
  const assets: DocumentAsset[] = [];
  for (const plugin of plugins) {
    const normalized = normalizeDocumentPluginState(plugin);
    if (!normalized) continue;
    assets.push(normalizeDocumentAsset(normalized));
  }
  return assets.sort((left, right) => left.assetId.localeCompare(right.assetId));
}

export function normalizeDocumentAssetData(
  assetId: string,
  output: Record<string, unknown> | null,
): Record<string, unknown> | TocAssetData | null {
  if (!output) return null;
  if (assetId === 'toc') {
    return normalizeTocAssetOutput(output);
  }
  return output;
}

export function normalizeTocAssetOutput(output: Record<string, unknown>): TocAssetData {
  const rawItems = Array.isArray(output.toc) ? output.toc : [];
  const items: TocItem[] = rawItems
    .map((item, index) => {
      const entry = asRecord(item);
      if (!entry) return null;
      const title = asString(entry.text) ?? asString(entry.title);
      const page = asNumber(entry.page);
      const level = asNumber(entry.level);
      if (!title || page === null || level === null) return null;
      return {
        id: createTocItemId(title, page, index),
        title,
        page,
        level,
      };
    })
    .filter((item): item is TocItem => item !== null);

  return {
    items,
    pageCount: asNumber(output.pageCount) ?? 0,
    generatedAt: asNumber(output.generatedAt) ?? 0,
  };
}

export function assetPluginSpec(assetId: string): DocumentPluginSpec | null {
  if (assetId === 'toc') {
    return { name: 'toc' };
  }
  return null;
}

export function mergeDocumentAssetPlugins(
  spec: DocumentSpec,
  assetIds: Iterable<string>,
): { spec: DocumentSpec; changed: boolean } {
  const nextPlugins = [...spec.plugins];
  const seen = new Set(nextPlugins.map((plugin) => plugin.name));
  let changed = false;

  for (const assetId of assetIds) {
    const plugin = assetPluginSpec(assetId);
    if (!plugin || seen.has(plugin.name)) continue;
    nextPlugins.push(plugin);
    seen.add(plugin.name);
    changed = true;
  }

  if (!changed) {
    return { spec, changed: false };
  }

  return {
    spec: {
      ...spec,
      plugins: nextPlugins,
    },
    changed: true,
  };
}

function createTocItemId(title: string, page: number, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${slug || 'item'}-p${page}-${index}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
