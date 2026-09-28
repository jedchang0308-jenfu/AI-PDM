import { describe, expect, it } from "vitest";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";

describe("production Principal-only auth configuration", () => {
  it("requires the Platform BFF lane on the exact production service", () => {
    const production = { NODE_ENV: "production", K_SERVICE: "ai-pdm-prod" } as const;
    expect(() => getAuthMode(production)).toThrow("PDM_PRODUCTION_AUTH_MODE_INVALID");
    expect(() => getAuthMode({ ...production, PDM_AUTH_MODE: "demo" }))
      .toThrow("PDM_PRODUCTION_AUTH_MODE_INVALID");
    expect(() => getAuthMode({ ...production, PDM_AUTH_MODE: "managed" }))
      .toThrow("PDM_PRODUCTION_AUTH_MODE_INVALID");
    expect(getAuthMode({ ...production, PDM_AUTH_MODE: "firebase_bff" }))
      .toBe("firebase_bff");
    expect(() => getJenfuPlatformAuthMode(production))
      .toThrow("PDM_PRODUCTION_PLATFORM_AUTH_MODE_INVALID");
    expect(() => getJenfuPlatformAuthMode({ ...production,
      PDM_JENFU_PLATFORM_AUTH_MODE: "off" }))
      .toThrow("PDM_PRODUCTION_PLATFORM_AUTH_MODE_INVALID");
    expect(getJenfuPlatformAuthMode({ ...production,
      PDM_JENFU_PLATFORM_AUTH_MODE: "on" })).toBe("on");
  });

  it("leaves isolated local fixtures and other services on their explicit mode", () => {
    expect(getAuthMode({ NODE_ENV: "test", PDM_AUTH_MODE: "demo" })).toBe("demo");
    expect(getJenfuPlatformAuthMode({ NODE_ENV: "test",
      PDM_JENFU_PLATFORM_AUTH_MODE: "off" })).toBe("off");
    expect(getAuthMode({ NODE_ENV: "production", K_SERVICE: "ai-pdm-nonprod",
      PDM_AUTH_MODE: "managed" }))
      .toBe("managed");
  });
});
