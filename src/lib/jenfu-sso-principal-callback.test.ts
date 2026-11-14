import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { JenfuPrincipalAccountError } from "@/lib/jenfu-principal-account-repository";
import { JenfuPrincipalAdmissionError } from "@/lib/jenfu-principal-admission-repository";

const mocks = vi.hoisted(() => ({
  issuePrincipal: vi.fn(),
  legacyResolver: vi.fn(),
  producerConfig: null as null | { broker: string; base: string; issuer: string; callback: string },
  producerIdentityIssuer: null as string | null,
  database: null as unknown
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
  getAuthMode: () => "firebase_bff",
  getJenfuPlatformAuthMode: () => "on",
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
vi.mock("@/lib/db-async-provider", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/db-async-provider")>(),
  getAsyncDatabaseClient: () => mocks.database ?? { kind: "postgres" }
}));
vi.mock("@/lib/jenfu-principal-handoff-session-service", async importOriginal => {
  const native = await importOriginal<typeof import("@/lib/jenfu-principal-handoff-session-service")>();
  return {
    issueSessionForPrincipalHandoff: (input: Parameters<typeof native.issueSessionForPrincipalHandoff>[0]) =>
      mocks.database ? native.issueSessionForPrincipalHandoff(input) : mocks.issuePrincipal(input)
  };
});
vi.mock("@/lib/entitlement-config", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/entitlement-config")>(),
  getJenfuEntitlementMode: () => "enforce"
}));
vi.mock("@/lib/jenfu-principal-role-catalog", async importOriginal => {
  const catalog = await importOriginal<typeof import("@/lib/jenfu-principal-role-catalog")>();
  return { ...catalog, requirePublishedPrincipalCatalog: async () => catalog.principalCatalog };
});
vi.mock("@/lib/firebase-platform-principal-repository", () => ({
  FirebasePlatformPrincipalRepository: class {
    constructor() { mocks.legacyResolver(); }
  }
}));

import { jenfuSsoCallback, jenfuSsoStart } from "@/lib/jenfu-sso-handoff";
import { GET as numberingPermissions } from "@/app/api/numbering/permissions/route";

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
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mocks.producerConfig = null;
  mocks.producerIdentityIssuer = null;
  mocks.database = null;
});

