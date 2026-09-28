import type { NumberingUserScope } from "@/lib/db";
import { numberStateFlowJson, requireNumberStateCommandAccessAsync, requireNumberStateReadAccessAsync } from "@/lib/number-state-flow-api";
import { TransferPackageError, type TransferPackageActor } from "@/lib/transfer-packages";
import type { PdmCompanyContext } from "@/lib/company-context";
import { principalRequestFailure } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";

export type TransferPackageApiAccess =
  | { user: NumberingUserScope; company: PdmCompanyContext; actor: TransferPackageActor; response: null }
  | { user: null; company: null; actor: null; response: Response };

export async function requireTransferPackageAccessAsync(
  request: Request,
  body?: Record<string, unknown>,
  action = "transfer.package.view"
): Promise<TransferPackageApiAccess> {
  if (action === "transfer.package.view") {
    const access = await requireNumberStateReadAccessAsync(request, action);
    if (access.response) {
      return { user: null, company: null, actor: null, response: access.response };
    }
    return {
      user: access.user,
      company: access.company,
      actor: access.actor,
      response: null
    };
  }
  const access = await requireNumberStateCommandAccessAsync(request, action, body ?? {});
  if (access.response) {
    return { user: null, company: null, actor: null, response: access.response };
  }
  return {
    user: access.auth.user,
    company: access.company,
    actor: {
      userId: access.actor.pdmUserId,
      companyId: access.actor.organizationId,
      role: access.auth.user.role
    },
    response: null
  };
}

export function transferPackageErrorResponse(error: unknown, fallback: string) {
  if (error instanceof TransferPackageError) {
    return numberStateFlowJson({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof JenfuPrincipalRequestError) return principalRequestFailure(error);
  if (error instanceof Error && error.message === "PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED") {
    return numberStateFlowJson({ error: "permission_not_granted" }, { status: 403 });
  }
  if (error instanceof Error && (
    error.message.startsWith("PLATFORM_PRINCIPAL_") ||
    error.message === "PLATFORM_ACTOR_VERIFICATION_REQUIRED"
  )) {
    return numberStateFlowJson({ error: "principal_authorization_unavailable" }, { status: 503 });
  }
  console.error(fallback, error);
  return numberStateFlowJson({ error: "TRANSFER_PACKAGE_INTERNAL", message: fallback }, { status: 500 });
}
