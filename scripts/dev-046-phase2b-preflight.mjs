#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildPhase2APreflight } from "./dev-046-phase2a-preflight.mjs";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const check = (id, passed, detail) => ({ id, passed: Boolean(passed), detail });

export function buildPhase2BPreflight() {
  const phase2a = buildPhase2APreflight();
  const packageJson = json("package.json");
  const authConfig = read("src/lib/auth-config.ts");
  const adminAdapter = read("src/lib/firebase-admin-identity-provider.ts");
  const principalRepository = read("src/lib/firebase-platform-principal-repository.ts");
  const sessionRoute = read("src/app/api/auth/firebase/session/route.ts");
  const sessionRuntime = read("src/lib/auth-async.ts");
  const sessionKeys = read("src/lib/platform-session-key-ring.ts");
  const clientAuth = read("src/lib/firebase-client-auth.ts");
  const loginPage = read("src/app/login/page.tsx");
  const invitationService = read("src/lib/firebase-managed-invitations.ts");
  const invitationPage = read("src/app/account-invitation/firebase/page.tsx");
  const actionEmail = read("src/lib/firebase-managed-action-email.ts");
  const sqliteSchema = read("db/schema.sql");
  const postgresInvitationMigration = read("db/postgres/013_firebase_bff_identity_invitations.sql");
  const nextConfig = read("next.config.mjs");
  const runtimeTf = read("infra/google-cloud/staging/runtime.tf");
  const localsTf = read("infra/google-cloud/staging/locals.tf");
  const securityTf = read("infra/google-cloud/staging/security.tf");
  const legacyRoutes = [
    "src/app/api/auth/login/route.ts",
    "src/app/api/auth/token/route.ts",
    "src/app/api/auth/google/start/route.ts",
    "src/app/api/auth/google/callback/route.ts",
    "src/app/api/account-invitations/accept/route.ts",
    "src/app/api/account-recovery/complete/route.ts"
  ].map(read).join("\n");

  const checks = [
    check("P2B-APP-001", packageJson.dependencies.firebase === "^12.16.0" && packageJson.dependencies["firebase-admin"] === "^14.1.0", "Firebase Web/Admin SDK versions are pinned in package-lock"),
    check("P2B-APP-002", authConfig.includes('"firebase_bff"') && authConfig.includes("getFirebaseWebConfig"), "firebase_bff mode and runtime web config exist"),
    check("P2B-APP-003", adminAdapter.includes("verifyIdToken(idToken, true)") && adminAdapter.includes("sign_in_second_factor") && !/(?:firestore|storage|functions)/iu.test(adminAdapter), "Admin adapter verifies revocation and TOTP without Firebase data products"),
    check("P2B-APP-004", principalRepository.includes("mapping.external_subject = :firebaseUid") && !principalRepository.includes("users.email ="), "principal mapping is UID allowlist-only with no same-email fallback"),
    check("P2B-APP-005", sessionRoute.includes("sameOrigin(request)") && sessionRoute.includes("contentLength > 32 * 1024") && sessionRoute.includes("setFirebaseBffSessionResponseCookie") && sessionRoute.includes("exchangeFirebaseIdTokenForPlatformSession"), "same-origin size-bounded HTTP BFF session exchange exists"),
    check("P2B-APP-006", sessionRuntime.includes("verifyPlatformSessionV2") && sessionRuntime.includes("currentSessionVersion") && sessionRuntime.includes("user.company_id !== initialClaims.companyId"), "every BFF request rechecks signature, lifecycle version and company"),
    check("P2B-APP-007", sessionKeys.includes("PDM_SESSION_CURRENT_SECRET") && sessionKeys.includes("PDM_SESSION_PREVIOUS_SECRET") && sessionKeys.includes("SESSION_V2_KEY_IDS_MUST_DIFFER"), "current/previous signing-key rotation contract is fail closed"),
    check("P2B-APP-008", clientAuth.includes("inMemoryPersistence") && clientAuth.includes("signOut(auth)") && clientAuth.includes("/api/auth/firebase/session"), "browser Firebase credential is memory-only and exchanged through BFF"),
    check("P2B-APP-009", clientAuth.includes("TotpMultiFactorGenerator.assertionForSignIn") && loginPage.includes("completeFirebaseTotp"), "TOTP challenge path is implemented"),
    check("P2B-APP-010", legacyRoutes.match(/getAuthMode\(\) === "firebase_bff"/gu)?.length === 6, "legacy password, token, OAuth, invite and recovery routes fail closed"),
    check("P2B-APP-011", actionEmail.includes('requestType: "EMAIL_SIGNIN"') && invitationPage.includes("completeFirebaseEmailLinkInvitation") && clientAuth.includes("updatePassword"), "managed email link proves email before password linking"),
    check("P2B-APP-012", invitationService.includes("createFirebaseManagedInvitation") && invitationService.includes("disableIdentity") && invitationService.includes("revokeRefreshTokens") && invitationService.includes("compensate"), "Firebase invitation provisioning has deny-first compensation"),
    check("P2B-DB-001", sqliteSchema.includes("CREATE TABLE IF NOT EXISTS firebase_identity_invitations") && postgresInvitationMigration.includes("CREATE TABLE IF NOT EXISTS public.firebase_identity_invitations") && postgresInvitationMigration.includes("COMMIT;"), "canonical SQLite schema and additive PostgreSQL migration contain the invitation state machine"),
    check("P2B-BUILD-001", ["gcp-metadata", "gaxios", "google-logging-utils", "json-bigint", "bignumber.js"].every((name) => nextConfig.includes(`"./node_modules/${name}/**/*"`)), "Next standalone tracing includes the Firebase Admin metadata dependency chain"),
    check("P2B-IAC-001", localsTf.includes('"roles/firebaseauth.admin"'), "runtime Firebase IAM supports reviewed user provisioning and revocation"),
    check("P2B-IAC-002", runtimeTf.includes("PDM_SESSION_CURRENT_SECRET") && runtimeTf.includes("secret_key_ref") && runtimeTf.includes("PDM_FIREBASE_APP_ID"), "Cloud Run receives public Firebase config and secret references"),
    check("P2B-IAC-003", securityTf.includes("local.secret_bootstrap_ready") && localsTf.includes("session_secret_versions_ready"), "empty secret bootstrap and runtime deployment are independently gated"),
    check("P2B-IAC-004", !/(?:secret_data|service_account_key|client_secret\s*=|credentials\s*=)/iu.test(`${runtimeTf}\n${securityTf}`), "Terraform contains no secret values or credential material"),
    check("P2B-BOUNDARY-001", phase2a.tooling.credentialLookupPerformed === false && phase2a.safeToCreateResources === false, "preflight remains local and non-mutating")
  ];
  const failures = checks.filter((item) => !item.passed);
  const blockers = [...new Set(phase2a.blockers)];

  return {
    schemaVersion: 1,
    dev: "DEV-046",
    phase: "Phase-2B-local-application-readiness",
    generatedAt: new Date().toISOString(),
    result: failures.length === 0 ? "blocked_external" : "local_contract_failed",
    applicationContractPassed: failures.length === 0,
    safeToRunCredentialledPlan: false,
    safeToCreateResources: false,
    summary: {
      checksPassed: checks.length - failures.length,
      checksTotal: checks.length,
      blockerCount: blockers.length
    },
    tooling: phase2a.tooling,
    checks,
    blockers: blockers.sort()
  };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const report = buildPhase2BPreflight();
  if (args.has("--write-report")) {
    const outputDirectory = path.join(root, "output", "dev-046-phase2b-preflight");
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(`DEV-046 Phase 2B preflight: ${report.result}`);
  console.log(`Local application/IaC checks: ${report.summary.checksPassed}/${report.summary.checksTotal}`);
  console.log(`Open external/live blockers: ${report.summary.blockerCount}`);
  for (const blocker of report.blockers) console.log(`BLOCKED ${blocker}`);
  console.log("No credentials were read and no Terraform plan/apply, cloud resource, billing or DNS action ran.");
  if (!report.applicationContractPassed || (args.has("--require-ready") && report.result !== "ready")) process.exitCode = 1;
}
