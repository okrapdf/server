import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { mergeDocumentAssetPlugins } from '../assets';
import type { OkraClient } from '../client';
import { createOkra } from '../providers';
import type { DocumentConfigUpdate, DocumentStatus, OkraSession, UploadInput } from '../types';
import type { OkraDocumentStatus, UseOkraDocumentReturn } from './types';

const READY_PHASES = new Set(['complete', 'awaiting_review']);
const DOCUMENT_POLL_MS = 2000;

type ProviderSource =
  | { kind: 'file'; input: UploadInput }
  | { kind: 'url'; input: string }
  | { kind: 'document'; documentId: string };

export interface OkraContextValue extends UseOkraDocumentReturn {
  client: OkraClient;
  apiKey?: string;
  registerAsset: (assetId: string) => void;
}

const OkraContext = createContext<OkraContextValue | null>(null);

type OkraClientAuthProps =
  | {
      client: OkraClient;
      apiKey?: never;
      baseUrl?: never;
    }
  | {
      client?: never;
      apiKey: string;
      baseUrl?: string;
    };

type OkraProviderSourceProps =
  | {
      file: UploadInput;
      url?: never;
      documentId?: never;
      config?: DocumentConfigUpdate;
    }
  | {
      url: string;
      file?: never;
      documentId?: never;
      config?: DocumentConfigUpdate;
    }
  | {
      documentId: string;
      file?: never;
      url?: never;
      config?: never;
    };

export type OkraProviderProps = OkraClientAuthProps &
  OkraProviderSourceProps & {
    children: React.ReactNode;
  };

