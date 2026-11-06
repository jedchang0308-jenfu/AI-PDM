import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

const state = vi.hoisted(() => ({
  runtime: null as unknown, active: true, targetValid: true,
  account: { principalId: "pdm-local-test-admin", pdmUserId: "pdm-local-test-admin-user",
    employeeId: "pdm-local-test-employee", companyId: "company-jenfu", accountType: "human_personal",
    lifecycleVersion: 1, profileVersion: 1, accountStatus: "active", systemRoleEnabled: true,
    minimumAssurance: "aal1", sessionInvalidBefore: null as string | null },
  sourceLoad: vi.fn(), register: vi.fn(), upstream: vi.fn(),
}));
vi.mock("@/lib/local-sandbox-principal-runtime", () => ({
  getLocalSandboxPrincipalRuntime: () => { state.sourceLoad(); return Promise.resolve(state.runtime); },
  isLocalPrincipalSandboxRequested: (env: Record<string, string | undefined>) => env.PDM_LOCAL_PRINCIPAL_SANDBOX === "1",
}));
vi.mock("@/lib/jenfu-principal-account-repository", () => ({
  JenfuPrincipalAccountRepository: class { async requireActive() {
    if (state.account.accountStatus !== "active" || !state.account.systemRoleEnabled) throw new Error("inactive");
    return state.account;
  } },
  JenfuPrincipalAccountError: class extends Error {},
}));
vi.mock("@/lib/jenfu-principal-session-registry", () => ({
  JenfuPrincipalSessionRegistry: class {
    async register(claims: unknown) { state.register(claims); state.active = true; }
    async isActive() { return state.active; }
    async revoke() { state.active = false; }
  },
  hashJenfuPrincipalSessionId: () => "a".repeat(64),
}));

