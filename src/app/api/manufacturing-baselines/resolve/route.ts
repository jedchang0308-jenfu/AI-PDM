import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { resolveRequiredMaForBaselineAsync, Shared3dBaselineError } from "@/lib/shared-3d-baseline";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireRoleAsync(request, ["Engineer", "R&D Manager", "Admin", "Manufacturing"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const result = await resolveRequiredMaForBaselineAsync({
      ownerScope: body.ownerScope === "part_root" ? "part_root" : "part_number",
      ownerCode: String(body.ownerCode ?? "")
    });
    return NextResponse.json(result);
  } catch (error) {
    return shared3dErrorResponse(error);
  }
}

function shared3dErrorResponse(error: unknown) {
  if (error instanceof Shared3dBaselineError) {
    return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json({ error: "BASELINE_RESOLVE_FAILED", message: "製造基準包 required-MA 解析失敗，請稍後重試或通知 Admin。" }, { status: 500 });
}
