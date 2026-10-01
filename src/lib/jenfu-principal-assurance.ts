import crypto from "node:crypto";
import type { GoogleWorkspaceMfaTrustPolicy } from "@/lib/auth-config";
import { resolveJenfuAssuranceFacts } from "@/lib/jenfu-auth-assurance";
import type { JenfuPrincipalHandoff } from "@/lib/jenfu-principal-handoff";

const RESOLVER_VERSION = "jenfu-ai-pdm-principal-assurance.v2";

export function principalAssurancePolicyHash(_policy: GoogleWorkspaceMfaTrustPolicy) {
  return crypto.createHash("sha256").update(JSON.stringify({
    resolverVersion: RESOLVER_VERSION,
    humanMinimumAssurance: "aal1",
    recognizedSecondFactors: ["totp"]
  })).digest("hex");
}

export function resolvePrincipalHandoffAssurance(input: {
  authentication: JenfuPrincipalHandoff["authentication"];
  policy: GoogleWorkspaceMfaTrustPolicy;
}) {
  const hasRecognizedFactor = input.authentication.secondFactor === "totp";
  if ((input.authentication.assuranceLevel === "aal2") !== hasRecognizedFactor) {
    throw new Error("HANDOFF_FACTOR_INVALID");
  }
  // Principal sessions trust only an explicit same-session factor. Workspace
  // email/domain inference and the legacy AAL1 pilot cannot manufacture AAL2.
  const assurance = resolveJenfuAssuranceFacts({
    email: input.authentication.email,
    signInProvider: input.authentication.signInProvider,
    secondFactor: input.authentication.secondFactor,
    requirePrivilegedAssurance: false,
    workspaceMfaTrustPolicy: { enabled: false, domains: [], allowAal1PrivilegedPilot: false }
  });
  return { ...assurance, secondFactor: input.authentication.secondFactor,
    assurancePolicyHash: principalAssurancePolicyHash(input.policy) };
}
