import { getSessionCookieToken } from "@/lib/auth";
import { getGoogleWorkspaceMfaTrustPolicy, getJenfuIdentityConfig } from "@/lib/auth-config";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuPrincipalRequestError, type PrincipalRequestInput } from "@/lib/jenfu-principal-request-guard";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { reportLocalPrincipalDiagnostic } from "@/lib/local-principal-diagnostics";
import { LocalSandboxError } from "../../contracts/local-principal-sandbox/v1/client.mjs";
import { LOCAL_IDENTITY_ISSUER } from "../../contracts/local-principal-sandbox/v1/protocol.mjs";
import {
  isLocalSandboxPrincipalRequestAdmission,
  resolveLocalSandboxPrincipalRequestAdmission,
  LOCAL_SANDBOX_PRINCIPAL_TRUST_POLICY
} from "@/lib/local-sandbox-principal-session";
import {
  getLocalSandboxPrincipalRuntime,
  isLocalPrincipalSandboxRequested,
  readLocalPrincipalSessionCookie,
} from "@/lib/local-sandbox-principal-runtime";

/** Envelope inspection only; withVerifiedJenfuPrincipalRequest authenticates the token. */
export function principalSessionTokenFromRequest(request: Request): string | null {
  let token: string | null;
  try {
    if (isLocalPrincipalSandboxRequested()) {
      token = readLocalPrincipalSessionCookie(request, process.env.JENFU_LOCAL_SANDBOX_ID ?? "");
    } else {
      token = getSessionCookieToken(request);
    }
  } catch {
    return null;
  }
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

function unverifiedIdentityIssuer(token: string): string | null {
  const segments = token.split(".");
  if (segments.length !== 3 || !segments[1]) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return null;
    const identityIssuer = (claims as { identityIssuer?: unknown }).identityIssuer;
    return typeof identityIssuer === "string" ? identityIssuer : null;
  } catch { return null; }
}

export async function principalRequestInput(token: string, request: Request): Promise<PrincipalRequestInput> {
  const tokenIdentityIssuer = unverifiedIdentityIssuer(token);
  let localSandboxRequested = false;
  try { localSandboxRequested = isLocalPrincipalSandboxRequested(); }
  catch { throw new JenfuPrincipalRequestError("principal_dependency_unavailable"); }
  if (localSandboxRequested) {
    if (tokenIdentityIssuer !== LOCAL_IDENTITY_ISSUER) throw new JenfuPrincipalRequestError("auth_session_invalid");
    try {
      const local = await getLocalSandboxPrincipalRuntime();
      if (readLocalPrincipalSessionCookie(request, local.config.sandboxId) !== token) {
        throw new JenfuPrincipalRequestError("auth_session_invalid");
      }
      const admission = await resolveLocalSandboxPrincipalRequestAdmission({
        request, token, environment: process.env, listenAddress: local.listenAddress,
        expected: local.expected, database: local.database, keyRing: local.keyRing,
        targetReader: local.ports.targetReader, nativeSessionReadback: local.ports.nativeSessionReadback,
        binding: local.ports.binding, centralIntrospection: local.ports.centralIntrospection,
      });
      if (!isLocalSandboxPrincipalRequestAdmission(admission, token)) {
        throw new JenfuPrincipalRequestError("auth_session_invalid");
      }
      return { token, keyRing: local.keyRing, identityIssuer: LOCAL_IDENTITY_ISSUER,
        trustPolicy: LOCAL_SANDBOX_PRINCIPAL_TRUST_POLICY, database: local.database };
    } catch (error) {
      if (error instanceof JenfuPrincipalRequestError) {
        if (error.code === "principal_dependency_unavailable") {
          reportLocalPrincipalDiagnostic("principal_request_input", error);
        }
        throw error;
      }
      if (error instanceof LocalSandboxError && error.status === 401 &&
        ["local_session_invalid", "local_session_stale"].includes(error.code)) {
        throw new JenfuPrincipalRequestError("auth_session_invalid");
      }
      reportLocalPrincipalDiagnostic("principal_request_input", error);
      const code = error instanceof Error ? error.message : "";
      if (["LOCAL_SANDBOX_NATIVE_SESSION_INVALID", "LOCAL_SANDBOX_NATIVE_SESSION_MISMATCH",
        "LOCAL_SANDBOX_REQUEST_BINDING_INVALID", "LOCAL_SANDBOX_CENTRAL_INTROSPECTION_INVALID",
        "LOCAL_SANDBOX_CENTRAL_INTROSPECTION_MISMATCH"].includes(code)) {
        throw new JenfuPrincipalRequestError("auth_session_invalid");
      }
      throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
    }
  }
  if (tokenIdentityIssuer === LOCAL_IDENTITY_ISSUER) throw new JenfuPrincipalRequestError("auth_session_invalid");
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
  if (dependency) reportLocalPrincipalDiagnostic("principal_http_boundary", error);
  return Response.json({ code: dependency ? "principal_dependency_unavailable" : "auth_session_invalid" },
    { status: dependency ? 503 : 401, headers: { "cache-control": "no-store" } });
}
