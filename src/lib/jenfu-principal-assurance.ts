import crypto from "node:crypto";
import type { GoogleWorkspaceMfaTrustPolicy } from "@/lib/auth-config";
import { resolveJenfuAssurance } from "@/lib/jenfu-platform-identity-contract";
import type { JenfuPrincipalAccount } from "@/lib/jenfu-principal-account-repository";
import type { JenfuPrincipalHandoff } from "@/lib/jenfu-principal-handoff";

const RESOLVER_VERSION = "jenfu-ai-pdm-principal-assurance.v1";

export function principalAssurancePolicyHash(policy: GoogleWorkspaceMfaTrustPolicy) {
  const domains = [...new Set(policy.domains.map((value) => value.trim().toLowerCase()))].sort();
  return crypto.createHash("sha256").update(JSON.stringify({
    resolverVersion: RESOLVER_VERSION,
    workspaceMfaTrustEnabled: policy.enabled === true,
    domains,
    principalPrivilegedAal1PilotAllowed: false
  })).digest("hex");
}

export function resolvePrincipalHandoffAssurance(input: {
  authentication: JenfuPrincipalHandoff["authentication"];
  account: Pick<JenfuPrincipalAccount, "accountType" | "minimumAssurance">;
  policy: GoogleWorkspaceMfaTrustPolicy;
  requiresPrivilegedRole?: boolean;
}) {
  if (input.authentication.assuranceLevel === "aal1" && input.authentication.secondFactor !== null) {
    throw new Error("HANDOFF_FACTOR_INVALID");
  }
  const requiredAal2 = input.account.accountType === "human_privileged" ||
    input.account.minimumAssurance === "aal2" || input.requiresPrivilegedRole === true;
  // The transitional AAL1 pilot is not a principal-account policy. Source
  // assurance is not copied over; target assurance is recomputed from facts.
  const assurance = resolveJenfuAssurance({
    email: input.authentication.email,
    signInProvider: input.authentication.signInProvider,
    secondFactor: input.authentication.secondFactor,
    requirePrivilegedAssurance: requiredAal2,
    workspaceMfaTrustPolicy: { ...input.policy, allowAal1PrivilegedPilot: false }
  });
  return { ...assurance, assurancePolicyHash: principalAssurancePolicyHash(input.policy) };
}
