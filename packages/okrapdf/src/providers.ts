import type { OkraClientOptions, ProcessingCapabilities } from './types';
import { OkraClient } from './client';
import { workflowPreset, type WorkflowPresetName } from './workflows';

export type ExtractionPhase = 'ocr' | 'enhance' | 'metadata' | 'verify';

export interface OkraProvider {
  name: string;
  supportedPhases: ExtractionPhase[];
}

export interface OkraMiddleware {
  name: string;
  config: Record<string, unknown>;
}

export interface CreateOkraOptions extends OkraClientOptions {
  providers?: Record<string, OkraProvider>;
  extraction?: Partial<Record<ExtractionPhase, string>>;
  middleware?: OkraMiddleware[];
  /** Legacy default BYOK keys (prefer `workflow.vendorKeys`). */
  vendorKeys?: Record<string, string>;
  /** General workflow defaults for all uploads from this client. */
  workflow?: {
    preset?: WorkflowPresetName;
    capabilities?: ProcessingCapabilities;
    vendorKeys?: Record<string, string>;
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = merged[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      merged[key] = deepMerge(existing, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * Factory function — AI SDK-style provider abstraction.
 *
 * ```ts
 * import { createOkra } from 'okrapdf';
 *
 * const okra = createOkra({
 *   apiKey: 'okra_...',
 *   providers: { azureDocAI },
 *   extraction: { ocr: 'azureDocAI' },
 * });
 * ```
 */
export function createOkra(options: CreateOkraOptions): OkraClient {
  if (options.extraction && options.providers) {
    for (const [phase, providerName] of Object.entries(options.extraction)) {
      if (!options.providers[providerName]) {
        throw new Error(
          `Extraction phase '${phase}' references provider '${providerName}' which is not registered. ` +
          `Available: ${Object.keys(options.providers).join(', ')}`,
        );
      }
    }
  }

  let capabilities: Record<string, unknown> = options.workflow?.preset
    ? (workflowPreset(options.workflow.preset) as Record<string, unknown>)
    : {};
  if (options.extraction) {
    const phases = (capabilities.phases && isPlainObject(capabilities.phases))
      ? { ...(capabilities.phases as Record<string, unknown>) }
      : {};
    for (const [phase, providerName] of Object.entries(options.extraction)) {
      phases[phase] = {
        vendor: providerName,
        enabled: true,
      };
    }
    capabilities.phases = phases;
  }

  if (options.middleware) {
    capabilities.middleware = options.middleware.map((m) => ({
      name: m.name,
      ...m.config,
    }));
  }
  if (options.workflow?.capabilities) {
    capabilities = deepMerge(capabilities, options.workflow.capabilities as Record<string, unknown>);
  }

  const client = new OkraClient({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    sharedSecret: options.sharedSecret,
    fetch: options.fetch,
  });

  const defaultVendorKeys = options.workflow?.vendorKeys ?? options.vendorKeys;
  const hasDefaults = Object.keys(capabilities).length > 0 || defaultVendorKeys;
  if (hasDefaults) {
    const upload = client.upload.bind(client);
    client.upload = ((input: Parameters<OkraClient['upload']>[0], uploadOptions: Parameters<OkraClient['upload']>[1] = {}) =>
      upload(input, {
        ...uploadOptions,
        capabilities: uploadOptions.capabilities
          ? deepMerge(capabilities, uploadOptions.capabilities)
          : Object.keys(capabilities).length > 0
            ? capabilities
            : uploadOptions.capabilities,
        vendorKeys: uploadOptions.vendorKeys
          ? { ...defaultVendorKeys, ...uploadOptions.vendorKeys }
          : defaultVendorKeys,
      })) as OkraClient['upload'];
  }

  return client;
}

// ─── Built-in middleware constructors ──────────────────────────────────────

export function withCache(opts: { by: 'pdf-hash' | 'content-hash' }): OkraMiddleware {
  return { name: 'cache', config: { strategy: opts.by } };
}

export function withQualityScore(opts: { threshold: number }): OkraMiddleware {
  return { name: 'quality-score', config: { threshold: opts.threshold } };
}

export function withSecret(namespace: string, opts?: { required?: boolean }): OkraMiddleware {
  return {
    name: 'secret',
    config: { namespace, required: opts?.required !== false },
  };
}
