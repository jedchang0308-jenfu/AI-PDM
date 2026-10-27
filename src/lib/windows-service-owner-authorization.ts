import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuPrincipalAccountRepository } from "@/lib/jenfu-principal-account-repository";
import { JenfuPrincipalAdmissionRepository } from "@/lib/jenfu-principal-admission-repository";
import { validatePrincipalPublishedGrantSnapshot } from "@/lib/jenfu-principal-published-grant-validation";
import { evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";

export type WindowsServiceOwnerIdentity = Readonly<{
  principalId: string;
  employeeId: string;
  pdmUserId: string;
  companyId: string;
  identityIssuer: string;
  identitySubject: string;
}>;

export class WindowsServiceOwnerAuthorizationError extends Error {
  constructor(readonly code: "WORKER_DEVICE_UNAUTHORIZED" | "WORKER_DEVICE_AUTH_UNAVAILABLE",
    readonly status: 403 | 503) { super(code); }
}

/** Re-admit a device owner and, when requested, require one current workspace action. */
export async function requireWindowsServiceOwnerAuthorization(snapshot: AsyncDatabaseClient,
  owner: WindowsServiceOwnerIdentity, permissionCode?: string) {
  if (snapshot.kind !== "postgres") {
    throw new WindowsServiceOwnerAuthorizationError("WORKER_DEVICE_AUTH_UNAVAILABLE", 503);
  }
  try {
    const typed = await new JenfuPrincipalAdmissionRepository(snapshot)
      .requireActiveTypedPrincipal(owner.identityIssuer, owner.identitySubject);
    const account = await new JenfuPrincipalAccountRepository(snapshot).requireActive(owner.principalId);
    if (typed.principalId !== owner.principalId || typed.employeeId !== owner.employeeId ||
        account.principalId !== owner.principalId || account.employeeId !== owner.employeeId ||
        account.pdmUserId !== owner.pdmUserId || account.companyId !== owner.companyId ||
        typed.accountType !== account.accountType) {
      throw new WindowsServiceOwnerAuthorizationError("WORKER_DEVICE_UNAUTHORIZED", 403);
    }
    await validatePrincipalPublishedGrantSnapshot(snapshot, owner);
    if (permissionCode) {
      const [decision] = await evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot(snapshot, {
        principalId: owner.principalId,
        employeeId: owner.employeeId,
        identityIssuer: owner.identityIssuer,
        identitySubject: owner.identitySubject,
        localPrincipalId: owner.pdmUserId,
        companyId: owner.companyId,
        sessionSchemaVersion: 2
      }, [{ permissionKind: "action", permissionCode }]);
      if (!decision?.allowed || decision.principalId !== owner.principalId ||
          decision.permissionCode !== permissionCode) {
        throw new WindowsServiceOwnerAuthorizationError("WORKER_DEVICE_UNAUTHORIZED", 403);
      }
    }
  } catch (error) {
    if (error instanceof WindowsServiceOwnerAuthorizationError) throw error;
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (["principal_not_active", "principal_ambiguous", "principal_account_missing",
      "principal_account_inactive", "permission_not_granted"].includes(code)) {
      throw new WindowsServiceOwnerAuthorizationError("WORKER_DEVICE_UNAUTHORIZED", 403);
    }
    throw new WindowsServiceOwnerAuthorizationError("WORKER_DEVICE_AUTH_UNAVAILABLE", 503);
  }
}
