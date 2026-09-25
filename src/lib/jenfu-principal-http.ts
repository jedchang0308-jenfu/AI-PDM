import { getSessionCookieToken } from "@/lib/auth";
import { getGoogleWorkspaceMfaTrustPolicy, getJenfuIdentityConfig } from "@/lib/auth-config";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuPrincipalRequestError, type PrincipalRequestInput } from "@/lib/jenfu-principal-request-guard";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";

/** Envelope inspection only; withVerifiedJenfuPrincipalRequest authenticates the token. */
export function principalSessionTokenFromRequest(request: Request): string | null {
  const token = getSessionCookieToken(request);
  if (!token || token.length > 8192) return null;
  const header = token.split(".", 1)[0];
  if (!header || header.length > 1024) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    if (value && typeof value === "object" && !Array.isArray(value) &&
      (value as { type?: unknown }).type === "JENFU-AI-PDM-PRINCIPAL" &&
      (value as { version?: unknown }).version === 2) return token;
  } catch { /* Other sessions are handled by their own exact verifier. */ }
  return null;
}

export function principalRequestInput(token: string): PrincipalRequestInput {
  return {
    token, keyRing: getPlatformSessionKeyRing(),
    identityIssuer: getJenfuIdentityConfig().identityIssuer,
    trustPolicy: getGoogleWorkspaceMfaTrustPolicy(),
    database: getAsyncDatabaseClient()
  };
}

export function principalRequestFailure(error: unknown): Response {
  const dependency = !(error instanceof JenfuPrincipalRequestError) ||
    error.code === "principal_dependency_unavailable";
  return Response.json({ code: dependency ? "principal_dependency_unavailable" : "auth_session_invalid" },
    { status: dependency ? 503 : 401, headers: { "cache-control": "no-store" } });
}
