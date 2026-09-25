import { describe, expect, it } from "vitest";
import vectors from "../../contracts/jenfu-sso-handoff/v2/conformance-vectors.json";
import { principalAssurancePolicyHash, resolvePrincipalHandoffAssurance } from "@/lib/jenfu-principal-assurance";
import type { JenfuPrincipalHandoff } from "@/lib/jenfu-principal-handoff";

const authentication = vectors.valid.authentication as JenfuPrincipalHandoff["authentication"];
const policy = { enabled: true, domains: ["example.test"], allowAal1PrivilegedPilot: true };

describe("DEV-121 principal target assurance", () => {
  it("binds a canonical policy hash independent of domain ordering and the legacy pilot flag", () => {
    const expected = principalAssurancePolicyHash({ ...policy, domains: ["example.test", "jenfu.com.tw"] });
    expect(principalAssurancePolicyHash({ ...policy, domains: ["JENFU.COM.TW", "example.test"] })).toBe(expected);
    expect(principalAssurancePolicyHash({ ...policy, domains: ["example.test", "jenfu.com.tw"], allowAal1PrivilegedPilot: false })).toBe(expected);
    expect(principalAssurancePolicyHash({ ...policy, enabled: false })).not.toBe(principalAssurancePolicyHash(policy));
  });

  it("recomputes target assurance from provider facts and account class without the AAL1 pilot", () => {
    const privileged = { accountType: "human_privileged" as const, minimumAssurance: "aal2" as const };
    expect(resolvePrincipalHandoffAssurance({ authentication, account: privileged, policy })).toMatchObject({
      assuranceLevel: "aal2", secondFactor: "google_workspace_mfa"
    });
    expect(() => resolvePrincipalHandoffAssurance({ authentication, account: privileged,
      policy: { ...policy, enabled: false } })).toThrow("auth_token_invalid");
    expect(() => resolvePrincipalHandoffAssurance({ authentication: { ...authentication, signInProvider: "password" },
      account: privileged, policy })).toThrow("auth_token_invalid");
    expect(resolvePrincipalHandoffAssurance({ authentication: { ...authentication, signInProvider: "password" },
      account: { accountType: "human_personal", minimumAssurance: "aal1" }, policy })).toMatchObject({
        assuranceLevel: "aal1", secondFactor: null
      });
  });

  it("rejects a claimed AAL1 proof that also carries an explicit second factor", () => {
    expect(() => resolvePrincipalHandoffAssurance({
      authentication: { ...authentication, secondFactor: "totp" },
      account: { accountType: "human_personal", minimumAssurance: "aal1" }, policy
    })).toThrow("HANDOFF_FACTOR_INVALID");
  });
});
