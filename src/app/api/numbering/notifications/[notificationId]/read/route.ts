import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { updateNumberingNotificationStateAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.notification.update");
  if (auth.response) return auth.response;

  const { notificationId } = await params;
  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;
  try {
    const notification = await updateNumberingNotificationStateAsync({
      companyId: companyResult.company.companyId,
      notificationId,
      user: auth.user,
      markRead: true
    });
    return NextResponse.json(notification);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark notification read";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("FORBIDDEN") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
