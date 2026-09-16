import { describe, expect, it } from "vitest";
import { resolveJenfuAssurance } from "@/lib/jenfu-platform-identity-contract";
import { safeJenfuSsoReturnTo } from "@/lib/jenfu-sso-handoff";

describe("DEV-013 target handoff guards", () => {
  it("keeps return paths local and prevents auth-loop paths", () => {
    expect(safeJenfuSsoReturnTo("/drawings?tab=recent")).toBe("/drawings?tab=recent");
    expect(safeJenfuSsoReturnTo("//evil.example")).toBe("/");
    expect(safeJenfuSsoReturnTo("/login")).toBe("/");
    expect(safeJenfuSsoReturnTo("/api/auth/jenfu-sso/start")).toBe("/");
    expect(safeJenfuSsoReturnTo("/%2F%2Fevil.example")).toBe("/");
  });

  it("rebuilds the existing assurance policy from verified facts", () => {
    const trusted = resolveJenfuAssurance({ email: "owner@jenfu.com.tw", signInProvider: "google.com", secondFactor: "totp", requirePrivilegedAssurance: true, workspaceMfaTrustPolicy: { enabled: true, allowAal1PrivilegedPilot: false, domains: ["jenfu.com.tw"] } });
    expect(trusted).toEqual({ assuranceLevel: "aal2", secondFactor: "totp" });
    expect(() => resolveJenfuAssurance({ email: "owner@jenfu.com.tw", signInProvider: "password", secondFactor: null, requirePrivilegedAssurance: true, workspaceMfaTrustPolicy: { enabled: false, allowAal1PrivilegedPilot: false, domains: ["jenfu.com.tw"] } })).toThrowError("auth_token_invalid");
  });
});
