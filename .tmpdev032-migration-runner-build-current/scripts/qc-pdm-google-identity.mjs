import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-google-identity-"));
const clientId = "google-identity-qc-client";
const bootstrapPassword = "Google-QC-Admin-Password-2026";
const bootstrapUsers = [{
  id: "user-google-qc-admin",
  displayName: "Google QC Admin",
  email: "google.qc.admin@example.com",
  password: bootstrapPassword,
  role: "Admin"
}];
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = publicKey.export({ type: "spki", format: "pem" });
const publicJwk = publicKey.export({ format: "jwk" });
const keyId = "google-qc-key";
let currentIdentity = { subject: "", email: "", nonce: "" };
let tokenRequestCount = 0;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("No port")));
    });
  });
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signIdToken(issuer) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: keyId }));
  const payload = base64url(JSON.stringify({
    iss: issuer,
    aud: clientId,
    sub: currentIdentity.subject,
    email: currentIdentity.email,
    email_verified: true,
    name: "Google QC User",
    nonce: currentIdentity.nonce,
    iat: now,
    exp: now + 600
  }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function startOidcServer(port) {
  const issuer = `http://127.0.0.1:${port}`;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", issuer);
    if (url.pathname === "/token" && request.method === "POST") {
      tokenRequestCount += 1;
      const body = new URLSearchParams(await readBody(request));
      if (!body.get("code") || !body.get("code_verifier")) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "invalid_request" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({
        access_token: "mock-access-token-not-persisted",
        token_type: "Bearer",
        expires_in: 600,
        id_token: signIdToken(issuer)
      }));
      return;
    }
    if (url.pathname === "/certs-pem") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=60" });
      response.end(JSON.stringify({ [keyId]: publicPem }));
      return;
    }
    if (url.pathname === "/certs-jwk") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=60" });
      response.end(JSON.stringify({ keys: [{ ...publicJwk, kid: keyId, alg: "RS256", use: "sig" }] }));
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("mock-google-oidc");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { server, issuer };
}

function startApp(port, oidc) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const distDirRelative = ".tmp/next-qc-google-identity";
  const distDir = path.join(root, ...distDirRelative.split("/"));
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const endpointConfig = {
    issuers: [oidc.issuer],
    endpoints: {
      tokenInfoUrl: `${oidc.issuer}/tokeninfo`,
      oauth2AuthBaseUrl: `${oidc.issuer}/auth`,
      oauth2TokenUrl: `${oidc.issuer}/token`,
      oauth2RevokeUrl: `${oidc.issuer}/revoke`,
      oauth2FederatedSignonPemCertsUrl: `${oidc.issuer}/certs-pem`,
      oauth2FederatedSignonJwkCertsUrl: `${oidc.issuer}/certs-jwk`,
      oauth2IapPublicKeyUrl: `${oidc.issuer}/iap-certs`
    }
  };
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "managed",
      PDM_AUTH_SECRET: "google-qc-auth-secret-32-characters-minimum",
      PDM_BOOTSTRAP_USERS: JSON.stringify(bootstrapUsers),
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_PUBLIC_BASE_URL: baseUrl,
      PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft",
      PDM_GOOGLE_OAUTH_ENABLED: "true",
      PDM_GOOGLE_OAUTH_CLIENT_ID: clientId,
      PDM_GOOGLE_OAUTH_CLIENT_SECRET: "google-qc-client-secret",
      PDM_GOOGLE_OAUTH_REDIRECT_URI: `${baseUrl}/api/auth/google/callback`,
      PDM_GOOGLE_OAUTH_TEST_ENDPOINTS_JSON: JSON.stringify(endpointConfig),
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  return { child, baseUrl, distDir, getOutput: () => output };
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3000).then(() => child.exitCode === null && child.kill("SIGTERM"))
  ]);
}

