#!/usr/bin/env node

import assert from "node:assert/strict";
import { FirebaseAdminIdentityProvider } from "../src/lib/firebase-admin-identity-provider.ts";
import { createFirebaseManagedInvitation } from "../src/lib/firebase-managed-invitations.ts";
import { FirebasePlatformPrincipalRepository } from "../src/lib/firebase-platform-principal-repository.ts";
import { exchangeFirebaseIdTokenForPlatformSession } from "../src/lib/platform-identity-contract.ts";
import { getPlatformSessionKeyRing } from "../src/lib/platform-session-key-ring.ts";
import { verifyPlatformSessionV2 } from "../src/lib/platform-session-v2.ts";
import { buildPhase2BPreflight } from "./dev-046-phase2b-preflight.mjs";

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
  },
  async createUser(input) {
    operations.push(`create:${input.uid}`);
    return { uid: input.uid, email: input.email };
  },
  async generatePasswordResetLink(email) {
    operations.push(`link:${email}`);
    return "https://example.test/action";
  },
  async updateUser(uid, input) {
    operations.push(`update:${uid}:${input.disabled}`);
    return { uid };
  },
  async revokeRefreshTokens(uid) {
    operations.push(`revoke:${uid}`);
  },
  async deleteUser(uid) {
    operations.push(`delete:${uid}`);
  }
};
const firebase = new FirebaseAdminIdentityProvider(adminClient);

const verified = await firebase.verifyIdToken("valid-token", { checkRevoked: true });
record("DEV046-2B-001 Admin adapter forces revoked-token verification", verified.uid === decoded.uid && operations.includes("verify:valid-token:true"));
record("DEV046-2B-002 Google Workspace sign-in provider is available for MFA trust", verified.signInProvider === "google.com" && verified.secondFactor === null && verified.emailVerified === true);

const created = await firebase.createEmailPasswordIdentity({ uid: "new-001", email: "NEW@JENFU.COM.TW", displayName: "New User", disabled: false });
await firebase.disableIdentity(created.uid);
await firebase.revokeRefreshTokens(created.uid);
await firebase.deleteIdentity(created.uid);
record("DEV046-2B-003 provider lifecycle operations are explicit", created.email === "new@jenfu.com.tw" && operations.includes("update:new-001:true") && operations.includes("revoke:new-001") && operations.includes("delete:new-001"));

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
record("DEV046-2B-008 privileged principal fails closed without trusted Workspace Google provider/domain", assuranceDenied);

assert.throws(
  () => getPlatformSessionKeyRing({ PDM_SESSION_ISSUER: "issuer", PDM_SESSION_AUDIENCE: "audience", PDM_SESSION_CURRENT_KEY_ID: "same", PDM_SESSION_CURRENT_SECRET: "x".repeat(40), PDM_SESSION_PREVIOUS_KEY_ID: "same", PDM_SESSION_PREVIOUS_SECRET: "y".repeat(40) }),
  /SESSION_V2_KEY_IDS_MUST_DIFFER/u
);
record("DEV046-2B-009 duplicate rotation key IDs are rejected", true);

const preflight = buildPhase2BPreflight();
record("DEV046-2B-010 local Phase 2B contract passes", preflight.applicationContractPassed && preflight.summary.checksPassed === preflight.summary.checksTotal);
record("DEV046-2B-011 preflight remains externally blocked", preflight.result === "blocked_external" && preflight.safeToRunCredentialledPlan === false && preflight.safeToCreateResources === false);
record("DEV046-2B-012 resolved application blockers do not reappear", !preflight.blockers.includes("LIVE_FIREBASE_IDENTITY_ADAPTER_NOT_IMPLEMENTED") && !preflight.blockers.includes("PDM_AUTH_MODE_DOES_NOT_YET_ACCEPT_FIREBASE_BFF") && !preflight.blockers.includes("EMPLOYEE_LOGIN_ALIAS_MAPPING_NOT_IMPLEMENTED") && !preflight.blockers.includes("PRIVACY_NOTICE_UI_AND_ACKNOWLEDGEMENT_NOT_IMPLEMENTED"));
record("DEV046-2B-013 invitation, Firebase Web config and Google provider evidence are present while principal evidence remains blocked", !preflight.blockers.includes("FIREBASE_INVITATION_PROVIDER_NOT_IMPLEMENTED") && !preflight.blockers.includes("FIREBASE_WEB_APP_CONFIG_MISSING") && !preflight.blockers.includes("FIREBASE_GOOGLE_PROVIDER_CONFIG_MISSING") && preflight.blockers.includes("STAGING_PRINCIPAL_MAPPING_EVIDENCE_MISSING"));

