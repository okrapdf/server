import { useAgent } from 'agents/react';
import { useCallback, useEffect, useState } from 'react';
import { normalizeOkraRpcArgs } from './rpc-schema';
import type { DocumentAgentMethods, DocumentAgentState } from './agent-types';

type QueryObject = Record<string, string | null>;
type QueryResolver = (name: string) => QueryObject | Promise<QueryObject>;
type MethodArgs<Methods, K extends keyof Methods> = Methods[K] extends (...args: infer Args) => any ? Args : never;
type MethodResult<Methods, K extends keyof Methods> = Methods[K] extends (...args: any[]) => infer Result ? Awaited<Result> : never;

type AgentShape<State, Methods extends object> = Methods & {
  get state(): State;
};

export interface OkraAuthEndpointRequest {
  docId: string;
}

export interface OkraAuthEndpointResponse {
  token: string;
  [key: string]: unknown;
}

export interface CreateOkraContextOptions {
  host?: string;
  agent: string;
  authEndpoint?: string;
  query?: QueryResolver;
  cacheTtl?: number;
}

export type OkraDocumentAgent<State, Methods extends object> = ReturnType<
  typeof useAgent<AgentShape<State, Methods>, State>
>;

async function fetchAuthEndpoint(endpoint: string, name: string): Promise<QueryObject> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId: name } satisfies OkraAuthEndpointRequest),
  });
  if (!response.ok) {
    throw new Error(`Okra auth endpoint failed: ${response.status}`);
  }
  const body = (await response.json()) as OkraAuthEndpointResponse;
  if (!body.token) {
    throw new Error('Okra auth endpoint response missing token');
  }
  return { token: body.token };
}

export function createOkraContext<
  State = DocumentAgentState,
  Methods extends object = DocumentAgentMethods,
>(cfg: CreateOkraContextOptions) {
  function useDocument(name: string | null | undefined): OkraDocumentAgent<State, Methods> {
    const resolvedName = name || '_idle';
    const query = useCallback(async () => {
      const [endpointQuery, customQuery] = await Promise.all([
        cfg.authEndpoint ? fetchAuthEndpoint(cfg.authEndpoint, resolvedName) : Promise.resolve({}),
        cfg.query ? cfg.query(resolvedName) : Promise.resolve({}),
      ]);
      return { ...endpointQuery, ...customQuery };
    }, [resolvedName]);

    return useAgent<AgentShape<State, Methods>, State>({
      agent: cfg.agent,
      name: resolvedName,
      host: cfg.host,
      startClosed: !name,
      query: cfg.authEndpoint || cfg.query ? query : undefined,
      queryDeps: [resolvedName, cfg.authEndpoint],
      cacheTtl: cfg.cacheTtl ?? 30_000,
    });
  }

  function useDocumentSlice<T>(
    name: string | null | undefined,
    selector: (state: State) => T,
  ): T | undefined {
    const document = useDocument(name);
    const [selected, setSelected] = useState<T | undefined>(() =>
      document.state ? selector(document.state) : undefined,
    );

    useEffect(() => {
      if (!document.state) {
        setSelected(undefined);
        return;
      }
      const next = selector(document.state);
      setSelected((prev) => (Object.is(prev, next) ? prev : next));
    }, [document.state, selector]);

    return selected;
  }

  function useDocumentAction<K extends keyof Methods>(
    name: string | null | undefined,
    method: K,
  ): (...args: MethodArgs<Methods, K>) => Promise<MethodResult<Methods, K>> {
    const document = useDocument(name);
    return useCallback(
      (...args: MethodArgs<Methods, K>) => {
        const call = document.call as (method: string, args?: unknown[]) => Promise<unknown>;
        return call(String(method), normalizeOkraRpcArgs(args as unknown[])) as Promise<MethodResult<Methods, K>>;
      },
      [document, method],
    );
  }

  function useDocumentEvents(
    name: string | null | undefined,
    handler: (event: unknown) => void,
  ): void {
    const document = useDocument(name);
    useEffect(() => {
      if (!name) return;
      const onMessage = (event: MessageEvent) => {
        try {
          handler(JSON.parse(String(event.data)));
        } catch {
          handler(event.data);
        }
      };
      document.addEventListener('message', onMessage);
      return () => document.removeEventListener('message', onMessage);
    }, [document, handler, name]);
  }

  return {
    useDocument,
    useDocumentSlice,
    useDocumentAction,
    useDocumentEvents,
  };
}