export function OkraProvider({
  client: providedClient,
  apiKey,
  baseUrl,
  file,
  url,
  documentId,
  config,
  children,
}: OkraProviderProps) {
  validateOkraProviderProps({ providedClient, apiKey, baseUrl, file, url, documentId, config });

  const client = useMemo<OkraClient>(() => {
    if (providedClient) return providedClient;
    return createOkra({ apiKey: apiKey!, baseUrl });
  }, [providedClient, apiKey, baseUrl]);

  const source = useMemo<ProviderSource>(
    () => resolveProviderSource({ file, url, documentId }),
    [file, url, documentId],
  );

  const configKey = useMemo(
    () => JSON.stringify(config ?? null),
    [config],
  );
  const uploadConfig = useMemo(
    () =>
      source.kind === 'document' || configKey === 'null'
        ? undefined
        : (JSON.parse(configKey) as DocumentConfigUpdate),
    [configKey, source.kind],
  );

  const [session, setSession] = useState<OkraSession | null>(null);
  const [status, setStatus] = useState<OkraDocumentStatus>('resolving');
  const [error, setError] = useState<Error | null>(null);
  const [documentStatus, setDocumentStatus] = useState<DocumentStatus | null>(null);
  const [requestedAssets, setRequestedAssets] = useState<string[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const ensuredAssetKeyRef = useRef(new Map<string, string>());

  const registerAsset = useCallback((assetId: string) => {
    const normalized = assetId.trim();
    if (!normalized) return;
    setRequestedAssets((current) =>
      current.includes(normalized) ? current : [...current, normalized],
    );
  }, []);

  const refetch = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    let disposed = false;

    setStatus('resolving');
    setError(null);
    setDocumentStatus(null);

    void (async () => {
      try {
        const nextSession =
          source.kind === 'document'
            ? client.sessions.from(source.documentId)
            : await client.sessions.create(source.input, {
                wait: false,
                upload: uploadConfig ? { config: uploadConfig } : undefined,
              });

        if (disposed) return;
        setSession(nextSession);
        setStatus('ready');
      } catch (err) {
        if (disposed) return;
        setSession(null);
        setDocumentStatus(null);
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
      }
    })();

    return () => {
      disposed = true;
    };
  }, [client, configKey, reloadToken, source, uploadConfig]);

  useEffect(() => {
    let disposed = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (!session) return;

    const poll = async () => {
      try {
        const nextStatus = await session.status();
        if (disposed) return;
        setDocumentStatus(nextStatus);
        if (!READY_PHASES.has(nextStatus.phase)) {
          timeoutId = setTimeout(poll, DOCUMENT_POLL_MS);
        }
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
      }
    };

    void poll();

    return () => {
      disposed = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [session, reloadToken]);

  useEffect(() => {
    let disposed = false;

    if (!session || requestedAssets.length === 0) return;

    const ensuredKey = requestedAssets.slice().sort().join('|');
    if (ensuredAssetKeyRef.current.get(session.id) === ensuredKey) return;

    void (async () => {
      try {
        const current = await client.getConfig(session.id);
        if (disposed) return;
        const merged = mergeDocumentAssetPlugins(current.spec, requestedAssets);
        if (merged.changed) {
          await client.updateConfig(session.id, merged.spec);
          if (disposed) return;
        }
        ensuredAssetKeyRef.current.set(session.id, ensuredKey);
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      disposed = true;
    };
  }, [client, requestedAssets, session]);

  const documentIdValue =
    session?.id ?? (source.kind === 'document' ? source.documentId : null);
  const isReady = documentStatus ? READY_PHASES.has(documentStatus.phase) : false;

  const value = useMemo<OkraContextValue>(
    () => ({
      client,
      apiKey: apiKey ?? undefined,
      session,
      documentId: documentIdValue,
      status,
      error,
      isReady,
      refetch,
      registerAsset,
    }),
    [apiKey, client, documentIdValue, error, isReady, refetch, registerAsset, session, status],
  );

  return createElement(OkraContext.Provider, { value }, children);
}

export function useOkra(): OkraContextValue {
  const ctx = useContext(OkraContext);
  if (!ctx) {
    throw new Error('useOkra must be used within an <OkraProvider>');
  }
  return ctx;
}

export function useOkraDocument(): UseOkraDocumentReturn {
  const { documentId, session, status, error, isReady, refetch } = useOkra();
  return {
    documentId,
    session,
    status,
    error,
    isReady,
    refetch,
  };
}

function validateOkraProviderProps(options: {
  providedClient?: OkraClient;
  apiKey?: string;
  baseUrl?: string;
  file?: UploadInput;
  url?: string;
  documentId?: string;
  config?: DocumentConfigUpdate;
}): void {
  if (options.providedClient && (options.apiKey || options.baseUrl)) {
    throw new Error('OkraProvider accepts either `client` or `apiKey`/`baseUrl`, not both.');
  }
  if (!options.providedClient && !options.apiKey) {
    throw new Error('OkraProvider requires either a `client` or an `apiKey`.');
  }

  const providedSources = [
    options.file !== undefined,
    typeof options.url === 'string' && options.url.trim() !== '',
    typeof options.documentId === 'string' && options.documentId.trim() !== '',
  ].filter(Boolean).length;

  if (providedSources !== 1) {
    throw new Error('OkraProvider requires exactly one of `file`, `url`, or `documentId`.');
  }

  if (
    typeof options.documentId === 'string' &&
    options.documentId.trim() !== '' &&
    options.config !== undefined
  ) {
    throw new Error('OkraProvider only accepts `config` when creating a document from `file` or `url`.');
  }
}

function resolveProviderSource(options: {
  file?: UploadInput;
  url?: string;
  documentId?: string;
}): ProviderSource {
  if (options.file !== undefined) {
    return { kind: 'file', input: options.file };
  }
  if (typeof options.url === 'string' && options.url.trim() !== '') {
    return { kind: 'url', input: options.url.trim() };
  }
  if (typeof options.documentId === 'string' && options.documentId.trim() !== '') {
    return { kind: 'document', documentId: options.documentId.trim() };
  }
  throw new Error('OkraProvider requires exactly one of `file`, `url`, or `documentId`.');
}
