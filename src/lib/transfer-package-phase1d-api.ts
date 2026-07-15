import crypto from "node:crypto";
import { numberStateFlowJson } from "@/lib/number-state-flow-api";
import { TransferPackageError } from "@/lib/repositories/transfer-package-async-repository";

export function requiredTransferVersion(value: unknown) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw new TransferPackageError("TRANSFER_PACKAGE_VERSION_REQUIRED", "請重新整理技轉包後再操作。", 400);
  }
  return version;
}

export function transferPhase1dErrorResponse(error: unknown, operation: string) {
  if (error instanceof TransferPackageError) {
    return numberStateFlowJson({
      error: { code: error.code, message: error.message, retryable: error.status >= 500 }
    }, { status: error.status });
  }
  const correlationId = crypto.randomUUID();
  console.error("transfer_phase1d_operation_failed", {
    operation,
    correlationId,
    errorName: error instanceof Error ? error.name : "UnknownError"
  });
  return numberStateFlowJson({
    error: {
      code: "TRANSFER_INTERNAL",
      message: `技轉操作失敗，追蹤碼 ${correlationId}。`,
      retryable: false
    }
  }, { status: 500 });
}
