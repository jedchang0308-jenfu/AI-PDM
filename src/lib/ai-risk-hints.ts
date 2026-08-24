import { findReleasedFilenameConflicts, listItemRevisionHistory } from "@/lib/db";
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