import { LOCAL_TEST_ADMIN_IDENTITY, bindLocalTestAdminActor, getLocalTestAdminRuntime,
  isLocalTestAdminAvailable, isLocalTestAdminRequestInput, isLocalTestAdminRequested,
  isVerifiedLocalTestAdmin, issueLocalTestAdminSession, logoutLocalTestAdmin,
  readLocalTestAdminCookie, resolveLocalTestAdminRequestInput, withVerifiedLocalTestAdminRequest,
} from "@/lib/local-test-admin";
import { verifyJenfuPrincipalSession } from "@/lib/jenfu-principal-session";
import { evaluatePrincipalWorkspacePermissions } from "@/lib/jenfu-principal-permission-service";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";
import { principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { POST as loginRoute } from "@/app/api/auth/local-test-admin/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { GET as modeRoute } from "@/app/api/auth/mode/route";

const origin = "http://localhost:1020";
const target = { applicationId: "ai-pdm", sandboxId: "test-admin", databaseName: "jenfu_local_test_admin",
  generation: "11111111-1111-4111-8111-111111111111", fixtureHash: "b".repeat(64),
  fixtureVersion: "fixture-v1", targetFingerprint: "c".repeat(64),
  sandboxRoot: "C:/owned", dataDirectory: "C:/owned/data", repositoryDirectory: "C:/owned/repository",
  nativeSessionContractVersion: "jenfu.ai-pdm-session.v2" };
let database: AsyncDatabaseClient;
let snapshot: AsyncDatabaseClient;
const makeRequest = (method = "POST", cookie?: string, body = "{}", requestOrigin = origin) => new Request(`${requestOrigin}/api/auth/local-test-admin`, {
  method, headers: { origin: requestOrigin, host: new URL(requestOrigin).host,
    "sec-fetch-site": "same-origin", "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  ...(!["GET", "HEAD"].includes(method) ? { body } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("PDM_LOCAL_TEST_ADMIN", "1");
  vi.stubEnv("PDM_LOCAL_PRINCIPAL_SANDBOX", "1");
  vi.stubEnv("PDM_AUTH_MODE", "firebase_bff");
  vi.stubEnv("PDM_JENFU_PLATFORM_AUTH_MODE", "on");
  vi.stubEnv("PDM_JENFU_ENTITLEMENT_MODE", "enforce");
  vi.stubEnv("JENFU_LOCAL_SANDBOX_ID", "test-admin");
  for (const key of ["K_SERVICE", "K_REVISION", "FUNCTION_TARGET", "FUNCTION_NAME", "FIREBASE_CONFIG"]) vi.stubEnv(key, "");
  vi.stubGlobal("fetch", () => { state.upstream(); throw new Error("HTTP forbidden"); });
  state.active = true; state.targetValid = true;
  Object.assign(state.account, { accountStatus: "active", systemRoleEnabled: true,
    lifecycleVersion: 1, profileVersion: 1, sessionInvalidBefore: null });
  const queryOne = vi.fn(async (sql: string) => {
    if (/orgmaster_contract|platform_contract/iu.test(sql)) throw new Error("upstream SQL forbidden");
    if (sql.includes("AS target_valid")) return { target_valid: state.targetValid };
    if (sql.includes("local_sandbox_target_metadata")) return { generation: target.generation,
      fixture_hash: target.fixtureHash, target_fingerprint: target.targetFingerprint, status: "ready" };
    if (/FROM (?:ai_pdm_core\.)?users/u.test(sql)) return { id: LOCAL_TEST_ADMIN_IDENTITY.pdmUserId,
      company_id: "company-jenfu", account_status: "active", role: "Admin", system_role_enabled: 1,
      display_name: "PDM 本機測試超級管理員", email: "pdm-local-test-admin@local.invalid" };
    throw new Error(`unexpected SQL: ${sql}`);
  });
  const query = vi.fn(async (sql: string) => {
    if (/orgmaster_contract|platform_contract/iu.test(sql)) throw new Error("upstream SQL forbidden");
    if (sql.includes("ai_pdm_core.companies")) return [{ id: "company-jenfu", company_code: "JENFU",
      company_kind: "business", display_name: "鉦富測試" }];
    return [];
  });
  snapshot = { kind: "postgres", transactionScope: "postgres", queryOne, query,
    execute: vi.fn(), close: vi.fn(), transaction: vi.fn() } as unknown as AsyncDatabaseClient;
  database = { ...snapshot, transactionScope: undefined,
    transaction: vi.fn(async (callback: (client: AsyncDatabaseClient) => Promise<unknown>) => callback(snapshot)),
  } as unknown as AsyncDatabaseClient;
  state.runtime = { target: { ...target }, config: { applicationId: "ai-pdm", origin, sandboxId: "test-admin",
    runtimeRole: "jenfu_ai_pdm_runtime", databaseName: target.databaseName },
    profile: { principalSessionKey: { keyId: "existing-key", secret: "d".repeat(43) } },
    listenAddress: "127.0.0.1", database,
    client: new Proxy({}, { get: () => () => { state.upstream(); throw new Error("Platform client forbidden"); } }),
    ports: new Proxy({}, { get: () => () => { state.upstream(); throw new Error("Platform port forbidden"); } }),
  };
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("PDM independent local test administrator", () => {
  it("logs in through HTTP handlers, grants the complete PDM projection and logs out with no upstream calls", async () => {
    const mode = await modeRoute(makeRequest("GET"));
    expect(await mode.json()).toMatchObject({ localTestAdmin: true, ssoHandoffEnabled: false });
    const login = await loginRoute(makeRequest());
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0];
    const request = makeRequest("GET", cookie);
    const token = principalSessionTokenFromRequest(request)!;
    expect(token).toBeTruthy();
    const me = await meRoute(request);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ localTestAdmin: true,
      user: { display_name: "PDM 本機測試超級管理員", employee_name: "本機測試超級管理員" } });
    const input = await principalRequestInput(token, request);
    const permissions = [
      ...NUMBERING_PAGE_PERMISSION_CODES.map(permissionCode => ({ permissionKind: "page" as const, permissionCode })),
      ...NUMBERING_ACTION_PERMISSION_CODES.map(permissionCode => ({ permissionKind: "action" as const, permissionCode })),
    ];
    const decisions = await evaluatePrincipalWorkspacePermissions({ ...input, permissions });
    expect(decisions).toHaveLength(permissions.length);
    expect(decisions.every(decision => decision.allowed && decision.publishedAssignmentVersion === 0)).toBe(true);
    expect((await logoutRoute(makeRequest("POST", cookie))).status).toBe(200);
    await expect(evaluatePrincipalWorkspacePermissions({ ...input, permissions })).rejects.toThrow();
    expect(state.upstream).not.toHaveBeenCalled();
  });
  it("requires both explicit switches and development", () => {
    expect(isLocalTestAdminRequested()).toBe(true);
    expect(isLocalTestAdminRequested({})).toBe(false);
    expect(() => isLocalTestAdminRequested({ NODE_ENV: "production", PDM_LOCAL_TEST_ADMIN: "1", PDM_LOCAL_PRINCIPAL_SANDBOX: "1" })).toThrow();
    expect(() => isLocalTestAdminRequested({ NODE_ENV: "development", PDM_LOCAL_TEST_ADMIN: "1" })).toThrow();
  });
  it.each(["K_SERVICE", "K_REVISION", "FUNCTION_TARGET", "FUNCTION_NAME", "FIREBASE_CONFIG"])("rejects cloud marker %s", key => {
    vi.stubEnv(key, "present");
    expect(isLocalTestAdminAvailable(makeRequest())).toBe(false);
  });
  it("rejects remote host before loading any runtime", async () => {
    await expect(getLocalTestAdminRuntime(makeRequest("POST", undefined, "{}", "https://example.com"))).rejects.toThrow();
    expect(state.sourceLoad).not.toHaveBeenCalled();
  });
  it("requires matching browser origin", async () => {
    const request = new Request(`${origin}/api/auth/local-test-admin`, { method: "POST", headers: { origin: "https://example.com" }, body: "{}" });
    await expect(getLocalTestAdminRuntime(request)).rejects.toThrow();
  });
  it("rejects unsafe or unmarked target", async () => {
    state.targetValid = false;
    await expect(issueLocalTestAdminSession(makeRequest())).rejects.toThrow();
    expect(state.register).not.toHaveBeenCalled();
  });
  it("does not accept a role or user supplied claims", async () => {
    await expect(issueLocalTestAdminSession(makeRequest("POST", undefined, '{"role":"Admin"}'))).rejects.toThrow();
    expect(state.register).not.toHaveBeenCalled();
  });
  it("issues fixed synthetic AAL1 native session without HTTP/SSO ports", async () => {
    const result = await issueLocalTestAdminSession(makeRequest());
    const { pdmUserId: _domainProfile, ...claimsIdentity } = LOCAL_TEST_ADMIN_IDENTITY;
    expect(result.claims).toMatchObject({ ...claimsIdentity,
      assuranceLevel: "aal1", secondFactor: null, authEpoch: 0, appId: "ai-pdm" });
    expect(state.register).toHaveBeenCalledOnce();
    expect(result.cookie).toContain("pdm_local_test_admin_test-admin=");
    expect(result.cookie).toContain("HttpOnly; SameSite=Strict");
    expect(state.upstream).not.toHaveBeenCalled();
  });
  it("rejects duplicate cookies", async () => {
    const result = await issueLocalTestAdminSession(makeRequest());
    const pair = result.cookie.split(";", 1)[0];
    expect(readLocalTestAdminCookie(makeRequest("GET", `${pair}; ${pair}`))).toBeNull();
  });
  it("isolates signing keys across target generations and fixture versions", async () => {
    const before = await getLocalTestAdminRuntime(makeRequest());
    const result = await issueLocalTestAdminSession(makeRequest());
    (state.runtime as { target: { generation: string } }).target.generation = "22222222-2222-4222-8222-222222222222";
    const after = await getLocalTestAdminRuntime(makeRequest());
    expect(after.keyRing.issuer).not.toBe(before.keyRing.issuer);
    expect(() => verifyJenfuPrincipalSession(result.token, after.keyRing)).toThrow();
  });
  it("carries an opaque proof through server spread while verified brands remain callback scoped", async () => {
    const result = await issueLocalTestAdminSession(makeRequest());
    const request = makeRequest("GET", result.cookie.split(";", 1)[0]);
    const input = await resolveLocalTestAdminRequestInput(result.token, request);
    expect(isLocalTestAdminRequestInput(input)).toBe(true);
    const spreadInput = { ...input, permissions: [{ permissionKind: "page", permissionCode: "pdm.parts" }] };
    expect(isLocalTestAdminRequestInput(spreadInput)).toBe(true);
    expect(isLocalTestAdminRequestInput(JSON.parse(JSON.stringify(input)))).toBe(false);
    let escaped: unknown;
    await withVerifiedLocalTestAdminRequest(spreadInput, async (client, verified) => {
      expect(isVerifiedLocalTestAdmin(verified, client)).toBe(true);
      expect(isVerifiedLocalTestAdmin(verified, database)).toBe(false);
      expect(Object.isFrozen(verified.session)).toBe(true);
      const actor = bindLocalTestAdminActor(verified, { ...LOCAL_TEST_ADMIN_IDENTITY,
        localPrincipalId: LOCAL_TEST_ADMIN_IDENTITY.pdmUserId }, client);
      expect(isVerifiedLocalTestAdmin(actor, client)).toBe(true);
      expect(isVerifiedLocalTestAdmin({ ...actor }, client)).toBe(false);
      escaped = actor;
    });
    expect(isVerifiedLocalTestAdmin(escaped)).toBe(false);
    expect(isVerifiedLocalTestAdmin(LOCAL_TEST_ADMIN_IDENTITY)).toBe(false);
  });
  it("rejects forged symbols, replacement proofs and inherited proof properties", async () => {
    const result = await issueLocalTestAdminSession(makeRequest());
    const request = makeRequest("GET", result.cookie.split(";", 1)[0]);
    const input = await resolveLocalTestAdminRequestInput(result.token, request);
    const plain = JSON.parse(JSON.stringify(input));
    expect(isLocalTestAdminRequestInput({ ...plain, [Symbol("ai-pdm.local-test-admin.request-proof")]: Object.freeze({}) })).toBe(false);
    const [proofSymbol] = Object.getOwnPropertySymbols(input);
    expect(proofSymbol).toBeDefined();
    expect(isLocalTestAdminRequestInput({ ...input, [proofSymbol]: Object.freeze({}) })).toBe(false);
    expect(isLocalTestAdminRequestInput(Object.create(input))).toBe(false);
  });
  it("revalidates proof-bound token and database after server spread", async () => {
    const result = await issueLocalTestAdminSession(makeRequest());
    const request = makeRequest("GET", result.cookie.split(";", 1)[0]);
    const input = await resolveLocalTestAdminRequestInput(result.token, request);
    const evaluate = vi.fn(async () => true);
    await expect(withVerifiedLocalTestAdminRequest({ ...input, token: `${result.token}tampered` }, evaluate)).rejects.toThrow();
    await expect(withVerifiedLocalTestAdminRequest({ ...input, database: snapshot }, evaluate)).rejects.toThrow();
    expect(evaluate).not.toHaveBeenCalled();
  });
  it("denies stale lifecycle and revoked native session", async () => {
    const result = await issueLocalTestAdminSession(makeRequest());
    const request = makeRequest("GET", result.cookie.split(";", 1)[0]);
    const input = await resolveLocalTestAdminRequestInput(result.token, request);
    state.account.lifecycleVersion = 2;
    await expect(withVerifiedLocalTestAdminRequest(input, async () => true)).rejects.toThrow();
    state.account.lifecycleVersion = 1; state.active = false;
    await expect(withVerifiedLocalTestAdminRequest(input, async () => true)).rejects.toThrow();
  });
  it("logout revokes native registry and expires only its dedicated cookie", async () => {
    const result = await issueLocalTestAdminSession(makeRequest());
    const response = await logoutLocalTestAdmin(makeRequest("POST", result.cookie.split(";", 1)[0]));
    expect(response.headers.get("set-cookie")).toContain("pdm_local_test_admin_test-admin=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(state.active).toBe(false);
    expect(state.upstream).not.toHaveBeenCalled();
  });
});
