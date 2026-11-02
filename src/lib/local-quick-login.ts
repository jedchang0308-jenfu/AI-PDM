import { createHash, randomBytes } from "node:crypto";
import {
  LOCAL_PORTAL_COOKIE,
  type LocalFixture,
} from "../../contracts/local-principal-sandbox/v1/protocol.mjs";
import {
  getLocalSandboxPrincipalRuntime,
  isLocalPrincipalSandboxRequested,
  type LocalSandboxPrincipalRuntime,
} from "@/lib/local-sandbox-principal-runtime";
import { issueLocalSandboxPrincipalSession } from "@/lib/local-sandbox-principal-session";

export const LOCAL_PRINCIPAL_QUICK_LOGIN_SCENARIO_ID = "active" as const;

function isLoopbackRequest(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

/**
 * Compatibility entrypoint for local test tooling. It is deliberately enabled
 * only beside the isolated Principal-v2 lane; the old demo/role login is not
 * a valid authentication source anymore.
 */
export function isLocalQuickLoginAvailable(request: Request) {
  return isLoopbackRequest(request) && isLocalPrincipalSandboxRequested();
}

export function selectLocalPrincipalQuickLoginScenario(fixture: LocalFixture, nowMs = Date.now()) {
  const scenario = fixture.scenarios.find((candidate) => candidate.scenarioId === LOCAL_PRINCIPAL_QUICK_LOGIN_SCENARIO_ID &&
    candidate.principalStatus === "active" && candidate.employeeStatus === "active" &&
    candidate.grants.some((grant) => grant.applicationId === "ai-pdm" && grant.status === "active" &&
      Date.parse(grant.validFrom) <= nowMs && (grant.validUntil === null || Date.parse(grant.validUntil) > nowMs)));
  if (!scenario) throw new Error("LOCAL_QUICK_LOGIN_SCENARIO_UNAVAILABLE");
  return scenario.scenarioId;
}

function requestHeaders(origin: string, cookie?: string) {
  const url = new URL(origin);
  const headers = new Headers({
    accept: "application/json",
    host: url.host,
    origin,
    "sec-fetch-site": "same-origin",
  });
  if (cookie) headers.set("cookie", cookie);
  return headers;
}

function readPortalCookie(response: Response, sandboxId: string) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  const name = `${LOCAL_PORTAL_COOKIE}_${sandboxId}`;
  const pair = values.map((value) => value.split(";", 1)[0]).find((value) => value.startsWith(`${name}=`));
  const token = pair?.slice(name.length + 1) ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) throw new Error("LOCAL_QUICK_LOGIN_PARENT_COOKIE_UNAVAILABLE");
  return pair!;
}

function authorizationCode(response: Response, runtime: LocalSandboxPrincipalRuntime, state: string) {
  const location = response.headers.get("location");
  if (!location) throw new Error("LOCAL_QUICK_LOGIN_AUTHORIZATION_REDIRECT_MISSING");
  const callback = new URL(`${runtime.config.origin}/api/auth/local-sandbox/callback`);
  const redirect = new URL(location);
  const keys = [...redirect.searchParams.keys()];
  if (redirect.origin !== callback.origin || redirect.pathname !== callback.pathname ||
    keys.length !== 3 || keys.some((key) => !["code", "state", "iss"].includes(key)) ||
    ["code", "state", "iss"].some((key) => redirect.searchParams.getAll(key).length !== 1) ||
    redirect.searchParams.get("state") !== state ||
    redirect.searchParams.get("iss") !== `${runtime.config.platformOrigin}/api/local-sandbox`) {
    throw new Error("LOCAL_QUICK_LOGIN_AUTHORIZATION_REDIRECT_INVALID");
  }
  const code = redirect.searchParams.get("code") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/u.test(code)) throw new Error("LOCAL_QUICK_LOGIN_AUTHORIZATION_CODE_INVALID");
  return code;
}

export async function issueLocalPrincipalQuickLoginSession(
  request: Request,
  runtime: LocalSandboxPrincipalRuntime,
) {
  const scenarioId = selectLocalPrincipalQuickLoginScenario(runtime.fixture);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  const state = randomBytes(32).toString("base64url");
  const callback = `${runtime.config.origin}/api/auth/local-sandbox/callback`;

  const loginHeaders = requestHeaders(runtime.config.platformOrigin);
  loginHeaders.set("content-type", "application/json");
  const loginResponse = await fetch(new URL("/api/local-sandbox/login", runtime.config.platformOrigin), {
    method: "POST",
    headers: loginHeaders,
    body: JSON.stringify({ scenarioId }),
    redirect: "error",
    cache: "no-store",
  });
  if (!loginResponse.ok) throw new Error("LOCAL_QUICK_LOGIN_PARENT_SESSION_FAILED");
  const portalCookie = readPortalCookie(loginResponse, runtime.config.sandboxId);

  const authorize = new URL("/api/local-sandbox/authorize", runtime.config.platformOrigin);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: runtime.profile.platformClient.clientId,
    redirect_uri: callback,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  const authorizeResponse = await fetch(authorize, {
    headers: requestHeaders(runtime.config.platformOrigin, portalCookie),
    redirect: "manual",
    cache: "no-store",
  });
  if (authorizeResponse.status !== 303) throw new Error("LOCAL_QUICK_LOGIN_AUTHORIZATION_FAILED");
  const code = authorizationCode(authorizeResponse, runtime, state);
  const proof = await runtime.client.tokenProof({
    code,
    redirectUri: callback,
    codeVerifier: verifier,
    expected: runtime.expected,
  });

  return issueLocalSandboxPrincipalSession({
    request,
    environment: process.env,
    listenAddress: runtime.listenAddress,
    expected: runtime.expected,
    expectedNonce: proof.nonce,
    signedResponse: {
      rawBody: proof.rawBody,
      nonce: proof.nonce,
      audience: proof.audience,
      clientId: proof.clientId,
      signature: proof.signature,
    },
    database: runtime.database,
    keyRing: runtime.keyRing,
    ports: runtime.ports,
  });
}

export { getLocalSandboxPrincipalRuntime };
