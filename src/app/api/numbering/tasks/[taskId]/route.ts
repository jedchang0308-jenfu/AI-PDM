import { NextResponse } from "next/server";
import { updateNumberingTaskStatus } from "@/lib/db";
import { requireNumberingAction } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = requireNumberingAction(request, "numbering.task.update");
  if (auth.response) return auth.response;

  const { taskId } = await params;
  const body = await request.json().catch(() => ({}));
  const status = String(body.status ?? body.action ?? "").trim();
  if (status !== "open" && status !== "handled" && status !== "cancelled") {
    return NextResponse.json({ error: "status must be open, handled, or cancelled" }, { status: 400 });
  }

  try {
    const task = updateNumberingTaskStatus({ taskId, status, handledBy: auth.user.id });
    return NextResponse.json(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update task";
    const responseStatus = message.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ error: message }, { status: responseStatus });
  }
}
