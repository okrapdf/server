import { useState, useEffect, useRef, useCallback } from 'react';
import type { OkraSession, DocumentStatus } from '../types';
import { useOkra } from './provider';

export interface UseDocumentStatusOptions {
  /** Poll interval in ms while processing (default: 2000). 0 to disable. */
  pollInterval?: number;
  /** Skip fetching entirely */
  enabled?: boolean;
}

export interface UseDocumentStatusReturn {
  data: DocumentStatus | null;
  isLoading: boolean;
  error: Error | null;
  isComplete: boolean;
  isProcessing: boolean;
  refetch: () => void;
}

const COMPLETE_PHASES = new Set(['complete', 'awaiting_review']);
const PROCESSING_PHASES = new Set(['uploading', 'parsing', 'hydrating', 'verifying']);

/**
 * Poll document processing status from the CF Worker.
 * Accepts either a session object or a raw document ID.
 *
 * ```tsx
 * const { data, isComplete, isProcessing } = useDocumentStatus(session);
 * // or
 * const { data } = useDocumentStatus('doc-abc123');
 * ```
 */
export function useDocumentStatus(
  sessionOrId: OkraSession | string | null,
  options: UseDocumentStatusOptions = {},
): UseDocumentStatusReturn {
  const { pollInterval = 2000, enabled = true } = options;
  const { client } = useOkra();

  const [data, setData] = useState<DocumentStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Resolve to session object
  const session = typeof sessionOrId === 'string'
    ? client.sessions.from(sessionOrId)
    : sessionOrId;
  const docId = session?.id ?? null;

  const fetchStatus = useCallback(async () => {
    if (!session || !enabled) return;
    try {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setIsLoading(true);
      const s = await session.status(ac.signal);
      setData(s);
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
    setData(null);
    setError(null);
  }, [docId]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
    return () => abortRef.current?.abort();
  }, [fetchStatus]);

  // Poll while processing
  useEffect(() => {
    if (!session || !pollInterval || !enabled) return;
    if (data && COMPLETE_PHASES.has(data.phase)) return;

    const interval = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(interval);
  }, [session, pollInterval, enabled, data?.phase, fetchStatus]);

  return {
    data,
    isLoading,
    error,
    isComplete: data ? COMPLETE_PHASES.has(data.phase) : false,
    isProcessing: data ? PROCESSING_PHASES.has(data.phase) : false,
    refetch: fetchStatus,
  };
}
