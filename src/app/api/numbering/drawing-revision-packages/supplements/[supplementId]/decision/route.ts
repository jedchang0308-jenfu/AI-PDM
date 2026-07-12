import { NextResponse } from "next/server";
import { decideApprovalPlatformLegacyDrawingPackageSupplementAsync } from "@/lib/approval-platform";
import { forbidden, requireRoleAsync } from "@/lib/auth-async";
import { DrawingRevisionPackageError } from "@/lib/drawing-revision-packages-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ supplementId: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;
  if (!auth.user) return forbidden();

  const { supplementId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const decision = normalizeDecision(body.decision);
  if (!decision) {
    return NextResponse.json({ error: "supplement_decision_required", message: "請選擇核准或駁回補件。" }, { status: 400 });
  }

  try {
    const result = await decideApprovalPlatformLegacyDrawingPackageSupplementAsync({
      supplementId,
      companyId: companyResult.company.companyId,
      actor: auth.user,
      decision: decision === "approve" ? "approved" : "rejected",
      comment: nullableText(body.note ?? body.comment)
    });
    return NextResponse.json({ ...result, pdmCompany: companyResult.company });
  } catch (error) {
    return supplementErrorResponse(error);
  }
}

function normalizeDecision(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["approve", "approved", "核准"].includes(text)) return "approve" as const;
  if (["reject", "rejected", "駁回"].includes(text)) return "reject" as const;
  return null;
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function supplementErrorResponse(error: unknown) {
  if (error instanceof DrawingRevisionPackageError) {
    return NextResponse.json({ error: error.code, code: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json(
    { error: "drawing_revision_package_supplement_decision_failed", message: "補件審核失敗，請稍後重試或通知 Admin。" },
    { status: 500 }
  );
}
