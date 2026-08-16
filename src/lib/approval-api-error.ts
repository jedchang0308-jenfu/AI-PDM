import crypto from "node:crypto";

const clientSafeApprovalCodes = new Set([
  "APPROVAL_REQUEST_NOT_FOUND",
  "APPROVAL_REQUEST_ALREADY_RESOLVED",
  "APPROVAL_REQUEST_NOT_READY",
  "APPROVAL_HANDLER_NOT_REGISTERED",
  "APPROVAL_ACTION_NOT_REGISTERED",
  "APPROVAL_TARGET_REQUIRED",
  "APPROVAL_REASON_REQUIRED",
  "APPROVAL_APPLY_UNSUPPORTED"
]);

function approvalErrorStatus(code: string) {
  if (code.includes("NOT_FOUND")) return 404;
  if (code.includes("ALREADY") || code.includes("NOT_READY")) return 409;
  if (code.includes("UNSUPPORTED") || code.includes("NOT_REGISTERED") || code.includes("REQUIRED")) return 400;
  return 500;
}

function normalizedApprovalCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code = message.split(":", 1)[0]?.trim() ?? "";
  return clientSafeApprovalCodes.has(code) ? code : "";
}

export function approvalApiErrorResponse(error: unknown, operation: "decision" | "apply", request: Request) {
  const code = normalizedApprovalCode(error);
  if (code) return Response.json({ error: code }, { status: approvalErrorStatus(code) });

  const correlationId = request.headers.get("x-correlation-id")?.trim() || crypto.randomUUID();
  console.error(`Approval ${operation} failed`, {
    correlationId,
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorMessage: error instanceof Error ? error.message : String(error)
  });
  return Response.json(
    { error: operation === "decision" ? "APPROVAL_DECISION_FAILED" : "APPROVAL_APPLY_FAILED", correlationId },
    { status: 500 }
  );
}
