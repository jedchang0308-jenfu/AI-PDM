import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { listNotificationsAsync, summarizeNotifications } from "@/lib/notifications-async";
import { getStorageEvidenceDashboard } from "@/lib/storage-evidence-dashboard";
import type { NotificationItem } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const notifications = await listNotificationsAsync(auth.user);
  if (auth.user.role === "Admin" || auth.user.role === "R&D Manager") {
    notifications.push(await buildStorageEvidenceNotification());
    notifications.sort((left, right) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 } as const;
      const severityDiff = severityOrder[left.severity] - severityOrder[right.severity];
      if (severityDiff !== 0) return severityDiff;
      return right.created_at.localeCompare(left.created_at);
    });
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: summarizeNotifications(notifications),
    notifications
  });
}

async function buildStorageEvidenceNotification(): Promise<NotificationItem> {
  const dashboard = await getStorageEvidenceDashboard();
  const severity = dashboard.run?.severity === "critical" ? "critical" : dashboard.run?.severity === "warning" || !dashboard.source.available ? "warning" : "info";
  const status = dashboard.run?.status ?? "missing";
  const period = dashboard.run?.period ?? "not generated";
  const blockerCount = dashboard.readiness?.blockers.length ?? 0;
  const warningCount = dashboard.readiness?.warnings.length ?? 0;
  const governanceLabel = dashboard.governance?.label ?? "Evidence missing";

  return {
    id: `storage_evidence_alert:${dashboard.run?.runId ?? "missing"}`,
    kind: "storage_evidence_alert",
    severity,
    title: "Storage evidence status",
    message: `Storage monthly evidence ${period}: ${status}; governance ${governanceLabel}; blockers ${blockerCount}; warnings ${warningCount}.`,
    submission_id: null,
    drawing_number: null,
    revision: null,
    part_number: null,
    part_name: null,
    created_at: dashboard.run?.generatedAt ?? dashboard.generatedAt,
    action_url: "/api/storage/evidence"
  };
}
