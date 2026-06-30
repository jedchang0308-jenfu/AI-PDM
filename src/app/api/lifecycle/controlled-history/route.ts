import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { listObsoleteBomWorkbenchHistoryAsync } from "@/lib/bom-workbench-async";
import { requestedPdmCompanyCodeFromRequest, resolvePdmCompanyContextAsync } from "@/lib/company-context";
import { listNumberingApprovalBatchesAsync } from "@/lib/numbering-async";
import { scopedSubmittedBy } from "@/lib/permissions";
import type { BomWorkbenchObsoleteHistoryRecord } from "@/lib/repositories/bom-workbench-async-repository";
import type { NumberingApprovalReviewRequestRecord } from "@/lib/repositories/numbering-repository";
import { getSubmissionAsync, listSubmissionsAsync } from "@/lib/submissions-async";
import type { ControlledHistoryEntry, SubmissionLifecycleRequest, SubmissionSummary } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const companyResult = await resolvePdmCompanyContextAsync(auth.user, requestedPdmCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const limit = parsePageLimit(url.searchParams.get("limit"));
  const offset = parsePageOffset(url.searchParams.get("offset"));
  const sourceFetchLimit = limit + offset + 1;
  const submittedBy = scopedSubmittedBy(auth.user);
  const [submissionRows, numberingBatches, bomRows] = await Promise.all([
    listSubmissionsAsync({
      status: "Obsolete",
      submittedBy,
      companyId: companyResult.company.companyId,
      limit: sourceFetchLimit,
      offset: 0,
      includeHistory: true
    }),
    listNumberingApprovalBatchesAsync({
      companyId: companyResult.company.companyId,
      status: "approved",
      actionCodes: ["obsolete_part_number", "obsolete_ma_drawing"],
      limit: sourceFetchLimit
    }),
    listObsoleteBomWorkbenchHistoryAsync({
      companyId: companyResult.company.companyId,
      limit: sourceFetchLimit
    })
  ]);
  const details = await Promise.all(submissionRows.map((submission) => getSubmissionAsync(submission.id)));
  const detailById = new Map(
    details.filter((detail): detail is NonNullable<typeof detail> => Boolean(detail)).map((detail) => [detail.id, detail])
  );
  const submissionEntries = submissionRows.map((submission) =>
    buildSubmissionControlledHistoryEntry(submission, detailById.get(submission.id)?.lifecycle_requests ?? [])
  );
  const numberingEntries = numberingBatches.flatMap((batch) =>
    batch.items
      .map((item) => item.request)
      .filter((request) => request.requestStatus === "approved")
      .map(buildNumberingControlledHistoryEntry)
  );
  const bomEntries = bomRows.map(buildBomControlledHistoryEntry);
  const allEntries = [...submissionEntries, ...numberingEntries, ...bomEntries].sort(compareControlledHistoryEntries);
  const entries = allEntries.slice(offset, offset + limit);

  return NextResponse.json({
    pdmCompany: companyResult.company,
    entries,
    pagination: {
      limit,
      offset,
      count: entries.length,
      hasMore: allEntries.length > offset + limit,
      nextOffset: offset + entries.length
    }
  });
}

function buildSubmissionControlledHistoryEntry(
  submission: SubmissionSummary,
  lifecycleRequests: SubmissionLifecycleRequest[]
): ControlledHistoryEntry {
  const approvedRequest =
    lifecycleRequests.find((request) => request.action_code === "obsolete_submission" && request.request_status === "approved") ??
    lifecycleRequests.find((request) => request.action_code === "obsolete_submission");
  const historyAt = submission.obsolete_at ?? approvedRequest?.decided_at ?? submission.released_at ?? submission.updated_at;

  return {
    id: `submission:${submission.id}`,
    entity_type: "submission",
    target_id: submission.id,
    display_code: submission.drawing_number,
    secondary_code: `${submission.part_number} / Rev ${submission.revision}`,
    title: submission.part_name,
    stage_label: "歷史",
    result_label: "已作廢",
    traceability_class: "controlled_history",
    history_reason: approvedRequest?.reason ?? "此正式 submission 已作廢或已被正式生命週期取代。",
    requested_by_name: approvedRequest?.requested_by_name ?? null,
    reviewed_by_name: approvedRequest?.decided_by_name ?? null,
    requested_at: approvedRequest?.requested_at ?? null,
    decided_at: approvedRequest?.decided_at ?? null,
    history_at: historyAt,
    decision_reason: approvedRequest?.decision_reason ?? null,
    source_status: submission.status,
    release_package_available: Boolean(submission.has_release_package),
    actions: {
      delete: false,
      restore: false,
      obsolete: false
    }
  };
}

