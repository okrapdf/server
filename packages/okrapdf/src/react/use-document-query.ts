import { useState, useEffect, useRef, useCallback } from 'react';
import type { GenerateResult, StructuredSchema } from '../types';
import { useOkra } from './provider';

// ---------------------------------------------------------------------------
// In-memory cache — shared across all useDocumentQuery instances
// Key: documentId + query + schema hash
// ---------------------------------------------------------------------------

interface CacheEntry<T = unknown> {
  result: GenerateResult<T>;
  timestamp: number;
}

const DEFAULT_CACHE_TIME = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

function cacheKey(documentId: string, query: string, schema?: unknown): string {
  const schemaStr = schema ? JSON.stringify(schema) : '';
  return `${documentId}::${query}::${schemaStr}`;
}

function getCached<T>(key: string, cacheTime: number): GenerateResult<T> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > cacheTime) {
    cache.delete(key);
    return null;
  }
  return entry.result as GenerateResult<T>;
}

function setCache<T>(key: string, result: GenerateResult<T>): void {
  cache.set(key, { result, timestamp: Date.now() });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseDocumentQueryOptions<T = undefined> {
  /** Document ID (e.g. "doc-xxx" or "ocr-xxx") */
  documentId: string | null;
  /** The query/prompt to run against the document */
  query: string;
  /** JSON schema or Zod schema for structured output */
  schema?: StructuredSchema<T>;
  /** Skip the query (e.g. while waiting for doc to be ready) */
  skip?: boolean;
  /** Model override */
  model?: string;
  /** Timeout in ms */
  timeoutMs?: number;
  /** How long cached results stay valid in ms (default: 300000 / 5 min) */
  cacheTime?: number;
}

export interface UseDocumentQueryReturn<T = undefined> {
  data: T | null;
  result: GenerateResult<T> | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Run a one-shot query against a document, optionally with structured output.
 * Results are cached in-memory for `cacheTime` ms (default 5 min).
 *
 * ```tsx
 * const { data } = useDocumentQuery({
 *   documentId: "doc-xxx",
 *   query: "Generate 4 chat suggestions",
 *   schema: z.object({ suggestions: z.array(z.object({ id: z.string(), text: z.string() })) }),
 *   skip: !isReady,
 * })
 * ```
 */
export function useDocumentQuery<T = undefined>(
  options: UseDocumentQueryOptions<T>,
): UseDocumentQueryReturn<T> {
  const { client } = useOkra();
  const {
    documentId,
    query,
    schema,
    skip = false,
    model,
    timeoutMs,
    cacheTime = DEFAULT_CACHE_TIME,
  } = options;

  const key = documentId ? cacheKey(documentId, query, schema) : '';
  const cached = key ? getCached<T>(key, cacheTime) : null;

  const [result, setResult] = useState<GenerateResult<T> | null>(cached);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);

  const doFetch = useCallback(async (bypassCache = false) => {
    if (!documentId || !query.trim() || skip) return;

    // Check cache unless explicitly bypassing (refetch)
    if (!bypassCache) {
      const hit = getCached<T>(key, cacheTime);
      if (hit) {
        setResult(hit);
        setError(null);
        setIsLoading(false);
        return;
      }
    }

    const fetchId = ++fetchIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const session = client.sessions.from(documentId);
      const res = schema
        ? await session.prompt<T>(query, { schema, model, timeoutMs, signal: controller.signal } as any)
        : await session.prompt(query, { model, timeoutMs, signal: controller.signal });

      if (fetchId !== fetchIdRef.current) return;
      const typed = res as GenerateResult<T>;
      setCache(key, typed);
      setResult(typed);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (fetchId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [client, documentId, query, schema, skip, model, timeoutMs, key, cacheTime]);

  useEffect(() => {
    doFetch();
    return () => { abortRef.current?.abort(); };
  }, [doFetch]);

  const data = result?.data ?? null;

  return {
    data,
    result,
    isLoading,
    error,
    refetch: () => doFetch(true),
  };
}
