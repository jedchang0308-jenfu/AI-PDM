import { afterEach, expect, it, vi } from "vitest";
import {
  clearLocalPrincipalSessionCookie,
  createLocalPrincipalSessionCookie,
  createLocalStateCookie,
  localStateCookieValue,
  readLocalPrincipalSessionCookie,
} from "./local-sandbox-principal-runtime";

afterEach(() => vi.unstubAllEnvs());

it("reads and clears only the cookies for the configured PDM listener", () => {
  const primary = "http://localhost:1020";
  const alternate = "http://localhost:1021";
  const sandbox = "shared-daily";
  const expires = new Date(Date.now() + 60_000);
  const expiresInSeconds = Math.floor(expires.getTime() / 1000);
  vi.stubEnv("PDM_LOCAL_DAILY_PARALLEL", "1");
  vi.stubEnv("JENFU_LOCAL_SANDBOX_ID", sandbox);
  const cookies = [
    createLocalPrincipalSessionCookie("a.primary.b", sandbox, expires.toISOString(), primary),
    createLocalPrincipalSessionCookie("a.alternate.b", sandbox, expires.toISOString(), alternate),
    createLocalStateCookie("primary", primary, expiresInSeconds),
    createLocalStateCookie("alternate", alternate, expiresInSeconds),
  ].map(cookie => cookie.split(";")[0]);

  for (const [origin, expected] of [[primary, "primary"], [alternate, "alternate"]]) {
    vi.stubEnv("JENFU_LOCAL_SANDBOX_ORIGIN", origin);
    const request = new Request(origin + "/api/auth/local-sandbox/callback", {
      headers: { cookie: cookies.join("; ") },
    });
    expect(readLocalPrincipalSessionCookie(request, sandbox)).toBe(`a.${expected}.b`);
    expect(localStateCookieValue(request)).toBe(expected);
    expect(clearLocalPrincipalSessionCookie(sandbox, origin)).toMatch(
      expected === "alternate" ? /^pdm_local_principal_shared_daily_1021=;/ : /^pdm_local_principal_shared_daily=;/,
    );
  }
});

it("separates native sessions and PKCE for explicit integrated and standalone modes", () => {
  const sandbox = "isolated-dual-mode";
  const expires = new Date(Date.now() + 60_000);
  const cookies: string[] = [];
  for (const [mode, port] of [["integrated", 1020], ["standalone", 1021]] as const) {
    vi.stubEnv("JENFU_LOCAL_SANDBOX_MODE", mode);
    const origin = `http://localhost:${port}`;
    cookies.push(createLocalPrincipalSessionCookie(`a.${mode}.b`, sandbox, expires.toISOString(), origin).split(";")[0]);
    cookies.push(createLocalStateCookie(mode, origin, Math.floor(expires.getTime() / 1000)).split(";")[0]);
  }
  for (const [mode, port] of [["integrated", 1020], ["standalone", 1021]] as const) {
    vi.stubEnv("JENFU_LOCAL_SANDBOX_MODE", mode);
    vi.stubEnv("JENFU_LOCAL_SANDBOX_ORIGIN", `http://localhost:${port}`);
    vi.stubEnv("JENFU_LOCAL_SANDBOX_ID", sandbox);
    const request = new Request(`http://localhost:${port}/api/auth/local-sandbox/callback`, {headers:{cookie:cookies.join("; ")}});
    expect(readLocalPrincipalSessionCookie(request,sandbox)).toBe(`a.${mode}.b`);
    expect(localStateCookieValue(request)).toBe(mode);
    expect(clearLocalPrincipalSessionCookie(sandbox, `http://localhost:${port}`)).toContain(`_${mode}=;`);
    const other = mode === "integrated" ? "standalone" : "integrated";
    expect(clearLocalPrincipalSessionCookie(sandbox, `http://localhost:${port}`)).not.toContain(`_${other}=`);
  }
});
