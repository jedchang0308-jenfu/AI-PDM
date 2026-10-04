import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { JenfuPrincipalAccountError } from "@/lib/jenfu-principal-account-repository";
import { JenfuPrincipalAdmissionError } from "@/lib/jenfu-principal-admission-repository";

const mocks = vi.hoisted(() => ({
  issuePrincipal: vi.fn(),
  legacyResolver: vi.fn(),
  producerConfig: null as null | { broker: string; base: string; issuer: string; callback: string },
  producerIdentityIssuer: null as string | null
}));

vi.mock("google-auth-library", () => ({
  Compute: class {
    async getAccessToken() { throw new Error("UNEXPECTED_STORAGE_ACCESS_IN_SSO_TEST"); }
  },
  GoogleAuth: class {
    async getIdTokenClient() {
      return { idTokenProvider: { async fetchIdToken() { return "task-service-token"; } } };
    }
  }
}));
vi.mock("@/lib/auth-config", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth-config")>(),
  getJenfuSsoHandoffConfig: () => mocks.producerConfig ?? ({
    broker: "https://platform.example", base: "https://pdm.example",
    issuer: "https://platform.example/api/sso",
    callback: "https://pdm.example/api/auth/jenfu-sso/callback"
  }),
  getJenfuIdentityConfig: () => ({ identityIssuer: mocks.producerIdentityIssuer ?? "https://identity.example", identityAudience: "identity-app" }),
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
  mocks.producerConfig = null;
  mocks.producerIdentityIssuer = null;
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

  it("rejects a v1 handoff instead of reopening the UID and cutover path", async () => {
    const started = await jenfuSsoStart(new Request("https://pdm.example/api/auth/jenfu-sso/start"));
    const state = new URL(started.headers.get("location")!).searchParams.get("state");
    const transactionCookie = started.headers.get("set-cookie")!.split(";")[0];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ...principalProof(), contractVersion: "jenfu.sso-handoff.v1"
    }), { status: 200 })));

    const callback = await jenfuSsoCallback(new Request(
      `https://pdm.example/api/auth/jenfu-sso/callback?code=one-time-code&state=${state}&iss=${encodeURIComponent("https://platform.example/api/sso")}`,
      { headers: { cookie: transactionCookie } }
    ));

    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("https://pdm.example/login?auth_error=sso_code_invalid");
    expect(mocks.issuePrincipal).not.toHaveBeenCalled();
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

  it("maps a typed missing published grant to access denied and never issues a session", async () => {
    const started = await jenfuSsoStart(new Request("https://pdm.example/api/auth/jenfu-sso/start"));
    const state = new URL(started.headers.get("location")!).searchParams.get("state");
    const transactionCookie = started.headers.get("set-cookie")!.split(";")[0];
    const proof = principalProof();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(proof), { status: 200 })));
    mocks.issuePrincipal.mockRejectedValueOnce(
      new JenfuEntitlementRepositoryError("permission_not_granted"));

    const callback = await jenfuSsoCallback(new Request(
      `https://pdm.example/api/auth/jenfu-sso/callback?code=one-time-code&state=${state}&iss=${encodeURIComponent(proof.issuer)}`,
      { headers: { cookie: transactionCookie } }
    ));

    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("https://pdm.example/login?auth_error=principal_access_denied");
    expect(callback.headers.get("location")).not.toContain("one-time-code");
    expect(callback.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(callback.headers.get("set-cookie")).not.toContain("principal.session.token");
    expect(mocks.legacyResolver).not.toHaveBeenCalled();
  });

  it.each([
    [new JenfuPrincipalAccountError("principal_account_inactive"), "principal_not_active"],
    [new JenfuPrincipalAccountError(), "sso_dependency_unavailable"],
    [new JenfuPrincipalAdmissionError("principal_not_active", 403), "principal_not_active"],
    [new JenfuPrincipalAdmissionError("principal_directory_unavailable", 503), "sso_dependency_unavailable"],
    [new JenfuPrincipalAdmissionError("principal_ambiguous", 403), "sso_dependency_unavailable"],
    [new JenfuPrincipalAdmissionError("auth_contract_mismatch", 409), "sso_dependency_unavailable"],
    [Object.assign(new Error("private database failure"), { code: "principal_account_inactive" }), "sso_dependency_unavailable"]
  ])("maps only a typed inactive account to login denial", async (failure, expected) => {
    const started = await jenfuSsoStart(new Request("https://pdm.example/api/auth/jenfu-sso/start"));
    const state = new URL(started.headers.get("location")!).searchParams.get("state");
    const transactionCookie = started.headers.get("set-cookie")!.split(";")[0];
    const proof = principalProof();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(proof), { status: 200 })));
    mocks.issuePrincipal.mockRejectedValueOnce(failure);
    const response = await jenfuSsoCallback(new Request(
      `https://pdm.example/api/auth/jenfu-sso/callback?code=one-time-code&state=${state}&iss=${encodeURIComponent(proof.issuer)}`,
      { headers: { cookie: transactionCookie } }
    ));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://pdm.example/login?auth_error=${expected}`);
    expect(response.headers.get("set-cookie")).not.toContain("principal.session.token");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(mocks.legacyResolver).not.toHaveBeenCalled();
  });

  it("keeps typed entitlement read failures as dependency errors", async () => {
    const started = await jenfuSsoStart(new Request("https://pdm.example/api/auth/jenfu-sso/start"));
    const state = new URL(started.headers.get("location")!).searchParams.get("state");
    const transactionCookie = started.headers.get("set-cookie")!.split(";")[0];
    const proof = principalProof();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(proof), { status: 200 })));
    mocks.issuePrincipal.mockRejectedValueOnce(
      new JenfuEntitlementRepositoryError("entitlement_authority_unavailable"));

    const callback = await jenfuSsoCallback(new Request(
      `https://pdm.example/api/auth/jenfu-sso/callback?code=one-time-code&state=${state}&iss=${encodeURIComponent(proof.issuer)}`,
      { headers: { cookie: transactionCookie } }
    ));

    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("https://pdm.example/login?auth_error=sso_dependency_unavailable");
    expect(callback.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(callback.headers.get("set-cookie")).not.toContain("principal.session.token");
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

const producerProofPath = process.env.DEV015_HANDOFF_PROOF_INPUT;
if (producerProofPath) {
  it("accepts the Platform producer proof through the AI-PDM callback without a UID resolver", async () => {
    const proof = (JSON.parse(readFileSync(producerProofPath, "utf8")) as { "ai-pdm": ReturnType<typeof principalProof> })["ai-pdm"];
    const broker = new URL(proof.issuer).origin;
    mocks.producerConfig = { broker, base: "https://ai-pdm.example.test", issuer: proof.issuer,
      callback: "https://ai-pdm.example.test/api/auth/jenfu-sso/callback" };
    mocks.producerIdentityIssuer = proof.identity.identityIssuer;
    const started = await jenfuSsoStart(new Request("https://ai-pdm.example.test/api/auth/jenfu-sso/start?returnTo=%2Fdrawings"));
    expect(started.status).toBe(303);
    const authorize = new URL(started.headers.get("location")!);
    expect(authorize.searchParams.get("redirect_uri")).toBe(mocks.producerConfig.callback);
    const transactionCookie = started.headers.get("set-cookie")!.split(";")[0];
    const exchange = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(proof), { status: 200 }));
    vi.stubGlobal("fetch", exchange);
    mocks.issuePrincipal.mockResolvedValue({ token: "principal.session.token" });
    const callback = new URL(mocks.producerConfig.callback);
    callback.searchParams.set("code", "producer-issued-code");
    callback.searchParams.set("state", authorize.searchParams.get("state")!);
    callback.searchParams.set("iss", proof.issuer);
    const accepted = await jenfuSsoCallback(new Request(callback, { headers: { cookie: transactionCookie } }));
    expect(accepted.status).toBe(303);
    expect(accepted.headers.get("set-cookie")).toContain("principal.session.token");
    expect(mocks.issuePrincipal).toHaveBeenCalledWith(expect.objectContaining({
      handoff: expect.objectContaining({ contractVersion: "jenfu.sso-handoff.v2", audience: "ai-pdm",
        identity: expect.objectContaining({ principalId: proof.identity.principalId }) }),
      expectedIdentityIssuer: proof.identity.identityIssuer
    }));
    expect(mocks.legacyResolver).not.toHaveBeenCalled();
    const body = new URLSearchParams(exchange.mock.calls[0][1]?.body as string);
    expect(body.get("redirect_uri")).toBe(mocks.producerConfig.callback);
  });
}
