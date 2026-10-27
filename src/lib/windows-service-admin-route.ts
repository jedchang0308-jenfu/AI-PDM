import { randomUUID } from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCompanyContext } from "@/lib/company-context";
import { requestedPdmCompanyCodeFromRequest } from "@/lib/company-context";
import { isAllowedRequestOrigin } from "@/lib/request-origin";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { withPrincipalCompanyRead, withPrincipalCompanyWrite } from "@/lib/principal-company-read";
import { revalidateRolePolicyManager } from "@/lib/role-policy-apply-authorization";
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
  verified: VerifiedPrincipalRequest) => Promise<Response>;

export async function windowsServiceAdminReadRoute(request: Request, routePath: string, handler: ReadHandler) {
  const policy = resolveJenfuRoutePolicy(routePath, "GET", { expectedPermissionCode: permission });
  if (request.method !== "GET" || policy?.authorizationMode !== "permission" || policy.scopeResolver !== "workspace") {
    return Response.json({ error: "principal_route_policy_unavailable" }, { status: 503, headers });
  }
  const response = await withPrincipalCompanyRead(request, requestedPdmCompanyCodeFromRequest(request),
    [{ permissionKind: "action", permissionCode: permission }], async (client, company, verified) => {
      try {
        await revalidateRolePolicyManager(client, verified);
        return await handler(client, company, verified);
      } catch (error) { return errorResponse(error); }
    });
  return response ?? Response.json({ error: "auth_session_invalid" }, { status: 401, headers });
}

export async function windowsServiceAdminWriteRoute(request: Request, routePath: string,
  handler: (client: AsyncDatabaseClient, company: PdmCompanyContext,
    verified: VerifiedPrincipalRequest, body: Record<string, unknown>) => Promise<Response>) {
  let body: Record<string, unknown>;
  try { body = await readJson(request); } catch (error) { return errorResponse(error); }
  return withPrincipalCompanyWrite(request, routePath, permission, async (client, company, verified) => {
    try {
      await revalidateRolePolicyManager(client, verified);
      return await handler(client, company, verified, body);
    } catch (error) { return errorResponse(error); }
  }, { isolationLevel: "read_committed" });
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
