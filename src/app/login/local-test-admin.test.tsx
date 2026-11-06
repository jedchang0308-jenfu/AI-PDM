// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
  <a {...props}>{children}</a> }));

let root: Root;
let container: HTMLDivElement;
const authMode = (localTestAdmin: boolean) => ({
  authMode: "firebase_bff", ssoHandoffEnabled: !localTestAdmin,
  googleOAuth: { enabled: false }, firebase: { config: null },
  localQuickLogin: false, localPrincipalSandbox: localTestAdmin, localTestAdmin,
});
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("local test administrator login", () => {
  it("offers one local action and recovers a failed login without visiting SSO", async () => {
    let finish!: (value: Response) => void;
    const request = vi.fn((url: string) => url === "/api/auth/mode"
      ? Promise.resolve(Response.json(authMode(true)))
      : new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", request);
    await act(async () => { root.render(<LoginPage />); });
    const button = [...container.querySelectorAll("button")].find(item => item.textContent === "以測試超級管理員登入")!;
    expect(button).toBeTruthy();
    expect(container.textContent).not.toContain("使用鉦富平台本機測試身分");
    expect(container.querySelector('input[type="password"]')).toBeNull();
    await act(async () => button.click());
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
    expect(request.mock.calls.filter(([url]) => url === "/api/auth/local-test-admin")).toHaveLength(1);
    expect(request).toHaveBeenLastCalledWith("/api/auth/local-test-admin", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    await act(async () => { finish(Response.json({ error: "測試帳戶尚未安裝" }, { status: 503 })); });
    expect(button.disabled).toBe(false);
    expect(container.textContent).toContain("測試帳戶尚未安裝");
  });

  it("keeps the test administrator action absent in the ordinary SSO mode", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(authMode(false))));
    await act(async () => { root.render(<LoginPage />); });
    expect(container.textContent).not.toContain("以測試超級管理員登入");
    expect(container.textContent).toContain("鉦富平台");
  });
});
