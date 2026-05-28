import {
  findPreviousBomSubmissionId,
  getBomDiffBetweenSubmissions,
  listItemRevisionHistory,
  listWhereUsed
} from "@/lib/db";
import type { AiSubmissionSummary, AiSubmissionSummarySection, AiSubmissionSummarySource, FileRole, SubmissionDetail } from "@/lib/types";

const requiredHandoffRoles: FileRole[] = ["pdf", "dwg"];

export function buildAiSubmissionSummary(input: { submission: SubmissionDetail; submittedBy?: string }): AiSubmissionSummary {
  const { submission, submittedBy } = input;
  const fileRoles = new Set(submission.files.map((file) => file.file_role));
  const missingFileRoles = requiredHandoffRoles.filter((role) => !fileRoles.has(role));
  const revisions = listItemRevisionHistory({ partNumber: submission.part_number, submittedBy });
  const previousBomSubmissionId = findPreviousBomSubmissionId(submission.id);
  const bomDiff = previousBomSubmissionId
    ? getBomDiffBetweenSubmissions({ baseSubmissionId: previousBomSubmissionId, targetSubmissionId: submission.id })
    : null;
  const whereUsed = listWhereUsed({ partNumber: submission.part_number, submittedBy });

  const sources: AiSubmissionSummarySource[] = [
    {
      type: "submission",
      label: submission.id,
      detail: `${submission.drawing_number} Rev ${submission.revision} - ${submission.part_name}`
    },
    ...submission.files.map((file) => ({
      type: "file" as const,
      label: file.original_filename,
      detail: `${file.file_role.toUpperCase()} ${file.sha256}`
    })),
    ...revisions.slice(0, 5).map((revision) => ({
      type: "revision" as const,
      label: `${revision.drawing_number} Rev ${revision.revision}`,
      detail: `${revision.status} ${revision.submission_id}`
    }))
  ];

  if (bomDiff) {
    sources.push({
      type: "bom",
      label: "BOM 差異",
      detail: `${bomDiff.base_submission_id} 版次 ${bomDiff.base_revision} -> ${bomDiff.target_submission_id} 版次 ${bomDiff.target_revision}`
    });
  } else {
    sources.push({
      type: "bom",
      label: "BOM 差異",
      detail: previousBomSubmissionId ? "無法取得 BOM 差異" : "沒有前一版 BOM"
    });
  }

  sources.push(
    ...whereUsed.slice(0, 5).map((entry) => ({
      type: "where_used" as const,
      label: entry.parent_submission_id,
      detail: `${entry.parent_part_number} 版次 ${entry.parent_revision} 使用 ${entry.child_part_number}，數量 ${entry.quantity}`
    }))
  );

  if (whereUsed.length === 0) {
    sources.push({
      type: "where_used",
      label: "使用處",
      detail: "沒有上層 BOM 使用紀錄"
    });
  }

  const sections: AiSubmissionSummarySection[] = [
    {
      key: "change_reason",
      title: "變更原因",
      body: submission.change_description || "未填寫變更原因。",
      facts: [
        `圖號 ${submission.drawing_number}`,
        `料號 ${submission.part_number}`,
        `版次 ${submission.revision}`,
        `狀態 ${submission.status}`
      ],
      severity: "info"
    },
    {
      key: "files",
      title: "檔案清單",
      body: `本次送審包含 ${submission.files.length} 個檔案。`,
      facts:
        submission.files.length > 0
          ? submission.files.map((file) => `${file.file_role.toUpperCase()} ${file.original_filename}`)
          : ["沒有檔案"],
      severity: submission.files.length > 0 ? "info" : "critical"
    },
    {
      key: "revision_history",
      title: "歷史 revision",
      body: `此料號可見 ${revisions.length} 筆 revision 紀錄。`,
      facts:
        revisions.length > 0
          ? revisions.slice(0, 6).map((revision) => `Rev ${revision.revision} ${revision.status} ${revision.submission_id}`)
          : ["沒有可見 revision 紀錄"],
      severity: "info"
    },
    {
      key: "bom_diff",
      title: "BOM diff",
      body: bomDiff
        ? `相對 Rev ${bomDiff.base_revision}：新增 ${bomDiff.added_count}、移除 ${bomDiff.removed_count}、變更 ${bomDiff.changed_count}、未變 ${bomDiff.unchanged_count}。`
        : "目前沒有可比較的前版 BOM。",
      facts: bomDiff
        ? bomDiff.lines
            .filter((line) => line.change_type !== "unchanged")
            .slice(0, 6)
            .map((line) => `${line.change_type} ${line.child_part_number} qty ${line.from_quantity ?? "-"} -> ${line.to_quantity ?? "-"}`)
        : ["沒有前版 BOM diff"],
      severity: bomDiff && (bomDiff.added_count > 0 || bomDiff.removed_count > 0 || bomDiff.changed_count > 0) ? "warning" : "info"
    },
    {
      key: "where_used",
      title: "Where-used 影響",
      body: `目前有 ${whereUsed.length} 個上層 BOM 使用此料號。`,
      facts:
        whereUsed.length > 0
          ? whereUsed.slice(0, 6).map((entry) => `${entry.parent_part_number} Rev ${entry.parent_revision} qty ${entry.quantity}`)
          : ["沒有上層 BOM 使用紀錄"],
      severity: whereUsed.length > 0 ? "warning" : "info"
    },
    {
      key: "missing_files",
      title: "缺漏檔案",
      body:
        missingFileRoles.length > 0
          ? `缺少製造交接常用檔案：${missingFileRoles.map((role) => role.toUpperCase()).join(", ")}。`
          : "PDF/DWG 交接檔案已存在。",
      facts:
        missingFileRoles.length > 0
          ? missingFileRoles.map((role) => `Missing ${role.toUpperCase()}`)
          : ["PDF present", "DWG present"],
      severity: missingFileRoles.length > 0 ? "warning" : "info"
    }
  ];

  return {
    submission_id: submission.id,
    title: `${submission.drawing_number} Rev ${submission.revision} AI 送審摘要`,
    generated_at: new Date().toISOString(),
    sections,
    missing_file_roles: missingFileRoles,
    source_count: sources.length,
    sources
  };
}
