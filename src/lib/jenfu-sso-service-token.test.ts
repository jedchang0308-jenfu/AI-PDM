import { beforeEach, describe, expect, it, vi } from "vitest";

const google = vi.hoisted(() => ({
  source: {},
  fetchIdToken: vi.fn(),
  getIdTokenClient: vi.fn(),
  getClient: vi.fn(),
  impersonated: vi.fn(),
}));
vi.mock("google-auth-library", async (original) => ({
  ...await original<typeof import("google-auth-library")>(),
  GoogleAuth: class {
    getClient = google.getClient;
    getIdTokenClient = google.getIdTokenClient;
  },
  Impersonated: class {
    constructor(options: unknown) { google.impersonated(options); }
    fetchIdToken = google.fetchIdToken;
  },
}));

import { jenfuSsoServiceToken } from "@/lib/jenfu-sso-handoff";

const audience = "http://localhost:11000";
const targetPrincipal = "dev010-stg-aipdm-runtime@jenfu-platform-nonprod.iam.gserviceaccount.com";
const local = { NODE_ENV: "development", JENFU_SSO_IMPERSONATE_SERVICE_ACCOUNT: targetPrincipal } as NodeJS.ProcessEnv;

beforeEach(() => {
  vi.clearAllMocks();
  google.getClient.mockResolvedValue(google.source);
  google.fetchIdToken.mockResolvedValue("unit-service-token");
  google.getIdTokenClient.mockResolvedValue({ idTokenProvider: { fetchIdToken: google.fetchIdToken } });
});

describe("development SSO service identity", () => {
  it("keeps the default credential path unchanged when impersonation is unset", async () => {
    await expect(jenfuSsoServiceToken("https://platform.example.test", { NODE_ENV: "production" })).resolves.toBe("unit-service-token");
    expect(google.getIdTokenClient).toHaveBeenCalledWith("https://platform.example.test");
    expect(google.impersonated).not.toHaveBeenCalled();
  });

  it.each([audience, "https://localhost:11000"])("uses existing IAM credentials for the exact loopback audience %s", async (localAudience) => {
    await expect(jenfuSsoServiceToken(localAudience, local)).resolves.toBe("unit-service-token");
    expect(google.impersonated).toHaveBeenCalledWith({ sourceClient: google.source, targetPrincipal,
      targetScopes: ["https://www.googleapis.com/auth/cloud-platform"], lifetime: 300 });
    expect(google.fetchIdToken).toHaveBeenCalledWith(localAudience);
    expect(google.getIdTokenClient).not.toHaveBeenCalled();
  });

  it.each([
    [audience, { ...local, NODE_ENV: "production" }],
    [audience, { ...local, K_SERVICE: "ai-pdm-prod" }],
    ["http://example.test", local],
    ["http://localhost:11000/path", local],
    ["http://user:password@localhost:11000", local],
    [audience, { ...local, JENFU_SSO_IMPERSONATE_SERVICE_ACCOUNT: "human@example.test" }],
    [audience, { ...local, JENFU_SSO_IMPERSONATE_SERVICE_ACCOUNT: " " }],
  ])("rejects unsupported runtime or identity configuration without credential fallback", async (value, environment) => {
    await expect(jenfuSsoServiceToken(value, environment)).rejects.toThrow();
    expect(google.impersonated).not.toHaveBeenCalled();
    expect(google.getIdTokenClient).not.toHaveBeenCalled();
  });

  it("preserves a real credential failure without falling back", async () => {
    google.fetchIdToken.mockRejectedValue(new Error("credential_unavailable"));
    await expect(jenfuSsoServiceToken(audience, local)).rejects.toThrow("credential_unavailable");
    expect(google.getIdTokenClient).not.toHaveBeenCalled();
  });
});
