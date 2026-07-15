import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PlatformIdentityPrincipal } from "@/lib/platform-identity-contract";

type FirebasePrincipalRow = {
  firebase_uid: string;
  pdm_user_id: string;
  company_id: string;
  account_lifecycle_version: number;
  role: string;
  account_status: string;
  system_role_enabled: number | boolean;
};

export class FirebasePlatformPrincipalRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async resolvePrincipal(firebaseUid: string): Promise<PlatformIdentityPrincipal | null> {
    const row = await this.client.queryOne<FirebasePrincipalRow>(
      `SELECT
         mapping.external_subject AS firebase_uid,
         mapping.pdm_user_id,
         users.company_id,
         users.account_lifecycle_version,
         users.role,
         users.account_status,
         users.system_role_enabled
       FROM platform_principal_mappings mapping
       JOIN users ON users.id = mapping.pdm_user_id
       WHERE mapping.mapping_source = 'shared_iam'
         AND mapping.mapping_status = 'active'
         AND mapping.external_subject = :firebaseUid
       LIMIT 1`,
      { firebaseUid: firebaseUid.trim() }
    );
    if (!row) return null;

    const active = row.account_status === "active" && row.system_role_enabled !== 0 && row.system_role_enabled !== false;
    return {
      firebaseUid: row.firebase_uid,
      pdmUserId: row.pdm_user_id,
      companyId: row.company_id,
      sessionVersion: Number(row.account_lifecycle_version),
      accountStatus: active ? "active" : "disabled",
      requiresPrivilegedAssurance: row.role === "Admin" || row.role === "R&D Manager"
    };
  }
}
