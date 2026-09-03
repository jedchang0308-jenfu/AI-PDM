import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export const JENFU_PLATFORM_AUTH_CONTRACT_VERSION = "jenfu.platform-auth.v1" as const;
export const JENFU_ACTIVE_PRINCIPAL_CONTRACT_VERSION = "organization.active-principal.v1" as const;

export type CanonicalJenfuPrincipalV1 = {
  contractVersion: typeof JENFU_PLATFORM_AUTH_CONTRACT_VERSION;
  directoryContractVersion: typeof JENFU_ACTIVE_PRINCIPAL_CONTRACT_VERSION;
  identityIssuer: string;
  identitySubject: string;
  principalId: string;
  employeeId: string;
  mappingVersion: number;
  publishedAt: string;
};

type ActivePrincipalRow = {
  contract_version: string;
  principal_issuer: string;
  principal_subject: string;
  principal_id: string;
  employee_id: string;
  employee_status: string;
  mapping_version: number | string;
  published_at: string | Date;
};

const SELECT_ACTIVE_PRINCIPAL_SQL = `
  SELECT contract_version, principal_issuer, principal_subject, principal_id,
         employee_id, employee_status, mapping_version, published_at
  FROM organization.v_active_principal_mappings_v1
  WHERE principal_issuer = :identityIssuer
    AND principal_subject = :identitySubject
  ORDER BY principal_id, employee_id
  FETCH FIRST 2 ROWS ONLY
`;

export type JenfuPrincipalAdmissionErrorCode =
  | "principal_not_active"
  | "principal_ambiguous"
  | "principal_directory_unavailable"
  | "auth_contract_mismatch";

export class JenfuPrincipalAdmissionError extends Error {
  constructor(
    readonly code: JenfuPrincipalAdmissionErrorCode,
    readonly httpStatus: number
  ) {
    super(code);
    this.name = "JenfuPrincipalAdmissionError";
  }
}

function requiredText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length >= 1 && normalized.length <= 255 ? normalized : null;
}

function mapPrincipal(row: ActivePrincipalRow, identityIssuer: string, identitySubject: string): CanonicalJenfuPrincipalV1 {
  const mappingVersion = Number(row.mapping_version);
  const publishedAt = row.published_at instanceof Date ? row.published_at.toISOString() : String(row.published_at ?? "");
  const principalId = requiredText(row.principal_id);
  const employeeId = requiredText(row.employee_id);
  if (
    row.contract_version !== JENFU_ACTIVE_PRINCIPAL_CONTRACT_VERSION ||
    row.principal_issuer !== identityIssuer ||
    row.principal_subject !== identitySubject ||
    row.employee_status !== "active" ||
    !principalId ||
    !employeeId ||
    !Number.isSafeInteger(mappingVersion) ||
    mappingVersion < 1 ||
    !Number.isFinite(Date.parse(publishedAt))
  ) {
    throw new JenfuPrincipalAdmissionError("auth_contract_mismatch", 409);
  }
  return {
    contractVersion: JENFU_PLATFORM_AUTH_CONTRACT_VERSION,
    directoryContractVersion: JENFU_ACTIVE_PRINCIPAL_CONTRACT_VERSION,
    identityIssuer,
    identitySubject,
    principalId,
    employeeId,
    mappingVersion,
    publishedAt: new Date(publishedAt).toISOString()
  };
}

export class JenfuPrincipalAdmissionRepository {
  constructor(private readonly client: Pick<AsyncDatabaseClient, "kind" | "query">) {}

  async requireActivePrincipal(identityIssuer: string, identitySubject: string): Promise<CanonicalJenfuPrincipalV1> {
    if (this.client.kind !== "postgres") {
      throw new JenfuPrincipalAdmissionError("principal_directory_unavailable", 503);
    }
    let rows: ActivePrincipalRow[];
    try {
      rows = await this.client.query<ActivePrincipalRow>(SELECT_ACTIVE_PRINCIPAL_SQL, {
        identityIssuer,
        identitySubject
      });
    } catch (error) {
      if (error instanceof JenfuPrincipalAdmissionError) throw error;
      throw new JenfuPrincipalAdmissionError("principal_directory_unavailable", 503);
    }
    if (rows.length === 0) throw new JenfuPrincipalAdmissionError("principal_not_active", 403);
    if (rows.length !== 1) throw new JenfuPrincipalAdmissionError("principal_ambiguous", 403);
    return mapPrincipal(rows[0], identityIssuer, identitySubject);
  }
}
