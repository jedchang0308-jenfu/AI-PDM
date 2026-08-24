import { NextResponse } from "next/server";
import type { NumberingGuardResult } from "@/lib/numbering-permission-guard";
import { PdmChangeControlError, type PdmChangeControlActorContext } from "@/lib/pdm-change-control";
import { ReplacementAttachmentSnapshotError } from "@/lib/replacement-part-attachments";

export function buildPdmChangeControlActor(auth: NumberingGuardResult, companyId: string): PdmChangeControlActorContext {
  const roleCodes = [auth.permission?.roleCode ?? "", ...(auth.permission?.evaluatedRoles ?? [])].filter(Boolean);
  return {
    userId: auth.user.id,
    companyId,
    role: auth.user.role,
    roleCodes: [...new Set(roleCodes)]
  };
}

export function pdmChangeControlErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof ReplacementAttachmentSnapshotError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status }
    );
  }
  if (error instanceof PdmChangeControlError) {
    return NextResponse.json(
      {
        error: error.code,
        message: error.message,
        details: error.details
      },
      { status: statusForPdmChangeControlError(error.code) }
    );
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return NextResponse.json({ error: message }, { status: 400 });
}

function statusForPdmChangeControlError(code: string) {
  if (code === "SOURCE_ATTACHMENTS_STALE" || code.endsWith("_CONFLICT") || code.endsWith("_MISMATCH")) return 409;
  if (code.includes("not_found")) return 404;
  if (code.includes("forbidden")) return 403;
  if (code.includes("optimistic_lock_conflict")) return 409;
  if (code.includes("already") || code.includes("controlled_boundary") || code.includes("not_") || code.includes("reused")) return 409;
  return 400;
}