describe("principal-first SSO callback routing", () => {
  it("reads one grant source on first and returning SSO login, then serves the normal permission API locally", async () => {
    vi.stubEnv("PDM_SESSION_REVOCATION_ENABLED", "1");
    vi.stubEnv("PDM_SESSION_PERMISSION_SNAPSHOTS_ENABLED", "1");
    let provisioned = false;
    let storedPermissions: unknown;
    let sourceCalls = 0;
    const proof = principalProof();
    const { identity } = proof;
    const now = new Date().toISOString();
    const identityRow = {
      contract_version: "organization.active-principal.v1", principal_issuer: identity.identityIssuer,
      principal_subject: identity.identitySubject, principal_id: identity.principalId,
      employee_id: identity.employeeId, employee_status: "active", account_type: "human_personal",
      mapping_version: 1, published_at: now
    };
    const authority = {
      contract_version: "orgmaster.ai-pdm-session-authority.v1", source_version: "9",
      evaluated_at: now, next_boundary: null, accounts: [identityRow], grants: [{
        contract_version: "jenfu.orgmaster.ai-pdm-principal-grants.v6", application_id: "ai-pdm",
        assignment_version_id: "version-9", assignment_version: 9, assignment_id: "rd-grant",
        grant_kind: "direct", delegation_id: null, principal_id: identity.principalId, employee_id: identity.employeeId,
        subject_kind: "employee", target_principal_id: null, stable_role_id: "role-rd", role_code: "rd",
        catalog_version: "catalog-1", scope_kind: "workspace", scope_key: "current", valid_from: now,
        valid_until: null, published_at: now, source_assignment_id: null, source_grant_id: null
      }]
    };
    const calls: string[] = [];
    const database = {
      kind: "postgres",
      async query(sql: string) {
        calls.push(sql);
        if (sql.includes("read_ai_pdm_active_principal_identity_v1")) return [identityRow];
        if (sql.includes("role_priority_versions")) return [{ priority_json: '["rd"]' }];
        if (sql.includes("v_principal_display_profiles_v1")) return [];
        throw new Error(sql);
      },
      async queryOne(sql: string) {
        calls.push(sql);
        if (sql.includes("read_principal_auth_state_v3")) return { principal_id: identity.principalId, auth_epoch: 0, revoked_before: null };
        if (sql.includes("FROM ai_pdm_core.principal_accounts")) return provisioned ? {
          ...identityRow, pdm_user_id: "pdm-user-one", company_id: "company-jenfu",
          lifecycle_version: 1, profile_version: 1, account_status: "active", system_role_enabled: true,
          minimum_assurance: "aal1", session_invalid_before: null
        } : null;
        if (sql.includes("ensure_principal_session_account_v3")) {
          sourceCalls++;
          provisioned = true;
          return { receipt: { created: true, principalId: identity.principalId,
            pdmUserId: "pdm-user-one", companyId: "company-jenfu", accountStatus: "active",
            lifecycleVersion: 1, profileVersion: 1, authority } };
        }
        if (sql.includes("read_principal_session_authority_v2")) {
          sourceCalls++;
          return authority;
        }
        if (sql.includes("lock_principal_session_catalog_v1")) return { locked: true };
        if (sql.includes("FROM ai_pdm_core.users")) return { id: "pdm-user-one", company_id: "company-jenfu" };
        if (sql.includes("FROM ai_pdm_core.principal_session_records")) {
          return { pdm_user_id: "pdm-user-one", permission_snapshot: storedPermissions };
        }
        throw new Error(sql);
      },
      async execute(sql: string, params?: { permissionSnapshot?: string }) {
        calls.push(sql);
        if (sql.includes("INSERT INTO ai_pdm_core.principal_session_records")) {
          storedPermissions = JSON.parse(params?.permissionSnapshot ?? "null");
        }
      },
      async transaction(run: (client: unknown) => Promise<unknown>) { return await run(database); }
    };
    mocks.database = database;
    const fetchBroker = vi.fn(async () => Response.json(proof));
    vi.stubGlobal("fetch", fetchBroker);
    async function login() {
      const start = await jenfuSsoStart(new Request("https://pdm.example/api/auth/jenfu-sso/start?returnTo=%2Fdrawings"));
      const state = new URL(start.headers.get("location")!).searchParams.get("state");
      const accepted = await jenfuSsoCallback(new Request(
        `https://pdm.example/api/auth/jenfu-sso/callback?code=synthetic&state=${state}&iss=${encodeURIComponent(proof.issuer)}`,
        { headers: { cookie: start.headers.get("set-cookie")!.split(";")[0] } }
      ));
      expect(accepted.headers.get("location")).toBe("https://pdm.example/drawings");
      const sessionCookie = accepted.headers.getSetCookie().find(cookie => /eyJ/u.test(cookie));
      expect(sessionCookie).toBeDefined();
      return sessionCookie!.split(";")[0];
    }
    const firstCookie = await login();
    expect(sourceCalls).toBe(1);
    const returningCookie = await login();
    expect(sourceCalls).toBe(2);
    expect(calls.filter(sql => sql.includes("ensure_principal_session_account_v3"))).toHaveLength(1);
    expect(calls.filter(sql => sql.includes("read_principal_session_authority_v2"))).toHaveLength(1);
    expect(calls.join("\n")).not.toMatch(/ensure_authorized_first_login_account_v1|principal_effective_grants_v[456]|role_policy_manager_eligible/u);
    calls.length = 0;
    for (const cookie of [firstCookie, returningCookie]) {
      const response = await numberingPermissions(new Request("https://pdm.example/api/numbering/permissions", { headers: { cookie } }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ pages: { "numbering.drawings.view": true } });
    }
    expect(calls.filter(sql => sql.includes("principal_session_records"))).toHaveLength(2);
    expect(calls.join("\n")).not.toMatch(/orgmaster_contract|platform_contract|role_catalog/u);
    expect(fetchBroker).toHaveBeenCalledTimes(2);
    expect(sourceCalls).toBe(2);
  });

  it("allows a valid broker exchange that finishes after the former 10 second limit", async () => {
    vi.useFakeTimers();
    try {
      const started = await jenfuSsoStart(new Request("https://pdm.example/api/auth/jenfu-sso/start?returnTo=%2Fdrawings"));
      const state = new URL(started.headers.get("location")!).searchParams.get("state");
      const transactionCookie = started.headers.get("set-cookie")!.split(";")[0];
      const proof = principalProof();
      vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
        setTimeout(() => resolve(new Response(JSON.stringify(proof), { status: 200 })), 11_500);
      })));
      mocks.issuePrincipal.mockResolvedValueOnce({ token: "principal.session.token" });

      const pending = jenfuSsoCallback(new Request(
        `https://pdm.example/api/auth/jenfu-sso/callback?code=one-time-code&state=${state}&iss=${encodeURIComponent(proof.issuer)}`,
        { headers: { cookie: transactionCookie } }
      ));
      await vi.advanceTimersByTimeAsync(11_500);
      const accepted = await pending;

      expect(accepted.status).toBe(303);
      expect(accepted.headers.get("location")).toBe("https://pdm.example/drawings");
      expect(accepted.headers.get("set-cookie")).toContain("principal.session.token");
      expect(mocks.issuePrincipal).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed when the broker exchange reaches the 20 second limit", async () => {
    vi.useFakeTimers();
    try {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const started = await jenfuSsoStart(new Request("https://pdm.example/api/auth/jenfu-sso/start"));
      const state = new URL(started.headers.get("location")!).searchParams.get("state");
      const transactionCookie = started.headers.get("set-cookie")!.split(";")[0];
      vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError")), { once: true });
      })));

      const pending = jenfuSsoCallback(new Request(
        `https://pdm.example/api/auth/jenfu-sso/callback?code=one-time-code&state=${state}&iss=${encodeURIComponent("https://platform.example/api/sso")}`,
        { headers: { cookie: transactionCookie } }
      ));
      await vi.advanceTimersByTimeAsync(20_000);
      const rejected = await pending;

      expect(rejected.status).toBe(303);
      expect(rejected.headers.get("location")).toBe("https://pdm.example/login?auth_error=sso_dependency_unavailable");
      expect(rejected.headers.get("set-cookie")).toContain("Max-Age=0");
      expect(rejected.headers.get("set-cookie")).not.toContain("principal.session.token");
      expect(mocks.issuePrincipal).not.toHaveBeenCalled();
      expect(logged).toHaveBeenCalledWith(expect.stringContaining('"code":"BROKER_EXCHANGE_TIMEOUT"'));
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([[1000, 1020], [12000, 12020]])("routes deterministic principals A and B from local broker %i into app %i", async (brokerPort, appPort) => {
    const broker = `http://localhost:${brokerPort}`, base = `http://localhost:${appPort}`;
    mocks.producerConfig = { broker, base, issuer: `${broker}/api/sso`, callback: `${base}/api/auth/jenfu-sso/callback` };
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("PDM_PUBLIC_BASE_URL", base); vi.stubEnv("K_SERVICE", undefined);
    for (const actor of ["A", "B"]) {
      const proof = principalProof(); proof.issuer = `${broker}/api/sso`;
      proof.identity.principalId = `fixture-principal-${actor}`;
      proof.identity.identitySubject = `fixture-subject-${actor}`;
      const start = await jenfuSsoStart(new Request(`${base}/api/auth/jenfu-sso/start?returnTo=%2Fparts`));
      const authorize = new URL(start.headers.get("location")!);
      const exchange = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(proof)));
      vi.stubGlobal("fetch", exchange);
      mocks.issuePrincipal.mockResolvedValueOnce({ token: `fixture-session-${actor}` });
      const callback = new URL(mocks.producerConfig.callback);
      callback.search = new URLSearchParams({ code: `fixture-code-${actor}`, state: authorize.searchParams.get("state")!, iss: proof.issuer }).toString();
      const result = await jenfuSsoCallback(new Request(callback, { headers: { cookie: start.headers.get("set-cookie")!.split(";")[0] } }));
      expect(result.headers.get("location")).toBe(`${base}/parts`);
      expect(result.headers.get("set-cookie")).toContain(`fixture-session-${actor}`);
      expect(authorize.searchParams.get("redirect_uri")).toBe(mocks.producerConfig.callback);
      const [url, init] = exchange.mock.calls[0];
      expect(url).toBe(`${broker}/api/sso/token`);
      const body = new URLSearchParams(init?.body as URLSearchParams);
      expect(body.get("client_id")).toBe("ai-pdm");
      expect(body.get("redirect_uri")).toBe(mocks.producerConfig.callback);
      expect(createHash("sha256").update(body.get("code_verifier")!, "ascii").digest("base64url")).toBe(authorize.searchParams.get("code_challenge"));
      expect(mocks.issuePrincipal).toHaveBeenLastCalledWith(expect.objectContaining({ handoff: expect.objectContaining({ identity: expect.objectContaining({ principalId: `fixture-principal-${actor}` }) }) }));
    }
    expect(mocks.legacyResolver).not.toHaveBeenCalled();
  });
  it.each([
    [401, "sso_reauthentication_required"],
    [403, "sso_access_denied"],
    [403, "sso_principal_stale"],
    [400, "sso_code_invalid"],
    [400, "sso_code_expired"],
    [400, "sso_code_consumed"],
    [400, "sso_pkce_invalid"]
  ])("preserves only the safe broker status/code pair %i %s", async (status, code) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const started = await jenfuSsoStart(new Request("https://pdm.example/api/auth/jenfu-sso/start"));
    const state = new URL(started.headers.get("location")!).searchParams.get("state");
    const cookie = started.headers.get("set-cookie")!.split(";")[0];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code }), { status })));

    const rejected = await jenfuSsoCallback(new Request(
      `https://pdm.example/api/auth/jenfu-sso/callback?code=one-time-code&state=${state}&iss=https%3A%2F%2Fplatform.example%2Fapi%2Fsso`,
      { headers: { cookie } }
    ));

    expect(rejected.status).toBe(303);
    expect(rejected.headers.get("location")).toBe(`https://pdm.example/login?auth_error=${code}`);
    expect(rejected.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(rejected.cookies.getAll().map(item => item.name)).toEqual(["__Host-jenfu_sso_tx"]);
    expect(rejected.headers.get("cache-control")).toBe("no-store");
    expect(rejected.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.issuePrincipal).not.toHaveBeenCalled();
    expect(mocks.legacyResolver).not.toHaveBeenCalled();
  });

  it.each([
    [503, JSON.stringify({ code: "sso_reauthentication_required" })],
    [401, JSON.stringify({ code: "sso_access_denied" })],
    [403, JSON.stringify({ code: "private-provider-detail" })],
    [403, "not-json-private-provider-detail"],
    [403, "null"],
    [403, JSON.stringify({ code: "sso_access_denied", detail: "x".repeat(4096) })]
  ])("keeps unsafe or mismatched broker failure %i generic", async (status, body) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const started = await jenfuSsoStart(new Request("https://pdm.example/api/auth/jenfu-sso/start"));
    const state = new URL(started.headers.get("location")!).searchParams.get("state");
    const cookie = started.headers.get("set-cookie")!.split(";")[0];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));

    const rejected = await jenfuSsoCallback(new Request(
      `https://pdm.example/api/auth/jenfu-sso/callback?code=one-time-code&state=${state}&iss=https%3A%2F%2Fplatform.example%2Fapi%2Fsso`,
      { headers: { cookie } }
    ));

    expect(rejected.headers.get("location")).toBe("https://pdm.example/login?auth_error=sso_dependency_unavailable");
    expect(rejected.cookies.getAll().map(item => item.name)).toEqual(["__Host-jenfu_sso_tx"]);
    expect(rejected.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("private-provider-detail");
    expect(mocks.issuePrincipal).not.toHaveBeenCalled();
  });

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

  it("keeps a raw inactive sentinel as an unclassified dependency failure", async () => {
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
    expect(callback.headers.get("location")).toBe("https://pdm.example/login?auth_error=sso_dependency_unavailable");
    expect(callback.headers.get("location")).not.toContain("PRINCIPAL_NOT_ACTIVE");
    expect(callback.cookies.getAll().map((cookie) => cookie.name)).toEqual(["__Host-jenfu_sso_tx"]);
    expect(callback.headers.get("set-cookie")).not.toContain("principal.session.token");
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
    [new JenfuPrincipalAccountError("principal_account_conflict"), "sso_principal_stale"],
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
