import crypto from "node:crypto";
import { requestedNumberingCompanyCodeFromRequest } from "@/lib/numbering-company-context";
import {
  requirePrincipalNumberingPermissionAsync,
  type NumberingGuardResult
} from "@/lib/numbering-permission-guard";
import {
  createPlatformActorContext,
  type PdmCommandMetadata,
  type PlatformActorContext
} from "@/lib/platform-command";
import type { PdmCompanyContext } from "@/lib/company-context";
import { principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { resolveJenfuRoutePolicyFromRequest } from "@/lib/jenfu-route-permission-map";
import { assertProductionSmokeRuntimeIsolation } from "@/lib/production-smoke-runtime";

export type NumberingPlatformCommandAccess =
  | {
      auth: NumberingGuardResult;
      company: PdmCompanyContext;
      actor: PlatformActorContext;
      metadata: PdmCommandMetadata;
      response: null;
    }
  | {
      auth: NumberingGuardResult;
      company: null;
      actor: null;
      metadata: null;
      response: Response;
    };

function safeHeaderId(request: Request, name: string) {
  const value = request.headers.get(name)?.trim() ?? "";
  return /^[A-Za-z0-9._:/-]{1,200}$/u.test(value) ? value : "";
}

function requestedIdempotencyKey(request: Request, body: Record<string, unknown>, requestId: string) {
  const supplied = String(
    request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key") ?? body.idempotencyKey ?? body.idempotency_key ?? ""
  ).trim();
  return supplied || `request:${requestId}`;
}

export async function requireNumberingPlatformCommandAsync(
  request: Request,
  input: {
    action: string;
    permissionCode?: string;
    body?: Record<string, unknown>;
    additionalPermissionCodes?: string[];
  }
): Promise<NumberingPlatformCommandAccess> {
  const permissionCode = input.permissionCode ?? input.action;
  const route = resolveJenfuRoutePolicyFromRequest(request, permissionCode);
  if (!route || route.scopeResolver !== "workspace") {
    return {
      auth: { user: { id: "", role: "" }, permission: null, response: null },
      company: null, actor: null, metadata: null,
      response: Response.json({ code: "principal_route_not_migrated" },
        { status: 503, headers: { "cache-control": "no-store" } })
    };
  }
  const body = input.body ?? {};
  const auth = await requirePrincipalNumberingPermissionAsync(request, "action", permissionCode,
    requestedNumberingCompanyCodeFromRequest(request, body));
  if (auth.response || !auth.company || !auth.user.authorizationActor) {
    return {
      auth, company: null, actor: null, metadata: null,
      response: auth.response ?? Response.json({ code: "platform_actor_verification_required" }, { status: 401 })
    };
  }
  const verifiedActor = auth.user.authorizationActor;
  if (verifiedActor.localPrincipalId !== auth.user.id ||
      verifiedActor.companyId !== auth.company.companyId) {
    return {
      auth, company: null, actor: null, metadata: null,
      response: Response.json({ error: "platform_actor_company_mismatch" }, { status: 403 })
    };
  }

  const requestId = safeHeaderId(request, "x-request-id") || crypto.randomUUID();
  const correlationId = safeHeaderId(request, "x-correlation-id") || requestId;
  if (auth.company.companyKind === "production_smoke") {
    try {
      assertProductionSmokeRuntimeIsolation(auth.company);
    } catch {
      return {
        auth,
        company: null,
        actor: null,
        metadata: null,
        response: Response.json({ error: "pdm_smoke_runtime_isolation_required" }, { status: 503 })
      };
    }
  }
  const actor = createPlatformActorContext({
    pdmUserId: auth.user.id,
    organizationId: auth.company.companyId,
    roles: auth.permission?.roleCode ? [auth.permission.roleCode] : [],
    scopes: [input.action],
    authProvider: "current_pdm_session",
    authorizationActor: verifiedActor,
    requestId,
    correlationId
  });
  const token = principalSessionTokenFromRequest(request);
  if (!token) {
    return { auth, company: null, actor: null, metadata: null,
      response: Response.json({ code: "auth_session_invalid" }, { status: 401 }) };
  }
  return {
    auth,
    company: auth.company,
    actor,
    metadata: {
      actor,
      idempotencyKey: requestedIdempotencyKey(request, body, requestId),
      principalRequest: principalRequestInput(token),
      principalAuthorization: {
        request, routePath: route.path, method: request.method, permissionCode,
        additionalPermissionCodes: input.additionalPermissionCodes ??
          (input.action === "numbering.create" &&
            Boolean(body.drawingRequested ?? body.drawing_requested)
            ? ["numbering.link_variant"] : [])
      }
    },
    response: null
  };
}
