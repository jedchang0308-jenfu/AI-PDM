import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { listWhereUsedAsync } from "@/lib/item-insights-async";
import { scopedSubmittedBy } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { partNumber } = await params;
  const decodedPartNumber = decodeURIComponent(partNumber).trim();
  if (!decodedPartNumber) {
    return NextResponse.json({ error: "料號為必填" }, { status: 400 });
  }

  return NextResponse.json({
    partNumber: decodedPartNumber,
    whereUsed: await listWhereUsedAsync({
      companyId: auth.user.company_id,
      partNumber: decodedPartNumber,
      submittedBy: scopedSubmittedBy(auth.user)
    })
  });
}
