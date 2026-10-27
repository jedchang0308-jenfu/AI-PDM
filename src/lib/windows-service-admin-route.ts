import { randomUUID } from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCompanyContext } from "@/lib/company-context";
import { requestedPdmCompanyCodeFromRequest, resolvePrincipalCompanyContextInSnapshot } from "@/lib/company-context";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { isAllowedRequestOrigin } from "@/lib/request-origin";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { hashJenfuPrincipalSessionId } from "@/lib/jenfu-principal-session-registry";
import { WindowsServiceDeviceError } from "@/lib/windows-service-devices";

const permission = "settings.secret.manage";
const headers = { "cache-control": "private, no-store" };
const maxBodyBytes = 2 * 1024;

export class WindowsServiceHttpError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}

function errorResponse(error: unknown) {
  const correlationId = randomUUID();
  if (error instanceof WindowsServiceHttpError || error instanceof WindowsServiceDeviceError) {
    return Response.json({ error: error.code, correlationId }, { status: error.status, headers });
  }
  const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/u.test(error.message)
    ? error.message : "WINDOWS_SERVICE_DEPENDENCY_UNAVAILABLE";
  const status = code === "ROLE_POLICY_MANAGER_REQUIRED" ? 403
    : code.includes("UNAVAILABLE") ? 503 : 500;
  return Response.json({ error: code, correlationId }, { status, headers });
}

async function readJson(request: Request) {
  if (!isAllowedRequestOrigin(request)) throw new WindowsServiceHttpError("REQUEST_ORIGIN_INVALID", 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new WindowsServiceHttpError("CONTENT_TYPE_INVALID", 415);
  }
  const announced = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(announced) && announced > maxBodyBytes) {
    throw new WindowsServiceHttpError("REQUEST_TOO_LARGE", 413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBodyBytes) throw new WindowsServiceHttpError("REQUEST_TOO_LARGE", 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new WindowsServiceHttpError("INVALID_JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new WindowsServiceHttpError("INVALID_JSON");
  return body as Record<string, unknown>;
}

export function assertWindowsServiceKeys(body: Record<string, unknown>, required: string[]) {
  const keys = Object.keys(body);
  if (keys.length !== required.length || required.some((key) => !(key in body)) ||
      keys.some((key) => !required.includes(key))) {
    throw new WindowsServiceHttpError("REQUEST_SCHEMA_INVALID", 422);
  }
}

type ReadHandler = (client: AsyncDatabaseClient, company: PdmCompanyContext,
  verified: VerifiedPrincipalRequest, canManageAll: boolean) => Promise<Response>;

async function authorizeSelfService(request: Request, routePath: string, method: "GET" | "POST",
  handler: ReadHandler, readOnly: boolean) {
  const policy = resolveJenfuRoutePolicy(routePath, method, {});
  if (request.method !== method || policy?.authorizationMode !== "authenticated_domain" ||
      policy.permissionCode !== null || policy.scopeResolver !== "workspace") {
    return Response.json({ error: "principal_route_policy_unavailable" }, { status: 503, headers });
  }
  const token = principalSessionTokenFromRequest(request);
  if (!token) return Response.json({ error: "auth_session_invalid" }, { status: 401, headers });
  if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
      getJenfuEntitlementMode() !== "enforce") {
    return Response.json({ error: "principal_authorization_unavailable" }, { status: 503, headers });
  }
  try {
    return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token), async (client, verified) => {
      const result = await resolvePrincipalCompanyContextInSnapshot(client, verified,
        requestedPdmCompanyCodeFromRequest(request));
      if (result.response) return result.response;
      const [manager] = await evaluatePrincipalWorkspacePermissionsInSnapshot(client, verified,
        [{ permissionKind: "action", permissionCode: permission }]);
      const canManageAll = manager?.principalId === verified.session.principalId && manager.allowed === true;
      try { return await handler(client, result.company, verified, canManageAll); }
      catch (error) { return errorResponse(error); }
    }, { readOnly, isolationLevel: readOnly ? "repeatable_read" : "serializable" });
  } catch (error) { return principalRequestFailure(error); }
}

export async function windowsServiceUserReadRoute(request: Request, routePath: string, handler: ReadHandler) {
  return authorizeSelfService(request, routePath, "GET", handler, true);
}

export async function windowsServiceUserWriteRoute(request: Request, routePath: string,
  handler: (client: AsyncDatabaseClient, company: PdmCompanyContext,
    verified: VerifiedPrincipalRequest, body: Record<string, unknown>, canManageAll: boolean) => Promise<Response>) {
  let body: Record<string, unknown>;
  try { body = await readJson(request); } catch (error) { return errorResponse(error); }
  return authorizeSelfService(request, routePath, "POST",
    (client, company, verified, canManageAll) => handler(client, company, verified, body, canManageAll), false);
}

export function windowsServiceEnrollmentCreator(verified: VerifiedPrincipalRequest) {
  return {
    createdBy: verified.session.principalId,
    creatorSessionHash: hashJenfuPrincipalSessionId(verified.session.sessionId),
    creatorAuthEpoch: verified.session.authEpoch,
    creatorIdentityIssuer: verified.session.identityIssuer,
    creatorIdentitySubject: verified.session.identitySubject
  };
}
