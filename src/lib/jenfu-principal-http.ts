import { getSessionCookieToken } from "@/lib/auth";
import { getGoogleWorkspaceMfaTrustPolicy, getJenfuIdentityConfig } from "@/lib/auth-config";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuPrincipalRequestError, type PrincipalRequestInput } from "@/lib/jenfu-principal-request-guard";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";

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
  // The verified request guard preserves evaluator errors. Published denial
  // must retain the entitlement taxonomy instead of being called an outage.
  // Only this typed producer/consumer error is eligible, never a raw code field.
  if (error instanceof JenfuEntitlementRepositoryError) {
    return jenfuEntitlementFailureResponse(error.code);
  }
  const dependency = !(error instanceof JenfuPrincipalRequestError) ||
    error.code === "principal_dependency_unavailable";
  return Response.json({ code: dependency ? "principal_dependency_unavailable" : "auth_session_invalid" },
    { status: dependency ? 503 : 401, headers: { "cache-control": "no-store" } });
}
