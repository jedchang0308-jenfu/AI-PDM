import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { listApprovalPlatformInboxAsync } from "@/lib/approval-platform";
import type { ApprovalPlatformStatus } from "@/lib/repositories/approval-platform-async-repository";

export const runtime = "nodejs";
const reviewerRoles = ["R&D Manager", "Admin"] as const;

const allowedStatuses = new Set<string>([
  "active",
  "all",
  "pending",
  "approved",
  "rejected",
  "needs_info",
  "cancelled",
  "apply_failed",
  "applied"
]);

export async function GET(request: Request) {
  const auth = await requireRoleAsync(request, [...reviewerRoles]);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "active";
  const status = (allowedStatuses.has(statusParam) ? statusParam : "active") as
    | "active"
    | "all"
    | ApprovalPlatformStatus;
  const limitParam = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 100;
  const companyId = auth.user.company_id || undefined;
  const domainCode = url.searchParams.get("domain")?.trim() || undefined;
  const actionCode = url.searchParams.get("action")?.trim() || undefined;
  const items = await listApprovalPlatformInboxAsync({ companyId, actorId: auth.user.id, status, limit, domainCode, actionCode });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: items.length,
      pending: items.filter((item) => item.status === "pending").length,
      needsInfo: items.filter((item) => item.status === "needs_info").length,
      applyFailed: items.filter((item) => item.status === "apply_failed").length
    },
    items
  });
}
