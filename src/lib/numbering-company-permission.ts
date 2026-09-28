import type { PdmCompanyContext } from "@/lib/company-context";
import { requestedNumberingCompanyCodeFromRequest } from "@/lib/numbering-company-context";
import {
  requirePrincipalNumberingPermissionAsync,
  type NumberingGuardResult
} from "@/lib/numbering-permission-guard";
import type { NumberingPermissionKind } from "@/lib/db";

export type NumberingCompanyGuardResult =
  | (NumberingGuardResult & { company: PdmCompanyContext; response: null })
  | (NumberingGuardResult & { company: null; response: Response });

/** Shared workspace entry; a historical PDM session cannot authorize a new request. */
export async function requireNumberingCompanyPermissionAsync(
  request: Request,
  permissionKind: NumberingPermissionKind,
  permissionCode: string
): Promise<NumberingCompanyGuardResult> {
  const requestedCompany = requestedNumberingCompanyCodeFromRequest(request);
  const auth = await requirePrincipalNumberingPermissionAsync(request, permissionKind, permissionCode, requestedCompany);
  if (auth.response) return { ...auth, company: null, response: auth.response };
  if (!auth.permission?.allowed || !auth.company ||
      auth.user.authorizationActor?.sessionSchemaVersion !== 2 ||
      !auth.user.authorizationActor.principalId ||
      auth.company.companyId !== auth.user.authorizationActor.companyId) {
    return { ...auth, company: null, response: Response.json({ code: "entitlement_scope_mismatch" },
      { status: 403, headers: { "cache-control": "no-store" } }) };
  }
  return { ...auth, company: auth.company, response: null };
}
