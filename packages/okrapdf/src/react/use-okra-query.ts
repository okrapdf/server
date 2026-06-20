import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentAssetStatus, StructuredSchema } from '../types';
import { validateStructuredData, structuredSchemaCacheKey } from '../structured-schema';
import { useOkra, useOkraDocument } from './provider';

interface CacheEntry<T> {
  assetStatus: DocumentAssetStatus;
  data: T | null;
  timestamp: number;
}

const DEFAULT_STALE_TIME = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL = 2000;
const assetCache = new Map<string, CacheEntry<unknown>>();

export interface UseOkraQueryOptions {
  asset: string;
  key?: string;
  enabled?: boolean;
  pollInterval?: number;
  staleTime?: number;
}

export interface UseOkraQueryReturn<T> {
  data: T | null;
  assetStatus: DocumentAssetStatus;
  error: Error | null;
  isLoading: boolean;
  refetch: () => void;
}

export function useOkraQuery<T>(
  schema: StructuredSchema<T>,
  options: UseOkraQueryOptions,
): UseOkraQueryReturn<T> {
  const { registerAsset } = useOkra();
  const { documentId, session, status: providerStatus, error: documentError } = useOkraDocument();
  const { asset, key, enabled = true, pollInterval = DEFAULT_POLL_INTERVAL, staleTime = DEFAULT_STALE_TIME } = options;
  const [data, setData] = useState<T | null>(null);
  const [assetStatus, setAssetStatus] = useState<DocumentAssetStatus>('pending');
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);

  const schemaKey = useMemo(() => structuredSchemaCacheKey(schema), [schema]);
  const cacheKey = documentId
    ? `${documentId}::${asset}::${key ?? asset}::${schemaKey}`
    : '';

  useEffect(() => {
    if (!enabled || !asset.trim()) return;
    registerAsset(asset);
  }, [asset, enabled, registerAsset]);

  useEffect(() => {
    if (cacheKey) {
      const cached = assetCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp <= staleTime) {
        setData(cached.data as T | null);
        setAssetStatus(cached.assetStatus);
        setError(null);
      }
    }
  }, [cacheKey, staleTime]);

  useEffect(() => {
    if (!enabled) return;

    if (documentError) {
      setError(documentError);
      setAssetStatus('failed');
      return;
    }

    if (!session || !documentId) {
      setAssetStatus('pending');
      return;
    }

    let disposed = false;

    const run = async () => {
      const fetchId = ++fetchIdRef.current;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (cacheKey) {
        const cached = assetCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp <= staleTime) {
          if (disposed || fetchId !== fetchIdRef.current) return;
          setData(cached.data as T | null);
          setAssetStatus(cached.assetStatus);
          setError(null);
          return;
        }
      }

      try {
        setError(null);
        const result = await session.asset<T>(asset);
        if (disposed || fetchId !== fetchIdRef.current) return;

        if (!result) {
          setAssetStatus('pending');
          timeoutRef.current = setTimeout(run, pollInterval);
          return;
        }

        if (result.status === 'completed') {
          const parsed = validateStructuredData(schema, result.data);
          if (!parsed.success) {
            setData(null);
            setAssetStatus('failed');
            setError(new Error(`Asset "${asset}" failed schema validation: ${parsed.issues.join('; ')}`));
            return;
          }

          setData(parsed.data);
          setAssetStatus('completed');
          if (cacheKey) {
            assetCache.set(cacheKey, {
              assetStatus: 'completed',
              data: parsed.data,
              timestamp: Date.now(),
            });
          }
          return;
        }

        if (result.status === 'failed') {
          setData(null);
          setAssetStatus('failed');
          setError(new Error(result.error || `Asset "${asset}" failed.`));
          return;
        }

        setData(null);
        setAssetStatus(result.status);
        timeoutRef.current = setTimeout(run, pollInterval);
      } catch (err) {
        if (disposed || fetchId !== fetchIdRef.current) return;
        setData(null);
        setAssetStatus('failed');
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    void run();

    return () => {
      disposed = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [
    asset,
    cacheKey,
    documentError,
    documentId,
    enabled,
    pollInterval,
    reloadToken,
    schema,
    session,
    staleTime,
  ]);

  return {
    data,
    assetStatus,
    error,
    isLoading:
      enabled &&
      !error &&
      (providerStatus === 'resolving' || assetStatus === 'pending' || assetStatus === 'running'),
    refetch: () => {
      if (cacheKey) assetCache.delete(cacheKey);
      setReloadToken((current) => current + 1);
    },
  };
}

export function clearOkraQueryCache(): void {
  assetCache.clear();
}
