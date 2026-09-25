import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PrincipalInventoryCandidate } from "@/lib/jenfu-principal-inventory-repository";
import {
  canonicalPrincipalSource, hashPrincipalSource, orderedPrincipalSourceRows
} from "@/lib/jenfu-principal-source-canonical";

type ProducerSnapshotRow = {
  ordinal: number;
  principal_id: string;
  employee_id: string;
  identity_issuer: string;
  identity_subject: string;
  states: unknown;
  active_accounts: unknown;
  authorities: unknown;
  grants: unknown;
};

function invalid(): never { throw new Error("PRINCIPAL_PRODUCER_SOURCE_INVALID"); }
function nonNegativeInteger(value: unknown): value is number | string {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/u.test(value))) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0;
}
function facts(value: unknown, maximum: number): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) =>
    !item || typeof item !== "object" || Array.isArray(item))) invalid();
  return value as Record<string, unknown>[];
}

/** Caller owns a single read-only RR owner transaction and has already verified each alias. */
export async function capturePrincipalCutoverProducerSource(
  snapshot: AsyncDatabaseClient,
  candidateSets: readonly (readonly PrincipalInventoryCandidate[])[]
) {
  if (snapshot.kind !== "postgres" || candidateSets.length < 1 || candidateSets.length > 32) invalid();
  const requested: Array<Record<string, string | number>> = [];
  const seenPrincipals = new Set<string>();
  const seenAliases = new Set<string>();
  for (const candidates of candidateSets) {
    const first = candidates[0];
    if (!first || seenPrincipals.has(first.principalId) || candidates.length > 2 ||
      candidates.some((row) => row.principalId !== first.principalId ||
        row.employeeId !== first.employeeId || row.pdmUserId !== first.pdmUserId)) invalid();
    seenPrincipals.add(first.principalId);
    for (const candidate of candidates) {
      const alias = JSON.stringify([candidate.identityIssuer, candidate.identitySubject]);
      if (seenAliases.has(alias)) invalid();
      seenAliases.add(alias);
      requested.push({ ordinal: requested.length, principal_id: candidate.principalId,
        employee_id: candidate.employeeId, identity_issuer: candidate.identityIssuer,
        identity_subject: candidate.identitySubject });
    }
  }

  // One statement snapshot across all three producer contracts. Bounded subqueries
  // preserve duplicate-cardinality evidence instead of picking a first row.
  const rows = await snapshot.query<ProducerSnapshotRow>(`
    WITH requested AS (
      SELECT * FROM jsonb_to_recordset(:requested::jsonb) AS item(
        ordinal integer, principal_id text, employee_id text,
        identity_issuer text, identity_subject text)
    )
    SELECT requested.*,
      (SELECT COALESCE(jsonb_agg(to_jsonb(state)), '[]'::jsonb)
       FROM (SELECT principal_id,auth_epoch::text,revoked_before::text,version::text
             FROM platform_contract.read_principal_auth_state_v3(requested.principal_id)
             LIMIT 2) state) AS states,
      (SELECT COALESCE(jsonb_agg(to_jsonb(account)), '[]'::jsonb)
       FROM (SELECT * FROM orgmaster_contract.v_active_principal_accounts_v1
             WHERE principal_issuer=requested.identity_issuer
               AND principal_subject=requested.identity_subject
             LIMIT 2) account) AS active_accounts,
      (SELECT COALESCE(jsonb_agg(to_jsonb(authority)), '[]'::jsonb)
       FROM (SELECT * FROM orgmaster_contract.v_ai_pdm_entitlement_authority_v1
             WHERE application_id='ai-pdm'
               AND (employee_id=requested.employee_id OR employee_id IS NULL)
             LIMIT 2) authority) AS authorities,
      (SELECT COALESCE(jsonb_agg(to_jsonb(grant_row)), '[]'::jsonb)
       FROM (SELECT * FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v2
             WHERE application_id='ai-pdm'
               AND principal_id=requested.principal_id
               AND employee_id=requested.employee_id
             LIMIT 33) grant_row) AS grants
    FROM requested
    ORDER BY requested.ordinal
  `, { requested: JSON.stringify(requested) });
  if (rows.length !== requested.length) invalid();

  const principalStates: Array<Record<string, unknown>> = [];
  const activeAccounts: Array<Record<string, unknown>> = [];
  const authorities: Array<Record<string, unknown>> = [];
  const grants: Array<Record<string, unknown>> = [];
  const stateByPrincipal = new Map<string, string>();
  const authorityByPrincipal = new Map<string, string>();
  const grantsByPrincipal = new Map<string, string>();
  const candidates = candidateSets.flat();
  for (const [index, row] of rows.entries()) {
    const candidate = candidates[index];
    if (row.ordinal !== index || row.principal_id !== candidate.principalId ||
      row.employee_id !== candidate.employeeId ||
      row.identity_issuer !== candidate.identityIssuer ||
      row.identity_subject !== candidate.identitySubject) invalid();

    const states = facts(row.states, 2);
    const accounts = facts(row.active_accounts, 2);
    const authorityRows = facts(row.authorities, 2);
    const grantRows = facts(row.grants, 33);
    if (states.length !== 1 || accounts.length !== 1 || authorityRows.length !== 1 ||
      grantRows.length > 32) invalid();
    const state = states[0];
    if (state.principal_id !== candidate.principalId ||
      !nonNegativeInteger(state.auth_epoch) || !nonNegativeInteger(state.version) ||
      Number(state.version) < 1 ||
      (state.revoked_before !== null &&
        (typeof state.revoked_before !== "string" || !Number.isFinite(Date.parse(state.revoked_before))))) invalid();
    const stateKey = canonicalPrincipalSource(state);
    if (stateByPrincipal.has(candidate.principalId)) {
      if (stateByPrincipal.get(candidate.principalId) !== stateKey) invalid();
    } else {
      stateByPrincipal.set(candidate.principalId, stateKey);
      principalStates.push(state);
    }

    const account = accounts[0];
    if (account.contract_version !== "organization.active-principal.v1" ||
      account.principal_issuer !== candidate.identityIssuer ||
      account.principal_subject !== candidate.identitySubject ||
      account.principal_id !== candidate.principalId ||
      account.employee_id !== candidate.employeeId ||
      account.employee_status !== "active" ||
      account.account_type !== candidate.accountType ||
      !nonNegativeInteger(account.mapping_version) ||
      Number(account.mapping_version) !== candidate.mappingVersion ||
      typeof account.published_at !== "string" ||
      Date.parse(account.published_at) !== Date.parse(candidate.publishedAt)) invalid();
    activeAccounts.push({ identityIssuer: candidate.identityIssuer,
      identitySubject: candidate.identitySubject, fact: account });

    const authority = authorityRows[0];
    if (authority.contract_version !== "jenfu.platform-entitlement.v1" ||
      authority.application_id !== "ai-pdm" ||
      (authority.employee_id !== candidate.employeeId && authority.employee_id !== null) ||
      !["legacy_authority", "orgmaster_authority"].includes(String(authority.authority_source)) ||
      !nonNegativeInteger(authority.authority_version) ||
      Number(authority.authority_version) < 1) invalid();
    const authorityKey = canonicalPrincipalSource(authority);
    if (authorityByPrincipal.has(candidate.principalId)) {
      if (authorityByPrincipal.get(candidate.principalId) !== authorityKey) invalid();
    } else {
      authorityByPrincipal.set(candidate.principalId, authorityKey);
      authorities.push({ principalId: candidate.principalId, fact: authority });
    }

    if (authority.authority_source === "legacy_authority" && grantRows.length > 0) invalid();
    for (const grant of grantRows) {
      if (grant.contract_version !== "jenfu.orgmaster.ai-pdm-principal-grants.v2" ||
        grant.application_id !== "ai-pdm" || grant.principal_id !== candidate.principalId ||
        grant.employee_id !== candidate.employeeId ||
        "identity_issuer" in grant || "identity_subject" in grant ||
        !nonNegativeInteger(grant.authority_version) ||
        Number(grant.authority_version) !== Number(authority.authority_version)) invalid();
    }
    // Provider aliases prove admission; the authorization source is one
    // principal-keyed grant set, read in the same owner snapshot.
    const principalGrants = orderedPrincipalSourceRows(grantRows);
    const grantKeys = principalGrants.map(canonicalPrincipalSource);
    if (new Set(grantKeys).size !== grantKeys.length) invalid();
    const grantsKey = canonicalPrincipalSource(principalGrants);
    if (grantsByPrincipal.has(candidate.principalId)) {
      if (grantsByPrincipal.get(candidate.principalId) !== grantsKey) invalid();
    } else {
      grantsByPrincipal.set(candidate.principalId, grantsKey);
      grants.push({ principalId: candidate.principalId, facts: principalGrants });
    }
  }
  return hashPrincipalSource({
    contractVersion: "ai-pdm.principal-cutover-producer-source.v2",
    principalStates: orderedPrincipalSourceRows(principalStates),
    activeAccounts: orderedPrincipalSourceRows(activeAccounts),
    authorities: orderedPrincipalSourceRows(authorities),
    grants: orderedPrincipalSourceRows(grants)
  });
}