async function waitForApp(app) {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${app.baseUrl}/api/auth/mode`);
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`App did not become ready\n${app.getOutput()}`);
}

async function removeDir(dir) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (error) {
      if (attempt === 5) return;
      await delay(500);
    }
  }
}

function firstCookie(response, name) {
  const value = response.headers.get("set-cookie") ?? "";
  const match = value.match(new RegExp(`(?:^|,\\s*)${name}=([^;]*)`));
  return match ? `${name}=${match[1]}` : "";
}

function oauthStateFromCookie(cookie) {
  const encoded = cookie.slice(cookie.indexOf("=") + 1).split(".")[0];
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

async function beginGoogle(baseUrl, inviteToken = "") {
  const suffix = inviteToken ? `?invite_token=${encodeURIComponent(inviteToken)}` : "";
  const response = await fetch(`${baseUrl}/api/auth/google/start${suffix}`, { redirect: "manual" });
  const cookie = firstCookie(response, "pdm_google_oauth");
  const state = oauthStateFromCookie(cookie);
  return { response, cookie, state, location: response.headers.get("location") ?? "" };
}

async function callbackGoogle(baseUrl, flow, identity, returnedState = flow.state.state) {
  currentIdentity = { ...identity, nonce: flow.state.nonce };
  return fetch(`${baseUrl}/api/auth/google/callback?code=qc-code&state=${encodeURIComponent(returnedState)}`, {
    headers: { cookie: flow.cookie },
    redirect: "manual"
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function login(baseUrl) {
  const result = await requestJson(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: bootstrapUsers[0].email, password: bootstrapPassword })
  });
  return { ...result, cookie: firstCookie(result.response, "pdm_session") };
}

async function createInvitation(baseUrl, cookie, email) {
  const result = await requestJson(`${baseUrl}/api/admin/account-invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ displayName: "Google Invited User", email, role: "Engineer", expiresInDays: 7 })
  });
  const token = new URL(String(result.body.inviteUrl)).searchParams.get("token") ?? "";
  return { ...result, token };
}

function expect(name, actual, expected) {
  return { name, passed: actual === expected, actual, expected };
}

let app;
let oidc;
const results = [];

