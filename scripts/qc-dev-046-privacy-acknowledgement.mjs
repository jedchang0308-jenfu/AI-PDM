#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SQLiteAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { privacyNoticeCanonicalJson } from "../src/lib/privacy-notice-content.ts";
import {
  PrivacyNoticeAsyncRepository,
  PrivacyNoticeError
} from "../src/lib/repositories/privacy-notice-async-repository.ts";
import { buildPhase2APreflight } from "./dev-046-phase2a-preflight.mjs";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const results = [];
const record = (name, passed, detail = "") => results.push({ name, passed: Boolean(passed), detail });

const schema = read("db/schema.sql");
const migration = read("db/postgres/015_employee_privacy_notice_acknowledgements.sql");
const sessionRoute = read("src/app/api/auth/firebase/session/route.ts");
const acknowledgementRoute = read("src/app/api/privacy/acknowledgements/current/route.ts");
const authAsync = read("src/lib/auth-async.ts");
const authSource = read("src/lib/auth.ts");
const authResponseCookies = read("src/lib/auth-response-cookies.ts");
const invitationPage = read("src/app/account-invitation/firebase/page.tsx");
const acknowledgementPage = read("src/app/privacy/acknowledgement/page.tsx");
const privacyPage = read("src/app/privacy/page.tsx");
const accountPage = read("src/app/settings/accounts/page.tsx");
const sidebar = read("src/components/sidebar-nav.tsx");
const productionSlice = read("src/lib/production-slice.ts");

record(
  "DEV046-PRIV-001 canonical and PostgreSQL schemas include immutable notice and acknowledgement tables",
  ["privacy_notice_versions", "privacy_notice_acknowledgements"].every((name) => schema.includes(name) && migration.includes(`public.${name}`)) &&
    schema.includes("privacy acknowledgement is immutable") && migration.includes("prevent_privacy_evidence_change")
);
record(
  "DEV046-PRIV-002 privacy tables force RLS and deny direct Data API roles",
  ["privacy_notice_versions", "privacy_notice_acknowledgements"].every(
    (name) => migration.includes(`ALTER TABLE public.${name} FORCE ROW LEVEL SECURITY`) && migration.includes(`REVOKE ALL ON TABLE public.${name} FROM PUBLIC, anon, authenticated`)
  )
);
record(
  "DEV046-PRIV-003 schema stores no password, token, MFA code or browser fingerprint",
  !/(?:password_hash|password_digest|mfa_secret|recovery_code|refresh_token|browser_fingerprint|session_token)/iu.test(migration)
);

const contentJson = privacyNoticeCanonicalJson();
const contentSha256 = crypto.createHash("sha256").update(contentJson).digest("hex");
const v1Contract = {
  version: "1.0",
  title: "AI PDM 員工個人資料告知事項",
  contentSha256,
  contentJson,
  effectiveAt: null,
  publishedBy: "company-owner:qc",
  publishedAt: "2026-07-13T00:00:00.000Z"
};

const database = new Database(":memory:");
database.exec(schema);
database.exec(`
  INSERT INTO users (id, display_name, email, role, company_id, account_status, system_role_enabled)
  VALUES
    ('admin-jenfu', 'Jenfu Admin', 'admin@jenfu.test', 'Admin', 'company-jenfu', 'active', 1),
    ('user-jenfu', 'Jenfu User', 'user@jenfu.test', 'Engineer', 'company-jenfu', 'active', 1),
    ('user-jenfu-2', 'Jenfu User 2', 'user2@jenfu.test', 'Engineer', 'company-jenfu', 'active', 1),
    ('user-jenfu-3', 'Jenfu User 3', 'user3@jenfu.test', 'Engineer', 'company-jenfu', 'active', 1);
  INSERT INTO account_invitations (
    id, email, display_name, role, company_id, token_hash, status, invited_by, invited_at, expires_at
  ) VALUES
    ('inv-privacy-1', 'user@jenfu.test', 'Jenfu User', 'Engineer', 'company-jenfu', '${"a".repeat(64)}', 'pending', 'admin-jenfu', '2026-07-13T08:00:00.000Z', '2026-07-20T08:00:00.000Z'),
    ('inv-privacy-3', 'user3@jenfu.test', 'Jenfu User 3', 'Engineer', 'company-jenfu', '${"b".repeat(64)}', 'pending', 'admin-jenfu', '2026-07-13T08:00:00.000Z', '2026-07-20T08:00:00.000Z');
  INSERT INTO firebase_identity_invitations (
    invitation_id, firebase_uid, pdm_user_id, setup_state, created_at, updated_at
  ) VALUES
    ('inv-privacy-1', 'firebase-user-1', 'user-jenfu', 'password_setup_link_sent', '2026-07-13T08:00:00.000Z', '2026-07-13T08:00:00.000Z'),
    ('inv-privacy-3', 'firebase-user-3', 'user-jenfu-3', 'password_setup_link_sent', '2026-07-13T08:00:00.000Z', '2026-07-13T08:00:00.000Z');
`);

