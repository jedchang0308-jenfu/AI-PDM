import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { parsePdmCompanyCode, resolvePdmCompanyContextAsync } from "@/lib/company-context";
import { findActiveItemLockForSubmissionIdentifiersAsync } from "@/lib/item-locks-async";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireRoleAsync(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const companyResult = await resolvePdmCompanyContextAsync(
    auth.user,
    parsePdmCompanyCode(body.pdm_company_code ?? body.pdmCompanyCode)
  );
  if (companyResult.response) return companyResult.response;

  const drawingNumber = String(body.drawing_number ?? body.drawingNumber ?? "").trim();
  const partNumber = String(body.part_number ?? body.partNumber ?? "").trim();

  if (!drawingNumber && !partNumber) {
    return NextResponse.json({ error: "圖號或料號為必填" }, { status: 400 });
  }

  const lock = await findActiveItemLockForSubmissionIdentifiersAsync({
    companyId: companyResult.company.companyId,
    drawingNumber,
    partNumber
  });

  return NextResponse.json({
    locked: Boolean(lock),
    lockedByCurrentUser: Boolean(lock && lock.locked_by === auth.user.id),
    pdmCompany: companyResult.company,
    matchedBy: lock ? { drawing_number: drawingNumber || null, part_number: partNumber || null } : null,
    lock
  });
}
