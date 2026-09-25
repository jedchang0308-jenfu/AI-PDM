import type { GoogleWorkspaceMfaTrustPolicy } from "@/lib/auth-config";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuAuthEpochRepository } from "@/lib/jenfu-auth-epoch-repository";
import { JenfuPrincipalAccountRepository } from "@/lib/jenfu-principal-account-repository";
import { JenfuPrincipalAdmissionRepository } from "@/lib/jenfu-principal-admission-repository";
import { principalAssurancePolicyHash } from "@/lib/jenfu-principal-assurance";
import { requiresPrincipalAal2 } from "@/lib/jenfu-principal-assurance-requirement";
import { verifyJenfuPrincipalSession } from "@/lib/jenfu-principal-session";
import { JenfuPrincipalSessionRegistry } from "@/lib/jenfu-principal-session-registry";
import type { PlatformSessionKeyRing } from "@/lib/platform-session-v2";

export class JenfuPrincipalRequestError extends Error {
  constructor(readonly code: "auth_session_invalid" | "auth_epoch_stale" | "principal_dependency_unavailable") {
    super(code);
  }
}

export type VerifiedJenfuPrincipalAppSession = {
  contractVersion: "jenfu.ai-pdm-session.v2";
  appId: "ai-pdm";
  sessionId: string;
  identityIssuer: string;
  identitySubject: string;
  principalId: string;
  employeeId: string;
  authEpoch: number;
  issuedAt: string;
  expiresAt: string;
  assuranceLevel: "aal1" | "aal2";
};

export type PrincipalRequestInput = {
  token: string;
  keyRing: PlatformSessionKeyRing;
  identityIssuer: string;
  trustPolicy: GoogleWorkspaceMfaTrustPolicy;
  database: AsyncDatabaseClient;
  nowSeconds?: number;
};

export type VerifiedPrincipalRequest = {
  profile: { pdmUserId: string; companyId: string };
  session: VerifiedJenfuPrincipalAppSession;
};

/** Keep principal admission and the eventual permission/resource decision in one snapshot. */
export async function withVerifiedJenfuPrincipalRequest<TResult>(
  input: PrincipalRequestInput,
  evaluate: (client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) => Promise<TResult>,
  options: { readOnly?: boolean; isolationLevel?: "repeatable_read" | "serializable" } = {}
): Promise<TResult> {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  let claims;
  try {
    claims = verifyJenfuPrincipalSession(input.token, input.keyRing, { nowSeconds });
  } catch {
    throw new JenfuPrincipalRequestError("auth_session_invalid");
  }
  if (claims.identityIssuer !== input.identityIssuer ||
    claims.assurancePolicyHash !== principalAssurancePolicyHash(input.trustPolicy) ||
    input.database.kind !== "postgres") {
    throw new JenfuPrincipalRequestError("auth_session_invalid");
  }

  let evaluatorError: unknown;
  try {
    return await input.database.transaction(async (client) => {
      let verified: VerifiedPrincipalRequest;
      try {
        await client.execute("SET LOCAL statement_timeout = '5s'");
        await client.execute("SET LOCAL lock_timeout = '2s'");
        const typed = await new JenfuPrincipalAdmissionRepository(client)
          .requireActiveTypedPrincipal(claims.identityIssuer, claims.identitySubject);
        const state = await new JenfuAuthEpochRepository(client)
          .readCanonicalPrincipalState(claims.principalId);
        const account = await new JenfuPrincipalAccountRepository(client)
          .requireActive(claims.principalId);
        const registered = await new JenfuPrincipalSessionRegistry(client)
          .isActive(claims, nowSeconds * 1000);
        // The historical PDM user row is a domain profile, never a role or
        // lifecycle authority for a principal session.
        const profile = await client.queryOne<{ id: string; company_id: string }>(`
          SELECT profile.id,profile.company_id
          FROM ai_pdm_core.users profile
          JOIN ai_pdm_core.principal_accounts owner
            ON owner.pdm_user_id=profile.id AND owner.company_id=profile.company_id
           AND owner.principal_id=:principalId
          JOIN ai_pdm_core.principal_identity_cutovers cutover
            ON cutover.pdm_user_id=profile.id AND cutover.principal_id=owner.principal_id
           AND cutover.status='principal_active'
          WHERE profile.id=:pdmUserId AND profile.company_id=:companyId
        `, { pdmUserId: account.pdmUserId, companyId: account.companyId,
          principalId: account.principalId });

        if (typed.principalId !== claims.principalId || typed.employeeId !== claims.employeeId ||
          typed.accountType !== account.accountType || account.employeeId !== claims.employeeId ||
          account.companyId !== claims.companyId ||
          account.lifecycleVersion !== claims.accountLifecycleVersion ||
          account.profileVersion !== claims.profileVersion ||
          state.authEpoch !== claims.authEpoch || !registered ||
          !profile || profile.id !== account.pdmUserId || profile.company_id !== account.companyId ||
          (account.minimumAssurance === "aal2" && claims.assuranceLevel !== "aal2") ||
          (account.accountType === "human_privileged" && claims.assuranceLevel !== "aal2")) {
          throw new JenfuPrincipalRequestError("auth_session_invalid");
        }
        if (state.revokedBefore && claims.authenticatedAt * 1000 <= Date.parse(state.revokedBefore)) {
          throw new JenfuPrincipalRequestError("auth_epoch_stale");
        }
        if (account.sessionInvalidBefore &&
            claims.issuedAt * 1000 <= Date.parse(account.sessionInvalidBefore)) {
          throw new JenfuPrincipalRequestError("auth_session_invalid");
        }
        if (claims.assuranceLevel !== "aal2" && await requiresPrincipalAal2(client, {
          principalId: claims.principalId, employeeId: claims.employeeId,
          identityIssuer: claims.identityIssuer, identitySubject: claims.identitySubject
        })) {
          throw new JenfuPrincipalRequestError("auth_session_invalid");
        }
        verified = { profile: { pdmUserId: profile.id, companyId: profile.company_id }, session: {
          contractVersion: "jenfu.ai-pdm-session.v2",
          appId: "ai-pdm",
          sessionId: claims.sessionId,
          identityIssuer: claims.identityIssuer,
          identitySubject: claims.identitySubject,
          principalId: claims.principalId,
          employeeId: claims.employeeId,
          authEpoch: claims.authEpoch,
          issuedAt: new Date(claims.issuedAt * 1000).toISOString(),
          expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
          assuranceLevel: claims.assuranceLevel
        } };
      } catch (error) {
        if (error instanceof JenfuPrincipalRequestError) throw error;
        throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
      }
      try { return await evaluate(client, verified); }
      catch (error) { evaluatorError = error; throw error; }
    }, { isolationLevel: options.isolationLevel ?? "repeatable_read",
      readOnly: options.readOnly !== false });
  } catch (error) {
    if (error === evaluatorError && error !== undefined) throw error;
    if (error instanceof JenfuPrincipalRequestError) throw error;
    throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
  }
}