const client = new SQLiteAsyncDatabaseClient(database);
let now = "2026-07-13T08:30:00.000Z";
let idSequence = 0;
const repository = new PrivacyNoticeAsyncRepository(client, v1Contract, {
  clock: () => now,
  idFactory: () => `qc-${++idSequence}`
});

const initial = await repository.getStatus({ userId: "user-jenfu", companyId: "company-jenfu" });
record(
  "DEV046-PRIV-004 current approved content has a deterministic SHA-256 and starts unacknowledged",
  /^[a-f0-9]{64}$/u.test(contentSha256) && initial.requiredContentSha256 === contentSha256 && initial.status === "not_acknowledged"
);
record(
  "DEV046-PRIV-005 exactly one published required version exists per company",
  database.prepare("SELECT COUNT(*) AS count FROM privacy_notice_versions WHERE company_id = ? AND status = 'published'").get("company-jenfu").count === 1
);

const withoutAck = await repository.finalizeAccess({
  userId: "user-jenfu",
  companyId: "company-jenfu",
  firebaseUid: "firebase-user-1",
  acknowledged: false,
  source: "firebase_bff_session"
});
record(
  "DEV046-PRIV-006 missing acknowledgement leaves invitation and PDM access fail closed",
  withoutAck.status === "not_acknowledged" &&
    database.prepare("SELECT setup_state FROM firebase_identity_invitations WHERE invitation_id = 'inv-privacy-1'").get().setup_state === "password_setup_link_sent" &&
    database.prepare("SELECT status FROM account_invitations WHERE id = 'inv-privacy-1'").get().status === "pending"
);

const requestId = "privacy-request-00000001";
const acknowledged = await repository.finalizeAccess({
  userId: "user-jenfu",
  companyId: "company-jenfu",
  firebaseUid: "firebase-user-1",
  acknowledged: true,
  source: "firebase_bff_session",
  requestId
});
const acknowledgementRow = database.prepare("SELECT * FROM privacy_notice_acknowledgements WHERE user_id = 'user-jenfu'").get();
record(
  "DEV046-PRIV-007 acknowledgement stores exact version, hash, stable user, timestamp, source and request ID",
  acknowledged.status === "acknowledged" && acknowledgementRow.notice_version === "1.0" && acknowledgementRow.content_sha256 === contentSha256 &&
    acknowledgementRow.user_id === "user-jenfu" && acknowledgementRow.acknowledged_at === now &&
    acknowledgementRow.source === "firebase_email_invitation" && acknowledgementRow.request_id === requestId
);
record(
  "DEV046-PRIV-008 acknowledgement, invitation activation and canonical acceptance commit together",
  database.prepare("SELECT setup_state FROM firebase_identity_invitations WHERE invitation_id = 'inv-privacy-1'").get().setup_state === "active" &&
    database.prepare("SELECT status FROM account_invitations WHERE id = 'inv-privacy-1'").get().status === "accepted" &&
    database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE actor_id = 'user-jenfu' AND action = 'PrivacyNoticeAcknowledged'").get().count === 1
);

