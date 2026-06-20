import { useState, useEffect, useRef, useCallback } from 'react';
import type { OkraSession, Page } from '../types';
import { useOkra } from './provider';

export interface UsePageContentOptions {
  /** Poll interval while content not yet ready (default: 3000). 0 to disable. */
  pollInterval?: number;
}

export interface UsePageContentReturn {
  data: Page | null;
  content: string;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch a single page's content (markdown + blocks + entities).
 * Polls until content arrives if the page is still processing.
 *
 * ```tsx
 * const { content, data, isLoading } = usePageContent(session, 1);
 * ```
 */
export function usePageContent(
  sessionOrId: OkraSession | string | null,
  pageNumber: number,
  options: UsePageContentOptions = {},
): UsePageContentReturn {
  const { pollInterval = 3000 } = options;
  const { client } = useOkra();

  const [data, setData] = useState<Page | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasContentRef = useRef(false);

  const session = typeof sessionOrId === 'string'
    ? client.sessions.from(sessionOrId)
    : sessionOrId;

  const fetchPage = useCallback(async () => {
    if (!session || !pageNumber) return;
    try {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setIsLoading(true);
      const result = await session.page(pageNumber, ac.signal);
      setData(result);
      setError(null);
      hasContentRef.current = !!result.content;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [session, pageNumber]);

  // Reset on page change
  useEffect(() => {
    setData(null);
    hasContentRef.current = false;
    setError(null);
  }, [pageNumber]);

  // Initial fetch
  useEffect(() => {
    fetchPage();
    return () => abortRef.current?.abort();
  }, [fetchPage]);

  // Poll until content arrives
  useEffect(() => {
    if (!session || !pageNumber || !pollInterval) return;
    if (hasContentRef.current) return;

    const interval = setInterval(fetchPage, pollInterval);
    return () => clearInterval(interval);
  }, [session, pageNumber, pollInterval, fetchPage]);

  return {
    data,
    content: data?.content ?? '',
    isLoading,
    error,
    refetch: fetchPage,
  };
}
