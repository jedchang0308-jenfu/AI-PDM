import crypto from "node:crypto";
import { getDb } from "@/lib/db";

export type LlmConversation = {
  id: string;
  user_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
};

export function createLlmConversation(input: { userId: string; title: string }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO llm_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, input.userId, input.title, now, now);
  return id;
}

export function getLlmConversation(id: string) {
  return getDb()
    .prepare("SELECT id, user_id, title, created_at, updated_at FROM llm_conversations WHERE id = ?")
    .get(id) as LlmConversation | undefined;
}

export function addLlmMessage(input: { conversationId: string; role: "user" | "assistant" | "system"; content: string }) {
  const now = new Date().toISOString();
  const database = getDb();
  database
    .prepare("INSERT INTO llm_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), input.conversationId, input.role, input.content, now);
  database.prepare("UPDATE llm_conversations SET updated_at = ? WHERE id = ?").run(now, input.conversationId);
}
