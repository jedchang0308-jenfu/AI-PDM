import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { createSharedModelVersionAsync, listSharedModelVersionsAsync, Shared3dBaselineError } from "@/lib/shared-3d-baseline";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Engineer", "R&D Manager", "Admin", "Manufacturing", "Procurement"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { partNumber } = await params;
  try {
    const result = await listSharedModelVersionsAsync({ ownerScope: "part_number", ownerCode: decodeURIComponent(partNumber) });
    return NextResponse.json(result);
  } catch (error) {
    return shared3dErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Engineer", "R&D Manager", "Admin"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { partNumber } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const result = await createSharedModelVersionAsync({
      ownerScope: "part_number",
      ownerCode: decodeURIComponent(partNumber),
      sourceFileAssetId: String(body.sourceFileAssetId ?? body.attachmentId ?? ""),
      modelRevision: String(body.modelRevision ?? ""),
      actorId: auth.user.id,
      status: String(body.status ?? "Released") === "Draft" ? "Draft" : "Released",
      releaseReason: String(body.releaseReason ?? ""),
      allowSameHashNewLabel: body.allowSameHashNewLabel === true
    });
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return shared3dErrorResponse(error);
  }
}

function shared3dErrorResponse(error: unknown) {
  if (error instanceof Shared3dBaselineError) {
    return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json({ error: "SHARED_3D_OPERATION_FAILED", message: "共用 3D 操作失敗，請稍後重試或通知 Admin。" }, { status: 500 });
}
