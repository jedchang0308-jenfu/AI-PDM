import { NextResponse } from "next/server";
import { getPartModuleDetail } from "@/lib/db";
import { requireNumberingPage } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = requireNumberingPage(request, "numbering.search");
  if (auth.response) return auth.response;

  const { partNumber } = await params;
  const part = getPartModuleDetail(decodeURIComponent(partNumber));
  if (!part) {
    return NextResponse.json({ error: "Part number not found" }, { status: 404 });
  }
  return NextResponse.json({ part });
}
