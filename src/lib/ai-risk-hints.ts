import {
  findReleasedFilenameConflicts,
  listItemRevisionHistory,
  listWhereUsed
} from "@/lib/db";
import type { AiRiskHint, AiRiskReport, AiSubmissionSummarySource, FileRole, SubmissionDetail } from "@/lib/types";

const requiredHandoffRoles: FileRole[] = ["pdf", "dwg"];

export function buildAiRiskReport(input: { submission: SubmissionDetail; submittedBy?: string }): AiRiskReport {
  const { submission, submittedBy } = input;
  const risks: AiRiskHint[] = [];
  const fileRoles = new Set(submission.files.map((file) => file.file_role));
  const missingRoles = requiredHandoffRoles.filter((role) => !fileRoles.has(role));

  if (missingRoles.length > 0) {
    risks.push({
      code: "missing_handoff_file",
      severity: "warning",
      title: "缺少製造交接檔案",
      message: `缺少 ${missingRoles.map((role) => role.toUpperCase()).join(", ")}，發布前可能無法完整交接製造或採購。`,
      action: "補上 PDF/DWG 或在審核問題清單要求送審者補件。",
      sources: [
        submissionSource(submission),
        ...submission.files.map((file) => ({
          type: "file" as const,
          label: file.original_filename,
          detail: file.file_role.toUpperCase()
        }))
      ]
    });
  }

  const newerRevisions = listItemRevisionHistory({ partNumber: submission.part_number, submittedBy }).filter(
    (revision) =>
      revision.submission_id !== submission.id &&
      new Date(revision.created_at).getTime() > new Date(submission.created_at).getTime()
  );

  if (newerRevisions.length > 0) {
    risks.push({
      code: "newer_revision_exists",
      severity: "warning",
      title: "同料號已有較新送審版次",
      message: `${submission.part_number} 在此筆之後已有 ${newerRevisions.length} 筆可見 revision。`,
      action: "確認目前審核的 submission 是否仍是要發布的版本。",
      sources: newerRevisions.slice(0, 5).map((revision) => ({
        type: "revision" as const,
        label: `${revision.drawing_number} Rev ${revision.revision}`,
        detail: `${revision.status} ${revision.submission_id}`
      }))
    });
  }

  const whereUsed = listWhereUsed({ partNumber: submission.part_number, submittedBy });
  if (whereUsed.length >= 2) {
    risks.push({
      code: "where_used_impact",
      severity: "warning",
      title: "多個上層組立使用此料號",
      message: `${submission.part_number} 目前被 ${whereUsed.length} 個可見上層 BOM 使用。`,
      action: "審核前確認變更是否影響所有上層組立、圖面與 release package。",
      sources: whereUsed.slice(0, 5).map((entry) => ({
        type: "where_used" as const,
        label: entry.parent_submission_id,
        detail: `${entry.parent_part_number} Rev ${entry.parent_revision} qty ${entry.quantity}`
      }))
    });
  }

  const missingFieldNames = [
    ["product_line", submission.product_line],
    ["customer", submission.customer],
    ["project_code", submission.project_code],
    ["process_name", submission.process_name],
    ["machine", submission.machine],
    ["material", submission.material],
    ["surface_finish", submission.surface_finish]
  ].filter(([, value]) => !String(value ?? "").trim());

  if (missingFieldNames.length > 0) {
    risks.push({
      code: "submission_required_fields_missing",
      severity: "warning",
      title: "送審欄位缺漏",
      message: `${submission.drawing_number} 缺少 ${missingFieldNames.map(([name]) => name).join(", ")}，後續搜尋、採購或製造交接可能無法完整追溯。`,
      action: "送審前補齊欄位；若欄位不適用，應於變更說明或審核留言中明確註記。",
      sources: [submissionSource(submission)]
    });
  }

  const bomLines = submission.bom?.lines ?? [];
  if (bomLines.length > 0) {
    const missingChildren = bomLines.filter((line) => !line.child_submission_id);
    if (missingChildren.length > 0) {
      risks.push({
        code: "bom_child_missing",
        severity: "critical",
        title: "BOM 含缺圖或缺件",
        message: `${submission.drawing_number} BOM 有 ${missingChildren.length} 個子件找不到對應 submission。`,
        action: "建立缺漏子件圖面/料號資料，或修正 BOM 來源中的子件料號與版次。",
        sources: missingChildren.slice(0, 6).map(bomLineSource)
      });
    }

    const notReleasedChildren = bomLines.filter((line) => line.child_submission_id && line.child_status !== "Released");
    if (notReleasedChildren.length > 0) {
      risks.push({
        code: "bom_child_not_released",
        severity: "warning",
        title: "BOM 含未 Released 子件",
        message: `${submission.drawing_number} BOM 有 ${notReleasedChildren.length} 個子件尚未 Released。`,
        action: "確認是否需先完成子件審核發布，或於審核中記錄接受未發布子件的原因。",
        sources: notReleasedChildren.slice(0, 6).map(bomLineSource)
      });
    }

    const outdatedChildren = bomLines.filter(
      (line) =>
        line.child_submission_id &&
        line.child_latest_released_revision &&
        line.child_submission_revision &&
        line.child_latest_released_revision !== line.child_submission_revision
    );
    if (outdatedChildren.length > 0) {
      risks.push({
        code: "bom_child_outdated",
        severity: "warning",
        title: "BOM 含舊版子件",
        message: `${submission.drawing_number} BOM 有 ${outdatedChildren.length} 個子件不是最新 Released 版次。`,
        action: "確認 parent 是否需更新到最新子件版次；若維持舊版，需保留設計決策依據。",
        sources: outdatedChildren.slice(0, 6).map(bomLineSource)
      });
    }

    const childCounts = new Map<string, number>();
    for (const line of bomLines) {
      const key = line.child_part_number.trim().toUpperCase();
      childCounts.set(key, (childCounts.get(key) ?? 0) + 1);
    }
    const duplicateChildren = bomLines.filter((line) => (childCounts.get(line.child_part_number.trim().toUpperCase()) ?? 0) > 1);
    if (duplicateChildren.length > 0) {
      risks.push({
        code: "bom_duplicate_child_part",
        severity: "warning",
        title: "BOM 含重複子件料號",
        message: `${submission.drawing_number} BOM 有 ${new Set(duplicateChildren.map((line) => line.child_part_number.toUpperCase())).size} 個子件料號重複出現。`,
        action: "確認重複料號是否為不同裝配位置的合法數量，或合併/修正 BOM 行。",
        sources: duplicateChildren.slice(0, 6).map(bomLineSource)
      });
    }
  }

  const filenameConflicts = findReleasedFilenameConflicts({
    submissionId: submission.id,
    files: submission.files.map((file) => ({
      file_role: file.file_role,
      original_filename: file.original_filename,
      sha256: file.sha256
    }))
  });

  if (filenameConflicts.length > 0) {
    risks.push({
      code: "released_filename_conflict",
      severity: "critical",
      title: "Released 同名檔案衝突",
      message: `${filenameConflicts.length} 個檔名已存在於 Released submission，核准發布會被阻擋。`,
      action: "發布前更正檔名或確認是否應提高 revision 後重新匯出。",
      sources: filenameConflicts.map((conflict) => ({
        type: "file" as const,
        label: conflict.original_filename,
        detail: `${conflict.drawing_number} Rev ${conflict.revision} ${conflict.submission_id}`
      }))
    });
  }

  return {
    submission_id: submission.id,
    generated_at: new Date().toISOString(),
    risk_count: risks.length,
    risks
  };
}

function submissionSource(submission: SubmissionDetail): AiSubmissionSummarySource {
  return {
    type: "submission",
    label: submission.id,
    detail: `${submission.drawing_number} Rev ${submission.revision} - ${submission.part_name}`
  };
}

function bomLineSource(line: NonNullable<SubmissionDetail["bom"]>["lines"][number]): AiSubmissionSummarySource {
  return {
    type: "bom",
    label: line.child_part_number,
    detail: `line ${line.line_no} rev ${line.child_revision ?? "-"} qty ${line.quantity} status ${line.child_status ?? "missing"} latest ${
      line.child_latest_released_revision ?? "-"
    }`
  };
}
