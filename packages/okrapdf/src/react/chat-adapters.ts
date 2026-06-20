import { useMemo } from 'react';
import type { ChatMessageAdapter, LibreChatMessage, Message } from './types';

export function toLibreChatMessage(message: Message): LibreChatMessage {
  const isCreatedByUser = message.role === 'user';

  return {
    id: message.id,
    messageId: message.id,
    role: message.role,
    sender: isCreatedByUser ? 'User' : 'Okra',
    isCreatedByUser,
    text: message.content,
    content: [{ type: 'text', text: message.content }],
    createdAt: message.createdAt,
    sources: message.sources,
  };
}

const LIBRECHAT_ADAPTER: ChatMessageAdapter<LibreChatMessage> = {
  name: 'librechat',
  toMessage: toLibreChatMessage,
};

export function libreChatAdapter(): ChatMessageAdapter<LibreChatMessage> {
  return LIBRECHAT_ADAPTER;
}

export function adaptChatMessages<TMessage>(
  messages: readonly Message[],
  adapter: ChatMessageAdapter<TMessage>,
): TMessage[] {
  return messages.map((message) => adapter.toMessage(message));
}

export function toLibreChatMessages(messages: readonly Message[]): LibreChatMessage[] {
  return adaptChatMessages(messages, LIBRECHAT_ADAPTER);
}

export function useAdaptedChatMessages<TMessage>(
  messages: readonly Message[],
  adapter: ChatMessageAdapter<TMessage>,
): TMessage[] {
  return useMemo(() => adaptChatMessages(messages, adapter), [adapter, messages]);
}

export function useLibreChatMessages(messages: readonly Message[]): LibreChatMessage[] {
  return useAdaptedChatMessages(messages, LIBRECHAT_ADAPTER);
}
