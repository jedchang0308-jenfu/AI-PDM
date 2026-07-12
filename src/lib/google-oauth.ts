import crypto from "node:crypto";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";

export const GOOGLE_OAUTH_STATE_COOKIE_NAME = "pdm_google_oauth";
const GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
const DEFAULT_AUTH_SECRET = "dev-only-change-before-production";

export type GoogleOAuthPurpose = "login" | "invite";

type GoogleOAuthState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  purpose: GoogleOAuthPurpose;
  invitationId?: string;
  invitationEmail?: string;
  returnTo: string;
  createdAt: number;
};

type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type GoogleOAuthEndpointOverrides = Partial<{
  tokenInfoUrl: string;
  oauth2AuthBaseUrl: string;
  oauth2TokenUrl: string;
  oauth2RevokeUrl: string;
  oauth2FederatedSignonPemCertsUrl: string;
  oauth2FederatedSignonJwkCertsUrl: string;
  oauth2IapPublicKeyUrl: string;
}>;

export type VerifiedGoogleIdentity = {
  subject: string;
  email: string;
  displayName: string | null;
  verifiedAt: string;
};

export type GoogleOAuthErrorCode =
  | "google_oauth_not_configured"
  | "google_oauth_invalid_state"
  | "google_oauth_exchange_failed"
  | "google_oauth_invalid_identity";

