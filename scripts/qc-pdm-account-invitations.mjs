import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { chromium } from "playwright";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-account-invitations-"));
const generatedFileSnapshots = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const asyncInvitationRepositorySource = fs.readFileSync(
  path.join(root, "src", "lib", "repositories", "account-invitation-async-repository.ts"),
  "utf8"
);
const bootstrapPassword = "Managed-QC-Password-2026";
const invitedPassword = "Invite-QC-Password-2026";
const bootstrapUsers = [
  {
    id: "user-invite-qc-admin",
    displayName: "Invite QC Admin",
    email: "invite.qc.admin@example.com",
    password: bootstrapPassword,
    role: "Admin"
  },
  {
    id: "user-invite-qc-engineer",
    displayName: "Invite QC Engineer",
    email: "invite.qc.engineer@example.com",
    password: bootstrapPassword,
    role: "Engineer"
  }
];

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error("Unable to allocate a local port"));
        else resolve(port);
      });
    });
  });
}

function startApp(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const distDirRelative = ".tmp/next-qc-account-invitations";
  const distDir = path.join(root, ...distDirRelative.split("/"));
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "managed",
      PDM_AUTH_SECRET: "invite-qc-secret",
      PDM_BOOTSTRAP_USERS: JSON.stringify(bootstrapUsers),
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_RELEASE_MODE: "local_stub",
      PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft",
      PDM_PUBLIC_BASE_URL: baseUrl,
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  return { child, baseUrl, distDir, getOutput: () => output };
}

async function stopApp(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3000).then(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    })
  ]);
}

