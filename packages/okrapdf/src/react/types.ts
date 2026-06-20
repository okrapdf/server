import type {
  DocumentAssetStatus,
  OkraSession,
  CompletionEvent,
  CompletionOptions,
  DocumentStatus,
  GenerateResult,
  Page,
} from '../types';

// ---------------------------------------------------------------------------
// AI SDK–compatible Message type
// Matches { id, role, content } shape for drop-in Shadcn Chat UI support
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
  sources?: Array<{ page: number; snippet: string }>;
}

export interface ChatMessageAdapter<TMessage = Message> {
  name?: string;
  toMessage: (message: Message) => TMessage;
}

export interface LibreChatMessage {
  id: string;
  messageId: string;
  role: Message['role'];
  sender: 'User' | 'Okra';
  isCreatedByUser: boolean;
  text: string;
  content: Array<{ type: 'text'; text: string }>;
  createdAt?: Date;
  sources?: Message['sources'];
}

// ---------------------------------------------------------------------------
// useOkraDocument / useOkraQuery
// ---------------------------------------------------------------------------

export type OkraDocumentStatus = 'resolving' | 'ready' | 'error';

export interface UseOkraDocumentReturn {
  documentId: string | null;
  session: OkraSession | null;
  status: OkraDocumentStatus;
  error: Error | null;
  isReady: boolean;
  refetch: () => void;
}

export interface UseOkraQueryReturn<T> {
  data: T | null;
  assetStatus: DocumentAssetStatus;
  error: Error | null;
  isLoading: boolean;
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// useChat
// ---------------------------------------------------------------------------

export type ChatStatus = 'idle' | 'submitted' | 'streaming' | 'error';

export interface UseChatReturn<TMessage = Message> {
  messages: TMessage[];
  okraMessages: Message[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSubmit: (e?: { preventDefault?: () => void }) => void;
  isLoading: boolean;
  status: ChatStatus;
  stop: () => void;
  append: (message: Pick<Message, 'role' | 'content'>) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export interface ChatConfig<TMessage = Message> {
  session: OkraSession | null;
  /** Use streaming (default: true) */
  stream?: boolean;
  /** Forwarded to `session.stream()` / `session.prompt()` without overriding the hook's abort signal. */
  completionOptions?: Omit<CompletionOptions, 'signal' | 'stream'>;
  adapter?: ChatMessageAdapter<TMessage>;
  onFinish?: (message: Message) => void;
  onError?: (error: Error) => void;
}

// Re-export useful runtime types
export type {
  DocumentAssetStatus,
  OkraSession,
  CompletionEvent,
  CompletionOptions,
  DocumentStatus,
  GenerateResult,
  Page,
};
