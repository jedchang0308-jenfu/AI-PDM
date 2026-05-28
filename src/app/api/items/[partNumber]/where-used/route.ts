import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listWhereUsed } from "@/lib/db";
import { scopedSubmittedBy } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { partNumber } = await params;
  const decodedPartNumber = decodeURIComponent(partNumber).trim();
  if (!decodedPartNumber) {
    return NextResponse.json({ error: "料號為必填" }, { status: 400 });
  }

  return NextResponse.json({
    partNumber: decodedPartNumber,
    whereUsed: listWhereUsed({
      partNumber: decodedPartNumber,
      submittedBy: scopedSubmittedBy(auth.user)
    })
  });
}
