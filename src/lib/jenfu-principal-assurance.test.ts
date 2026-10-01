import { describe, expect, it } from "vitest";
import vectors from "../../contracts/jenfu-sso-handoff/v2/conformance-vectors.json";
import { principalAssurancePolicyHash, resolvePrincipalHandoffAssurance } from "@/lib/jenfu-principal-assurance";
import type { JenfuPrincipalHandoff } from "@/lib/jenfu-principal-handoff";

const authentication = vectors.valid.authentication as JenfuPrincipalHandoff["authentication"];
const policy = { enabled: true, domains: ["example.test"], allowAal1PrivilegedPilot: true };

describe("DEV-121 principal target assurance", () => {
  it("uses a versioned human AAL1 policy hash independent of legacy Workspace settings", () => {
    const expected = principalAssurancePolicyHash(policy);
    expect(expected).toMatch(/^[0-9a-f]{64}$/u);
    expect(principalAssurancePolicyHash({ ...policy, domains: ["JENFU.COM.TW"], enabled: false }))
      .toBe(expected);
  });

  it("accepts single-factor AAL1 for privileged principals without a pilot", () => {
    expect(resolvePrincipalHandoffAssurance({ authentication, policy })).toMatchObject({
      assuranceLevel: "aal1", secondFactor: null
    });
    expect(resolvePrincipalHandoffAssurance({
      authentication: { ...authentication, signInProvider: "password" }, policy
    })).toMatchObject({ assuranceLevel: "aal1", secondFactor: null });
  });

  it("preserves AAL2 only when the handoff carries a recognized same-session factor", () => {
    expect(resolvePrincipalHandoffAssurance({
      authentication: { ...authentication, assuranceLevel: "aal2", secondFactor: "totp" }, policy
    })).toMatchObject({ assuranceLevel: "aal2", secondFactor: "totp" });
    expect(() => resolvePrincipalHandoffAssurance({
      authentication: { ...authentication, assuranceLevel: "aal2",
        secondFactor: "google_workspace_mfa" as never }, policy
    })).toThrow("HANDOFF_FACTOR_INVALID");
  });

  it("rejects either AAL claim when it disagrees with the explicit factor fact", () => {
    expect(() => resolvePrincipalHandoffAssurance({
      authentication: { ...authentication, assuranceLevel: "aal1", secondFactor: "totp" }, policy
    })).toThrow("HANDOFF_FACTOR_INVALID");
    expect(() => resolvePrincipalHandoffAssurance({
      authentication: { ...authentication, assuranceLevel: "aal2", secondFactor: null }, policy
    })).toThrow("HANDOFF_FACTOR_INVALID");
  });
});
