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
import { resolvePrincipalCompanyContextInSnapshot, type PdmCompanyContext } from "@/lib/company-context";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { createJenfuVerifiedAuthorizationActor } from "@/lib/jenfu-entitlement-contract";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { resolveJenfuRoutePolicyFromRequest } from "@/lib/jenfu-route-permission-map";
import type { JenfuRouteDiscriminator } from "@/lib/jenfu-route-permission-map";
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

function attachmentIngressGroups(routePath: string, method: string, permissionCode: string) {
  if (permissionCode !== "numbering.attachments.manage") return undefined;
  if (method === "DELETE" && routePath === "src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts") return ["part"] as const;
  if (method === "POST" && (
    routePath === "src/app/api/parts/[partNumber]/attachments/[attachmentId]/restore/route.ts" ||
    routePath === "src/app/api/parts/[partNumber]/attachments/[attachmentId]/previews/route.ts")) return ["part"] as const;
  if (method === "POST" && routePath === "src/app/api/parts/[partNumber]/attachments/route.ts") return ["part"] as const;
  if (method === "POST" && routePath === "src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/previews/route.ts") return ["drawing"] as const;
  return undefined;
}

/** Transfer review admission and authorization share the command's write transaction. */
export async function withTransferReviewCommand(
  request: Request,
  input: { action: "transfer.package.review.submit" | "transfer.package.review.decide";
    body: Record<string, unknown> },
  execute: (client: AsyncDatabaseClient, metadata: PdmCommandMetadata) => Promise<Response>
): Promise<Response> {
  const decision = input.action === "transfer.package.review.decide";
  const permissionCode = decision ? "approval.request.decide" : input.action;
  const discriminator = decision ? "approval_decision:transfer_package" : undefined;
  const route = resolveJenfuRoutePolicyFromRequest(request, permissionCode, discriminator);
  const routePath = decision ? "src/app/api/approvals/requests/[requestId]/decisions/route.ts"
    : "src/app/api/transfer-packages/[id]/submit-review/route.ts";
  if (route?.path !== routePath || route.scopeResolver !== "workspace" ||
      route.authorizationMode !== "permission" || request.method !== "POST" ||
      getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
      getJenfuEntitlementMode() !== "enforce") {
    throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
  }
  const token = principalSessionTokenFromRequest(request);
  if (!token) throw new JenfuPrincipalRequestError("auth_session_invalid");
  const principalRequest = await principalRequestInput(token, request);
  return withVerifiedJenfuPrincipalRequest(principalRequest, async (client, verified) => {
    const company = await resolvePrincipalCompanyContextInSnapshot(client, verified,
      requestedNumberingCompanyCodeFromRequest(request, input.body));
    if (company.response) return company.response;
    const authorizationActor = createJenfuVerifiedAuthorizationActor({
      identityIssuer: verified.session.identityIssuer, identitySubject: verified.session.identitySubject,
      principalId: verified.session.principalId, employeeId: verified.session.employeeId,
      localPrincipalId: verified.profile.pdmUserId, companyId: company.company.companyId, sessionSchemaVersion: 2
    });
    if (!authorizationActor) throw new JenfuPrincipalRequestError("auth_session_invalid");
    const requestId = safeHeaderId(request, "x-request-id") || crypto.randomUUID();
    return execute(client, {
      actor: createPlatformActorContext({
        pdmUserId: verified.profile.pdmUserId, organizationId: company.company.companyId,
        authorizationActor, scopes: [input.action], requestId,
        correlationId: safeHeaderId(request, "x-correlation-id") || requestId
      }),
      idempotencyKey: requestedIdempotencyKey(request, input.body, requestId),
      principalRequest,
      principalAuthorization: { request, routePath: route.path, method: request.method, permissionCode, discriminator },
      inVerifiedSnapshot: (input, run) => {
        if (input !== principalRequest) throw new JenfuPrincipalRequestError("auth_session_invalid");
        return run(client, verified);
      }
    });
  }, { readOnly: false, isolationLevel: "serializable" });
}

export async function requireNumberingPlatformCommandAsync(
  request: Request,
  input: {
    action: string;
    permissionCode?: string;
    body?: Record<string, unknown>;
    additionalPermissionCodes?: string[];
    discriminator?: JenfuRouteDiscriminator;
  }
): Promise<NumberingPlatformCommandAccess> {
  const permissionCode = input.permissionCode ?? input.action;
  const route = resolveJenfuRoutePolicyFromRequest(request, permissionCode, input.discriminator);
  if (!route || route.scopeResolver !== "workspace") {
    return {
      auth: { user: { id: "", role: "" }, permission: null, response: null },
      company: null, actor: null, metadata: null,
      response: Response.json({ code: "principal_route_not_migrated" },
        { status: 503, headers: { "cache-control": "no-store" } })
    };
  }
  const body = input.body ?? {};
  const resourceGroups = attachmentIngressGroups(route.path, request.method, permissionCode);
  const resourceGroupsDynamicOnly = route.path === "src/app/api/parts/[partNumber]/attachments/route.ts" &&
    request.method === "POST";
  const auth = await requirePrincipalNumberingPermissionAsync(request, "action", permissionCode,
    requestedNumberingCompanyCodeFromRequest(request, body),
    resourceGroups ? { resourceGroups, ...(resourceGroupsDynamicOnly ? { resourceGroupsDynamicOnly: true } : {}) } : {});
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
      principalRequest: await principalRequestInput(token, request),
      principalAuthorization: {
        request, routePath: route.path, method: request.method, permissionCode,
        discriminator: input.discriminator,
        additionalPermissionCodes: input.additionalPermissionCodes ??
          (input.action === "numbering.create" &&
            Boolean(body.drawingRequested ?? body.drawing_requested)
            ? ["numbering.link_variant"] : [])
      }
    },
    response: null
  };
}
