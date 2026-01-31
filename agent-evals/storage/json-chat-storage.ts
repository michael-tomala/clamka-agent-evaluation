/**
 * JsonChatStorage - In-memory implementacja IChatStorage dla testów
 *
 * Przechowuje dane w pamięci (Map), nie wymaga better-sqlite3.
 * Używana przez testing API zamiast SqliteChatStorage.
 */

import { v4 as uuid } from 'uuid';
import type { IChatStorage } from '../../../shared/storage';
import type {
  ChatThread,
  ChatMessage,
  CreateChatThreadInput,
  UpdateChatThreadInput,
  CreateChatMessageInput,
  AgentType,
} from '../../../shared/types';

export class JsonChatStorage implements IChatStorage {
  private threads = new Map<string, ChatThread>();
  private messages = new Map<string, ChatMessage[]>();

  // ===== CHAT THREADS =====

  async createThread(input: CreateChatThreadInput): Promise<ChatThread> {
    const now = new Date().toISOString();
    const thread: ChatThread = {
      id: uuid(),
      projectId: input.projectId,
      agentType: input.agentType,
      title: input.title,
      createdDate: now,
      modifiedDate: now,
    };

    this.threads.set(thread.id, thread);
    this.messages.set(thread.id, []);

    return thread;
  }

  async getThread(threadId: string): Promise<ChatThread | null> {
    return this.threads.get(threadId) ?? null;
  }

  async listThreads(projectId: string): Promise<ChatThread[]> {
    return Array.from(this.threads.values())
      .filter((t) => t.projectId === projectId)
      .sort((a, b) => b.modifiedDate.localeCompare(a.modifiedDate))
      .map((thread) => {
        const threadMessages = this.messages.get(thread.id) ?? [];
        const firstUserMsg = threadMessages.find((m) => m.type === 'user');
        return {
          ...thread,
          firstUserMessage: this.extractFirstUserMessageText(firstUserMsg?.object),
        };
      });
  }

  async listThreadsByType(projectId: string, agentType: AgentType): Promise<ChatThread[]> {
    return Array.from(this.threads.values())
      .filter((t) => t.projectId === projectId && t.agentType === agentType)
      .sort((a, b) => b.modifiedDate.localeCompare(a.modifiedDate))
      .map((thread) => {
        const threadMessages = this.messages.get(thread.id) ?? [];
        const firstUserMsg = threadMessages.find((m) => m.type === 'user');
        return {
          ...thread,
          firstUserMessage: this.extractFirstUserMessageText(firstUserMsg?.object),
        };
      });
  }

  private extractFirstUserMessageText(object: Record<string, unknown> | undefined): string | undefined {
    if (!object) return undefined;
    try {
      // Format SDK: { message: { content: [{ type: 'text', text: '...' }] } }
      const message = object.message as { content?: Array<{ type: string; text?: string }> } | undefined;
      const content = message?.content;
      if (Array.isArray(content)) {
        const textBlock = content.find((c) => c.type === 'text');
        if (textBlock?.text) {
          return textBlock.text;
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  async updateThread(threadId: string, updates: UpdateChatThreadInput): Promise<ChatThread> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const updated: ChatThread = {
      ...thread,
      ...updates,
      modifiedDate: new Date().toISOString(),
    };

    this.threads.set(threadId, updated);
    return updated;
  }

  async deleteThread(threadId: string): Promise<void> {
    this.threads.delete(threadId);
    this.messages.delete(threadId);
  }

  // ===== CHAT MESSAGES =====

  async saveMessage(threadId: string, message: CreateChatMessageInput): Promise<ChatMessage> {
    // Auto-utwórz wątek jeśli nie istnieje (defensywne zachowanie dla testów)
    if (!this.threads.has(threadId)) {
      const now = new Date().toISOString();
      this.threads.set(threadId, {
        id: threadId,
        projectId: 'auto-created',
        agentType: 'montage',
        title: 'Auto-created thread',
        createdDate: now,
        modifiedDate: now,
      });
      this.messages.set(threadId, []);
    }

    const chatMessage: ChatMessage = {
      id: uuid(),
      threadId,
      type: message.type,
      object: message.object,
      timestamp: message.timestamp || new Date().toISOString(),
      sdkUuid: message.sdkUuid,
      contextRefs: message.contextRefs,
    };

    const threadMessages = this.messages.get(threadId) ?? [];
    threadMessages.push(chatMessage);
    this.messages.set(threadId, threadMessages);

    // Aktualizuj modified_date w thread
    await this.updateThread(threadId, {});

    return chatMessage;
  }

  async getMessages(threadId: string): Promise<ChatMessage[]> {
    const messages = this.messages.get(threadId) ?? [];
    return messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async deleteMessage(messageId: string): Promise<void> {
    for (const [threadId, messages] of this.messages.entries()) {
      const index = messages.findIndex((m) => m.id === messageId);
      if (index !== -1) {
        messages.splice(index, 1);
        this.messages.set(threadId, messages);
        break;
      }
    }
  }

  async clearMessages(threadId: string): Promise<void> {
    this.messages.set(threadId, []);
  }

  // ===== FORK THREAD =====

  async forkThread(
    originalThreadId: string,
    upToMessageId: string,
    newUserMessage?: string
  ): Promise<ChatThread> {
    const originalThread = this.threads.get(originalThreadId);
    if (!originalThread) {
      throw new Error(`Thread not found: ${originalThreadId}`);
    }
    if (!originalThread.sessionId) {
      throw new Error('Cannot fork thread without session - thread has no sessionId');
    }

    const allMessages = this.messages.get(originalThreadId) ?? [];
    const messageIndex = allMessages.findIndex((m) => m.id === upToMessageId);
    if (messageIndex === -1) {
      throw new Error(`Message not found: ${upToMessageId}`);
    }

    const messagesToCopy = allMessages.slice(0, messageIndex + 1);

    const targetMessage = messagesToCopy[messagesToCopy.length - 1];
    const resumeAtUuid = targetMessage?.sdkUuid;

    if (newUserMessage && messagesToCopy.length > 0) {
      const lastMsg = messagesToCopy[messagesToCopy.length - 1];
      if (lastMsg.type === 'user') {
        messagesToCopy[messagesToCopy.length - 1] = {
          ...lastMsg,
          object: {
            message: {
              role: 'user',
              content: [{ type: 'text', text: newUserMessage }],
            },
          },
        };
      }
    }

    const now = new Date().toISOString();
    const newThread: ChatThread = {
      id: uuid(),
      projectId: originalThread.projectId,
      agentType: originalThread.agentType,
      title: `${originalThread.title || 'Chat'} [Fork]`,
      createdDate: now,
      modifiedDate: now,
      parentSessionId: originalThread.sessionId,
      needsFork: true,
      resumeAtUuid: resumeAtUuid,
    };

    this.threads.set(newThread.id, newThread);

    // Skopiuj wiadomości
    const copiedMessages: ChatMessage[] = messagesToCopy.map((msg) => ({
      ...msg,
      id: uuid(),
      threadId: newThread.id,
    }));
    this.messages.set(newThread.id, copiedMessages);

    console.log(
      `[JsonChatStorage] Forked thread ${originalThreadId} -> ${newThread.id}, messages: ${messagesToCopy.length}`
    );

    return newThread;
  }

  // ===== RESET (dla testów) =====

  reset(): void {
    this.threads.clear();
    this.messages.clear();
  }
}
