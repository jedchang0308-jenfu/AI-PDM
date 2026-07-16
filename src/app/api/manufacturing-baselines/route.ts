import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { createManufacturingBaselineDraftAsync, Shared3dBaselineError } from "@/lib/shared-3d-baseline";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const result = await createManufacturingBaselineDraftAsync({
      ownerScope: body.ownerScope === "part_root" ? "part_root" : "part_number",
      ownerCode: String(body.ownerCode ?? ""),
      sharedModelVersionId: String(body.sharedModelVersionId ?? ""),
      baselineRevision: String(body.baselineRevision ?? "1"),
      actorId: auth.user.id,
      selectedPackageIds: Array.isArray(body.selectedPackageIds) ? body.selectedPackageIds.map(String) : [],
      exclusions: Array.isArray(body.exclusions)
        ? body.exclusions.map((item) => ({
            drawingNumberId: String((item as Record<string, unknown>).drawingNumberId ?? ""),
            reason: String((item as Record<string, unknown>).reason ?? ""),
            approved: (item as Record<string, unknown>).approved === true
          }))
        : []
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return shared3dErrorResponse(error);
  }
}

function shared3dErrorResponse(error: unknown) {
  if (error instanceof Shared3dBaselineError) {
    return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json({ error: "BASELINE_CREATE_FAILED", message: "製造基準包建立失敗，請稍後重試或通知 Admin。" }, { status: 500 });
}
