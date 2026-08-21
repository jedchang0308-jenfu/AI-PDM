"use client";

import type { ReactNode } from "react";
import { DrawingDetailSummary } from "@/components/drawing-detail-content";

export type NumberingSubmissionResultFile = {
  id: string;
  sourceFileAssetId?: string | null;
  role: string;
  displayName: string;
  description?: string | null;
  isPrimary: boolean;
  publicationEvidenceId?: string | null;
  removedAt?: string | null;
};

export type NumberingSubmissionResultCandidate = {
  id: string;
  drawingCode: string | null;
  revision: string;
  files: NumberingSubmissionResultFile[];
};

export function numberingSubmissionFileRoleLabel(role: string) {
  return ({
    cad_3d: "3D 模型",
    drawing_2d: "2D 圖面",
    pdf: "PDF",
    dwg_dxf: "DWG／DXF",
    intermediate: "中間檔",
    other: "附件"
  } as Record<string, string>)[role] ?? "附件";
}

function fileStatusLabel(file: NumberingSubmissionResultFile) {
  const kind = file.isPrimary ? "主要受控檔" : "受控附件";
  const verification = file.publicationEvidenceId ? "已完成驗證" : "需要先驗證，才能送審";
  return `${kind} · ${verification}`;
}

export function NumberingSubmissionResult({
  candidates,
  mode,
  requestId,
  heading = "建立結果",
  subtitle,
  facts = [],
  showCandidates = true,
  showHeader = true,
  renderFileActions
}: {
  candidates?: NumberingSubmissionResultCandidate[];
  mode: "author" | "reviewer";
  requestId?: string | null;
  heading?: string;
  subtitle?: string;
  facts?: Array<{ label: string; value: ReactNode }>;
  showCandidates?: boolean;
  showHeader?: boolean;
  renderFileActions?: (candidate: NumberingSubmissionResultCandidate, file: NumberingSubmissionResultFile) => ReactNode;
}) {
  const resultCandidates = candidates ?? [];
  return (
    <section className={`numbering-submission-result numbering-submission-result-${mode}`} data-submission-result-mode={mode}>
      {showHeader || facts.length > 0 ? (
        <DrawingDetailSummary
          heading={showHeader ? heading : undefined}
          subtitle={showHeader ? subtitle : undefined}
          facts={facts}
          dataMode={mode}
        />
      ) : null}
      {showCandidates ? <div className="numbering-submission-result-candidates">
        {resultCandidates.length > 0 ? resultCandidates.map((candidate, index) => (
          <article className="numbering-submission-result-card" key={candidate.id || `candidate-${index}`}>
            <div className="numbering-submission-result-card-heading">
              <div>
                <span>圖面</span>
                <strong>{candidate.drawingCode || "尚未產生圖號"}</strong>
              </div>
              <span className="numbering-submission-result-revision">版次 {candidate.revision || "0.1"}</span>
            </div>
            <NumberingSubmissionResultFileList
              candidate={candidate}
              files={candidate.files.filter((file) => !file.removedAt)}
              mode={mode}
              requestId={requestId}
              renderFileActions={renderFileActions}
            />
          </article>
        )) : <span className="approval-muted">尚未建立首版結果</span>}
      </div> : null}
    </section>
  );
}

export function NumberingSubmissionResultFileList({
  candidate,
  files,
  mode,
  requestId,
  renderFileActions,
  showFileMeta = true
}: {
  candidate: NumberingSubmissionResultCandidate;
  files: NumberingSubmissionResultFile[];
  mode: "author" | "reviewer";
  requestId?: string | null;
  renderFileActions?: (candidate: NumberingSubmissionResultCandidate, file: NumberingSubmissionResultFile) => ReactNode;
  showFileMeta?: boolean;
}) {
  if (files.length === 0) return <p className="numbering-submission-result-missing">尚未加入受控檔案。</p>;
  return (
    <ul className="numbering-submission-result-file-list">
      {files.map((file) => (
        <li className="numbering-submission-result-file" key={file.id}>
          <div className="numbering-submission-result-file-copy">
            <strong className="numbering-submission-result-file-name">{file.displayName || "未命名附件"}</strong>
            {showFileMeta ? <span className="numbering-submission-result-file-meta">
              {numberingSubmissionFileRoleLabel(file.role)} · {fileStatusLabel(file)}
            </span> : null}
            {file.description ? <small>{file.description}</small> : null}
          </div>
          <div className="numbering-submission-result-file-actions">
            {mode === "reviewer" && requestId && file.sourceFileAssetId ? (
              <>
                <a
                  className="numbering-submission-result-link"
                  href={`/api/approvals/requests/${encodeURIComponent(requestId)}/evidence/${encodeURIComponent(file.sourceFileAssetId)}?preview=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  預覽
                </a>
                <a
                  className="numbering-submission-result-link"
                  href={`/api/approvals/requests/${encodeURIComponent(requestId)}/evidence/${encodeURIComponent(file.sourceFileAssetId)}?download=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  下載
                </a>
              </>
            ) : null}
            {mode === "author" && renderFileActions ? renderFileActions(candidate, file) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
