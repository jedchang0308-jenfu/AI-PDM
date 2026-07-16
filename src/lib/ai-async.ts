import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAiRepository } from "@/lib/repositories/ai-async-repository";

export async function createLlmConversationAsync(input: { userId: string; title: string }) {
  return new AsyncAiRepository(getAsyncDatabaseClient()).createLlmConversation(input);
}

export async function getLlmConversationAsync(id: string) {
  return new AsyncAiRepository(getAsyncDatabaseClient()).getLlmConversation(id);
}

export async function addLlmMessageAsync(input: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
}) {
  return new AsyncAiRepository(getAsyncDatabaseClient()).addLlmMessage(input);
}
