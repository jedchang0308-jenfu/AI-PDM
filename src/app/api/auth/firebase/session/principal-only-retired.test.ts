import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/firebase/session/route";

afterEach(() => vi.unstubAllEnvs());

it("rejects direct Firebase exchange before reading a token in Platform SSO mode", async () => {
  vi.stubEnv("PDM_AUTH_MODE", "firebase_bff");
  vi.stubEnv("PDM_JENFU_PLATFORM_AUTH_MODE", "on");
  const request = new Request("https://pdm.example/api/auth/firebase/session", {
    method: "POST",
    body: "not-json-and-not-a-credential",
    headers: { "content-type": "text/plain" }
  });

  const response = await POST(request);

  expect(response.status).toBe(410);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ code: "principal_login_required" });
  expect(request.bodyUsed).toBe(false);
});

it("fails closed before reading a token when Platform mode is misconfigured", async () => {
  vi.stubEnv("PDM_AUTH_MODE", "firebase_bff");
  vi.stubEnv("PDM_JENFU_PLATFORM_AUTH_MODE", "invalid");
  const request = new Request("https://pdm.example/api/auth/firebase/session", {
    method: "POST", body: "unread-token", headers: { "content-type": "text/plain" }
  });

  const response = await POST(request);

  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ code: "auth_server_not_configured" });
  expect(request.bodyUsed).toBe(false);
});
