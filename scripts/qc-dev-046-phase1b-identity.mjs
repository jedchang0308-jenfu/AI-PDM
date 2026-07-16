#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  InMemoryPrivilegedReplayGuard,
  issuePlatformSessionV2,
  verifyPlatformSessionV2
} from "../src/lib/platform-session-v2.ts";
import {
  exchangeFirebaseIdTokenForPlatformSession,
  offboardIdentityDenyFirst,
  provisionFirebasePasswordInvitation
} from "../src/lib/platform-identity-contract.ts";
import {
  FakeFirebaseIdentityProvider,
  FakeInvitationMailProvider,
  FakePlatformIdentityRepository
} from "../src/lib/platform-identity-fakes.ts";
import {
  scanLegacyLoginClosure,
  validateAccountReprovisionManifest
} from "../src/lib/account-reprovision-contract.ts";

const results = [];
function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}
async function rejects(fn, expected) {
  try {
    await fn();
    return false;
  } catch (error) {
    return error instanceof Error && error.message === expected;
  }
}

const now = 1_800_000_000;
const oldKey = "old-session-signing-key-32-bytes-minimum-value";
const currentKey = "current-session-signing-key-32-bytes-minimum";
const keyRing = {
  issuer: "https://erp.jenfu.example/bff",
  audience: "ai-pdm",
  currentKeyId: "2026-07-current",
  keys: {
    "2026-06-previous": oldKey,
    "2026-07-current": currentKey
  }
};
const baseInput = {
  subject: "firebase-user-001",
  pdmUserId: "prod-pdm-user-001",
  companyId: "company-jenfu",
  authTime: now - 60,
  sessionVersion: 3,
  assuranceLevel: "aal2",
  secondFactor: "google_workspace_mfa",
  sessionId: "session-identity-0001"
};

const token = issuePlatformSessionV2(baseInput, keyRing, now);
const claims = verifyPlatformSessionV2(token, keyRing, {
  nowSeconds: now + 1,
  requiredAssuranceLevel: "aal2",
  currentSessionVersion: 3
});
record("DEV046-1B-001 issuer audience eight-hour and recognized MFA claims verify", claims.issuer === keyRing.issuer && claims.audience === "ai-pdm" && claims.expiresAt - claims.issuedAt === 28_800 && claims.secondFactor === "google_workspace_mfa");

const previousRing = { ...keyRing, currentKeyId: "2026-06-previous" };
const oldToken = issuePlatformSessionV2({ ...baseInput, sessionId: "session-identity-old1" }, previousRing, now);
record("DEV046-1B-002 previous signing key remains valid during rotation", verifyPlatformSessionV2(oldToken, keyRing, { nowSeconds: now + 1 }).sessionId === "session-identity-old1");
record("DEV046-1B-003 wrong audience fails closed", await rejects(() => Promise.resolve(verifyPlatformSessionV2(token, { ...keyRing, audience: "other-module" }, { nowSeconds: now + 1 })), "SESSION_V2_AUDIENCE_INVALID"));
record("DEV046-1B-004 revoked session version fails closed", await rejects(() => Promise.resolve(verifyPlatformSessionV2(token, keyRing, { nowSeconds: now + 1, currentSessionVersion: 4 })), "SESSION_V2_REVOKED_BY_VERSION"));
record("DEV046-1B-005 provider disabled state fails closed", await rejects(() => Promise.resolve(verifyPlatformSessionV2(token, keyRing, { nowSeconds: now + 1, providerUserDisabled: true })), "SESSION_V2_PROVIDER_DISABLED"));
record("DEV046-1B-006 sessions cannot exceed eight hours", await rejects(() => Promise.resolve(issuePlatformSessionV2({ ...baseInput, maxAgeSeconds: 28_801 }, keyRing, now)), "SESSION_V2_MAX_AGE_EXCEEDED"));
record("DEV046-1B-007 AAL2 cannot be issued without recognized MFA", await rejects(() => Promise.resolve(issuePlatformSessionV2({ ...baseInput, secondFactor: null }, keyRing, now)), "SESSION_V2_AAL2_REQUIRES_RECOGNIZED_MFA"));

const replay = new InMemoryPrivilegedReplayGuard();
replay.consume(claims.sessionId, "privileged-nonce-0001", now);
record("DEV046-1B-008 privileged nonce replay is rejected", await rejects(() => Promise.resolve(replay.consume(claims.sessionId, "privileged-nonce-0001", now + 1)), "PRIVILEGED_NONCE_REPLAYED"));