export class GoogleOAuthError extends Error {
  constructor(readonly code: GoogleOAuthErrorCode, message: string) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

function enabledByEnvironment(env: NodeJS.ProcessEnv) {
  return ["1", "true", "yes", "on"].includes(String(env.PDM_GOOGLE_OAUTH_ENABLED ?? "").trim().toLowerCase());
}

function resolveRedirectUri(env: NodeJS.ProcessEnv) {
  const explicit = env.PDM_GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const publicBaseUrl = env.PDM_PUBLIC_BASE_URL?.trim().replace(/\/+$/u, "");
  return publicBaseUrl ? `${publicBaseUrl}/api/auth/google/callback` : "";
}

function validRedirectUri(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function readConfig(env: NodeJS.ProcessEnv = process.env): GoogleOAuthConfig | null {
  if (!enabledByEnvironment(env)) return null;
  const clientId = env.PDM_GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.PDM_GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = resolveRedirectUri(env);
  const authSecret = env.PDM_AUTH_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret || !validRedirectUri(redirectUri)) return null;
  if (authSecret.length < 24 || authSecret === DEFAULT_AUTH_SECRET) return null;
  return { clientId, clientSecret, redirectUri };
}

export function getGoogleOAuthPublicStatus(env: NodeJS.ProcessEnv = process.env) {
  return { enabled: Boolean(readConfig(env)) };
}

function requiredConfig() {
  const config = readConfig();
  if (!config) {
    throw new GoogleOAuthError("google_oauth_not_configured", "Google 登入尚未完成系統設定。");
  }
  return config;
}

function authSecret() {
  return process.env.PDM_AUTH_SECRET?.trim() || DEFAULT_AUTH_SECRET;
}

function stateSignature(payload: string) {
  return crypto.createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

function encodeState(state: GoogleOAuthState) {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${stateSignature(payload)}`;
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeState(value: string): GoogleOAuthState {
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !secureEqual(signature, stateSignature(payload))) {
    throw new GoogleOAuthError("google_oauth_invalid_state", "Google 登入狀態驗證失敗，請重新開始。");
  }
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleOAuthState;
    const age = Date.now() - Number(state.createdAt);
    if (!state.state || !state.nonce || !state.codeVerifier || age < 0 || age > GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS * 1000) {
      throw new Error("invalid state payload");
    }
    if (state.purpose === "invite" && (!state.invitationId || !state.invitationEmail)) {
      throw new Error("invalid invitation state");
    }
    return state;
  } catch {
    throw new GoogleOAuthError("google_oauth_invalid_state", "Google 登入狀態已失效，請重新開始。");
  }
}

function parseCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const item of header.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (rawName === name) return rawValue.join("=");
  }
  return null;
}

function safeReturnTo(value: string | undefined) {
  const normalized = value?.trim() || "/";
  return normalized.startsWith("/") && !normalized.startsWith("//") ? normalized : "/";
}

function cookieSecure(config?: GoogleOAuthConfig) {
  const redirectUri = config?.redirectUri ?? resolveRedirectUri(process.env);
  return redirectUri.startsWith("https://") ? "; Secure" : "";
}

function testClientOverrides(): { endpoints?: GoogleOAuthEndpointOverrides; issuers?: string[] } {
  const raw = process.env.PDM_GOOGLE_OAUTH_TEST_ENDPOINTS_JSON?.trim();
  if (!raw || process.env.NODE_ENV === "production") return {};
  const parsed = JSON.parse(raw) as { endpoints?: GoogleOAuthEndpointOverrides; issuers?: string[] };
  const endpoints = parsed.endpoints
    ? Object.fromEntries(Object.entries(parsed.endpoints).filter(([, value]) => typeof value === "string" && value.startsWith("http://127.0.0.1:")))
    : undefined;
  const issuers = Array.isArray(parsed.issuers)
    ? parsed.issuers.filter((value) => typeof value === "string" && value.startsWith("http://127.0.0.1:"))
    : undefined;
  return { endpoints: endpoints as GoogleOAuthEndpointOverrides | undefined, issuers };
}

function createClient(config: GoogleOAuthConfig) {
  const overrides = testClientOverrides();
  return new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    ...overrides
  });
}

export async function beginGoogleOAuth(input: {
  purpose: GoogleOAuthPurpose;
  invitationId?: string;
  invitationEmail?: string;
  returnTo?: string;
}) {
  const config = requiredConfig();
  const client = createClient(config);
  const verifier = await client.generateCodeVerifierAsync();
  if (!verifier.codeChallenge) {
    throw new GoogleOAuthError("google_oauth_exchange_failed", "Google 登入安全參數建立失敗。");
  }
  const state: GoogleOAuthState = {
    state: crypto.randomBytes(32).toString("base64url"),
    nonce: crypto.randomBytes(32).toString("base64url"),
    codeVerifier: verifier.codeVerifier,
    purpose: input.purpose,
    invitationId: input.invitationId,
    invitationEmail: input.invitationEmail?.trim().toLowerCase(),
    returnTo: safeReturnTo(input.returnTo),
    createdAt: Date.now()
  };
  const authorizationUrl = client.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state: state.state,
    nonce: state.nonce,
    prompt: "select_account",
    code_challenge: verifier.codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256
  });
  const stateCookie = `${GOOGLE_OAUTH_STATE_COOKIE_NAME}=${encodeState(state)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS}${cookieSecure(config)}`;
  return { authorizationUrl, stateCookie };
}

export async function completeGoogleOAuth(request: Request): Promise<{ state: GoogleOAuthState; identity: VerifiedGoogleIdentity }> {
  const config = requiredConfig();
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const returnedState = url.searchParams.get("state")?.trim() ?? "";
  const stateCookie = parseCookie(request.headers.get("cookie"), GOOGLE_OAUTH_STATE_COOKIE_NAME);
  if (!code || !returnedState || !stateCookie) {
    throw new GoogleOAuthError("google_oauth_invalid_state", "Google 登入回傳資料不完整，請重新開始。");
  }
  const state = decodeState(stateCookie);
  if (!secureEqual(returnedState, state.state)) {
    throw new GoogleOAuthError("google_oauth_invalid_state", "Google 登入狀態不一致，請重新開始。");
  }

  try {
    const client = createClient(config);
    const { tokens } = await client.getToken({ code, codeVerifier: state.codeVerifier, redirect_uri: config.redirectUri });
    if (!tokens.id_token) {
      throw new GoogleOAuthError("google_oauth_invalid_identity", "Google 未回傳可驗證的登入身分。");
    }
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
    const payload = ticket.getPayload();
    if (
      !payload?.sub ||
      !payload.email ||
      payload.email_verified !== true ||
      !payload.nonce ||
      !secureEqual(payload.nonce, state.nonce)
    ) {
      throw new GoogleOAuthError("google_oauth_invalid_identity", "Google 登入身分驗證失敗。");
    }
    return {
      state,
      identity: {
        subject: payload.sub,
        email: payload.email.trim().toLowerCase(),
        displayName: payload.name?.trim() || null,
        verifiedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    if (error instanceof GoogleOAuthError) throw error;
    throw new GoogleOAuthError("google_oauth_exchange_failed", "Google 登入交換失敗，請重新嘗試。");
  }
}

export function clearGoogleOAuthStateCookie() {
  return `${GOOGLE_OAUTH_STATE_COOKIE_NAME}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecure()}`;
}
