import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type AsyncLlmConversation = {
  id: string;
  user_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
};

export const INSERT_ASYNC_LLM_CONVERSATION_SQL = `
  INSERT INTO llm_conversations (id, user_id, title, created_at, updated_at)
  VALUES (:id, :userId, :title, :now, :now)
`;

export const SELECT_ASYNC_LLM_CONVERSATION_SQL = `
  SELECT id, user_id, title, created_at, updated_at
  FROM llm_conversations
  WHERE id = :id
`;

export const INSERT_ASYNC_LLM_MESSAGE_SQL = `
  INSERT INTO llm_messages (id, conversation_id, role, content, created_at)
  VALUES (:id, :conversationId, :role, :content, :now)
`;

export const UPDATE_ASYNC_LLM_CONVERSATION_UPDATED_AT_SQL = `
  UPDATE llm_conversations
  SET updated_at = :now
  WHERE id = :conversationId
`;

export class AsyncAiRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async createLlmConversation(input: { userId: string; title: string }): Promise<string> {
    const id = this.idFactory();
    const now = this.clock();
    await this.client.execute(INSERT_ASYNC_LLM_CONVERSATION_SQL, {
      id,
      userId: input.userId,
      title: input.title,
      now
    });
    return id;
  }

  async getLlmConversation(id: string): Promise<AsyncLlmConversation | null> {
    return this.client.queryOne<AsyncLlmConversation>(SELECT_ASYNC_LLM_CONVERSATION_SQL, { id });
  }

  async addLlmMessage(input: { conversationId: string; role: "user" | "assistant" | "system"; content: string }): Promise<void> {
    const now = this.clock();
    await this.client.execute(INSERT_ASYNC_LLM_MESSAGE_SQL, {
      id: this.idFactory(),
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      now
    });
    await this.client.execute(UPDATE_ASYNC_LLM_CONVERSATION_UPDATED_AT_SQL, {
      conversationId: input.conversationId,
      now
    });
  }
}