function fakeInvitationClient(operations) {
  let sharedMapping = false;
  let externalSubject = "pdm-firebase-fixed";
  let reissuedUser = false;
  let reissuedInvitation = false;
  return {
    kind: "sqlite",
    async query() { return []; },
    async queryOne(sql, params = {}) {
      if (sql.includes("FROM companies")) return { id: "company-jenfu" };
      if (sql.includes("FROM platform_principal_mappings")) {
        return {
          platform_principal_id: sharedMapping ? `firebase:${params.pdmUserId}` : `pdm:${params.pdmUserId}`,
          pdm_user_id: params.pdmUserId,
          mapping_source: sharedMapping ? "shared_iam" : "current_pdm",
          mapping_status: "active",
          external_subject: sharedMapping ? externalSubject : null
        };
      }
      if (sql.includes("FROM users") && sql.includes("account_status_reason")) {
        return reissuedUser ? {
          account_status: "active",
          system_role_enabled: 1,
          account_status_reason: "firebase_invitation_reissued"
        } : null;
      }
      if (sql.includes("FROM firebase_identity_invitations")) {
        return reissuedInvitation ? {
          invitation_id: "invitation-fixed",
          firebase_uid: "pdm-firebase-existing",
          pdm_user_id: "prod-pdm-existing",
          setup_state: "requested",
          last_error: null
        } : null;
      }
      return null;
    },
    async execute(sql, params = {}) {
      if (sql.includes("SET platform_principal_id")) {
        sharedMapping = true;
        externalSubject = params.externalSubject;
      }
      if (sql.includes("account_status = 'active'")) {
        reissuedUser = true;
        operations.push("reissue:user");
      }
      if (sql.includes("SET setup_state = 'requested'")) {
        reissuedInvitation = true;
        operations.push("reissue:invitation");
      }
      if (params.state) operations.push(`state:${params.state}`);
      if (sql.includes("setup_state = 'compensated'")) operations.push("state:compensated");
    },
    async transaction(fn) { return fn(this); },
    async close() {}
  };
}

function canonicalInvitation() {
  return {
    invitation: {
      id: "invitation-fixed",
      email: "invitee@jenfu.com.tw",
      displayName: "Invitee User",
      role: "Engineer",
      companyId: "company-jenfu",
      status: "pending",
      invitedBy: "admin-001",
      invitedByName: "Admin",
      invitedAt: "2026-07-13T00:00:00.000Z",
      expiresAt: "2026-07-20T00:00:00.000Z",
      acceptedBy: null,
      acceptedAt: null,
      revokedBy: null,
      revokedAt: null
    },
    token: "not-used-by-firebase"
  };
}

