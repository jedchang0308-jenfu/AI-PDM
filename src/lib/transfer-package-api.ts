import { numberStateFlowJson } from "@/lib/number-state-flow-api";
import { TransferPackageError } from "@/lib/transfer-packages";
import { principalRequestFailure } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";

export function transferPackageErrorResponse(error: unknown, fallback: string) {
  if (error instanceof TransferPackageError) {
    return numberStateFlowJson({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof JenfuPrincipalRequestError) return principalRequestFailure(error);
  if (error instanceof Error && error.message === "PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED") {
    return numberStateFlowJson({ error: "permission_not_granted" }, { status: 403 });
  }
  if (error instanceof Error && ["PLATFORM_COMMAND_IDEMPOTENCY_PAYLOAD_MISMATCH",
    "PLATFORM_COMMAND_IN_PROGRESS", "PLATFORM_OUTBOX_IDEMPOTENCY_CONFLICT"].includes(error.message)) {
    return numberStateFlowJson({ error: "transfer_command_conflict" }, { status: 409 });
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
