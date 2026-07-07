import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { setDrawingPackageModelBasisAsync, Shared3dBaselineError } from "@/lib/shared-3d-baseline";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ packageId: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packageId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const basis = await setDrawingPackageModelBasisAsync({
      packageId,
      actorId: auth.user.id,
      sharedModelVersionId: body.sharedModelVersionId ? String(body.sharedModelVersionId) : null,
      twoDOnlyReason: body.twoDOnlyReason ? String(body.twoDOnlyReason) : null,
      confirmTwoDOnly: body.confirmTwoDOnly === true
    });
    return NextResponse.json({ basis });
  } catch (error) {
    return shared3dErrorResponse(error);
  }
}

function shared3dErrorResponse(error: unknown) {
  if (error instanceof Shared3dBaselineError) {
    return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json({ error: "PACKAGE_MODEL_BASIS_FAILED", message: "圖面 model basis 設定失敗，請稍後重試或通知 Admin。" }, { status: 500 });
}