try {
  const [oidcPort, appPort] = await Promise.all([getFreePort(), getFreePort()]);
  oidc = await startOidcServer(oidcPort);
  app = startApp(appPort, oidc);
  await waitForApp(app);

  const authMode = await requestJson(`${app.baseUrl}/api/auth/mode`);
  const admin = await login(app.baseUrl);

  const unknownFlow = await beginGoogle(app.baseUrl);
  const unknownCallback = await callbackGoogle(app.baseUrl, unknownFlow, { subject: "google-sub-unknown", email: "unknown.google@example.com" });

  const invitation = await createInvitation(app.baseUrl, admin.cookie, "google.invited@example.com");
  const inviteFlow = await beginGoogle(app.baseUrl, invitation.token);
  const inviteCallback = await callbackGoogle(app.baseUrl, inviteFlow, { subject: "google-sub-invited", email: "google.invited@example.com" });
  const invitedSession = firstCookie(inviteCallback, "pdm_session");
  const invitedMe = await requestJson(`${app.baseUrl}/api/auth/me`, { headers: { cookie: invitedSession } });

  const loginFlow = await beginGoogle(app.baseUrl);
  const loginCallback = await callbackGoogle(app.baseUrl, loginFlow, { subject: "google-sub-invited", email: "google.invited@example.com" });

  const mismatchInvitation = await createInvitation(app.baseUrl, admin.cookie, "google.mismatch@example.com");
  const mismatchFlow = await beginGoogle(app.baseUrl, mismatchInvitation.token);
  const mismatchCallback = await callbackGoogle(app.baseUrl, mismatchFlow, { subject: "google-sub-mismatch", email: "different.google@example.com" });

  const conflictInvitation = await createInvitation(app.baseUrl, admin.cookie, "google.conflict@example.com");
  const conflictFlow = await beginGoogle(app.baseUrl, conflictInvitation.token);
  const conflictCallback = await callbackGoogle(app.baseUrl, conflictFlow, { subject: "google-sub-invited", email: "google.conflict@example.com" });

  const invalidStateFlow = await beginGoogle(app.baseUrl);
  const tokenCountBeforeInvalidState = tokenRequestCount;
  const invalidStateCallback = await callbackGoogle(
    app.baseUrl,
    invalidStateFlow,
    { subject: "google-sub-invited", email: "google.invited@example.com" },
    `${invalidStateFlow.state.state}-tampered`
  );
  const invalidStateSkippedTokenExchange = tokenRequestCount === tokenCountBeforeInvalidState;

  const databasePath = path.join(tempDir, "ai-pdm.sqlite");
  const database = new Database(databasePath);
  const invitedUser = database.prepare("SELECT id, password_hash, account_status FROM users WHERE email = ?").get("google.invited@example.com");
  const identities = database.prepare("SELECT provider, provider_subject, last_login_at FROM auth_identities WHERE user_id = ? ORDER BY provider").all(invitedUser?.id);
  const unknownUsers = database.prepare("SELECT COUNT(*) count FROM users WHERE email = ?").get("unknown.google@example.com");
  const mismatchUsers = database.prepare("SELECT COUNT(*) count FROM users WHERE email = ?").get("google.mismatch@example.com");
  const conflictUsers = database.prepare("SELECT COUNT(*) count FROM users WHERE email = ?").get("google.conflict@example.com");
  const mismatchStatus = database.prepare("SELECT status FROM account_invitations WHERE id = ?").get(mismatchInvitation.body.invitation?.id);
  const conflictStatus = database.prepare("SELECT status FROM account_invitations WHERE id = ?").get(conflictInvitation.body.invitation?.id);
  const googleAudits = database.prepare("SELECT detail_json FROM audit_logs WHERE action = 'Login' AND detail_json LIKE '%google_oauth%'").all();
  database.prepare("UPDATE users SET account_status = 'suspended' WHERE id = ?").run(invitedUser?.id);
  database.close();

  const suspendedFlow = await beginGoogle(app.baseUrl);
  const suspendedCallback = await callbackGoogle(app.baseUrl, suspendedFlow, { subject: "google-sub-invited", email: "google.invited@example.com" });
  const oldSessionAfterSuspension = await requestJson(`${app.baseUrl}/api/auth/me`, { headers: { cookie: invitedSession } });

  const identityProviders = identities.map((item) => item.provider).join(",");
  const auditText = googleAudits.map((item) => item.detail_json).join("\n");
  results.push(expect("GOOGLE-ID-001 Google OAuth availability is exposed without credentials", authMode.body.googleOAuth?.enabled, true));
  results.push(expect("GOOGLE-ID-002 start uses state, nonce and PKCE", unknownFlow.response.status === 303 && Boolean(unknownFlow.state.state) && Boolean(unknownFlow.state.nonce) && Boolean(unknownFlow.state.codeVerifier), true));
  results.push(expect("GOOGLE-ID-003 unknown Google identity cannot self-register", new URL(unknownCallback.headers.get("location")).searchParams.get("auth_error"), "google_account_not_linked"));
  results.push(expect("GOOGLE-ID-004 unknown identity creates no PDM user", Number(unknownUsers?.count ?? 0), 0));
  results.push(expect("GOOGLE-ID-005 invited Google identity activates account", inviteCallback.status, 303));
  results.push(expect("GOOGLE-ID-006 Google activation issues PDM session", invitedSession.startsWith("pdm_session="), true));
  results.push(expect("GOOGLE-ID-007 session resolves stable invited user", invitedMe.body.user?.id, invitedUser?.id));
  results.push(expect("GOOGLE-ID-008 Google-only account stores no password", invitedUser?.password_hash ?? null, null));
  results.push(expect("GOOGLE-ID-009 Google and invite identities are persisted", identityProviders, "google_oauth,invite"));
  results.push(expect("GOOGLE-ID-010 existing Google subject can login again", loginCallback.status === 303 && firstCookie(loginCallback, "pdm_session").startsWith("pdm_session="), true));
  results.push(expect("GOOGLE-ID-011 invitation email mismatch fails closed", new URL(mismatchCallback.headers.get("location")).searchParams.get("auth_error"), "google_invitation_email_mismatch"));
  results.push(expect("GOOGLE-ID-012 mismatch leaves invitation and users unchanged", Number(mismatchUsers?.count ?? 0) === 0 && mismatchStatus?.status === "pending", true));
  results.push(expect("GOOGLE-ID-013 duplicate provider subject cannot link to another user", new URL(conflictCallback.headers.get("location")).searchParams.get("auth_error"), "google_identity_conflict"));
  results.push(expect("GOOGLE-ID-014 identity conflict rolls back invitation transaction", Number(conflictUsers?.count ?? 0) === 0 && conflictStatus?.status === "pending", true));
  results.push(expect("GOOGLE-ID-015 tampered state is rejected before token exchange", new URL(invalidStateCallback.headers.get("location")).searchParams.get("auth_error") === "google_invalid_state" && invalidStateSkippedTokenExchange, true));
  results.push(expect("GOOGLE-ID-016 suspended account cannot login", new URL(suspendedCallback.headers.get("location")).searchParams.get("auth_error"), "google_account_inactive"));
  results.push(expect("GOOGLE-ID-017 suspension invalidates existing app session", oldSessionAfterSuspension.response.status, 401));
  results.push(expect("GOOGLE-ID-018 audit identifies provider without OAuth tokens", auditText.includes('"provider":"google_oauth"') && !/access_token|id_token|refresh_token|mock-access-token/iu.test(auditText), true));
  results.push(expect("GOOGLE-ID-019 identity login timestamp is recorded", identities.some((item) => item.provider === "google_oauth" && Boolean(item.last_login_at)), true));

  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exitCode = failed.length > 0 ? 1 : 0;
} catch (error) {
  console.error(JSON.stringify({ passed: 0, failed: 1, results, error: error instanceof Error ? error.stack : String(error), appOutput: app?.getOutput() ?? "" }, null, 2));
  process.exitCode = 1;
} finally {
  await stopProcess(app?.child);
  if (oidc?.server) await new Promise((resolve) => oidc.server.close(resolve));
  if (app?.distDir) await removeDir(app.distDir);
  await removeDir(tempDir);
}
