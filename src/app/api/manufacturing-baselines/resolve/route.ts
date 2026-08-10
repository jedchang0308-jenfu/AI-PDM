import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { resolveRequiredMaForBaselineAsync, Shared3dBaselineError } from "@/lib/shared-3d-baseline";

export const runtime = "nodejs";

async function resolveForRequest(request: Request, ownerScope: unknown, ownerCode: unknown) {
  const auth = await requireRoleAsync(request, ["Engineer", "R&D Manager", "Admin", "Manufacturing"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await resolveRequiredMaForBaselineAsync({
      ownerScope: ownerScope === "part_root" ? "part_root" : "part_number",
      ownerCode: String(ownerCode ?? "")
    });
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return shared3dErrorResponse(error);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return resolveForRequest(request, url.searchParams.get("ownerScope"), url.searchParams.get("ownerCode"));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return resolveForRequest(request, body.ownerScope, body.ownerCode);
}

function shared3dErrorResponse(error: unknown) {
  if (error instanceof Shared3dBaselineError) {
    return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json({ error: "BASELINE_RESOLVE_FAILED", message: "製造基準包 required-MA 解析失敗，請稍後重試或通知 Admin。" }, { status: 500 });
}
