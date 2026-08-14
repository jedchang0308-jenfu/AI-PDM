#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const record = (name, passed, detail = "") => results.push({ name, passed: Boolean(passed), detail });

const sessionRoute = read("src/app/api/auth/firebase/session/route.ts");
const authAsync = read("src/lib/auth-async.ts");
const firebaseClient = read("src/lib/firebase-client-auth.ts");
const loginPage = read("src/app/login/page.tsx");
const invitationPage = read("src/app/account-invitation/firebase/page.tsx");
const layout = read("src/app/layout.tsx");
const accountLifecycle = read("src/lib/account-lifecycle.ts");
const accountSettings = read("src/app/settings/accounts/page.tsx");
const sidebar = read("src/components/sidebar-nav.tsx");
const productionSlice = read("src/lib/production-slice.ts");
const authCookies = `${read("src/lib/auth.ts")}\n${read("src/lib/auth-response-cookies.ts")}`;
const schema = read("db/schema.sql");
const postgresMigration = read("db/postgres/015_employee_privacy_notice_acknowledgements.sql");
const workflow = read(".github/workflows/deploy-production.yml");
const accountRecoveryPage = read("src/app/account-recovery/request/page.tsx");
const accountSecurityPage = read("src/app/account/security/page.tsx");
const globalStyles = read("src/app/globals.css");
const statusScopeBrowserQc = read("scripts/qc-pdm-status-scope-browser.mjs");
const middleware = read("src/middleware.ts");

const retiredRuntimeFiles = [
  "src/components/privacy-access-gate.tsx",
  "src/app/privacy/page.tsx",
  "src/app/privacy/acknowledgement/page.tsx",
  "src/app/api/privacy/notice/route.ts",
  "src/app/api/privacy/acknowledgements/current/route.ts",
  "src/lib/privacy-notice.ts",
  "src/lib/privacy-notice-content.ts",
  "src/lib/repositories/privacy-notice-async-repository.ts"
];

record("DEV070-PRIV-001 runtime privacy pages, APIs, repository and gate are absent", retiredRuntimeFiles.every((file) => !exists(file)));
record(
  "DEV070-PRIV-002 Firebase session exchange creates the normal session without a privacy branch",
  sessionRoute.includes("registerFirebaseAccountSessionAsync") &&
    sessionRoute.includes("setFirebaseBffSessionResponseCookie") &&
    !/privacy|acknowledg/iu.test(sessionRoute)
);
record(
  "DEV070-PRIV-003 protected API authentication no longer queries or returns privacy gate states",
  authAsync.includes("return { user, response: null }") && !/privacy|acknowledg|\b428\b/iu.test(authAsync)
);
record(
  "DEV070-PRIV-004 browser exchange has one authenticated outcome and no privacy payload",
  firebaseClient.includes('return { kind: "authenticated" } as const') && !/privacy|acknowledg/iu.test(firebaseClient)
);
record(
  "DEV070-PRIV-005 login keeps account recovery and removes privacy redirect and link",
  loginPage.includes('href="/account-recovery/request"') && loginPage.includes("login-help-footer") && !/privacy|acknowledg/iu.test(loginPage)
);
record(
  "DEV070-PRIV-006 invitation activation no longer requires a privacy checkbox or version",
  invitationPage.includes("disabled={loading || !config}") && !/privacy|acknowledg/iu.test(invitationPage)
);
record(
  "DEV070-PRIV-007 root layout, navigation and production slice expose no privacy route or client gate",
  !/PrivacyAccessGate|\/privacy/iu.test(`${layout}\n${sidebar}\n${productionSlice}`)
);
record(
  "DEV070-PRIV-008 Admin account detail no longer queries or renders acknowledgement evidence",
  !/privacyEvidence|PrivacyAcknowledgement|個人資料告知確認/iu.test(`${accountLifecycle}\n${accountSettings}`)
);
record("DEV070-PRIV-009 pending privacy session cookie support is removed", !/PRIVACY_PENDING|privacy_pending/iu.test(authCookies));
record(
  "DEV070-PRIV-010 immutable historical schema and provider migration remain preserved",
  schema.includes("privacy_notice_acknowledgements") &&
    schema.includes("privacy acknowledgement cannot be deleted") &&
    postgresMigration.includes("privacy_notice_acknowledgements") &&
    postgresMigration.includes("prevent_privacy_evidence_change")
);
record(
  "DEV070-PRIV-011 release workflow executes the retirement regression before build",
  workflow.includes("npm run qc:dev-070-privacy-removal") && workflow.indexOf("npm run qc:dev-070-privacy-removal") < workflow.indexOf("npm run build")
);
record(
  "DEV070-PRIV-012 retired privacy routes are absent from artifact provenance requirements",
  !/api\/privacy|privacy\/acknowledgements/iu.test(read("scripts/dev-046-application-artifact-provenance.mjs"))
);
record(
  "DEV070-PRIV-013 unrelated recovery and session UI no longer depends on retired privacy CSS names",
  accountRecoveryPage.includes("login-help-footer") &&
    accountSecurityPage.includes("session-status-current") &&
    accountSecurityPage.includes("session-status-revoked") &&
    !/login-privacy-footer|privacy-status-/u.test(`${accountRecoveryPage}\n${accountSecurityPage}\n${globalStyles}`) &&
    !/privacy-gate-state|waitForPrivacyGateToSettle/u.test(statusScopeBrowserQc)
);
record(
  "DEV070-PRIV-014 retired page paths return a no-store 404 before the production-slice rewrite",
  middleware.includes('const RETIRED_PRIVACY_PATH_PREFIX = "/privacy"') &&
    middleware.includes("isRetiredPrivacyPath(request.nextUrl.pathname)") &&
    middleware.includes("status: 404") &&
    middleware.includes('"x-ai-pdm-retired-route": "privacy"') &&
    middleware.indexOf("isRetiredPrivacyPath(request.nextUrl.pathname)") < middleware.indexOf("shouldBlockProductionSlicePagePath(pathname)")
);

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = results.filter((result) => !result.passed);
console.log(`\nDEV-070 privacy runtime removal QC: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
