import { useState, useRef, useCallback, useMemo } from 'react';
import type { Message, UseChatReturn, ChatConfig, ChatStatus } from './types';

let _idCounter = 0;
function genId(): string {
  return `msg_${Date.now()}_${++_idCounter}`;
}

export function useChat<TMessage = Message>(config: ChatConfig<TMessage>): UseChatReturn<TMessage> {
  const { session, stream = true, completionOptions, adapter, onFinish, onError } = config;

  const [okraMessages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<ChatStatus>('idle');

  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setStatus('idle');
  }, []);

  const append = useCallback(
    (msg: Pick<Message, 'role' | 'content'>) => {
      const full: Message = { id: genId(), createdAt: new Date(), ...msg };
      setMessages((prev) => [...prev, full]);
    },
    [],
  );

  const sendMessages = useCallback(
    async (_allMessages: Message[], userQuery: string) => {
      if (!session) return;
      setIsLoading(true);
      setStatus('submitted');

      const controller = new AbortController();
      abortRef.current = controller;
      let didError = false;

      try {
        if (stream) {
          // Streaming path — accumulate text_delta events
          const assistantId = genId();
          let fullText = '';
          let sources: Array<{ page: number; snippet: string }> | undefined;

          // Add placeholder assistant message
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: 'assistant', content: '', createdAt: new Date() },
          ]);

          const gen = session.stream(userQuery, {
            ...completionOptions,
            signal: controller.signal,
          });

          for await (const event of gen) {
            if (controller.signal.aborted) break;

            if (event.type === 'text_delta') {
              setStatus('streaming');
              fullText += event.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText } : m,
                ),
              );
            } else if (event.type === 'done') {
              fullText = event.answer || fullText;
              sources = event.sources;
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          }

          const finalMsg: Message = {
            id: assistantId,
            role: 'assistant',
            content: fullText,
            createdAt: new Date(),
            sources,
          };

          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? finalMsg : m)),
          );

          onFinish?.(finalMsg);
        } else {
          // Non-streaming path
          const result = await session.prompt(userQuery, {
            ...completionOptions,
            signal: controller.signal,
          });

          if (controller.signal.aborted) return;

          const assistantMsg: Message = {
            id: genId(),
            role: 'assistant',
            content: result.answer,
            createdAt: new Date(),
            sources: result.sources,
          };

          setMessages((prev) => [...prev, assistantMsg]);
          onFinish?.(assistantMsg);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        didError = true;
        setStatus('error');
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
      } finally {
        setIsLoading(false);
        abortRef.current = null;
        if (!didError) setStatus('idle');
      }
    },
    [session, stream, completionOptions, onFinish, onError],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      const trimmed = input.trim();
      if (!trimmed || isLoading || !session) return;

      const userMsg: Message = {
        id: genId(),
        role: 'user',
        content: trimmed,
        createdAt: new Date(),
      };

      const nextMessages = [...okraMessages, userMsg];
      setMessages(nextMessages);
      setInput('');
      sendMessages(nextMessages, trimmed);
    },
    [input, isLoading, session, okraMessages, sendMessages],
  );

  const messages = useMemo<TMessage[]>(() => {
    if (!adapter) return okraMessages as unknown as TMessage[];
    return okraMessages.map((message) => adapter.toMessage(message));
  }, [adapter, okraMessages]);

  return {
    messages,
    okraMessages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    status,
    stop,
    append,
    setMessages,
  };
}
