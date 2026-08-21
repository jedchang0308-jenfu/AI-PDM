import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getRootObsoleteImpactAsync } from "@/lib/numbering-async";
import { canUserUseNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { buildNumberingPartRootLifecyclePolicy } from "@/lib/pdm-lifecycle-policy";
import { isProductionNumberingLifecycleGateOpen } from "@/lib/production-slice";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const { rootCode } = await params;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  try {
    const impact = await getRootObsoleteImpactAsync({
      companyId: companyResult.company.companyId,
      rootCode: decodeURIComponent(rootCode)
    });
    const [directPermission, formalPermission] = await Promise.all([
      canUserUseNumberingActionAsync(auth.user, "numbering.draft.obsolete"),
      canUserUseNumberingActionAsync(auth.user, "obsolete_part_root", { actionCode: "obsolete_part_root" })
    ]);
    const policy = buildNumberingPartRootLifecyclePolicy({
      rootStatus: impact.root.recordStatus,
      childStatuses: [...impact.parts, ...impact.drawings].map((record) => record.recordStatus),
      controlledReferenceCount: impact.dependencySummary.controlledReferenceCount,
      pendingObsoleteRequest: Boolean(impact.pendingRequestId),
      canDirectObsolete: directPermission.allowed,
      canRequestObsolete: formalPermission.allowed,
      directGateOpen: isProductionNumberingLifecycleGateOpen("draft-obsolete"),
      formalGateOpen: isProductionNumberingLifecycleGateOpen("formal-obsolete")
    });
    return NextResponse.json({ ...impact, policy, permissions: { directObsolete: directPermission.allowed, formalObsolete: formalPermission.allowed }, pdmCompany: companyResult.company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load root obsolete impact";
    return NextResponse.json({ error: message }, { status: message.includes("NOT_FOUND") ? 404 : 400 });
  }
}
