import { describe, expect, it } from "vitest";
import { readLocalSandboxConfig } from "../../../contracts/local-principal-sandbox/v1/protocol.mjs";
import { canonicalLocalSandboxRequest } from "./local-sandbox-request";

const environment = {
  NODE_ENV: "development",
  JENFU_LOCAL_SANDBOX_ENABLED: "1",
  JENFU_LOCAL_SANDBOX_ID: "dev127-request",
  JENFU_LOCAL_SANDBOX_ORIGIN: "http://127.0.0.1:1020",
  JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: "http://127.0.0.1:1000",
  JENFU_LOCAL_SANDBOX_BIND_HOST: "127.0.0.1",
  JENFU_LOCAL_SANDBOX_DATABASE_URL: "postgresql://ai_pdm_runtime:local-only@127.0.0.1:55432/jenfu_local_dev127_request",
  JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: "ai_pdm_runtime",
};

describe("local sandbox Next request canonicalization", () => {
  const config = readLocalSandboxConfig(environment, "ai-pdm");

  it("canonicalizes only the internal localhost alias with the pinned Host", () => {
    const request = new Request("http://localhost:1020/api/auth/local-sandbox/start", {
      headers: { host: "127.0.0.1:1020" },
    });
    expect(canonicalLocalSandboxRequest(request, config).url)
      .toBe("http://127.0.0.1:1020/api/auth/local-sandbox/start");
  });

  it("does not canonicalize a forged Host or external origin", () => {
    expect(canonicalLocalSandboxRequest(new Request("http://localhost:1020/", {
      headers: { host: "evil.invalid" },
    }), config).url).toBe("http://localhost:1020/");
    expect(canonicalLocalSandboxRequest(new Request("http://evil.invalid:1020/", {
      headers: { host: "127.0.0.1:1020" },
    }), config).url).toBe("http://evil.invalid:1020/");
  });
});