const firebase = new FakeFirebaseIdentityProvider();
const repository = new FakePlatformIdentityRepository();
firebase.identities.set("firebase-token-aal2", {
  uid: "firebase-user-001",
  email: "admin@jenfu.com.tw",
  emailVerified: true,
  disabled: false,
  authTimeSeconds: now - 10,
  signInProvider: "google.com",
  secondFactor: null
});
repository.principals.set("firebase-user-001", {
  firebaseUid: "firebase-user-001",
  pdmUserId: "prod-pdm-user-001",
  companyId: "company-jenfu",
  sessionVersion: 3,
  accountStatus: "active",
  requiresPrivilegedAssurance: true
});
const exchanged = await exchangeFirebaseIdTokenForPlatformSession({
  idToken: "firebase-token-aal2",
  firebase,
  repository,
  keyRing,
  requirePrivilegedAssurance: true,
  workspaceMfaTrustPolicy: { enabled: false, allowAal1PrivilegedPilot: true, domains: ["jenfu.com.tw"] },
  nowSeconds: now
});
const exchangedClaims = verifyPlatformSessionV2(exchanged, keyRing, { nowSeconds: now + 1 });
record("DEV046-1B-009 BFF exchange allows approved Workspace AAL1 pilot after revoked-token verification", exchangedClaims.assuranceLevel === "aal1" && exchangedClaims.secondFactor === null && firebase.operations.includes("verify:firebase-token-aal2:revoked=true"));

const mailer = new FakeInvitationMailProvider();
const invitation = await provisionFirebasePasswordInvitation({
  invitationId: "invitation-success",
  targetUid: "firebase-invited-001",
  email: "external@example.com",
  displayName: "External User",
  continueUrl: "https://erp.jenfu.example/account-recovery",
  firebase,
  repository,
  mailer
});
record("DEV046-1B-010 password-link invitation reaches explicit setup state", invitation.setupState === "password_setup_link_sent" && repository.invitationStates.get("invitation-success")?.join(",") === "requested,identity_created,password_setup_link_sent" && mailer.deliveries.length === 1);

firebase.failPasswordLink = true;
await rejects(() => provisionFirebasePasswordInvitation({
  invitationId: "invitation-failure",
  targetUid: "firebase-orphan-001",
  email: "orphan@example.com",
  displayName: "Orphan Candidate",
  continueUrl: "https://erp.jenfu.example/account-recovery",
  firebase,
  repository,
  mailer
}), "FAKE_PASSWORD_LINK_FAILED");
record("DEV046-1B-011 invitation failure compensates orphan identity", !firebase.identities.has("firebase-orphan-001") && repository.invitationStates.get("invitation-failure")?.at(-1) === "compensated" && firebase.operations.includes("disable:firebase-orphan-001") && firebase.operations.includes("delete:firebase-orphan-001"));

repository.failOffboard = true;
const offboard = await offboardIdentityDenyFirst({
  firebaseUid: "firebase-user-001",
  pdmUserId: "prod-pdm-user-001",
  reasonCode: "employment-ended",
  actorId: "prod-pdm-user-admin-001",
  firebase,
  repository
});
record("DEV046-1B-012 offboarding denies provider first and remains denied on DB failure", offboard.status === "reconciliation_pending" && offboard.providerAccessDenied === true && firebase.identities.get("firebase-token-aal2")?.disabled === true && firebase.operations.indexOf("disable:firebase-user-001") < firebase.operations.indexOf("revoke:firebase-user-001"));

const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "config/platform/account-reprovision.template.json"), "utf8"));
const manifestResult = validateAccountReprovisionManifest(manifest);
record("DEV046-1B-013 clean reprovision manifest creates a new Admin identity", manifestResult.valid && manifest.records[0].email === "jedchang0308@jenfu.com.tw" && manifest.records[0].role === "Admin" && manifest.records[0].sourceLegacyUserId !== manifest.records[0].targetPdmUserId);
const collisionResult = validateAccountReprovisionManifest({ ...manifest, records: [manifest.records[0], { ...manifest.records[0], sourceLegacyUserId: "other-legacy" }] });
record("DEV046-1B-014 duplicate email and stable IDs produce collision report", !collisionResult.valid && new Set(collisionResult.collisions.map((collision) => collision.field)).size === 3);
const closure = scanLegacyLoginClosure({ enabledLoginMethods: ["google_workspace", "firebase_email_password_link"], enabledRoutes: ["/login", "/account-recovery"], demoBootstrapEnabled: false });
const openLegacy = scanLegacyLoginClosure({ enabledLoginMethods: ["local_password"], enabledRoutes: ["/demo-login"], demoBootstrapEnabled: true });
record("DEV046-1B-015 legacy login closure scanner is fail closed", closure.closed && !openLegacy.closed && openLegacy.methodViolations.includes("demo_bootstrap") && openLegacy.routeViolations.length === 1);

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-046 Phase 1B QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
