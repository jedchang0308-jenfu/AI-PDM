import { NextResponse } from "next/server";
import type { NumberingUserScope } from "@/lib/db";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { NumberStateFlowError, type NumberStateActor } from "@/lib/number-state-flow";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { requireNumberingPlatformCommandAsync, type NumberingPlatformCommandAccess } from "@/lib/platform-command-context";
import type { PdmCompanyContext } from "@/lib/company-context";

export const NUMBER_STATE_NO_STORE_HEADERS = { "cache-control": "private, no-store" };

export type NumberStateReadAccess =
  | { user: NumberingUserScope; company: PdmCompanyContext; actor: NumberStateActor; response: null }
  | { user: null; company: null; actor: null; response: Response };

export function numberStateFlowJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NUMBER_STATE_NO_STORE_HEADERS, ...(init?.headers ?? {}) }
  });
}

function errorEnvelope(code: string, message: string, retryable: boolean, details?: Record<string, unknown>) {
  return { error: { code, message, retryable, ...(details ? { details } : {}) } };
}

export function numberStateFlowErrorResponse(error: unknown, fallback = "Number state operation failed.") {
  if (error instanceof NumberStateFlowError) {
    return numberStateFlowJson(errorEnvelope(error.code, error.message, error.retryable, error.details), { status: error.status });
  }
  console.error(fallback, error);
  return numberStateFlowJson(errorEnvelope("number_state_internal", fallback, false), { status: 500 });
}

export function invalidNumberStateJsonResponse() {
  return numberStateFlowJson(errorEnvelope("invalid_json", "A valid JSON request body is required.", false), { status: 400 });
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() ?? "";
}

function requestAllowedOrigins(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  const protocol = forwardedProto === "http" || forwardedProto === "https"
    ? `${forwardedProto}:`
    : requestUrl.protocol;
  const hosts = [
    firstForwardedValue(request.headers.get("x-forwarded-host")),
    request.headers.get("host")?.trim() ?? ""
  ].filter(Boolean);
  const origins = new Set([requestUrl.origin]);
  for (const host of hosts) {
    try {
      origins.add(new URL(`${protocol}//${host}`).origin);
    } catch {
      // Invalid proxy/host metadata never becomes an allowed origin.
    }
  }
  return origins;
}

function accessError(status: number) {
  if (status === 401) {
    return numberStateFlowJson(errorEnvelope("authentication_required", "Authentication is required.", false), { status });
  }
  return numberStateFlowJson(errorEnvelope("numbering_permission_denied", "Permission or company scope was denied.", false), {
    status: status === 404 ? 404 : 403
  });
}

export async function requireNumberStateReadAccessAsync(
  request: Request,
  action: string
): Promise<NumberStateReadAccess> {
  const auth = await requireNumberingActionAsync(request, action);
  if (auth.response || !auth.user) {
    return { user: null, company: null, actor: null, response: accessError(auth.response?.status ?? 401) };
  }
  const companyResult = await resolveNumberingCompanyContextAsync(
    auth.user.id,
    requestedNumberingCompanyCodeFromRequest(request)
  );
  if (companyResult.response || !companyResult.company) {
    return { user: null, company: null, actor: null, response: accessError(companyResult.response?.status ?? 403) };
  }
  return {
    user: auth.user,
    company: companyResult.company,
    actor: {
      userId: auth.user.id,
      companyId: companyResult.company.companyId,
      role: auth.user.role,
      roles: [auth.user.role, auth.permission?.roleCode ?? "", ...(auth.permission?.evaluatedRoles ?? [])].filter(Boolean)
    },
    response: null
  };
}

export async function requireNumberStateCommandAccessAsync(
  request: Request,
  action: string,
  body: Record<string, unknown>
): Promise<NumberingPlatformCommandAccess> {
  const access = await requireNumberingPlatformCommandAsync(request, { action, body });
  if (!access.response) return access;
  return { ...access, response: accessError(access.response.status) };
}

export function validateNumberStateMutationRequest(input: {
  request: Request;
  idempotencyKey?: string | null;
  requireIdempotency?: boolean;
}) {
  const contentType = input.request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return numberStateFlowJson(errorEnvelope("json_request_required", "Content-Type application/json is required.", false), { status: 415 });
  }
  const fetchSite = input.request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    return numberStateFlowJson(errorEnvelope("same_origin_required", "Cross-site mutation requests are not allowed.", false), { status: 403 });
  }
  const origin = input.request.headers.get("origin");
  if (origin && !requestAllowedOrigins(input.request).has(origin)) {
    return numberStateFlowJson(errorEnvelope("same_origin_required", "Cross-origin mutation requests are not allowed.", false), { status: 403 });
  }
  if (input.requireIdempotency && !/^[A-Za-z0-9._:/-]{1,200}$/u.test(input.idempotencyKey?.trim() ?? "")) {
    return numberStateFlowJson(errorEnvelope("idempotency_key_required", "A valid Idempotency-Key is required.", false), { status: 400 });
  }
  return null;
}
