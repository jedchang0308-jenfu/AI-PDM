import { NextResponse } from "next/server";
import { answerPdmQuestion } from "@/lib/chat";
import { forbidden, requireAuth } from "@/lib/auth";
import { addLlmMessage, createLlmConversation, getLlmConversation } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const message = String(body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "訊息為必填" }, { status: 400 });
  }

  const conversationId = resolveConversationId(body.conversationId, auth.user.id);
  if (conversationId instanceof Response) return conversationId;

  addLlmMessage({ conversationId, role: "user", content: message });
  const answer = await answerPdmQuestion(message, body.context, auth.user);
  addLlmMessage({ conversationId, role: "assistant", content: answer.answer });

  return NextResponse.json({ answer: answer.answer, sources: answer.sources, conversationId });
}

function resolveConversationId(rawConversationId: unknown, userId: string) {
  const requestedId = String(rawConversationId ?? "").trim();
  if (!requestedId) {
    return createLlmConversation({
      userId,
      title: "Chat: " + new Date().toISOString()
    });
  }

  const conversation = getLlmConversation(requestedId);
  if (!conversation) {
    return NextResponse.json({ error: "找不到對話" }, { status: 404 });
  }
  if (conversation.user_id !== userId) {
    return forbidden();
  }
  return conversation.id;
}
