import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { updateNumberingTaskStatusAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.task.update");
  if (auth.response) return auth.response;

  const { taskId } = await params;
  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;
  const status = String(body.status ?? body.action ?? "").trim();
  if (status !== "open" && status !== "handled" && status !== "cancelled") {
    return NextResponse.json({ error: "status must be open, handled, or cancelled" }, { status: 400 });
  }

  try {
    const task = await updateNumberingTaskStatusAsync({ companyId: companyResult.company.companyId, taskId, status, handledBy: auth.user.id });
    return NextResponse.json(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update task";
    const responseStatus = message.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ error: message }, { status: responseStatus });
  }
}
