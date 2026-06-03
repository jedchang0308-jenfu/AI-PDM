import { NextResponse } from "next/server";
import { updateNumberingNotificationState } from "@/lib/db";
import { requireNumberingAction } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const auth = requireNumberingAction(request, "numbering.notification.update");
  if (auth.response) return auth.response;

  const { notificationId } = await params;
  try {
    const notification = updateNumberingNotificationState({
      notificationId,
      user: auth.user,
      markRead: true,
      markHandled: true
    });
    return NextResponse.json(notification);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark notification handled";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("FORBIDDEN") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
