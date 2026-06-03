import { NextResponse } from "next/server";
import { getNumberingRootDetail } from "@/lib/db";
import { requireNumberingPage } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const auth = requireNumberingPage(request, "numbering.search");
  if (auth.response) return auth.response;

  const { rootCode } = await params;
  const detail = getNumberingRootDetail(decodeURIComponent(rootCode));
  if (!detail) {
    return NextResponse.json({ error: "Numbering root not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
