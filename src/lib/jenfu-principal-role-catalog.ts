import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import type { JenfuEntitlementRoleCatalog } from "@/lib/repositories/jenfu-entitlement-repository";
import principalRoleCatalog from "../../config/access-control/jenfu-role-catalog.v4.json" with { type: "json" };

export const principalCatalog = principalRoleCatalog as JenfuEntitlementRoleCatalog & {
  contractVersion: string; applicationId: string; catalogVersion: string; catalogSha256: string;
};

/** A static consumer artifact is usable only after its active producer readback. */
export async function requirePublishedPrincipalCatalog(snapshot: AsyncDatabaseClient) {
  let rows: Array<{ contract_version: string; application_id: string;
    catalog_version: string; catalog_sha256: string; display_order: number;
    stable_role_id: string; role_definition_hash: string }>;
  try {
    rows = await snapshot.query(`
      SELECT contract_version,application_id,catalog_version,catalog_sha256,
             display_order,stable_role_id,role_definition_hash
      FROM ai_pdm_contract.v_application_role_catalog_v1
      ORDER BY display_order
    `);
  } catch {
    throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
  }
  if (rows.length !== principalCatalog.roles.length || rows.some((row, index) =>
      row.contract_version !== principalCatalog.contractVersion ||
      row.application_id !== principalCatalog.applicationId ||
      row.catalog_version !== principalCatalog.catalogVersion ||
      row.catalog_sha256 !== principalCatalog.catalogSha256 ||
      Number(row.display_order) !== index ||
      row.stable_role_id !== principalCatalog.roles[index].stableRoleId ||
      row.role_definition_hash !== principalCatalog.roles[index].roleDefinitionHash)) {
    throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
  }
  return principalCatalog;
}
