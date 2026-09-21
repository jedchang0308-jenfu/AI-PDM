import { describe, expect, it } from "vitest";
import { getJenfuSsoHandoffConfig, getJenfuSsoHandoffEntryState } from "@/lib/auth-config";
import { resolveJenfuAssurance } from "@/lib/jenfu-platform-identity-contract";
import { resolveJenfuTargetSessionExpiry, safeJenfuSsoReturnTo } from "@/lib/jenfu-sso-handoff";

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

  it("caps the target session by the app and source session, not the short-lived handoff assertion", () => {
    const now = Math.floor(Date.parse("2026-09-21T00:00:00.000Z") / 1000);

    expect(resolveJenfuTargetSessionExpiry(now, "2026-09-21T12:00:00.000Z")).toBe(now + 8 * 60 * 60);
    expect(resolveJenfuTargetSessionExpiry(now, "2026-09-21T01:00:00.000Z")).toBe(now + 60 * 60);
    expect(() => resolveJenfuTargetSessionExpiry(now, "2026-09-21T00:00:00.000Z")).toThrowError("HANDOFF_EXPIRED");
  });

  it("exposes SSO only when the complete static handoff contract is valid", () => {
    const valid: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      PDM_AUTH_MODE: "firebase_bff",
      PDM_JENFU_PLATFORM_AUTH_MODE: "on",
      PDM_JENFU_SSO_HANDOFF_MODE: "on",
      PDM_JENFU_SSO_BROKER_ORIGIN: "https://platform.example",
      PDM_PUBLIC_BASE_URL: "https://pdm.example"
    };
    expect(getJenfuSsoHandoffEntryState(valid)).toBe("on");
    expect(getJenfuSsoHandoffConfig(valid)).toEqual({
      broker: "https://platform.example",
      base: "https://pdm.example",
      issuer: "https://platform.example/api/sso",
      callback: "https://pdm.example/api/auth/jenfu-sso/callback"
    });
    expect(getJenfuSsoHandoffEntryState({ ...valid, PDM_JENFU_SSO_BROKER_ORIGIN: "" })).toBe("invalid");
    expect(getJenfuSsoHandoffEntryState({ ...valid, PDM_JENFU_SSO_HANDOFF_MODE: "maybe" })).toBe("invalid");
    expect(getJenfuSsoHandoffEntryState({ ...valid, PDM_JENFU_PLATFORM_AUTH_MODE: "off" })).toBe("invalid");
    expect(getJenfuSsoHandoffEntryState({ ...valid, PDM_JENFU_SSO_BROKER_ORIGIN: "https://platform.example/api" })).toBe("invalid");
    expect(getJenfuSsoHandoffEntryState({ ...valid, PDM_JENFU_SSO_HANDOFF_MODE: "off" })).toBe("off");
  });
});
