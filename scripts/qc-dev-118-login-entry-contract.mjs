import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const authConfig = read("src/lib/auth-config.ts");
const modeRoute = read("src/app/api/auth/mode/route.ts");
const loginPage = read("src/app/login/page.tsx");
const handoff = read("src/lib/jenfu-sso-handoff.ts");
const checks = [];

function check(name, condition) {
  assert.equal(Boolean(condition), true, name);
  checks.push(name);
}

check("static SSO config parser is shared", authConfig.includes("export function getJenfuSsoHandoffConfig") && handoff.includes("const setup = getJenfuSsoHandoffConfig"));
check("SSO entry state distinguishes invalid configuration", authConfig.includes('export function getJenfuSsoHandoffEntryState') && authConfig.includes('return "invalid"'));
check("invalid SSO mode returns fixed 503", modeRoute.includes('code: "sso_dependency_unavailable"') && modeRoute.includes("status: 503"));
check("auth mode response is uncached", modeRoute.includes('"cache-control": "no-store"'));
check("SSO hides direct Google capability", modeRoute.includes('ssoState === "on" ? { enabled: false, provider: "firebase" }'));
check("login mode fetch never falls back to managed", loginPage.includes('setModeState("unavailable")') && !loginPage.includes('catch(() => {\n        setAuthMode("managed")'));
check("login loading state has no form", loginPage.includes('modeState === "loading"') && loginPage.includes('modeState === "ready" && !ssoHandoffEnabled && <form'));
check("login unavailable state has alert and retry", loginPage.includes('role="alert"') && loginPage.includes("重新取得登入設定"));
check("SSO ready state exposes only platform CTA", loginPage.includes('modeState === "ready" && ssoHandoffEnabled') && loginPage.includes("使用鉦富平台登入"));
check("no provider readiness probe was added", !modeRoute.includes("accounts:createAuthUri") && !handoff.includes("accounts:createAuthUri"));

console.log(JSON.stringify({ devId: "DEV-118", status: "PASS", total: checks.length, passed: checks.length, checks }, null, 2));
