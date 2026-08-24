import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { DbUser } from "@/lib/db";
import {
  resolveSharedBomCapabilityAsync,
  type SharedBomCapability,
  type SharedBomCapabilityResolution
} from "@/lib/bom-create-context";

type SharedBomResource = {
  draftId?: string;
  reviewId?: string;
  snapshotId?: string;
  definitionId?: string;
};

export async function authorizeSharedBomHttpAsync(input: SharedBomResource & {
  user: DbUser;
  capability: SharedBomCapability;
  exactParentPartNumberId?: string | null;
}): Promise<{ capability: SharedBomCapabilityResolution; response: Response | null }> {
  const capability = await resolveSharedBomCapabilityAsync(input);
  if (capability.authorized) return { capability, response: null };
  return {
    capability,
    response: capability.denial === "not_found"
      ? sharedBomHttpError("BOM_RESOURCE_NOT_FOUND", 404)
      : sharedBomHttpError("BOM_CAPABILITY_FORBIDDEN", 403)
  };
}

export function sharedBomHttpError(code: string, status: number, details: Record<string, unknown> = {}) {
  const messages: Record<string, string> = {
    BOM_RESOURCE_NOT_FOUND: "找不到指定的 BOM 資源",
    BOM_CAPABILITY_FORBIDDEN: "目前帳號沒有執行此 BOM 操作的權限",
    BOM_REVIEW_SELF_DECISION_FORBIDDEN: "送審者不可核准或退回自己的 BOM",
    BOM_SHARED_STRUCTURE_DISABLED: "共用 BOM 功能尚未啟用"
  };
  return NextResponse.json({
    error: code,
    message: messages[code] ?? "BOM 操作失敗",
    details,
    correlationId: crypto.randomUUID()
  }, { status });
}