function buildNumberingControlledHistoryEntry(request: NumberingApprovalReviewRequestRecord): ControlledHistoryEntry {
  const approvedDecision = request.decisions.find((decision) => decision.decision === "approved");
  const entityType = request.actionCode === "obsolete_part_number" ? "numbering_part_number" : "numbering_drawing_number";
  const entityLabel = entityType === "numbering_part_number" ? "正式料號" : "正式圖號";
  const secondaryCode =
    entityType === "numbering_part_number"
      ? [request.entitySummary.rootCode, request.entitySummary.developmentPhase].filter(Boolean).join(" / ")
      : [request.entitySummary.partNumber, request.entitySummary.developmentPhase].filter(Boolean).join(" / ");

  return {
    id: `${entityType}:${request.entityId}`,
    entity_type: entityType,
    target_id: request.entityId,
    display_code: request.entitySummary.label,
    secondary_code: secondaryCode || entityLabel,
    title: request.entitySummary.secondary || request.entitySummary.coreName || entityLabel,
    stage_label: "歷史",
    result_label: "已作廢",
    traceability_class: "controlled_history",
    history_reason: request.reason || `此${entityLabel}已完成正式作廢審核。`,
    requested_by_name: request.requestedByName ?? null,
    reviewed_by_name: approvedDecision?.approverName ?? null,
    requested_at: request.requestedAt,
    decided_at: approvedDecision?.decidedAt ?? null,
    history_at: approvedDecision?.decidedAt ?? request.requestedAt,
    decision_reason: approvedDecision?.comment ?? null,
    source_status: request.entitySummary.recordStatus ?? "Obsolete",
    release_package_available: false,
    actions: {
      delete: false,
      restore: false,
      obsolete: false
    }
  };
}

function buildBomControlledHistoryEntry(row: BomWorkbenchObsoleteHistoryRecord): ControlledHistoryEntry {
  return {
    id: `bom_release:${row.bom_draft_id}`,
    entity_type: "bom_release",
    target_id: row.bom_draft_id,
    display_code: row.parent_part_number,
    secondary_code: `${row.parent_drawing_number} / Rev ${row.parent_revision}`,
    title: row.draft_name || `${row.parent_part_name} BOM`,
    stage_label: "歷史",
    result_label: "已作廢",
    traceability_class: "controlled_history",
    history_reason: row.change_reason ?? "此正式 BOM 已完成作廢審核。",
    requested_by_name: row.submitted_by_name,
    reviewed_by_name: row.reviewed_by_name,
    requested_at: row.submitted_at,
    decided_at: row.reviewed_at,
    history_at: row.obsolete_at ?? row.reviewed_at ?? row.released_at,
    decision_reason: row.decision_reason,
    source_status: row.draft_status,
    release_package_available: false,
    actions: {
      delete: false,
      restore: false,
      obsolete: false
    }
  };
}

function compareControlledHistoryEntries(left: ControlledHistoryEntry, right: ControlledHistoryEntry) {
  const leftTime = left.history_at ? Date.parse(left.history_at) : 0;
  const rightTime = right.history_at ? Date.parse(right.history_at) : 0;
  if (rightTime !== leftTime) return rightTime - leftTime;
  return left.id.localeCompare(right.id);
}

function parsePageLimit(value: string | null) {
  const parsed = Number(value ?? 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function parsePageOffset(value: string | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.trunc(parsed), 0);
}
