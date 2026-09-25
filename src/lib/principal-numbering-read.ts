import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCompanyContext } from "@/lib/company-context";
import type { PrincipalWorkspacePermission } from "@/lib/jenfu-principal-permission-service";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { requestedNumberingCompanyCodeFromRequest } from "@/lib/numbering-company-context";
import { withPrincipalCompanyRead } from "@/lib/principal-company-read";

export function withPrincipalNumberingCompanyRead(
  request: Request,
  permission: string | readonly PrincipalWorkspacePermission[],
  read: (snapshot: AsyncDatabaseClient, company: PdmCompanyContext,
    verified: VerifiedPrincipalRequest) => Promise<Response>
): Promise<Response | null> {
  const permissions: readonly PrincipalWorkspacePermission[] = typeof permission === "string"
    ? [{ permissionKind: "page", permissionCode: permission }] : permission;
  return withPrincipalCompanyRead(request, requestedNumberingCompanyCodeFromRequest(request),
    permissions, read);
}
