"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, FileText, RefreshCcw, ShieldAlert } from "lucide-react";
import { NextStepState } from "@/components/next-step-state";
import { StatusBadge, StatusScopeHelp } from "@/components/status-help-popover";
import { revisionPackageRoleLabel } from "@/lib/revision-package";
import { formatStatusErrorForUser, formatStatusForUser } from "@/lib/status-display";
import type { SubmissionDetail } from "@/lib/types";

type PageState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | { status: "ready"; submission: SubmissionDetail };


const submissionDetailStatusLabels: Record<string, string> = {
  ReviewApproved: "研發受控（已核准）",
  ReleaseFailed: "發行未完成",
  Cancelled: "已取消"
};

export default function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const { id } = use(params);
  const submissionId = decodeURIComponent(id);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch(`/api/submissions/${encodeURIComponent(submissionId)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (response.status === 401) {
          setState({ status: "unauthorized" });
          return;
        }
        if (response.status === 404) {
          setState({ status: "not_found" });
          return;
        }
        if (response.status === 403) {
          setState({ status: "error", message: "你沒有權限查看這筆歷史送審資料。" });
          return;
        }
        if (!response.ok) {
          setState({ status: "error", message: humanSubmissionLoadError(body.message ?? body.error) });
          return;
        }
        if (!body.submission) {
          setState({ status: "not_found" });
          return;
        }
        if (body.historicalReadOnly !== true) {
          setState({ status: "error", message: "歷史資料讀取契約無法驗證。" });
          return;
        }
        setState({ status: "ready", submission: body.submission });
      })
      .catch((error) => setState({ status: "error", message: humanSubmissionLoadError(error instanceof Error ? error.message : error) }));
  }, [submissionId]);

  useEffect(() => {
    load();
  }, [load]);



  return (
    <>
      <div className="topbar">
        <div>
          <h1>送審明細 <StatusScopeHelp scope="submissionDetail" /></h1>
          <p>{submissionId}</p>
        </div>
        <div className="actions">
          <Link className="secondary-button" href="/">
            回工作台
          </Link>
          <button className="secondary-button" type="button" onClick={load} disabled={state.status === "loading"}>
            <RefreshCcw size={16} aria-hidden="true" />
            重新整理
          </button>
        </div>
      </div>

      {state.status === "loading" ? (
        <section className="panel">
          <div className="empty">讀取送審資料...</div>
        </section>
      ) : null}

      {state.status === "unauthorized" ? (
        <section className="panel">
          <div className="empty">
            <ShieldAlert size={22} aria-hidden="true" />
            <h2>尚未登入</h2>
            <p>請先登入 AI PDM，再查看送審資料。</p>
            <div className="empty-actions">
              <Link className="primary-button" href="/login">
                登入
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {state.status === "not_found" ? (
        <section className="panel">
          <NextStepState
            eyebrow="重新定位"
            title="找不到這筆送審資料"
            body={`現在請回送審來源或編號搜尋重新開啟既有送審。若清單也找不到 ${submissionId}，請 Admin 協助確認。`}
            actions={[
              { href: "/numbering/drawings", label: "回圖號工作台", variant: "primary" },
              { href: "/", label: "回工作台" }
            ]}
          />
        </section>
      ) : null}

      {state.status === "error" ? (
        <section className="panel">
          <NextStepState
            eyebrow="重新嘗試"
            title="送審明細暫時無法讀取"
            body={`${state.message} 現在請重新整理；若仍失敗，回編號搜尋重新開啟來源紀錄，或請主管 / Admin 協助確認。`}
            actions={[
              { href: `/submissions/${encodeURIComponent(submissionId)}`, label: "重新整理", variant: "primary" },
              { href: "/numbering/search", label: "回編號搜尋" }
            ]}
          />
        </section>
      ) : null}

      {state.status === "ready" ? <SubmissionDetailView submission={state.submission} /> : null}
    </>
  );
}

function SubmissionDetailView({ submission }: { submission: SubmissionDetail }) {
  const packageReviewApproved = submission.revision_package?.effective_status === "ReviewApproved";
  const terminalLifecycleReadOnly = submission.release_actionability?.code.startsWith("SUBMISSION_RELEASE_TERMINAL_") ?? false;
  const workbenchHref = "/numbering/drawings?query=" + encodeURIComponent(submission.drawing_number);
  const revisionPackageWarnings = submission.revision_package?.warnings ?? [];

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>
            {submission.drawing_number}
            <StatusBadge status={terminalLifecycleReadOnly ? "Obsolete" : packageReviewApproved ? "ReviewApproved" : submission.status} context="submission" />
          </h2>
          <span className="metadata-badge">送審 ID {submission.id}</span>
        </div>
        <p>這是歷史送審紀錄，僅供檢視。請在現行工作台執行後續操作。</p>

        <div className="handoff-grid">
          <Info label="圖號" value={submission.drawing_number} />
          <Info
            label={submission.part_scopes.length > 1 ? `進版料號（${submission.part_scopes.length}）` : "主料號"}
            value={submission.part_scopes.length > 0 ? submission.part_scopes.map((part) => part.part_number).join("、") : submission.part_number}
          />
          <Info label="品名" value={submission.part_name} />
          <Info label="版次" value={submission.revision} />
          <Info
            label="狀態"
            value={
              packageReviewApproved
                ? terminalLifecycleReadOnly
                  ? `受控歷史（原狀態：${submissionDetailStatusLabels.ReviewApproved}）`
                  : submissionDetailStatusLabels.ReviewApproved
                : terminalLifecycleReadOnly
                  ? `受控歷史（原狀態：${submissionDetailStatusLabels[submission.status] ?? formatStatusForUser(submission.status, "submission")}）`
                : submissionDetailStatusLabels[submission.status] ?? formatStatusForUser(submission.status, "submission")
            }
          />
          <Info label="材質" value={submission.material || "未填"} />
          <Info label="表面處理" value={submission.surface_finish || "未填"} />
          <Info label="建立者" value={submission.submitted_by_name || submission.submitted_by} />
          <Info label="建立時間" value={new Date(submission.created_at).toLocaleString()} />
        </div>

        {packageReviewApproved ? (
          <div className="upload-message success">
            <p>影響審核已核准，這個小數研發版已進入研發受控；不需要再按「核准發布」，也不會成為量產正式版。</p>
            <Link href={workbenchHref}>查看圖面工作台</Link>
          </div>
        ) : null}

        {terminalLifecycleReadOnly ? (
          <div className="upload-message error">
            <ShieldAlert size={16} aria-hidden="true" />
            <p>{submission.release_actionability?.message}</p>
            <Link href={workbenchHref}>
              {submission.release_actionability?.code === "SUBMISSION_RELEASE_TERMINAL_SANDBOX" ? "返回來源圖面" : "返回圖料歷史"}
            </Link>
          </div>
        ) : null}

        {revisionPackageWarnings.length > 0 && !terminalLifecycleReadOnly ? <RevisionPackageReviewWarnings warnings={revisionPackageWarnings} /> : null}

        <div className="next-step-inline-actions">
          <Link className="secondary-button" href={workbenchHref}>
            回圖號工作台
          </Link>
          {(submission.status === "Released" || submission.status === "Obsolete") && submission.release_package ? (
            <a className="secondary-button" href={`/api/submissions/${encodeURIComponent(submission.id)}/release-package`}>
              下載發布包
            </a>
          ) : null}

        </div>

        <div className="handoff-note">
          <span className="section-label">送審備註 / 變更原因</span>
          <p>{submission.change_description || "未填"}</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>送審附件</h2>
          <span className="metadata-badge">{submission.files.length} 個檔案</span>
        </div>
        {submission.files.length === 0 ? (
          <div className="empty">此送審沒有附件。</div>
        ) : (
          <div className="file-list">
            {submission.files.map((file) => (
              <div className="file-item" key={file.id}>
                <strong className="file-title">
                  <FileText size={14} aria-hidden="true" />
                  <span className="file-kind-badge">{file.file_role.toUpperCase()}</span>
                  <span className="file-name">{file.original_filename}</span>
                </strong>
                <div className="metadata-list">
                  {revisionPackageFileForSubmissionFile(submission, file.id, file.original_filename) ? (
                    <span className="metadata-pair">
                      <span className="metadata-label">版次包類別</span>
                      <span className="metadata-value">
                        {revisionPackageRoleLabel(revisionPackageFileForSubmissionFile(submission, file.id, file.original_filename)?.role ?? "")}
                      </span>
                    </span>
                  ) : null}
                  <span className="metadata-pair">
                    <span className="metadata-label">大小</span>
                    <span className="metadata-value">{formatBytes(file.file_size)}</span>
                  </span>
                  <span className="metadata-pair">
                    <span className="metadata-label">Google Drive</span>
                    <span className="metadata-value">{formatStatusForUser(file.gdrive_status, "fileSync")}</span>
                  </span>
                </div>
                <div className="file-actions">
                  <a className="secondary-button" href={`/api/submissions/${submission.id}/files/${file.id}`}>
                    <Download size={14} aria-hidden="true" />
                    下載
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function RevisionPackageReviewWarnings({ warnings }: { warnings: NonNullable<SubmissionDetail["revision_package"]>["warnings"] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="upload-message warning" style={{ alignItems: "flex-start" }}>
      <AlertTriangle size={16} aria-hidden="true" />
      <div>
        <p>以下是這筆歷史送審留存的版次檔案提醒。</p>
        <ul>
          {warnings.map((warning) => (
            <li key={`${warning.code}-${warning.affectedFileIds?.join(",") ?? ""}`}>{warning.messageForReviewer}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function revisionPackageFileForSubmissionFile(submission: SubmissionDetail, fileId: string, filename: string) {
  return (
    submission.revision_package?.files.find((file) => file.submission_file_id === fileId) ??
    submission.revision_package?.files.find((file) => file.filename === filename) ??
    null
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function humanSubmissionLoadError(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "送審明細暫時無法讀取。請重新整理；若仍失敗，請回編號搜尋重新開啟或請 Admin 協助確認。";
  if (text === "Insufficient role permission" || text === "FORBIDDEN") return "你沒有權限查看這筆送審資料。";
  if (text.includes("Internal Server Error")) return "送審明細暫時無法讀取。請重新整理；若仍失敗，請回編號搜尋重新開啟或請 Admin 協助確認。";
  return formatStatusErrorForUser(text, "submission");
}
