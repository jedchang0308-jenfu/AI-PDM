import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issuePrincipal: vi.fn(),
  legacyResolver: vi.fn()
}));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getIdTokenClient() {
      return { idTokenProvider: { async fetchIdToken() { return "task-service-token"; } } };
    }
  }
}));
vi.mock("@/lib/auth-config", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth-config")>(),
  getJenfuSsoHandoffConfig: () => ({
    broker: "https://platform.example", base: "https://pdm.example",
    issuer: "https://platform.example/api/sso",
    callback: "https://pdm.example/api/auth/jenfu-sso/callback"
  }),
  getJenfuIdentityConfig: () => ({ identityIssuer: "https://identity.example", identityAudience: "identity-app" }),
  getGoogleWorkspaceMfaTrustPolicy: () => ({ enabled: false, domains: ["example.com"], allowAal1PrivilegedPilot: false })
}));
vi.mock("@/lib/platform-session-key-ring", () => ({
  getPlatformSessionKeyRing: () => ({
    issuer: "https://pdm.example", audience: "ai-pdm", currentKeyId: "one",
    keys: { one: "task-only-test-signing-key-at-least-32-bytes" }
  })
}));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: () => ({ kind: "postgres" }) }));
vi.mock("@/lib/jenfu-principal-handoff-session-service", () => ({
  issueSessionForPrincipalHandoff: mocks.issuePrincipal
}));
vi.mock("@/lib/firebase-platform-principal-repository", () => ({
  FirebasePlatformPrincipalRepository: class {
    constructor() { mocks.legacyResolver(); }
  }
}));

import { jenfuSsoCallback, jenfuSsoStart } from "@/lib/jenfu-sso-handoff";

function principalProof(now = Date.now()) {
  return {
    contractVersion: "jenfu.sso-handoff.v2", issuer: "https://platform.example/api/sso",
    audience: "ai-pdm",
    identity: { identityIssuer: "https://identity.example", identitySubject: "provider-one",
      principalId: "principal-one", employeeId: "employee-one" },
    authentication: { authenticatedAt: new Date(now - 60_000).toISOString(), email: "one@example.com",
      emailVerified: true, signInProvider: "google.com", secondFactor: null, assuranceLevel: "aal1" },
    authState: { authEpoch: 0, revokedBefore: null },
    sourceSessionExpiresAt: new Date(now + 3_600_000).toISOString(),
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30_000).toISOString()
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("principal-first SSO callback routing", () => {
  it("accepts a v2 proof through the principal issuer without calling the UID resolver", async () => {
    const started = await jenfuSsoStart(new Request("https://pdm.example/api/auth/jenfu-sso/start?returnTo=%2Fdrawings"));
    const authorization = new URL(started.headers.get("location")!);
    const state = authorization.searchParams.get("state");
    const transactionCookie = started.headers.get("set-cookie")!.split(";")[0];
    const proof = principalProof();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(proof), { status: 200 })));
    mocks.issuePrincipal.mockResolvedValue({ token: "principal.session.token" });

    const callback = await jenfuSsoCallback(new Request(
      `https://pdm.example/api/auth/jenfu-sso/callback?code=one&state=${state}&iss=${encodeURIComponent(proof.issuer)}`,
      { headers: { cookie: transactionCookie } }
    ));

    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("https://pdm.example/drawings");
    expect(callback.headers.get("set-cookie")).toContain("principal.session.token");
    expect(mocks.issuePrincipal).toHaveBeenCalledWith(expect.objectContaining({
      handoff: expect.objectContaining({ contractVersion: "jenfu.sso-handoff.v2" }),
      expectedIdentityIssuer: "https://identity.example"
    }));
    expect(mocks.legacyResolver).not.toHaveBeenCalled();
  });

  it("returns a clean login URL when the principal is not active", async () => {
    const started = await jenfuSsoStart(new Request("https://pdm.example/api/auth/jenfu-sso/start"));
    const state = new URL(started.headers.get("location")!).searchParams.get("state");
    const transactionCookie = started.headers.get("set-cookie")!.split(";")[0];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(principalProof()), { status: 200 })));
    mocks.issuePrincipal.mockRejectedValueOnce(new Error("PRINCIPAL_NOT_ACTIVE"));

    const callback = await jenfuSsoCallback(new Request(
      `https://pdm.example/api/auth/jenfu-sso/callback?code=one-time-code&state=${state}&iss=${encodeURIComponent("https://platform.example/api/sso")}`,
      { headers: { cookie: transactionCookie } }
    ));

    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("https://pdm.example/login?auth_error=principal_not_active");
    expect(callback.headers.get("location")).not.toContain("one-time-code");
    expect(callback.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(callback.headers.get("set-cookie")).toContain("Secure");
    expect(callback.headers.get("set-cookie")).toContain("HttpOnly");
    expect(callback.headers.get("referrer-policy")).toBe("no-referrer");
    expect(callback.headers.get("cache-control")).toBe("no-store");
    expect(mocks.legacyResolver).not.toHaveBeenCalled();
  });

  it("clears an invalid transaction and strips the authorization code", async () => {
    const callback = await jenfuSsoCallback(new Request(
      "https://pdm.example/api/auth/jenfu-sso/callback?code=one-time-code&state=wrong&iss=https%3A%2F%2Fplatform.example%2Fapi%2Fsso"
    ));
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("https://pdm.example/login?auth_error=sso_request_invalid");
    expect(callback.headers.get("location")).not.toContain("one-time-code");
    expect(callback.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(callback.headers.get("set-cookie")).toContain("Secure");
  });
});
