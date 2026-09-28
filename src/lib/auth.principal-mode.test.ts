import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), getUserById: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb, getUserById: mocks.getUserById }));

import { generateToken, getSessionUser, requireAuth, SESSION_COOKIE_NAME } from "@/lib/auth";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("rejects a valid legacy profile cookie before database access in Platform mode", () => {
  vi.stubEnv("PDM_AUTH_MODE", "firebase_bff");
  vi.stubEnv("PDM_JENFU_PLATFORM_AUTH_MODE", "on");
  const token = generateToken("profile-one");
  const request = new Request("https://ai-pdm.test/api/numbering/search", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` }
  });

  expect(getSessionUser(request)).toBeNull();
  expect(requireAuth(request).response?.status).toBe(401);
  expect(mocks.getDb).not.toHaveBeenCalled();
  expect(mocks.getUserById).not.toHaveBeenCalled();
});