await repository.finalizeAccess({
  userId: "user-jenfu",
  companyId: "company-jenfu",
  firebaseUid: "firebase-user-1",
  acknowledged: true,
  source: "privacy_acknowledgement_page",
  requestId: "privacy-request-00000002"
});
record(
  "DEV046-PRIV-009 concurrent or repeated confirmation is idempotent for one user and version",
  database.prepare("SELECT COUNT(*) AS count FROM privacy_notice_acknowledgements WHERE user_id = 'user-jenfu'").get().count === 1 &&
    database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE actor_id = 'user-jenfu' AND action = 'PrivacyNoticeAcknowledged'").get().count === 1
);

let requestReuseDenied = false;
try {
  await repository.finalizeAccess({
    userId: "user-jenfu-2",
    companyId: "company-jenfu",
    acknowledged: true,
    source: "privacy_acknowledgement_page",
    requestId
  });
} catch (error) {
  requestReuseDenied = error instanceof PrivacyNoticeError && error.code === "privacy_acknowledgement_conflict";
}
record("DEV046-PRIV-010 request ID cannot be replayed for another user", requestReuseDenied);

const v2ContentJson = JSON.stringify({ ...JSON.parse(contentJson), version: "2.0", materialChange: "retention" });
const v2Contract = {
  ...v1Contract,
  version: "2.0",
  contentJson: v2ContentJson,
  contentSha256: crypto.createHash("sha256").update(v2ContentJson).digest("hex"),
  publishedAt: "2026-08-01T00:00:00.000Z"
};
const v2Repository = new PrivacyNoticeAsyncRepository(client, v2Contract, {
  clock: () => "2026-08-01T08:00:00.000Z",
  idFactory: () => `qc-v2-${++idSequence}`
});
const v2Status = await v2Repository.getStatus({ userId: "user-jenfu", companyId: "company-jenfu" });
record(
  "DEV046-PRIV-011 material version change requires exactly one new acknowledgement and preserves v1 evidence",
  v2Status.status === "not_acknowledged" && v2Status.requiredVersion === "2.0" &&
    database.prepare("SELECT status FROM privacy_notice_versions WHERE version = '1.0'").get().status === "superseded" &&
    database.prepare("SELECT COUNT(*) AS count FROM privacy_notice_versions WHERE status = 'published'").get().count === 1 &&
    database.prepare("SELECT COUNT(*) AS count FROM privacy_notice_acknowledgements WHERE user_id = 'user-jenfu' AND notice_version = '1.0'").get().count === 1
);

let immutableUpdate = false;
let immutableDelete = false;
try {
  database.prepare("UPDATE privacy_notice_acknowledgements SET source = 'privacy_acknowledgement_page' WHERE user_id = 'user-jenfu'").run();
} catch {
  immutableUpdate = true;
}
try {
  database.prepare("DELETE FROM privacy_notice_versions WHERE version = '2.0'").run();
} catch {
  immutableDelete = true;
}
record("DEV046-PRIV-012 published notice content and acknowledgement evidence are immutable", immutableUpdate && immutableDelete);

database.exec(`
  CREATE TRIGGER qc_fail_privacy_ack
  BEFORE INSERT ON privacy_notice_acknowledgements
  BEGIN
    SELECT RAISE(ABORT, 'qc acknowledgement write failure');
  END;
`);
let writeFailureBlocked = false;
try {
  await v2Repository.finalizeAccess({
    userId: "user-jenfu-3",
    companyId: "company-jenfu",
    firebaseUid: "firebase-user-3",
    acknowledged: true,
    source: "privacy_acknowledgement_page",
    requestId: "privacy-request-00000003"
  });
} catch {
  writeFailureBlocked = true;
}
database.exec("DROP TRIGGER qc_fail_privacy_ack");
record(
  "DEV046-PRIV-013 acknowledgement write failure cannot activate the invitation",
  writeFailureBlocked &&
    database.prepare("SELECT setup_state FROM firebase_identity_invitations WHERE invitation_id = 'inv-privacy-3'").get().setup_state === "password_setup_link_sent" &&
    database.prepare("SELECT status FROM account_invitations WHERE id = 'inv-privacy-3'").get().status === "pending"
);

