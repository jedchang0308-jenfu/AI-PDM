import crypto from "node:crypto";
import {
  requestedNumberingCompanyCodeFromRequest,
  resolveNumberingCompanyContextAsync
} from "@/lib/numbering-company-context";
import {
  requireNumberingActionAsync,
  type NumberingGuardResult
} from "@/lib/numbering-permission-guard";
import {
  createPlatformActorContext,
  type PdmCommandMetadata,
  type PlatformActorContext
} from "@/lib/platform-command";
import type { PdmCompanyContext } from "@/lib/company-context";

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
    body?: Record<string, unknown>;
  }
): Promise<NumberingPlatformCommandAccess> {
  const auth = await requireNumberingActionAsync(request, input.action);
  if (auth.response || !auth.user) {
    return {
      auth,
      company: null,
      actor: null,
      metadata: null,
      response: auth.response ?? Response.json({ error: "platform_actor_required" }, { status: 401 })
    };
  }

  const body = input.body ?? {};
  const companyResult = await resolveNumberingCompanyContextAsync(
    auth.user.id,
    requestedNumberingCompanyCodeFromRequest(request, body)
  );
  if (companyResult.response || !companyResult.company) {
    return {
      auth,
      company: null,
      actor: null,
      metadata: null,
      response: companyResult.response
    };
  }

  const requestId = safeHeaderId(request, "x-request-id") || crypto.randomUUID();
  const correlationId = safeHeaderId(request, "x-correlation-id") || requestId;
  const roleCodes = [auth.user.role, auth.permission?.roleCode ?? "", ...(auth.permission?.evaluatedRoles ?? [])];
  const actor = createPlatformActorContext({
    pdmUserId: auth.user.id,
    organizationId: companyResult.company.companyId,
    roles: roleCodes,
    scopes: [input.action],
    authProvider: "current_pdm_session",
    requestId,
    correlationId
  });
  return {
    auth,
    company: companyResult.company,
    actor,
    metadata: {
      actor,
      idempotencyKey: requestedIdempotencyKey(request, body, requestId)
    },
    response: null
  };
}
