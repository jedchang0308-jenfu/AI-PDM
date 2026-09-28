import { createHash } from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  JenfuPrincipalInventoryRepository,
  type PrincipalInventoryCandidate,
  type PrincipalInventoryInput
} from "@/lib/jenfu-principal-inventory-repository";

type ActiveProfileRow = {
  pdm_user_id: string;
  company_id: string;
  account_lifecycle_version: number | string;
  system_role_enabled: number | boolean;
  marker_status: string | null;
  marker_principal_id: string | null;
  marker_row_version: number | string | null;
  account_principal_id: string | null;
};

export type PrincipalOnlyActiveProfile = {
  pdmUserId: string;
  companyId: string;
  lifecycleVersion: number;
  systemRoleEnabled: boolean;
  markerStatus: "missing" | "legacy_compatible";
  markerPrincipalId: string | null;
  markerRowVersion: number;
};

export type PrincipalOnlyCohortSource = {
  contractVersion: "ai-pdm.principal-only-cohort-source.v1";
  cohortHash: string;
  sourceHash: string;
  verified: PrincipalInventoryCandidate;
  activeProfiles: PrincipalOnlyActiveProfile[];
  withheld: PrincipalOnlyActiveProfile[];
};

export class PrincipalOnlyCohortSourceError extends Error {
  constructor() { super("principal_only_cohort_source_invalid"); }
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalize(row: ActiveProfileRow): PrincipalOnlyActiveProfile {
  const lifecycleVersion = Number(row.account_lifecycle_version);
  const markerRowVersion = row.marker_row_version === null
    ? 0 : Number(row.marker_row_version);
  const roleEnabled = Number(row.system_role_enabled);
  if (!row.pdm_user_id || !row.company_id ||
    !Number.isSafeInteger(lifecycleVersion) || lifecycleVersion < 1 ||
    !Number.isSafeInteger(markerRowVersion) || markerRowVersion < 0 ||
    ![0, 1].includes(roleEnabled) || row.account_principal_id !== null ||
    ![null, "legacy_compatible"].includes(row.marker_status) ||
    (row.marker_status === null &&
      (row.marker_principal_id !== null || markerRowVersion !== 0)) ||
    (row.marker_status !== null && markerRowVersion < 1)) {
    throw new PrincipalOnlyCohortSourceError();
  }
  return {
    pdmUserId: row.pdm_user_id,
    companyId: row.company_id,
    lifecycleVersion,
    systemRoleEnabled: roleEnabled === 1,
    markerStatus: (row.marker_status ?? "missing") as "missing" | "legacy_compatible",
    markerPrincipalId: row.marker_principal_id,
    markerRowVersion
  };
}

/** This is one owner snapshot, not an authorization grant or a write plan. */
export async function capturePrincipalOnlyCohortSource(
  client: AsyncDatabaseClient,
  verifiedInput: PrincipalInventoryInput,
  firebaseProjectId = "jenfu-platform-prod",
  mode: "snapshot" | "locked_owner_apply" = "snapshot"
): Promise<PrincipalOnlyCohortSource> {
  if (client.kind !== "postgres" || !verifiedInput ||
    !/^[a-z][a-z0-9-]{0,62}$/u.test(firebaseProjectId)) {
    throw new PrincipalOnlyCohortSourceError();
  }
  let rows: ActiveProfileRow[];
  try {
    rows = await client.query<ActiveProfileRow>(`
      SELECT profile.id AS pdm_user_id, profile.company_id,
             profile.account_lifecycle_version, profile.system_role_enabled,
             marker.status AS marker_status,
             marker.principal_id AS marker_principal_id,
             marker.row_version AS marker_row_version,
             account.principal_id AS account_principal_id
      FROM ai_pdm_core.users profile
      LEFT JOIN ai_pdm_core.principal_identity_cutovers marker
        ON marker.pdm_user_id=profile.id
      LEFT JOIN ai_pdm_core.principal_accounts account
        ON account.pdm_user_id=profile.id
      WHERE profile.account_status='active'
      ORDER BY profile.id
    `);
  } catch {
    throw new PrincipalOnlyCohortSourceError();
  }
  if (rows.length < 1 || rows.length > 32) throw new PrincipalOnlyCohortSourceError();
  const activeProfiles = rows.map(normalize).sort((a, b) =>
    a.pdmUserId < b.pdmUserId ? -1 : a.pdmUserId > b.pdmUserId ? 1 : 0);
  if (new Set(activeProfiles.map((row) => row.pdmUserId)).size !== rows.length) {
    throw new PrincipalOnlyCohortSourceError();
  }
  const selected = activeProfiles.find((row) => row.pdmUserId === verifiedInput.pdmUserId);
  if (!selected || !selected.systemRoleEnabled ||
    selected.companyId !== verifiedInput.companyId) {
    throw new PrincipalOnlyCohortSourceError();
  }
  let verified: PrincipalInventoryCandidate;
  try {
    verified = await new JenfuPrincipalInventoryRepository(
      client, firebaseProjectId, mode, "firebase_bff"
    ).requireExactCandidate(verifiedInput);
  } catch {
    throw new PrincipalOnlyCohortSourceError();
  }
  if (verified.accountStatus !== "active" || !verified.systemRoleEnabled ||
    verified.lifecycleVersion !== selected.lifecycleVersion ||
    (selected.markerStatus === "legacy_compatible" &&
      selected.markerPrincipalId !== verified.principalId)) {
    throw new PrincipalOnlyCohortSourceError();
  }
  const withheld = activeProfiles.filter((row) => row.pdmUserId !== selected.pdmUserId);
  const cohortHash = digest(["ai-pdm.principal-only-cohort.v1",
    activeProfiles.map((row) => row.pdmUserId)]);
  const sourceHash = digest(["ai-pdm.principal-only-cohort-source.v1",
    activeProfiles, [verified.pdmUserId, verified.companyId,
      verified.principalId, verified.employeeId, verified.identityIssuer,
      verified.identitySubject, verified.sourceKind, verified.mappingVersion,
      verified.publishedAt, verified.accountType, verified.lifecycleVersion,
      verified.accountStatus, verified.systemRoleEnabled,
      verified.sessionInvalidBefore]]);
  return {
    contractVersion: "ai-pdm.principal-only-cohort-source.v1",
    cohortHash, sourceHash, verified, activeProfiles, withheld
  };
}

/** Read-only preparation; application and background traffic remain untouched. */
export async function previewPrincipalOnlyCohortSource(
  database: AsyncDatabaseClient,
  verifiedInput: PrincipalInventoryInput,
  firebaseProjectId = "jenfu-platform-prod"
) {
  if (database.kind !== "postgres") throw new PrincipalOnlyCohortSourceError();
  return database.transaction(async (client) => {
    await client.execute("SET LOCAL ROLE jenfu_ai_pdm_migrator");
    return capturePrincipalOnlyCohortSource(
      client, verifiedInput, firebaseProjectId, "snapshot"
    );
  }, { isolationLevel: "repeatable_read", readOnly: true });
}
