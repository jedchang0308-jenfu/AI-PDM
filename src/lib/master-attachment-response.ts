import { contentDispositionHeader } from "@/lib/file-response";
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
      "content-disposition": contentDispositionHeader(input.disposition ?? "attachment", input.attachment.fileName),
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store"
    }
  });
}

export function masterAttachmentStatusFromError(message: string) {
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
