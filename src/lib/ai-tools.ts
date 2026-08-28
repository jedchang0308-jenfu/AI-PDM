import { getDashboardMetrics, getSubmission, listSubmissions, type DbUser } from "@/lib/db";
import { canReadSubmission, scopedSubmittedBy } from "@/lib/permissions";
import { searchPdmPolicy } from "@/lib/pdm-policy-rag";

export const AI_TOOL_WHITELIST = [
  "list_pending_reviews",
  "get_dashboard_metrics",
  "get_submission_detail",
  "explain_policy"
] as const;

export type AiToolName = (typeof AI_TOOL_WHITELIST)[number];

export function isAllowedAiToolName(value: string): value is AiToolName {
  return AI_TOOL_WHITELIST.includes(value as AiToolName);
}

export function parseExplicitToolRequest(message: string) {
  return message.match(/\btool\s*:\s*([a-z_]+)/i)?.[1]?.toLowerCase() ?? null;
}

export type AiSource = {
  type: "submission" | "metric" | "policy" | "file";
  label: string;
  detail: string;
};

export type AiToolResult = {
  text: string;
  sources: AiSource[];
};

const statusLabels = {
  Pending: "審核中",
  Releasing: "發行中",
  Released: "已發布",
  Obsolete: "已廢止",
  Rejected: "已駁回",
  ReleaseFailed: "發行未完成",
  Cancelled: "已取消"
} as const;

export function executeAiTool(input: {
  toolName: AiToolName;
  user: DbUser;
  currentSubmissionId?: string;
  query?: string;
}): AiToolResult {
  const submittedBy = scopedSubmittedBy(input.user);

  if (input.toolName === "list_pending_reviews") {
    const pending = listSubmissions("Pending", submittedBy);
    if (pending.length === 0) {
      return {
        text: "目前沒有這位使用者可查看的審核中送審資料。",
        sources: [
          {
            type: "metric",
            label: "審核中送審資料",
            detail: "依使用者權限查詢後共 0 筆"
          }
        ]
      };
    }

    const rows = pending.slice(0, 10);
    return {
      text: rows
        .map((row) => `${row.id}：${row.drawing_number} 版次 ${row.revision}，${row.part_name}，${row.change_description}`)
        .join("\n"),
      sources: rows.map((row) => ({
        type: "submission",
        label: row.id,
        detail: `${row.drawing_number} 版次 ${row.revision} - ${row.part_name}`
      }))
    };
  }

  if (input.toolName === "get_dashboard_metrics") {
    const metrics = getDashboardMetrics(submittedBy);
    return {
      text: `審核中 ${metrics.pending}，已發布 ${metrics.released}，已駁回 ${metrics.rejected}，發行未完成 ${metrics.failed}`,
      sources: [
        {
          type: "metric",
          label: "工作台統計",
          detail: `審核中 ${metrics.pending}，已發布 ${metrics.released}，已駁回 ${metrics.rejected}，發行未完成 ${metrics.failed}`
        }
      ]
    };
  }

  if (input.toolName === "get_submission_detail") {
    if (!input.currentSubmissionId) {
      return {
        text: "目前沒有可用的送審上下文。",
        sources: []
      };
    }
    const submission = getSubmission(input.currentSubmissionId);
    if (!submission || !canReadSubmission(input.user, submission)) {
      return {
        text: "這位使用者無法查看此送審資料。",
        sources: []
      };
    }
    const fileRoles = new Set(submission.files.map((file) => file.file_role));
    const missingHandoffFiles = [
      fileRoles.has("pdf") ? null : "缺 PDF",
      fileRoles.has("dwg") ? null : "缺 DWG"
    ].filter((value): value is string => Boolean(value));
    const impactLines = [
      missingHandoffFiles.length > 0 ? `缺漏檔案提示：${missingHandoffFiles.join("、")}` : "缺漏檔案提示：PDF/DWG 皆已提供"
    ];

    return {
      text: [
        `送審 ${submission.id}`,
        `圖號 ${submission.drawing_number} 版次 ${submission.revision}`,
        `料號 ${submission.part_number}：${submission.part_name}`,
        `狀態 ${statusLabels[submission.status] ?? submission.status}`,
        `變更原因 ${submission.change_description}`,
        `檔案 ${submission.files.length} 個`,
        ...impactLines
      ].join("\n"),
      sources: [
        {
          type: "submission",
          label: submission.id,
          detail: `${submission.drawing_number} 版次 ${submission.revision} - ${submission.part_name}`
        },
        ...submission.files.map((file) => ({
          type: "file" as const,
          label: file.original_filename,
          detail: `${file.file_role.toUpperCase()} ${file.local_path}`
        }))
      ]
    };
  }

  const result = searchPdmPolicy(input.query ?? "");
  return { text: result.answer, sources: result.sources };
}
