import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PrincipalWorkspaceDecision } from "@/lib/jenfu-principal-permission-service";

/** Profile IDs locate historical records; only the resolved principal decides ownership. */
export async function principalCanManageTransferPackageInSnapshot(input: {
  client: AsyncDatabaseClient;
  companyId: string;
  ownerProfileId: string;
  actorPrincipalId: string;
  decision: PrincipalWorkspaceDecision | null | undefined;
  permissionCode: string;
}) {
  const decision = input.decision;
  if (!input.actorPrincipalId || !decision?.allowed ||
      decision.principalId !== input.actorPrincipalId ||
      decision.permissionCode !== input.permissionCode) return false;
  if (["rd_manager", "pdm_admin", "system_admin"].includes(decision.roleCode ?? "")) return true;
  const owner = await input.client.query<{ principal_id: string }>(
    `SELECT account.principal_id FROM ai_pdm_core.principal_accounts account
     WHERE account.pdm_user_id = :ownerId AND account.company_id = :companyId
       AND account.account_status = 'active' AND account.system_role_enabled
     LIMIT 2`,
    { ownerId: input.ownerProfileId, companyId: input.companyId }
  );
  return owner.length === 1 && owner[0].principal_id === input.actorPrincipalId;
}
