#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const loginPage = fs.readFileSync("src/app/login/page.tsx", "utf8");
const styles = fs.readFileSync("src/app/globals.css", "utf8");

const checks = [
  {
    name: "Google popup wait has a dedicated operation state",
    passed: loginPage.includes('setLoginOperation("google")') && loginPage.includes('loginOperation === "google"')
  },
  {
    name: "Google popup wait exposes an enabled recovery command",
    passed:
      loginPage.includes("login-operation-cancel") &&
      loginPage.includes("取消登入") &&
      loginPage.includes("window.location.reload()")
  },
  {
    name: "Google popup wait explains the active external step",
    passed:
      loginPage.includes('role="status"') &&
      loginPage.includes("Google 登入視窗已開啟，請完成公司帳號選擇。")
  },
  {
    name: "Failed Firebase operations release the page state",
    passed: (loginPage.match(/setLoginOperation\(null\)/gu) ?? []).length >= 5
  },
  {
    name: "Popup recovery UI has stable responsive layout styles",
    passed:
      styles.includes(".login-operation-status") &&
      styles.includes(".login-operation-cancel") &&
      styles.includes("flex: 0 0 auto")
  }
];

for (const check of checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}`);
}

assert.equal(checks.every((check) => check.passed), true, "DEV-046 login popup recovery regression failed");
console.log(`\nDEV-046 login popup recovery QC: ${checks.length}/${checks.length} passed`);
