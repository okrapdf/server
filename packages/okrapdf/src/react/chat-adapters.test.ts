import { describe, expect, it } from 'vitest';
import {
  adaptChatMessages,
  libreChatAdapter,
  toLibreChatMessage,
  toLibreChatMessages,
} from './chat-adapters';
import type { Message } from './types';

describe('chat adapters', () => {
  const createdAt = new Date('2026-04-25T12:00:00.000Z');
  const message: Message = {
    id: 'msg_1',
    role: 'assistant',
    content: '## Answer\n\n| A | B |\n| - | - |\n| 1 | 2 |',
    createdAt,
    sources: [{ page: 7, snippet: 'evidence' }],
  };

  it('maps Okra messages to a LibreChat-compatible message shape', () => {
    expect(toLibreChatMessage(message)).toEqual({
      id: 'msg_1',
      messageId: 'msg_1',
      role: 'assistant',
      sender: 'Okra',
      isCreatedByUser: false,
      text: message.content,
      content: [{ type: 'text', text: message.content }],
      createdAt,
      sources: [{ page: 7, snippet: 'evidence' }],
    });
  });

  it('marks user messages as user-created', () => {
    const user = toLibreChatMessage({ id: 'msg_2', role: 'user', content: 'hello' });

    expect(user.sender).toBe('User');
    expect(user.isCreatedByUser).toBe(true);
  });

  it('adapts arrays with a reusable adapter object', () => {
    expect(adaptChatMessages([message], libreChatAdapter())).toEqual(toLibreChatMessages([message]));
  });
});
