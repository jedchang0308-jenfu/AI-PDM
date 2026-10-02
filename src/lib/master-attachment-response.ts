import { principalRequestFailure } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { protectedFileResponseHeaders } from "@/lib/file-response";
import type { MasterAttachmentRecord } from "@/lib/db";

export function buildMasterAttachmentFileResponse(input: {
  attachment: MasterAttachmentRecord;
  bytes: Buffer;
  disposition?: "inline" | "attachment";
}) {
  return new Response(new Uint8Array(input.bytes), {
    headers: {
      "content-type": input.attachment.mimeType || "application/octet-stream",
      "content-length": String(input.bytes.byteLength),
      ...protectedFileResponseHeaders(input.disposition ?? "attachment", input.attachment.fileName, input.attachment.mimeType || "application/octet-stream")
    }
  });
}

export function masterAttachmentStatusFromError(message: string) {
  if (message === "PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED") return 403;
  if (["PLATFORM_COMMAND_ACTOR_MISMATCH", "PLATFORM_COMMAND_IDEMPOTENCY_PAYLOAD_MISMATCH",
       "PLATFORM_COMMAND_SCHEMA_MISMATCH", "PLATFORM_COMMAND_IN_PROGRESS", "PLATFORM_OUTBOX_IDEMPOTENCY_CONFLICT"].includes(message)) return 409;
  if (message === "MASTER_ATTACHMENT_PRINCIPAL_CONTEXT_REQUIRED" || message === "PREVIEW_PRINCIPAL_COMPANY_CONTEXT_REQUIRED") return 503;
  if (message === "MASTER_ATTACHMENT_ACTOR_PROFILE_MISMATCH") return 403;
  if (message.includes("PART_PREVIEW_ACTIVE_ASSET")) return 409;
  if (message.includes("LIFE_PERMISSION_DENIED")) return 403;
  if (message.includes("LIFE_UNSUPPORTED_ENTITY")) return 400;
  if (message.includes("LIFE_ATTACHMENT_NOT_DELETED")) return 409;
  if (message.includes("LIFE_ATTACHMENT_DUPLICATE_ACTIVE")) return 409;
  if (message.includes("LIFE_ATTACHMENT_PARENT_INVALID")) return 409;
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("DUPLICATE")) return 409;
  if (message.includes("NOT_CONFIGURED")) return 503;
  if (
    message.includes("EXTENSION") ||
    message.includes("CATEGORY") ||
    message.includes("EMPTY") ||
    message.includes("TOO_LARGE") ||
    message.includes("REVISION")
  ) {
    return 400;
  }
  return 500;
}

/** Preserve typed command-time session/grant failures; dependency outages are not permission denies. */
export function masterAttachmentCommandFailureResponse(error: unknown) {
  if (error instanceof JenfuPrincipalRequestError || error instanceof JenfuEntitlementRepositoryError) {
    return principalRequestFailure(error);
  }
  const message = error instanceof Error ? error.message : "MASTER_ATTACHMENT_COMMAND_FAILED";
  return Response.json({ error: message }, {
    status: masterAttachmentStatusFromError(message), headers: { "cache-control": "private, no-store" }
  });
}
