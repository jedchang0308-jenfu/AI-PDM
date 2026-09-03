import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { decideProcurementSyncRunAsync } from "@/lib/release-records-async";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { runId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "acknowledge").trim();
  if (action !== "acknowledge" && action !== "fail") {
    return NextResponse.json({ error: "動作必須為確認或失敗" }, { status: 400 });
  }

  const externalReference = String(body.externalReference ?? body.external_reference ?? "").trim() || undefined;
  const message = String(body.message ?? "").trim();
  const result = await decideProcurementSyncRunAsync({
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
