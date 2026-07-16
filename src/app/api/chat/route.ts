import { NextResponse } from "next/server";
import { addLlmMessageAsync, createLlmConversationAsync, getLlmConversationAsync } from "@/lib/ai-async";
import { answerPdmQuestion } from "@/lib/chat";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const message = String(body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "訊息為必填" }, { status: 400 });
  }

  const conversationId = await resolveConversationId(body.conversationId, auth.user.id);
  if (conversationId instanceof Response) return conversationId;

  await addLlmMessageAsync({ conversationId, role: "user", content: message });
  const answer = await answerPdmQuestion(message, body.context, auth.user);
  await addLlmMessageAsync({ conversationId, role: "assistant", content: answer.answer });

  return NextResponse.json({ answer: answer.answer, sources: answer.sources, conversationId });
}

async function resolveConversationId(rawConversationId: unknown, userId: string) {
  const requestedId = String(rawConversationId ?? "").trim();
  if (!requestedId) {
    return createLlmConversationAsync({
      userId,
      title: "Chat: " + new Date().toISOString()
    });
  }

  const conversation = await getLlmConversationAsync(requestedId);
  if (!conversation) {
    return NextResponse.json({ error: "找不到對話" }, { status: 404 });
  }
  if (conversation.user_id !== userId) {
    return forbidden();
  }
  return conversation.id;
}
