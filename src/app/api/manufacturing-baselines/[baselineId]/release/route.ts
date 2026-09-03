import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { releaseManufacturingBaselineAsync, Shared3dBaselineError } from "@/lib/shared-3d-baseline";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ baselineId: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { baselineId } = await params;
  try {
    const result = await releaseManufacturingBaselineAsync({ baselineId, actorId: auth.user.id });
    return NextResponse.json(result);
  } catch (error) {
    return shared3dErrorResponse(error);
  }
}

function shared3dErrorResponse(error: unknown) {
  if (error instanceof Shared3dBaselineError) {
    return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json({ error: "BASELINE_RELEASE_FAILED", message: "製造基準包發行失敗，請稍後重試或通知 Admin。" }, { status: 500 });
}
