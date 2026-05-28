import { NextResponse } from "next/server";
import { decideProcurementSyncRun } from "@/lib/db";
import { forbidden, requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

function canManageProcurementSync(role: string) {
  return role === "R&D Manager" || role === "Admin";
}

export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;
  if (!canManageProcurementSync(auth.user.role)) return forbidden();

  const { runId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "acknowledge").trim();
  if (action !== "acknowledge" && action !== "fail") {
    return NextResponse.json({ error: "動作必須為確認或失敗" }, { status: 400 });
  }

  const externalReference = String(body.externalReference ?? body.external_reference ?? "").trim() || undefined;
  const message = String(body.message ?? "").trim();
  const result = decideProcurementSyncRun({
    runId,
    actorId: auth.user.id,
    status: action === "acknowledge" ? "acknowledged" : "failed",
    externalReference,
    response: {
      action,
      message,
      received_at: new Date().toISOString()
    }
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ run: result.run });
}
