import { useState, useEffect, useRef, useCallback } from 'react';
import type { OkraSession, Page } from '../types';
import { useOkra } from './provider';

export interface UsePagesOptions {
  /** Skip fetching (default: true) */
  enabled?: boolean;
}

export interface UsePagesReturn {
  data: Page[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch all pages for a document.
 *
 * ```tsx
 * const { data: pages, isLoading } = usePages(session);
 * // or with a document ID
 * const { data: pages } = usePages('doc-abc123');
 * ```
 */
export function usePages(
  sessionOrId: OkraSession | string | null,
  options: UsePagesOptions = {},
): UsePagesReturn {
  const { enabled = true } = options;
  const { client } = useOkra();

  const [data, setData] = useState<Page[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const session = typeof sessionOrId === 'string'
    ? client.sessions.from(sessionOrId)
    : sessionOrId;
  const docId = session?.id ?? null;

  const fetchPages = useCallback(async () => {
    if (!session || !enabled) return;
    try {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setIsLoading(true);
      const result = await session.pages({ signal: ac.signal });
      setData(result);
      setError(null);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [session, enabled]);

  // Reset on doc change
  useEffect(() => {
    setData([]);
    setError(null);
  }, [docId]);

  useEffect(() => {
    fetchPages();
    return () => abortRef.current?.abort();
  }, [fetchPages]);

  return { data, isLoading, error, refetch: fetchPages };
}
