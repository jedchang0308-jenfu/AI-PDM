#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FirebaseAdminIdentityProvider } from "../src/lib/firebase-admin-identity-provider.ts";
import { FirebasePlatformPrincipalRepository } from "../src/lib/firebase-platform-principal-repository.ts";
import { exchangeFirebaseIdTokenForPlatformSession } from "../src/lib/platform-identity-contract.ts";
import { getPlatformSessionKeyRing } from "../src/lib/platform-session-key-ring.ts";
import { verifyPlatformSessionV2 } from "../src/lib/platform-session-v2.ts";

const results = [];
const record = (name, passed, detail = "") => results.push({ name, passed: Boolean(passed), detail });

const decoded = {
  uid: "firebase-admin-001",
  email: "admin@jenfu.com.tw",
  email_verified: true,
  auth_time: 1_752_350_000,
  firebase: { identities: {}, sign_in_provider: "google.com" }
};
const operations = [];
const adminClient = {
  async verifyIdToken(token, revoked) {
    operations.push(`verify:${token}:${revoked}`);
    return decoded;
  }
};
const firebase = new FirebaseAdminIdentityProvider(adminClient);

const verified = await firebase.verifyIdToken("valid-token", { checkRevoked: true });
record("DEV046-2B-001 Admin adapter forces revoked-token verification", verified.uid === decoded.uid && operations.includes("verify:valid-token:true"));
record("DEV046-2B-002 Google Workspace sign-in provider is available for MFA trust", verified.signInProvider === "google.com" && verified.secondFactor === null && verified.emailVerified === true);

record("DEV046-2B-003 consumer adapter exposes verification only",
  Object.getOwnPropertyNames(FirebaseAdminIdentityProvider.prototype)
    .filter((name) => name !== "constructor" && name !== "client")
    .join(",") === "verifyIdToken" && operations.length === 1);

let capturedParams = null;
const repository = new FirebasePlatformPrincipalRepository({
  async queryOne(_sql, params) {
    capturedParams = params;
    return {
      firebase_uid: "firebase-admin-001",
      pdm_user_id: "prod-pdm-admin-001",
      company_id: "company-jenfu",
      account_lifecycle_version: 3,
      role: "Admin",
      account_status: "active",
      system_role_enabled: 1
    };
  }
});
const principal = await repository.resolvePrincipal("firebase-admin-001");
record("DEV046-2B-004 principal lookup uses Firebase UID mapping", capturedParams?.firebaseUid === "firebase-admin-001" && principal?.pdmUserId === "prod-pdm-admin-001" && principal.requiresPrivilegedAssurance === true);

const keyRing = getPlatformSessionKeyRing({
  PDM_SESSION_ISSUER: "https://pdm-stg.jenfu.com.tw",
  PDM_SESSION_AUDIENCE: "ai-pdm-staging",
  PDM_SESSION_CURRENT_KEY_ID: "current-v2",
  PDM_SESSION_CURRENT_SECRET: "c".repeat(48),
  PDM_SESSION_PREVIOUS_KEY_ID: "previous-v1",
  PDM_SESSION_PREVIOUS_SECRET: "p".repeat(48)
});
record("DEV046-2B-005 key ring retains current and previous verification keys", Object.keys(keyRing.keys).length === 2 && keyRing.currentKeyId === "current-v2");

const session = await exchangeFirebaseIdTokenForPlatformSession({
  idToken: "valid-token",
  firebase,
  repository,
  keyRing,
  workspaceMfaTrustPolicy: { enabled: false, allowAal1PrivilegedPilot: true, domains: ["jenfu.com.tw"] },
  nowSeconds: 1_752_350_100
});
const claims = verifyPlatformSessionV2(session, keyRing, { nowSeconds: 1_752_350_101, currentSessionVersion: 3 });
record("DEV046-2B-006 exchange issues eight-hour approved Workspace AAL1 pilot session", claims.pdmUserId === "prod-pdm-admin-001" && claims.expiresAt - claims.issuedAt === 8 * 60 * 60 && claims.assuranceLevel === "aal1" && claims.secondFactor === null);

const trustedPasswordFirebase = new FirebaseAdminIdentityProvider({
  ...adminClient,
  verifyIdToken: async () => ({ ...decoded, firebase: { sign_in_provider: "password" } })
});
const passwordSession = await exchangeFirebaseIdTokenForPlatformSession({
  idToken: "trusted-password-token",
  firebase: trustedPasswordFirebase,
  repository,
  keyRing,
  workspaceMfaTrustPolicy: { enabled: false, allowAal1PrivilegedPilot: true, domains: ["jenfu.com.tw"] },
  nowSeconds: 1_752_350_100
});
const passwordClaims = verifyPlatformSessionV2(passwordSession, keyRing, { nowSeconds: 1_752_350_101, currentSessionVersion: 3 });
record("DEV046-2B-006A exchange allows verified trusted-domain password sign-in without TOTP", passwordClaims.assuranceLevel === "aal1" && passwordClaims.secondFactor === null);

let pilotDisabledDenied = false;
try {
  await exchangeFirebaseIdTokenForPlatformSession({
    idToken: "valid-token",
    firebase,
    repository,
    keyRing,
    workspaceMfaTrustPolicy: { enabled: false, allowAal1PrivilegedPilot: false, domains: ["jenfu.com.tw"] },
    nowSeconds: 1_752_350_100
  });
} catch (error) {
  pilotDisabledDenied = error instanceof Error && error.message === "FIREBASE_PRIVILEGED_ASSURANCE_REQUIRED";
}
record("DEV046-2B-007 privileged AAL1 pilot fails closed when the explicit exception is disabled", pilotDisabledDenied);