async function removeTempDir(dir) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (error) {
      if (attempt === 5) {
        console.warn(`Account invitation QC temp cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      await delay(500);
    }
  }
}

function restoreGeneratedFiles() {
  for (const [file, content] of generatedFileSnapshots) fs.writeFileSync(path.join(root, file), content, "utf8");
}

async function waitForApp(baseUrl, getOutput) {
  const deadline = Date.now() + 40000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`App did not become ready: ${lastError}\n${getOutput()}`);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function login(baseUrl, email, password) {
  const result = await requestJson(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const setCookie = result.response.headers.get("set-cookie") ?? "";
  return { ...result, cookie: setCookie.split(";")[0] ?? "" };
}

function expect(name, actual, expected) {
  return { name, passed: actual === expected, actual, expected };
}

let app;
let browser;
const results = [];

try {
  const port = await getFreePort();
  app = startApp(port);
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "Managed account-invitation UI and API verification against a task-owned SQLite fixture",
    port,
    owningProcessTree: `QC runner ${process.pid} -> Next dev child ${app.child.pid ?? "pending"} -> Playwright browser`,
    cleanupCondition: "browser and Next child stop, port releases, task data and Next dist directories are removed",
    PDM_DATA_DIR: tempDir,
    PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
    mutationScope: `${tempDir} and ${app.distDir}`
  } }));
  await waitForApp(app.baseUrl, app.getOutput);

  const admin = await login(app.baseUrl, "invite.qc.admin@example.com", bootstrapPassword);
  const engineer = await login(app.baseUrl, "invite.qc.engineer@example.com", bootstrapPassword);
  const authMode = await requestJson(`${app.baseUrl}/api/auth/mode`);
  const adminPage = await fetch(`${app.baseUrl}/settings/account-invitations`, { headers: { cookie: admin.cookie } });
  const acceptPage = await fetch(`${app.baseUrl}/invite/accept`);

  const unauthorizedCreate = await requestJson(`${app.baseUrl}/api/admin/account-invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: engineer.cookie },
    body: JSON.stringify({ displayName: "Blocked User", email: "blocked.invite@example.com", role: "Engineer", expiresInDays: 7 })
  });

  const create = await requestJson(`${app.baseUrl}/api/admin/account-invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({ displayName: "Invited User", email: "invited.user@example.com", role: "Engineer", expiresInDays: 7 })
  });
  const inviteUrl = String(create.body.inviteUrl ?? "");
  const token = inviteUrl ? new URL(inviteUrl).searchParams.get("token") ?? "" : "";

  const duplicate = await requestJson(`${app.baseUrl}/api/admin/account-invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({ displayName: "Invited User", email: "invited.user@example.com", role: "Engineer", expiresInDays: 7 })
  });
  const listBefore = await requestJson(`${app.baseUrl}/api/admin/account-invitations`, { headers: { cookie: admin.cookie } });
  browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext();
  const [sessionCookieName, ...sessionCookieValueParts] = admin.cookie.split("=");
  await browserContext.addCookies([{
    name: sessionCookieName,
    value: sessionCookieValueParts.join("="),
    url: app.baseUrl
  }]);
  const managedDeliveryPage = await browserContext.newPage();
  const managedPageErrors = [];
  const managedPostBodies = [];
  managedDeliveryPage.on("pageerror", (error) => managedPageErrors.push(error.message));
  await managedDeliveryPage.route("**/api/admin/account-invitations", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const submitted = route.request().postDataJSON();
    managedPostBodies.push(submitted);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        invitation: {
          id: submitted.reissueInvitationId ?? "managed-delivery-ui",
          email: submitted.email,
          displayName: submitted.displayName,
          role: submitted.role,
          status: "pending",
          invitedByName: "Invite QC Admin",
          invitedAt: "2026-07-16T00:00:00.000Z",
          expiresAt: "2026-07-23T00:00:00.000Z",
          acceptedAt: null,
          revokedAt: null
        },
        reissued: Boolean(submitted.reissueInvitationId),
        delivery: "firebase_managed_email"
      })
    });
  });
  await managedDeliveryPage.goto(`${app.baseUrl}/settings/account-invitations`, { waitUntil: "domcontentloaded" });
  await managedDeliveryPage.locator(".account-invitations-page h1").filter({ hasText: "帳號邀請" }).waitFor();
  await managedDeliveryPage.getByLabel("姓名").fill("Managed Delivery");
  await managedDeliveryPage.getByLabel("公司電子郵件").fill("managed.delivery@example.com");
  await managedDeliveryPage.getByRole("button", { name: "建立邀請" }).click();
  await managedDeliveryPage.getByText("邀請信已寄出", { exact: true }).waitFor();
  const managedDeliveryUiCorrect =
    await managedDeliveryPage.getByText("目前不用再傳送連結", { exact: false }).isVisible() &&
    await managedDeliveryPage.getByRole("button", { name: "複製連結" }).count() === 0 &&
    await managedDeliveryPage.getByLabel("一次性邀請連結").count() === 0;
  const lookup = await requestJson(`${app.baseUrl}/api/account-invitations/lookup?token=${encodeURIComponent(token)}`);
  const weakPassword = await requestJson(`${app.baseUrl}/api/account-invitations/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password: "short" })
  });

  const databasePath = path.join(tempDir, "ai-pdm.sqlite");
  const beforeDatabase = new Database(databasePath, { readonly: true });
  const storedBefore = beforeDatabase.prepare("SELECT token_hash, status FROM account_invitations WHERE id = ?").get(create.body.invitation?.id);
  const userBefore = beforeDatabase.prepare("SELECT COUNT(*) count FROM users WHERE lower(email) = lower(?)").get("invited.user@example.com");
  beforeDatabase.close();

  const accepted = await requestJson(`${app.baseUrl}/api/account-invitations/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password: invitedPassword })
  });
  const acceptedCookie = (accepted.response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const acceptedMe = await requestJson(`${app.baseUrl}/api/auth/me`, { headers: { cookie: acceptedCookie } });
  const reuse = await requestJson(`${app.baseUrl}/api/account-invitations/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password: invitedPassword })
  });
  const acceptedLogin = await login(app.baseUrl, "invited.user@example.com", invitedPassword);

  const createRevoked = await requestJson(`${app.baseUrl}/api/admin/account-invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({ displayName: "Revoked User", email: "revoked.user@example.com", role: "Manufacturing", expiresInDays: 3 })
  });
  const revokedToken = new URL(String(createRevoked.body.inviteUrl ?? app.baseUrl)).searchParams.get("token") ?? "";
  const revoke = await requestJson(`${app.baseUrl}/api/admin/account-invitations`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({ action: "revoke", invitationId: createRevoked.body.invitation?.id })
  });
  const revokedAccept = await requestJson(`${app.baseUrl}/api/account-invitations/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: revokedToken, password: invitedPassword })
  });

  await managedDeliveryPage.reload({ waitUntil: "domcontentloaded" });
  await managedDeliveryPage.locator(".account-invitations-page h1").filter({ hasText: "帳號邀請" }).waitFor();
  const reissueButton = managedDeliveryPage.getByRole("button", { name: "重新邀請", exact: true });
  await reissueButton.waitFor({ state: "visible" });
  await reissueButton.click();
  const reissueFormPrefilled =
    await managedDeliveryPage.getByLabel("姓名").inputValue() === "Revoked User" &&
    await managedDeliveryPage.getByLabel("公司電子郵件").inputValue() === "revoked.user@example.com" &&
    await managedDeliveryPage.getByLabel("公司電子郵件").isEditable() === false &&
    await managedDeliveryPage.getByLabel("初始角色").inputValue() === "Manufacturing";
  await managedDeliveryPage.getByRole("button", { name: "重新寄出邀請", exact: true }).click();
  await managedDeliveryPage.getByText("邀請信已重新寄出。下一步請通知受邀者檢查公司信箱與垃圾郵件。", { exact: true }).waitFor();
  const reissuePostBody = managedPostBodies.at(-1);
  const reissueUiSubmittedExactRecord =
    reissuePostBody?.reissueInvitationId === createRevoked.body.invitation?.id &&
    reissuePostBody?.email === "revoked.user@example.com";

  const compensatedUserId = "user-invite-qc-compensated";
  const compensatedFirebaseUid = "firebase-invite-qc-compensated";
  const reissueSeedDatabase = new Database(databasePath);
  reissueSeedDatabase.prepare(
    `INSERT INTO users (
       id, display_name, email, password_hash, role, company_id,
       account_status, system_role_enabled, account_status_changed_at,
       account_status_changed_by, account_status_reason, created_at, updated_at
     ) VALUES (?, ?, ?, NULL, ?, 'company-jenfu', 'suspended', 0, ?, ?, 'firebase_invitation_compensated', ?, ?)`
  ).run(
    compensatedUserId,
    "Revoked User",
    "revoked.user@example.com",
    "Manufacturing",
    "2026-07-16T01:00:00.000Z",
    "user-invite-qc-admin",
    "2026-07-16T00:00:00.000Z",
    "2026-07-16T01:00:00.000Z"
  );
  reissueSeedDatabase.prepare(
    `INSERT INTO platform_principal_mappings (
       platform_principal_id, pdm_user_id, mapping_source, mapping_status,
       external_subject, created_at, updated_at
     ) VALUES (?, ?, 'shared_iam', 'suspended', ?, ?, ?)`
  ).run(
    `firebase:${compensatedFirebaseUid}`,
    compensatedUserId,
    compensatedFirebaseUid,
    "2026-07-16T00:00:00.000Z",
    "2026-07-16T01:00:00.000Z"
  );
  reissueSeedDatabase.prepare(
    `INSERT INTO firebase_identity_invitations (
       invitation_id, firebase_uid, pdm_user_id, setup_state, last_error, created_at, updated_at
     ) VALUES (?, ?, ?, 'compensated', 'firebase_invitation_revoked', ?, ?)`
  ).run(
    createRevoked.body.invitation?.id,
    compensatedFirebaseUid,
    compensatedUserId,
    "2026-07-16T00:00:00.000Z",
    "2026-07-16T01:00:00.000Z"
  );
  reissueSeedDatabase.close();

  const { SQLiteAsyncDatabaseClient } = await import("../src/lib/db-async-provider.ts");
  const { AsyncAccountInvitationRepository } = await import("../src/lib/repositories/account-invitation-async-repository.ts");
  const reissueDatabase = new Database(databasePath);
  const reissueRepository = new AsyncAccountInvitationRepository(
    new SQLiteAsyncDatabaseClient(reissueDatabase),
    () => "2026-07-16T02:00:00.000Z"
  );
  const reissuedInvitation = await reissueRepository.reissueCompensatedFirebase({
    invitationId: createRevoked.body.invitation?.id,
    email: "revoked.user@example.com",
    displayName: "Reinvited User",
    role: "Engineer",
    tokenHash: "d".repeat(64),
    invitedBy: "user-invite-qc-admin",
    expiresAt: "2026-07-23T02:00:00.000Z"
  });
  const activeAccountReissue = await reissueRepository.reissueCompensatedFirebase({
    email: "invite.qc.admin@example.com",
    displayName: "Must Stay Active",
    role: "Admin",
    tokenHash: "e".repeat(64),
    invitedBy: "user-invite-qc-admin",
    expiresAt: "2026-07-23T02:00:00.000Z"
  });
  reissueDatabase.close();

  const afterDatabase = new Database(databasePath, { readonly: true });
  const storedAfter = afterDatabase.prepare("SELECT status, accepted_by FROM account_invitations WHERE id = ?").get(create.body.invitation?.id);
  const acceptedUser = afterDatabase.prepare("SELECT id, password_hash, role FROM users WHERE lower(email) = lower(?)").get("invited.user@example.com");
  const acceptedIdentities = afterDatabase.prepare("SELECT provider FROM auth_identities WHERE user_id = ? ORDER BY provider").all(acceptedUser?.id);
  const audits = afterDatabase.prepare("SELECT action, COUNT(*) count FROM audit_logs WHERE action IN ('AccountInvitationCreated', 'AccountInvitationAccepted', 'AccountInvitationRevoked', 'AccountInvitationReissued') GROUP BY action").all();
  const acceptedAudit = afterDatabase.prepare("SELECT detail_json FROM audit_logs WHERE actor_id = ? AND action = 'AccountInvitationAccepted' ORDER BY created_at DESC LIMIT 1").get(acceptedUser?.id);
  afterDatabase.close();
  const auditCounts = Object.fromEntries(audits.map((row) => [row.action, Number(row.count)]));

  results.push(expect("INVITE-001 managed auth mode is public and demo-safe", authMode.body.authMode, "managed"));
  results.push(expect("INVITE-002 invitation admin page is open in production slice", adminPage.status, 200));
  results.push(expect("INVITE-003 public invitation page is open in production slice", acceptPage.status, 200));
  results.push(expect("INVITE-004 non-admin cannot create invitation", unauthorizedCreate.response.status, 403));
  results.push(expect("INVITE-005 admin creates invitation", create.response.status, 201));
  results.push(expect("INVITE-006 create returns one-time invitation URL", token.length >= 40, true));
  results.push(expect("INVITE-007 duplicate pending invitation is blocked", duplicate.response.status, 409));
  results.push(expect("INVITE-008 admin can list invitations", listBefore.response.status, 200));
  results.push(expect("INVITE-009 list does not expose raw token or token hash", JSON.stringify(listBefore.body).includes(token) || JSON.stringify(listBefore.body).includes("token_hash"), false));
  results.push(expect("INVITE-010 valid token can be looked up", lookup.response.status, 200));
  results.push(expect("INVITE-011 weak first password is blocked", weakPassword.response.status, 400));
  results.push(expect("INVITE-012 account does not exist before acceptance", Number(userBefore?.count ?? 0), 0));
  results.push(expect("INVITE-013 database stores 64-character hash instead of raw token", String(storedBefore?.token_hash ?? "").length === 64 && storedBefore?.token_hash !== token, true));
  results.push(expect("INVITE-014 invitee can set password", accepted.response.status, 200));
  results.push(expect("INVITE-015 acceptance issues browser session", acceptedCookie.startsWith("pdm_session="), true));
  results.push(expect("INVITE-016 accepted session resolves invited user", acceptedMe.body.user?.email, "invited.user@example.com"));
  results.push(expect("INVITE-017 invitation cannot be reused", reuse.response.status, 410));
  results.push(expect("INVITE-018 invited user can login with chosen password", acceptedLogin.response.status, 200));
  results.push(expect("INVITE-019 accepted invitation is finalized", storedAfter?.status === "accepted" && storedAfter?.accepted_by === acceptedUser?.id, true));
  results.push(expect("INVITE-020 invited account uses hashed password and assigned role", String(acceptedUser?.password_hash ?? "").startsWith("scrypt:") && acceptedUser?.role === "Engineer", true));
  results.push(expect("INVITE-021 admin can revoke pending invitation", revoke.response.status, 200));
  results.push(expect("INVITE-022 revoked invitation cannot be accepted", revokedAccept.response.status, 410));
  results.push(expect("INVITE-023 invitation lifecycle writes audit evidence", (auditCounts.AccountInvitationCreated ?? 0) >= 2 && (auditCounts.AccountInvitationAccepted ?? 0) >= 1 && (auditCounts.AccountInvitationRevoked ?? 0) >= 1, true));
  results.push(expect("INVITE-024 password acceptance creates provider-neutral identities", acceptedIdentities.map((item) => item.provider).join(","), "invite,local_password"));
  results.push(expect("INVITE-025 local password audit records provider without secret", String(acceptedAudit?.detail_json ?? "").includes('"provider":"local_password"') && !String(acceptedAudit?.detail_json ?? "").includes(invitedPassword), true));
  results.push(expect("INVITE-026 Firebase managed delivery confirms email without exposing copy controls", managedDeliveryUiCorrect, true));
  results.push(expect("INVITE-027 Firebase managed delivery UI has no page errors", managedPageErrors.length, 0));
  results.push(expect("INVITE-028 compensated Firebase invitation can be reissued", reissuedInvitation?.invitation.status, "pending"));
  results.push(expect("INVITE-029 reissue preserves PDM and Firebase identity IDs", `${reissuedInvitation?.pdmUserId}:${reissuedInvitation?.firebaseUid}`, `${compensatedUserId}:${compensatedFirebaseUid}`));
  results.push(expect("INVITE-030 reissue applies new display name and role", `${reissuedInvitation?.invitation.displayName}:${reissuedInvitation?.invitation.role}`, "Reinvited User:Engineer"));
  results.push(expect("INVITE-031 active account cannot enter compensated reissue path", activeAccountReissue, null));
  results.push(expect("INVITE-032 invitation reissue writes audit evidence", (auditCounts.AccountInvitationReissued ?? 0) >= 1, true));
  results.push(expect("INVITE-033 revoked invitation exposes a reissue action that prefills and locks identity", reissueFormPrefilled, true));
  results.push(expect("INVITE-034 reissue UI submits the exact revoked invitation record", reissueUiSubmittedExactRecord, true));
  results.push(expect("INVITE-035 reissue UI confirms that Firebase sent a fresh invitation email", await managedDeliveryPage.getByText("邀請信已重新寄出。下一步請通知受邀者檢查公司信箱與垃圾郵件。", { exact: true }).isVisible(), true));
  results.push(expect(
    "INVITE-036 PostgreSQL reissue filter explicitly types the nullable invitation ID",
    asyncInvitationRepositorySource.includes("CAST(:invitationId AS text) IS NULL") &&
      asyncInvitationRepositorySource.includes("invitation.id = CAST(:invitationId AS text)"),
    true
  ));

  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exitCode = failed.length > 0 ? 1 : 0;
} catch (error) {
  console.error(JSON.stringify({ passed: 0, failed: 1, results, error: error instanceof Error ? error.message : String(error), appOutput: app?.getOutput() ?? "" }, null, 2));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (app) await stopApp(app.child);
  restoreGeneratedFiles();
  if (app?.distDir) await removeTempDir(app.distDir);
  await removeTempDir(tempDir);
}