record(
  "DEV046-PRIV-014 Firebase session exchange issues a short-lived BFF session plus pending cookie while protected APIs still gate until acknowledgement",
  sessionRoute.indexOf("finalizePrivacyAccessAsync") < sessionRoute.indexOf("setFirebaseBffSessionResponseCookie(response, sessionToken)") &&
    sessionRoute.includes("setPrivacyPendingResponseCookie(response, sessionToken)") && sessionRoute.includes('code: "privacy_ack_required"') &&
    sessionRoute.includes('status: 200') &&
    authAsync.includes('status !== "acknowledged"') && authAsync.includes('status: 428') &&
    authSource.includes('FIREBASE_HOSTING_SESSION_COOKIE_NAME = "__session"') &&
    authSource.indexOf("cookies.get(FIREBASE_HOSTING_SESSION_COOKIE_NAME)") < authSource.indexOf("cookies.get(SESSION_COOKIE_NAME)") &&
    authResponseCookies.includes("response.cookies.set(FIREBASE_HOSTING_SESSION_COOKIE_NAME")
);
record(
  "DEV046-PRIV-015 acknowledgement API enforces same-origin JSON, current version and verified pending/session principal",
  acknowledgementRoute.includes("sameOrigin(request)") && acknowledgementRoute.includes("JSON body") === false &&
    acknowledgementRoute.includes("json_body_required") && acknowledgementRoute.includes("getPrivacyPendingToken") &&
    acknowledgementRoute.includes("getSessionToken") &&
    acknowledgementRoute.includes("verifyPlatformSessionV2") && acknowledgementRoute.includes("privacy_notice_version_stale")
);
record(
  "DEV046-PRIV-016 protected BFF APIs fail closed when the current version is not acknowledged",
  authAsync.includes("getPrivacyAcknowledgementStatusAsync") && authAsync.includes('status !== "acknowledged"') &&
    authAsync.includes('status: 428') && authAsync.includes("privacy_gate_unavailable")
);
record(
  "DEV046-PRIV-017 activation, permanent-access and acknowledgement UIs expose required controls and failure states",
  invitationPage.includes("PRIVACY_NOTICE_SUMMARY") && invitationPage.includes("privacyAcknowledged") &&
    acknowledgementPage.includes("確認並繼續") && acknowledgementPage.includes("role=\"alert\"") &&
    privacyPage.includes("PRIVACY_NOTICE_SECTIONS") && sidebar.includes("隱私與資料使用")
);
record(
  "DEV046-PRIV-018 Admin account detail exposes status, required/acknowledged version, time and immutable hash without an impersonation action",
  accountPage.includes("個人資料告知確認") && accountPage.includes("requiredVersion") && accountPage.includes("acknowledgedVersion") &&
    accountPage.includes("acknowledgedAt") && accountPage.includes("requiredContentSha256") && !accountPage.includes("代替員工確認</button>")
);
record(
  "DEV046-PRIV-019 production slice permits privacy pages and only the required acknowledgement mutation",
  productionSlice.includes('"/privacy"') && productionSlice.includes('"/privacy/acknowledgement"') &&
    productionSlice.includes('/^\\/api\\/privacy\\/acknowledgements\\/current$/')
);

const preflight = buildPhase2APreflight();
record(
  "DEV046-PRIV-020 implementation blocker closes without claiming cloud or staging readiness",
  preflight.localStaticContractPassed && !preflight.blockers.includes("PRIVACY_NOTICE_UI_AND_ACKNOWLEDGEMENT_NOT_IMPLEMENTED") &&
    !preflight.blockers.includes("STAGING_RUNTIME_SMOKE_NOT_EXECUTED") &&
    preflight.blockers.includes("STAGING_PRINCIPAL_MAPPING_EVIDENCE_MISSING") &&
    preflight.blockers.includes("STAGING_APPLICATION_ARTIFACT_PROVENANCE_AND_DRIFT_EVIDENCE_MISSING") &&
    preflight.safeToCreateResources === false
);

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? `: ${result.detail}` : ""}`);
}

const failed = results.filter((result) => !result.passed);
console.log(`\nDEV-046 privacy acknowledgement QC: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
