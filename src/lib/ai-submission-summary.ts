import { listItemRevisionHistory } from "@/lib/db";
import type { AiSubmissionSummary, AiSubmissionSummarySection, AiSubmissionSummarySource, FileRole, SubmissionDetail } from "@/lib/types";

const requiredHandoffRoles: FileRole[] = ["pdf", "dwg"];

export function buildAiSubmissionSummary(input: { submission: SubmissionDetail; submittedBy?: string }): AiSubmissionSummary {
  const { submission, submittedBy } = input;
  const fileRoles = new Set(submission.files.map((file) => file.file_role));
  const missingFileRoles = requiredHandoffRoles.filter((role) => !fileRoles.has(role));
  const revisions = listItemRevisionHistory({ partNumber: submission.part_number, submittedBy });

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
