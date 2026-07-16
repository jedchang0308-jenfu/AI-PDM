#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const clientAuth = fs.readFileSync("src/lib/firebase-client-auth.ts", "utf8");
const loginPage = fs.readFileSync("src/app/login/page.tsx", "utf8");
const authConfig = fs.readFileSync("src/lib/auth-config.ts", "utf8");
const identityContract = fs.readFileSync("src/lib/platform-identity-contract.ts", "utf8");
const sessionV2 = fs.readFileSync("src/lib/platform-session-v2.ts", "utf8");
const runtimeIaC = fs.readFileSync("infra/google-cloud/staging/runtime.tf", "utf8");
const cloudRunContract = fs.readFileSync("config/platform/cloud-run.contract.json", "utf8");

const checks = [
  {
    name: "Login no longer starts AI_PDM TOTP enrollment",
    passed:
      !loginPage.includes("設定雙重驗證") &&
      !loginPage.includes("totpEnrollment") &&
      !loginPage.includes("Google Authenticator") &&
      !loginPage.includes("完成設定並登入")
  },
  {
    name: "Client auth no longer generates or enrolls TOTP secrets",
    passed:
      !clientAuth.includes("generateSecret") &&
      !clientAuth.includes("assertionForEnrollment") &&
      !clientAuth.includes("multiFactor(enrollment.user).enroll")
  },
  {
    name: "BFF no longer converts privileged assurance failures into enrollment state",
    passed:
      !clientAuth.includes('kind: "totp_enrollment_required"') &&
      !clientAuth.includes("keepFirebaseSessionForEnrollment") &&
      !clientAuth.includes('body.code === "totp_required"')
  },
  {
    name: "Workspace access policy is explicit and domain bounded",
    passed:
      authConfig.includes("PDM_TRUST_GOOGLE_WORKSPACE_MFA") &&
      authConfig.includes("PDM_ALLOW_GOOGLE_WORKSPACE_AAL1_PRIVILEGED") &&
      authConfig.includes("PDM_GOOGLE_WORKSPACE_DOMAINS") &&
      authConfig.includes("isTrustedGoogleWorkspaceEmail")
  },
  {
    name: "Pilot privileged access requires Google provider and trusted Workspace email",
    passed:
      identityContract.includes('verified.signInProvider === "google.com"') &&
      identityContract.includes("isTrustedGoogleWorkspaceEmail") &&
      identityContract.includes("allowAal1PrivilegedPilot") &&
      identityContract.includes("FIREBASE_PRIVILEGED_ASSURANCE_REQUIRED")
  },
  {
    name: "AAL2 records a recognized MFA source without requiring AI_PDM TOTP",
    passed:
      sessionV2.includes('"google_workspace_mfa"') &&
      sessionV2.includes("SESSION_V2_AAL2_REQUIRES_RECOGNIZED_MFA") &&
      !sessionV2.includes("SESSION_V2_AAL2_REQUIRES_TOTP")
  },
  {
    name: "Staging Cloud Run runtime carries Workspace MFA and AAL1 pilot switches",
    passed:
      runtimeIaC.includes('name  = "PDM_TRUST_GOOGLE_WORKSPACE_MFA"') &&
      runtimeIaC.includes('name  = "PDM_ALLOW_GOOGLE_WORKSPACE_AAL1_PRIVILEGED"') &&
      runtimeIaC.includes('name  = "PDM_GOOGLE_WORKSPACE_DOMAINS"') &&
      runtimeIaC.includes("var.trust_google_workspace_mfa") &&
      runtimeIaC.includes("var.allow_google_workspace_aal1_privileged") &&
      runtimeIaC.includes("var.google_workspace_domains")
  },
  {
    name: "Cloud Run contract records AAL1 pilot as a residual risk instead of MFA evidence",
    passed:
      cloudRunContract.includes('"workspacePilotAccess"') &&
      cloudRunContract.includes('"workspaceMfaTrustEnabled": false') &&
      cloudRunContract.includes('"aal1PrivilegedPilotAllowed": true') &&
      cloudRunContract.includes("recorded as AAL1")
  }
];

for (const check of checks) console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}`);

assert.equal(checks.every((check) => check.passed), true, "DEV-046 Workspace pilot access regression failed");
console.log(`\nDEV-046 Workspace pilot access QC: ${checks.length}/${checks.length} passed`);
