import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ values: [] as unknown[], effects: [] as Array<() => void>, index: 0 }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => { hooks.effects.push(effect); }
}));
import { WindowsServiceSettings } from "@/components/windows-service-settings";
const replace = vi.fn();
const search = `?pair=1&port=53125&state=${"A".repeat(43)}`;
beforeEach(() => {
  vi.stubGlobal("window", { location: { search, replace } });
});
afterEach(() => {
  vi.unstubAllGlobals(); vi.clearAllMocks(); hooks.values.length = 0; hooks.effects.length = 0; hooks.index = 0;
});
async function load(status: number, body: unknown = {}) {
  const fetch = vi.fn().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal("fetch", fetch);
  WindowsServiceSettings();
  for (const effect of hooks.effects) effect();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  return fetch;
}
describe("Windows installer browser self-link login handoff; captured hooks, not browser SSO proof", () => {
  it("automatically starts company SSO on 401 and preserves the exact loopback pairing request", async () => {
    await load(401, { error: "auth_session_invalid" });
    await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce());
    const target = new URL(replace.mock.calls[0][0], "https://pdm.example");
    expect(target.pathname).toBe("/api/auth/jenfu-sso/start");
    expect(target.searchParams.get("returnTo")).toBe(`/settings/windows-service${search}`);
    expect([...target.searchParams.keys()]).toEqual(["returnTo"]);
  });
  it("uses an already authenticated active user's session without another login", async () => {
    await load(200, { devices: [], canManageAll: false });
    await vi.waitFor(() => expect(hooks.values).toContain("ready"));
    expect(replace).not.toHaveBeenCalled();
  });
  it("shows account denial on 403 without looping through Google login", async () => {
    await load(403, { error: "principal_account_inactive" });
    await vi.waitFor(() => expect(hooks.values).toContain("forbidden"));
    expect(replace).not.toHaveBeenCalled();
  });
  it("keeps dependency failures distinct from missing authentication", async () => {
    await load(503, { error: "WINDOWS_SERVICE_DEPENDENCY_UNAVAILABLE" });
    await vi.waitFor(() => expect(hooks.values).toContain("error"));
    expect(replace).not.toHaveBeenCalled();
  });
});
