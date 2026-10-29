import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalSandboxError } from "../../contracts/local-principal-sandbox/v1/client.mjs";
import { LOCAL_IDENTITY_ISSUER } from "../../contracts/local-principal-sandbox/v1/protocol.mjs";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";

const mocks = vi.hoisted(() => ({
  requested: vi.fn(),
  readCookie: vi.fn(),
  getRuntime: vi.fn(),
  resolveAdmission: vi.fn(),
  isAdmission: vi.fn(),
  reportDiagnostic: vi.fn(),
}));

vi.mock("@/lib/local-sandbox-principal-runtime", () => ({
  getLocalSandboxPrincipalRuntime: mocks.getRuntime,
  isLocalPrincipalSandboxRequested: mocks.requested,
  readLocalPrincipalSessionCookie: mocks.readCookie,
}));

vi.mock("@/lib/local-sandbox-principal-session", () => ({
  isLocalSandboxPrincipalRequestAdmission: mocks.isAdmission,
  resolveLocalSandboxPrincipalRequestAdmission: mocks.resolveAdmission,
  LOCAL_SANDBOX_PRINCIPAL_TRUST_POLICY: Object.freeze({}),
}));

vi.mock("@/lib/local-principal-diagnostics", () => ({
  reportLocalPrincipalDiagnostic: mocks.reportDiagnostic,
}));

import { principalRequestFailure, principalRequestInput } from "@/lib/jenfu-principal-http";

const token = `header.${Buffer.from(JSON.stringify({ identityIssuer: LOCAL_IDENTITY_ISSUER })).toString("base64url")}.signature`;
const request = () => new Request("http://127.0.0.1:12000/api/auth/me");

function makeRuntime() {
  return {
    config: { sandboxId: "sandbox-dev126" },
    listenAddress: "127.0.0.1",
    expected: {},
    database: {},
    keyRing: {},
    ports: {
      targetReader: {},
      nativeSessionReadback: {},
      binding: {},
      centralIntrospection: {},
    },
  };
}

async function capturePrincipalRequestError(rejection: unknown) {
  mocks.resolveAdmission.mockRejectedValueOnce(rejection);
  const error = await principalRequestInput(token, request()).then(() => null, value => value);
  expect(error).toBeInstanceOf(JenfuPrincipalRequestError);
  return error as JenfuPrincipalRequestError;
}

describe("principalRequestInput local sandbox Central errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requested.mockReturnValue(true);
    mocks.readCookie.mockReturnValue(token);
    mocks.getRuntime.mockResolvedValue(makeRuntime());
    mocks.isAdmission.mockReturnValue(false);
  });

  it.each(["local_session_invalid", "local_session_stale"] as const)(
    "maps verified Central %s to an unauthenticated request", async code => {
      const error = await capturePrincipalRequestError(new LocalSandboxError(code, 401));

      expect(error.code).toBe("auth_session_invalid");
      expect(principalRequestFailure(error).status).toBe(401);
      expect(mocks.reportDiagnostic).not.toHaveBeenCalled();
    },
  );

  it("does not trust an unverified object that copies LocalSandboxError code and status", async () => {
    const error = await capturePrincipalRequestError({
      name: "LocalSandboxError",
      code: "local_session_stale",
      status: 401,
    });

    expect(error.code).toBe("principal_dependency_unavailable");
    expect(principalRequestFailure(error).status).toBe(503);
  });

  it.each([
    new LocalSandboxError("local_client_invalid", 401),
    new LocalSandboxError("local_response_invalid", 503),
    new LocalSandboxError("local_sandbox_unavailable", 503),
    Object.assign(new Error("untrusted failure"), { code: "local_session_invalid", status: 401 }),
  ])("keeps non-session or unverified failures in the dependency path", async rejection => {
    const error = await capturePrincipalRequestError(rejection);

    expect(error.code).toBe("principal_dependency_unavailable");
    expect(principalRequestFailure(error).status).toBe(503);
  });
});
