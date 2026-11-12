"use client";

import { useEffect, useRef, useState } from "react";
import { LoadingIndicator } from "@/components/loading-indicator";
import { pdmPermissionFetch } from "@/lib/pdm-permission-client";
import { errorMessage, readJson } from "@/lib/pdm-workbench-response";

type DeletePreview = {
  rootCode: string;
  drawingNumbers: string[];
  partNumbers: string[];
  affectedFileAssets: number;
  fileNames: string[];
  affectedAuxiliaryJobs: number;
  affectedRecognitionSessions?: number;
  transferReferences: { packageCode: string; entityCode: string }[];
  fingerprint: string;
};
type DeleteResult = { rootCode: string; drawingNumbers: string[]; partNumbers: string[]; reusable: boolean };

export function DraftNumberingDeleteAction({ rootCode, onBeforeOpen, onDeleted }: {
  rootCode: string;
  onBeforeOpen: () => boolean;
  onDeleted: () => void;
}) {
  const endpoint = `/api/numbering/records/${encodeURIComponent(rootCode)}/draft`;
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState<DeleteResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (response.ok && !controller.signal.aborted) setPreview(await response.json() as DeletePreview);
    }).catch(() => {});
    return () => controller.abort();
  }, [endpoint]);

  async function remove() {
    if (!preview || busy || error) return;
    setBusy(true);
    try {
      const response = await pdmPermissionFetch(endpoint, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmDelete: true, fingerprint: preview.fingerprint })
      });
      const result = await readJson(response);
      const completion = (result as { result?: DeleteResult } | null)?.result;
      if (!response.ok || !completion) {
        setError(errorMessage(result, "刪除未確認完成，請重新整理並核對資料。"));
        return;
      }
      setDeleted(completion);
    } catch {
      setError("刪除結果未確認，請重新整理並核對資料。");
    } finally {
      setBusy(false);
    }
  }

  if (!preview || preview.rootCode !== rootCode) return null;
  return <>
    <button type="button" className="secondary-button" onClick={() => {
      if (onBeforeOpen()) dialog.current?.showModal();
    }}>永久刪除草稿</button>
    <dialog ref={dialog} className="canonical-modal" aria-label={`永久刪除 ${rootCode}`} onClose={() => {
      if (deleted) onDeleted();
    }} onCancel={event => {
      if (busy) event.preventDefault();
    }}>
      {deleted ? <>
        <header><h2>已永久刪除 {deleted.rootCode}</h2></header>
        <div className="canonical-modal-status" role="status">
          {deleted.reusable ? <p>可重新配號：{[...deleted.drawingNumbers, ...deleted.partNumbers].join("、")}</p> : <p>此歷史編號未驗證可重新配發。</p>}
        </div>
        <div className="canonical-modal-actions"><button type="button" className="primary-button" onClick={() => dialog.current?.close()}>完成</button></div>
      </> : <>
      <header><h2>永久刪除 {rootCode} 草稿？</h2></header>
      <div className="canonical-modal-status">
        <p>這項操作無法還原。符合條件的編號會釋放。</p>
        {preview.drawingNumbers.length ? <p>圖號 {preview.drawingNumbers.join("、")}</p> : null}
        {preview.partNumbers.length ? <p>料號 {preview.partNumbers.join("、")}</p> : null}
        {preview.affectedFileAssets > 0 ? <p>受影響附件 {preview.affectedFileAssets} 筆{preview.fileNames.length ? ` · ${preview.fileNames.join("、")}` : ""}</p> : null}
        {preview.affectedAuxiliaryJobs > 0 ? <p>已終止的 OpenSWX 工作 {preview.affectedAuxiliaryJobs} 筆</p> : null}
        {preview.affectedRecognitionSessions ? <p>未正式化的圖面辨識 {preview.affectedRecognitionSessions} 筆</p> : null}
        {preview.transferReferences.length ? <ul aria-label="將移除的技轉引用">{preview.transferReferences.map(ref =>
          <li key={`${ref.packageCode}/${ref.entityCode}`}>{ref.packageCode} · {ref.entityCode}</li>)}</ul> : null}
        {error ? <p className="canonical-error" role="alert">{error}</p> : null}
      </div>
      <div className="canonical-modal-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => dialog.current?.close()}>取消</button>
        <button type="button" className="danger-button" disabled={busy || Boolean(error)} onClick={() => void remove()}>
          {busy ? <LoadingIndicator>刪除中</LoadingIndicator> : "確認永久刪除"}
        </button>
      </div>
      </>}
    </dialog>
  </>;
}
