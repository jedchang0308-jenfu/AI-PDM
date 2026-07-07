"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, FileText, RefreshCcw, ShieldAlert } from "lucide-react";
import { NextStepState } from "@/components/next-step-state";
import { StatusBadge } from "@/components/status-help-popover";
import { revisionPackageRoleLabel } from "@/lib/revision-package";
import { formatStatusErrorForUser, formatStatusForUser } from "@/lib/status-display";
import type { SubmissionDetail } from "@/lib/types";

type CurrentUser = {
  id: string;
  role: string;
};

type PageState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | { status: "restricted"; summary: RestrictedSubmissionSummary; message: string }
  | { status: "ready"; submission: SubmissionDetail };

type RestrictedSubmissionSummary = {
  id: string;
  drawing_number: string;
  part_number: string;
  part_name: string;
  revision: string;
  status: string;
  submitted_by_name: string;
  created_at: string;
  updated_at: string;
  file_count: number;
  file_roles: string[];
};

export default function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
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
          const summaryResponse = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/recovery-summary`);
          const summaryBody = await summaryResponse.json().catch(() => ({}));
          if (summaryResponse.status === 401) {
            setState({ status: "unauthorized" });
            return;
          }
          if (summaryResponse.status === 404) {
            setState({ status: "not_found" });
            return;
          }
          if (summaryResponse.ok && summaryBody.summary) {
            setState({
              status: "restricted",
              summary: summaryBody.summary,
              message:
                summaryBody.message ??
                "你可以查看同公司既有送審摘要；完整附件與審核內容需由送審建立者、主管或管理員查看。"
            });
            return;
          }
          setState({ status: "error", message: "你沒有權限查看這筆送審資料，請改由送審建立者、主管或管理員處理。" });
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
        setState({ status: "ready", submission: body.submission });
      })
      .catch((error) => setState({ status: "error", message: humanSubmissionLoadError(error instanceof Error ? error.message : error) }));
  }, [submissionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.user) return null;
        return body.user as CurrentUser;
      })
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null));
  }, []);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>送審明細</h1>
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
            body={`現在請回送審來源或圖料模組重新開啟既有送審。若清單也找不到 ${submissionId}，請 Admin 協助確認。`}
            actions={[
              { href: "/numbering/search", label: "回圖料模組", variant: "primary" },
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
            body={`${state.message} 現在請重新整理；若仍失敗，回圖料模組重新開啟來源紀錄，或請主管 / Admin 協助確認。`}
            actions={[
              { href: `/submissions/${encodeURIComponent(submissionId)}`, label: "重新整理", variant: "primary" },
              { href: "/numbering/search", label: "回圖料模組" }
            ]}
          />
        </section>
      ) : null}

      {state.status === "restricted" ? <RestrictedSubmissionView summary={state.summary} message={state.message} /> : null}

      {state.status === "ready" ? <SubmissionDetailView submission={state.submission} currentUser={currentUser} onReload={load} /> : null}
    </>
  );
}

function RestrictedSubmissionView({ summary, message }: { summary: RestrictedSubmissionSummary; message: string }) {
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>
            {summary.drawing_number}
            <StatusBadge status={summary.status} context="submission" />
          </h2>
          <span className="metadata-badge">送審 ID {summary.id}</span>
        </div>

        <div className="upload-message error" style={{ alignItems: "flex-start" }}>
          <ShieldAlert size={16} aria-hidden="true" />
          <div>
            <p>只能查看受限摘要</p>
            <p>{message} 現在請由送審建立者、主管或 Admin 處理完整明細。</p>
          </div>
        </div>

        <div className="handoff-grid">
          <Info label="圖號" value={summary.drawing_number} />
          <Info label="主料號" value={summary.part_number || "未填"} />
          <Info label="品名" value={summary.part_name || "未填"} />
          <Info label="版次" value={summary.revision} />
          <Info label="建立者" value={summary.submitted_by_name || "未記錄"} />
          <Info label="建立時間" value={new Date(summary.created_at).toLocaleString()} />
        </div>
      </section>

      <section className="panel">
        <NextStepState
          compact
          eyebrow="權限受限"
          title="你目前不用在這裡處理完整送審"
          body="若你只是確認來源，這份摘要已足夠。若要審核、重新發行或取消送審，請交由送審建立者、R&D Manager 或 Admin 開啟完整明細。"
          actions={[
            { href: "/numbering/search", label: "回圖料模組", variant: "primary" },
            { href: "/", label: "回工作台" }
          ]}
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>附件摘要</h2>
          <span className="metadata-badge">{summary.file_count} 個檔案</span>
        </div>
        <div className="metadata-list">
          <span className="metadata-pair">
            <span className="metadata-label">檔案角色</span>
            <span className="metadata-value">{summary.file_roles.length ? summary.file_roles.join(", ") : "未記錄"}</span>
          </span>
        </div>
      </section>
    </>
  );
}

function SubmissionDetailView({
  submission,
  currentUser,
  onReload
}: {
  submission: SubmissionDetail;
  currentUser: CurrentUser | null;
  onReload: () => void;
}) {
  const [busyAction, setBusyAction] = useState<"approve" | "cancel" | "retry" | "return" | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string; href?: string; label?: string } | null>(null);
  const canManageRelease = currentUser?.role === "R&D Manager" || currentUser?.role === "Admin";
  const canApprove = submission.status === "Pending" && canManageRelease;
  const canCancel = submission.status === "Pending" && (canManageRelease || currentUser?.id === submission.submitted_by);
  const isUnresolvedReleaseIncomplete =
    submission.status === "ReleaseFailed" && !submission.resolved_by_submission_id && !submission.resolved_at;
  const workbenchHref = `/drawings/${encodeURIComponent(submission.drawing_number)}/submission-workbench`;
  const revisionPackageWarnings = submission.revision_package?.warnings ?? [];

  async function runSubmissionAction(
    action: "approve" | "cancel" | "retry" | "return",
    endpoint: string,
    body?: Record<string, unknown>
  ) {
    setBusyAction(action);
    setActionMessage(null);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    setBusyAction(null);
    if (!response.ok) {
      setActionMessage({ type: "error", text: humanSubmissionActionError(payload.message ?? payload.error) });
      return;
    }
    if (action === "return" && payload.submissionId) {
      setActionMessage({
        type: "success",
        text: payload.message ?? "已建立退回修正送審。",
        href: `/submissions/${encodeURIComponent(payload.submissionId)}`,
        label: "查看新送審"
      });
      onReload();
      return;
    }
    setActionMessage({ type: "success", text: payload.message ?? (action === "approve" ? "已核准並發布。" : "操作完成。") });
    onReload();
  }

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>
            {submission.drawing_number}
            <StatusBadge status={submission.status} context="submission" />
          </h2>
          <span className="metadata-badge">送審 ID {submission.id}</span>
        </div>

        <div className="handoff-grid">
          <Info label="圖號" value={submission.drawing_number} />
          <Info label="主料號" value={submission.part_number} />
          <Info label="品名" value={submission.part_name} />
          <Info label="版次" value={submission.revision} />
          <Info label="材質" value={submission.material || "未填"} />
          <Info label="表面處理" value={submission.surface_finish || "未填"} />
          <Info label="建立者" value={submission.submitted_by_name || submission.submitted_by} />
          <Info label="建立時間" value={new Date(submission.created_at).toLocaleString()} />
        </div>

        {revisionPackageWarnings.length > 0 ? <RevisionPackageReviewWarnings warnings={revisionPackageWarnings} /> : null}

        <div className="next-step-inline-actions">
          <Link className="secondary-button" href={workbenchHref}>
            返回送審工作台
          </Link>
          {canApprove ? (
            <button
              className="primary-button"
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runSubmissionAction("approve", `/api/submissions/${encodeURIComponent(submission.id)}/approve`, {
                  comment: "由送審明細核准發布。"
                })
              }
            >
              {busyAction === "approve" ? "核准中..." : "核准發布"}
            </button>
          ) : null}
          {canCancel ? (
            <button
              className="secondary-button"
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runSubmissionAction("cancel", `/api/submissions/${encodeURIComponent(submission.id)}/cancel`, {
                  reason: "由送審明細取消審核中送審。"
                })
              }
            >
              {busyAction === "cancel" ? "取消中..." : "取消送審"}
            </button>
          ) : null}
          {isUnresolvedReleaseIncomplete && canManageRelease ? (
            <>
              <button
                className="primary-button"
                type="button"
                disabled={busyAction !== null}
                onClick={() => runSubmissionAction("retry", `/api/submissions/${encodeURIComponent(submission.id)}/retry-release`)}
              >
                {busyAction === "retry" ? "重新發行中..." : "重新發行"}
              </button>
              <Link className="secondary-button" href={workbenchHref}>
                到工作台修正附件
              </Link>
            </>
          ) : null}
        </div>

        {submission.status === "Pending" && !canCancel ? (
          <div className="upload-message error">
            <ShieldAlert size={16} aria-hidden="true" />
            <p>這筆送審仍在審核中；若需要取消，請由送審建立者、主管或 Admin 處理。</p>
          </div>
        ) : null}

        {isUnresolvedReleaseIncomplete ? (
          <div className="upload-message error">
            <ShieldAlert size={16} aria-hidden="true" />
            <p>
              {canManageRelease
                ? "此圖號版次已通過審核，但尚未完成發行。若是暫時性發布失敗可重新發行；若是附件或檔名問題，請到工作台修正附件後建立新的送審。"
                : "此圖號版次已通過審核，但尚未完成發行，需要主管或 Admin 處理。"}
            </p>
          </div>
        ) : null}

        {submission.status === "ReleaseFailed" && (submission.resolved_by_submission_id || submission.resolved_at) ? (
          <div className="upload-message success">
            <p>這筆發行未完成已由後續送審處理完成，不會再阻擋同版次工作。</p>
          </div>
        ) : null}

        {actionMessage ? (
          <div className={actionMessage.type === "success" ? "upload-message success" : "upload-message error"}>
            <p>{actionMessage.text}</p>
            {actionMessage.href ? <Link href={actionMessage.href}>{actionMessage.label ?? "查看"}</Link> : null}
          </div>
        ) : null}

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
        <p>審核前請先確認版次檔案包。</p>
        <p>這些提醒不會阻擋核准；若檔案不足以審核，請駁回並請送審者補件。</p>
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
  if (!text) return "送審明細暫時無法讀取。請重新整理；若仍失敗，請回圖料模組重新開啟或請 Admin 協助確認。";
  if (text === "Insufficient role permission" || text === "FORBIDDEN") return "你沒有權限查看這筆送審資料。";
  if (text.includes("Internal Server Error")) return "送審明細暫時無法讀取。請重新整理；若仍失敗，請回圖料模組重新開啟或請 Admin 協助確認。";
  return formatStatusErrorForUser(text, "submission");
}

function humanSubmissionActionError(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "操作未完成。請重新整理後再試；若仍失敗，請主管或 Admin 協助確認。";
  if (text === "FORBIDDEN" || text === "Insufficient role permission") return "你目前不能執行這個動作，請由主管或 Admin 處理。";
  if (text.includes("DUPLICATE_RELEASE_FILENAME")) return "重新發行失敗：附件檔名已被其他正式紀錄使用。請到送審工作台移除錯誤附件或更換正確檔案後，再建立修正送審。";
  if (text.includes("RELEASE_NOT_CONFIGURED")) return "重新發行失敗：系統尚未完成正式發行設定。請通知 Admin 檢查發行設定後再處理。";
  if (text.includes("LOCAL_GDRIVE_RELEASE_FAILED")) return "重新發行失敗：檔案移到正式資料夾時失敗。請通知主管或 Admin 檢查發行資料夾與檔案權限。";
  if (text.includes("主資料狀態同步失敗")) return "發行已嘗試完成，但主資料狀態同步未完成。請主管或 Admin 檢查主資料同步後再交接。";
  if (text.includes("Internal Server Error")) return "操作未完成。請重新整理後再試；若仍失敗，請主管或 Admin 協助確認。";
  return formatStatusErrorForUser(text, "submission");
}
