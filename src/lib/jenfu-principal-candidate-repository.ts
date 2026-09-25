import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JENFU_ACTIVE_PRINCIPAL_CONTRACT_VERSION } from "@/lib/jenfu-principal-admission-repository";

export type JenfuPrincipalCandidate = {
  principalId: string;
  employeeId: string;
  accountType: "human_personal" | "human_privileged";
  identityIssuer: string;
  identitySubject: string;
  mappingVersion: number;
  publishedAt: string;
};

type CandidateRow = {
  contract_version: string;
  principal_issuer: string;
  principal_subject: string;
  principal_id: string;
  employee_id: string;
  employee_status: string;
  account_type: string;
  mapping_version: number | string;
  published_at: string | Date;
};

export class JenfuPrincipalCandidateError extends Error {
  constructor(readonly code: "principal_candidate_invalid" | "principal_candidate_unavailable" |
    "principal_candidate_contract_mismatch") { super(code); }
}

function exactText(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 255 &&
    value.trim() === value && /\S/u.test(value) && !/[\u0000-\u001f\u007f]/u.test(value);
}

/** Published OrgMaster identity facts only; no local email, UID, or user-ID matching. */
export class JenfuPrincipalCandidateRepository {
  constructor(private readonly client: Pick<AsyncDatabaseClient, "kind" | "query">) {}

  async listByPrincipal(principalId: string): Promise<JenfuPrincipalCandidate[]> {
    if (this.client.kind !== "postgres" || !exactText(principalId)) {
      throw new JenfuPrincipalCandidateError("principal_candidate_invalid");
    }
    let rows: CandidateRow[];
    try {
      rows = await this.client.query<CandidateRow>(`
        SELECT contract_version,principal_issuer,principal_subject,principal_id,
               employee_id,employee_status,account_type,mapping_version,published_at
        FROM orgmaster_contract.v_active_principal_accounts_v1
        WHERE principal_id=:principalId
        ORDER BY principal_issuer,principal_subject
        FETCH FIRST 33 ROWS ONLY
      `, { principalId });
    } catch {
      throw new JenfuPrincipalCandidateError("principal_candidate_unavailable");
    }
    if (rows.length > 32) throw new JenfuPrincipalCandidateError("principal_candidate_contract_mismatch");
    const pairs = new Set<string>();
    let owner: string | null = null;
    let type: JenfuPrincipalCandidate["accountType"] | null = null;
    return rows.map((row) => {
      const version = Number(row.mapping_version);
      const publishedAt = row.published_at instanceof Date ? row.published_at.toISOString() : String(row.published_at ?? "");
      const accountType = row.account_type;
      const pair = `${row.principal_issuer}\0${row.principal_subject}`;
      if (row.contract_version !== JENFU_ACTIVE_PRINCIPAL_CONTRACT_VERSION ||
        row.principal_id !== principalId || row.employee_status !== "active" ||
        !exactText(row.principal_issuer) || !exactText(row.principal_subject) || !exactText(row.employee_id) ||
        (accountType !== "human_personal" && accountType !== "human_privileged") ||
        !Number.isSafeInteger(version) || version < 1 || !Number.isFinite(Date.parse(publishedAt)) ||
        pairs.has(pair) || (owner !== null && owner !== row.employee_id) ||
        (type !== null && type !== accountType)) {
        throw new JenfuPrincipalCandidateError("principal_candidate_contract_mismatch");
      }
      pairs.add(pair);
      owner = row.employee_id;
      type = accountType;
      return { principalId, employeeId: row.employee_id, accountType,
        identityIssuer: row.principal_issuer, identitySubject: row.principal_subject,
        mappingVersion: version, publishedAt: new Date(publishedAt).toISOString() };
    });
  }
}
