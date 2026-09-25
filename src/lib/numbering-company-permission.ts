import type { PdmCompanyContext } from "@/lib/company-context";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import {
  requireNumberingPermissionAsync, requirePrincipalNumberingPermissionAsync,
  type NumberingGuardResult
} from "@/lib/numbering-permission-guard";
import type { NumberingPermissionKind } from "@/lib/db";

export type NumberingCompanyGuardResult =
  | (NumberingGuardResult & { company: PdmCompanyContext; response: null })
  | (NumberingGuardResult & { company: null; response: Response });

/** Shared entry for workspace reads with no additional project/resource predicate. */
export async function requireNumberingCompanyPermissionAsync(
  request: Request,
  permissionKind: NumberingPermissionKind,
  permissionCode: string
): Promise<NumberingCompanyGuardResult> {
  const requestedCompany = requestedNumberingCompanyCodeFromRequest(request);
  const principal = Boolean(principalSessionTokenFromRequest(request));
  const auth = principal
    ? await requirePrincipalNumberingPermissionAsync(request, permissionKind, permissionCode, requestedCompany)
    : await requireNumberingPermissionAsync(request, permissionKind, permissionCode);
  if (auth.response) return { ...auth, company: null, response: auth.response };
  if (principal) {
    if (!auth.permission?.allowed || !auth.company ||
        auth.user.authorizationActor?.sessionSchemaVersion !== 2 ||
        !auth.user.authorizationActor.principalId ||
        auth.company.companyId !== auth.user.authorizationActor.companyId) {
      return { ...auth, company: null, response: Response.json({ code: "entitlement_scope_mismatch" },
        { status: 403, headers: { "cache-control": "no-store" } }) };
    }
    return { ...auth, company: auth.company, response: null };
  }
  const company = await resolveNumberingCompanyContextAsync(auth.user.id, requestedCompany);
  if (company.response) return { ...auth, company: null, response: company.response };
  return { ...auth, company: company.company, response: null };
}