const untrustedProviderFirebase = new FirebaseAdminIdentityProvider({ ...adminClient, verifyIdToken: async () => ({ ...decoded, email: "admin@example.com", firebase: { sign_in_provider: "password" } }) });
let assuranceDenied = false;
try {
  await exchangeFirebaseIdTokenForPlatformSession({
    idToken: "aal1-token",
    firebase: untrustedProviderFirebase,
    repository,
    keyRing,
    workspaceMfaTrustPolicy: { enabled: false, allowAal1PrivilegedPilot: true, domains: ["jenfu.com.tw"] },
    nowSeconds: 1_752_350_100
  });
} catch (error) {
  assuranceDenied = error instanceof Error && error.message === "FIREBASE_PRIVILEGED_ASSURANCE_REQUIRED";
}
record("DEV046-2B-008 privileged principal fails closed outside the trusted company domain", assuranceDenied);

const unsupportedProviderFirebase = new FirebaseAdminIdentityProvider({ ...adminClient, verifyIdToken: async () => ({ ...decoded, firebase: { sign_in_provider: "custom" } }) });
let unsupportedProviderDenied = false;
try {
  await exchangeFirebaseIdTokenForPlatformSession({
    idToken: "unsupported-provider-token",
    firebase: unsupportedProviderFirebase,
    repository,
    keyRing,
    workspaceMfaTrustPolicy: { enabled: false, allowAal1PrivilegedPilot: true, domains: ["jenfu.com.tw"] },
    nowSeconds: 1_752_350_100
  });
} catch (error) {
  unsupportedProviderDenied = error instanceof Error && error.message === "FIREBASE_PRIVILEGED_ASSURANCE_REQUIRED";
}
record("DEV046-2B-008A privileged principal fails closed for an unsupported provider", unsupportedProviderDenied);

assert.throws(
  () => getPlatformSessionKeyRing({ PDM_SESSION_ISSUER: "issuer", PDM_SESSION_AUDIENCE: "audience", PDM_SESSION_CURRENT_KEY_ID: "same", PDM_SESSION_CURRENT_SECRET: "x".repeat(40), PDM_SESSION_PREVIOUS_KEY_ID: "same", PDM_SESSION_PREVIOUS_SECRET: "y".repeat(40) }),
  /SESSION_V2_KEY_IDS_MUST_DIFFER/u
);
record("DEV046-2B-009 duplicate rotation key IDs are rejected", true);

if (process.env.PDM_QC_PHASE2B_SKIP_STAGING_PREFLIGHT !== "true") {
  const root = process.cwd();
  const stagingManifestPath = path.join(root, "config/platform/staging-preflight.template.json");
  const productionTarget = JSON.parse(fs.readFileSync(path.join(root, "config/platform/production-target.template.json"), "utf8"));
  const retainedStagingManifestIsFailClosed = !fs.existsSync(stagingManifestPath) || (() => {
    const stagingManifest = JSON.parse(fs.readFileSync(stagingManifestPath, "utf8"));
    return stagingManifest.executionMode === "local-static-only" &&
      stagingManifest.resourceCreationEnabled === false &&
      stagingManifest.credentialAccessAllowed === false &&
      stagingManifest.terraformApplyAllowed === false &&
      stagingManifest.billingMutationAllowed === false;
  })();
  record(
    "DEV046-2B-010 retired staging preflight contract is absent or retained fail-closed",
    retainedStagingManifestIsFailClosed
  );
  record(
    "DEV046-2B-011 current production target remains fail-closed",
    productionTarget.templateOnly === true && productionTarget.releaseReady === false && productionTarget.productionActionAllowed === false
  );
  record(
    "DEV046-2B-012 Firebase Hosting delegates application authority to the reviewed Cloud Run service",
    productionTarget.target?.projectId === "jenfu-ai-pdm-prod" &&
      productionTarget.target?.runtimeService === "ai-pdm-prod" &&
      productionTarget.edge?.type === "firebase-hosting-cloud-run-rewrite" &&
      productionTarget.edge?.firebaseHostingOwnsBusinessLogic === false
  );
  record(
    "DEV046-2B-013 production data authority is Cloud SQL and excludes Firebase data products",
    productionTarget.database?.provider === "Cloud SQL for PostgreSQL" &&
      productionTarget.identity?.firestoreAuthorityAllowed === false &&
      productionTarget.identity?.firebaseStorageAuthorityAllowed === false &&
      productionTarget.identity?.firebaseFunctionsAuthorityAllowed === false
  );
}

const invitationSource = fs.readFileSync(path.join(process.cwd(), "src/lib/firebase-managed-invitations.ts"), "utf8");
const invitationRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/admin/account-invitations/route.ts"), "utf8");
const mappingSource = fs.readFileSync(path.join(process.cwd(), "src/lib/repositories/platform-mapping-async-repository.ts"), "utf8");
record("DEV121-UID-RETIRE-001 new Firebase UID enrollment writer is absent",
  !invitationSource.includes("createFirebaseManagedInvitation") &&
  !mappingSource.includes("ensureCurrentPrincipal") &&
  !mappingSource.includes("linkSharedPrincipal") &&
  invitationRoute.includes('error: "principal_enrollment_required"') &&
  invitationSource.includes("revokeFirebaseManagedInvitation") &&
  invitationSource.includes("repository.compensate") &&
  !/deps\.firebase|new FirebaseAdminIdentityProvider/u.test(invitationSource));
for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-046 Phase 2B Firebase BFF QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
