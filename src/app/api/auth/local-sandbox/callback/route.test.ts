import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { readLocalSandboxConfig } from "../../../../../../contracts/local-principal-sandbox/v1/protocol.mjs";
import { createLocalSandboxLoginState, createLocalStateCookie } from "@/lib/local-sandbox-principal-runtime";

const mocks = vi.hoisted(() => ({ runtime: vi.fn(), tokenProof: vi.fn(), issue: vi.fn(), diagnostic: vi.fn() }));
vi.mock("@/lib/local-sandbox-principal-runtime", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/local-sandbox-principal-runtime")>(),
  getLocalSandboxPrincipalRuntime: mocks.runtime, isLocalPrincipalSandboxRequested: () => true,
}));
vi.mock("@/lib/local-sandbox-principal-session", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/local-sandbox-principal-session")>(),
  issueLocalSandboxPrincipalSession: mocks.issue,
}));
vi.mock("@/lib/local-principal-diagnostics", () => ({ reportLocalPrincipalDiagnostic: mocks.diagnostic }));
const platformKey = Buffer.alloc(32, 17).toString("base64url");
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

function fixture(mode: "integrated" | "standalone") {
  const origin = `http://localhost:${mode === "standalone" ? 1021 : 1020}`;
  const platformOrigin = `http://localhost:${mode === "standalone" ? 1001 : 1000}`;
  vi.stubEnv("JENFU_LOCAL_SANDBOX_MODE", mode);
  vi.stubEnv("JENFU_LOCAL_SANDBOX_ID", "shared-daily");
  vi.stubEnv("JENFU_LOCAL_SANDBOX_ORIGIN", origin);
  const config = readLocalSandboxConfig({ NODE_ENV: "development", JENFU_LOCAL_SANDBOX_ENABLED: "1",
    JENFU_LOCAL_SANDBOX_MODE: mode, JENFU_LOCAL_SANDBOX_ID: "shared-daily", JENFU_LOCAL_SANDBOX_ORIGIN: origin,
    JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: platformOrigin, JENFU_LOCAL_SANDBOX_BIND_HOST: "127.0.0.1",
    JENFU_LOCAL_SANDBOX_DATABASE_URL: "postgresql://local_runtime:fake_local_password@127.0.0.1:51870/jenfu_local_shared_daily",
    JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: "local_runtime" }, "ai-pdm");
  mocks.runtime.mockResolvedValue({ config, profile: { platformClient: { key: platformKey } }, listenAddress: "127.0.0.1",
    expected: { applicationId: "ai-pdm", sandboxId: "shared-daily" }, client: { tokenProof: mocks.tokenProof } });
  const state = createLocalSandboxLoginState(platformKey, origin);
  const cookie = createLocalStateCookie(state.cookieValue, origin, state.expiresAt).split(";")[0];
  const callback = new URL("/api/auth/local-sandbox/callback", origin);
  callback.search = new URLSearchParams({ code: "local-code", state: state.state, iss: `${platformOrigin}/api/local-sandbox` }).toString();
  return { origin, platformOrigin, callback, cookie, state };
}

it.each(["integrated", "standalone"] as const)("shared-daily %s callback verifies state and exchanges with the matching broker", async mode => {
  const value = fixture(mode);
  mocks.tokenProof.mockResolvedValue({ rawBody: "{}", nonce: "nonce", audience: value.platformOrigin, clientId: "ai-pdm", signature: "signature" });
  mocks.issue.mockImplementation(async input => {
    await input.verifyCallbackStateAndPkce(input.request);
    return { token: "local.principal.session", claims: { expiresAt: Math.floor(Date.now() / 1000) + 60 } };
  });
  const response = await GET(new Request(value.callback, { headers: { host: new URL(value.origin).host, cookie: value.cookie } }));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`${value.origin}/`);
  expect(mocks.tokenProof).toHaveBeenCalledWith(expect.objectContaining({ code: "local-code", redirectUri: `${value.origin}/api/auth/local-sandbox/callback`, codeVerifier: value.state.verifier }));
  expect(mocks.issue).toHaveBeenCalledOnce();
  expect(response.headers.get("set-cookie")).toContain(`pdm_local_principal_shared_daily_${mode}=`);
  expect(response.headers.get("set-cookie")).toContain(`pdm_local_principal_pkce_${mode}=;`);
  expect(mocks.diagnostic).not.toHaveBeenCalled();
});

it("standalone rejects an integrated issuer before token exchange", async () => {
  const value = fixture("standalone");
  value.callback.searchParams.set("iss", "http://localhost:1000/api/local-sandbox");
  const response = await GET(new Request(value.callback, { headers: { host: "localhost:1021", cookie: value.cookie } }));
  expect(response.headers.get("location")).toBe("http://localhost:1021/login?auth_error=local_sandbox_unavailable");
  expect(mocks.tokenProof).not.toHaveBeenCalled();
  expect(mocks.issue).not.toHaveBeenCalled();
});