const originalPublicUrl = process.env.PDM_PUBLIC_BASE_URL;
process.env.PDM_PUBLIC_BASE_URL = "https://pdm-stg.jenfu.com.tw";
try {
  const successOperations = [];
  const success = await createFirebaseManagedInvitation(
    { email: "invitee@jenfu.com.tw", displayName: "Invitee User", role: "Engineer", invitedBy: "admin-001" },
    {
      client: fakeInvitationClient(successOperations),
      idFactory: () => "fixed",
      createCanonical: async () => canonicalInvitation(),
      reissueCanonical: async () => null,
      revokeCanonical: async () => canonicalInvitation().invitation,
      firebase: {
        async verifyIdToken() { throw new Error("not-used"); },
        async createEmailPasswordIdentity(input) { successOperations.push(`identity:${input.uid}`); return { uid: input.uid, email: input.email }; },
        async generatePasswordSetupLink() { return "not-used"; },
        async disableIdentity() {},
        async revokeRefreshTokens() {},
        async deleteIdentity() {}
      },
      actionEmail: {
        async sendEmailSignInLink(input) { successOperations.push(`email:${input.email}`); }
      }
    }
  );
  record("DEV046-2B-014 managed invitation saga reaches sent state", success.delivery === "firebase_managed_email" && successOperations.includes("identity:pdm-firebase-fixed") && successOperations.includes("email:invitee@jenfu.com.tw") && successOperations.includes("state:password_setup_link_sent"));

  const failureOperations = [];
  let failureCompensated = false;
  try {
    await createFirebaseManagedInvitation(
      { email: "invitee@jenfu.com.tw", displayName: "Invitee User", role: "Engineer", invitedBy: "admin-001" },
      {
        client: fakeInvitationClient(failureOperations),
        idFactory: () => "fixed",
        createCanonical: async () => canonicalInvitation(),
        reissueCanonical: async () => null,
        revokeCanonical: async () => { failureOperations.push("canonical:revoked"); return canonicalInvitation().invitation; },
        firebase: {
          async verifyIdToken() { throw new Error("not-used"); },
          async createEmailPasswordIdentity(input) { failureOperations.push(`identity:${input.uid}`); return { uid: input.uid, email: input.email }; },
          async generatePasswordSetupLink() { return "not-used"; },
          async disableIdentity(uid) { failureOperations.push(`disable:${uid}`); },
          async revokeRefreshTokens(uid) { failureOperations.push(`revoke:${uid}`); },
          async deleteIdentity(uid) { failureOperations.push(`delete:${uid}`); }
        },
        actionEmail: { async sendEmailSignInLink() { throw new Error("EMAIL_DELIVERY_FAILED"); } }
      }
    );
  } catch (error) {
    failureCompensated = error instanceof Error && error.message === "EMAIL_DELIVERY_FAILED";
  }
  record("DEV046-2B-015 invitation delivery failure compensates provider and database", failureCompensated && ["disable:pdm-firebase-fixed", "revoke:pdm-firebase-fixed", "delete:pdm-firebase-fixed", "state:compensated", "canonical:revoked"].every((item) => failureOperations.includes(item)));

  const reissueOperations = [];
  const reissued = await createFirebaseManagedInvitation(
    { email: "invitee@jenfu.com.tw", displayName: "Invitee Reissued", role: "Engineer", invitedBy: "admin-001", reissueInvitationId: "invitation-fixed" },
    {
      client: fakeInvitationClient(reissueOperations),
      idFactory: () => "must-not-be-used",
      createCanonical: async () => { throw new Error("NEW_CANONICAL_MUST_NOT_BE_CREATED"); },
      reissueCanonical: async (input) => {
        reissueOperations.push(`canonical:${input.reissueInvitationId}`);
        return {
          ...canonicalInvitation(),
          pdmUserId: "prod-pdm-existing",
          firebaseUid: "pdm-firebase-existing"
        };
      },
      revokeCanonical: async () => canonicalInvitation().invitation,
      firebase: {
        async verifyIdToken() { throw new Error("not-used"); },
        async createEmailPasswordIdentity(input) { reissueOperations.push(`identity:${input.uid}`); return { uid: input.uid, email: input.email }; },
        async generatePasswordSetupLink() { return "not-used"; },
        async disableIdentity(uid) { reissueOperations.push(`disable:${uid}`); },
        async revokeRefreshTokens(uid) { reissueOperations.push(`revoke:${uid}`); },
        async deleteIdentity(uid) { reissueOperations.push(`delete:${uid}`); }
      },
      actionEmail: {
        async sendEmailSignInLink(input) { reissueOperations.push(`email:${input.email}`); }
      }
    }
  );
  record(
    "DEV046-2B-016 compensated invitation reuses stable IDs and sends a fresh managed email",
    reissued.reissued === true &&
      reissued.pdmUserId === "prod-pdm-existing" &&
      reissued.firebaseUid === "pdm-firebase-existing" &&
      [
        "reissue:user",
        "reissue:invitation",
        "canonical:invitation-fixed",
        "disable:pdm-firebase-existing",
        "revoke:pdm-firebase-existing",
        "delete:pdm-firebase-existing",
        "identity:pdm-firebase-existing",
        "email:invitee@jenfu.com.tw",
        "state:password_setup_link_sent"
      ].every((item) => reissueOperations.includes(item))
  );
} finally {
  if (originalPublicUrl === undefined) delete process.env.PDM_PUBLIC_BASE_URL;
  else process.env.PDM_PUBLIC_BASE_URL = originalPublicUrl;
}

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-046 Phase 2B Firebase BFF QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
