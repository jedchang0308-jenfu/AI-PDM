"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { LoadingIndicator } from "@/components/loading-indicator";
import type { DraftNumberingMemberTarget, DraftNumberingReuse } from "@/lib/draft-numbering-delete-policy";
import { pdmPermissionFetch } from "@/lib/pdm-permission-client";
import { errorMessage, readJson } from "@/lib/pdm-workbench-response";

type DeletePreview = {
  rootCode: string;
  target?: DraftNumberingMemberTarget;
  numberReuse: DraftNumberingReuse[];
  drawingNumbers: string[];
  partNumbers: string[];
  affectedFileAssets: number;
  fileNames: string[];
  affectedAuxiliaryJobs: number;
  affectedRecognitionSessions?: number;
  transferReferences: { packageCode: string; entityCode: string }[];
  fingerprint: string;
};
type DeleteResult = { rootCode: string; target?: DraftNumberingMemberTarget; numberReuse: DraftNumberingReuse[] };
type Scope = "work" | "member" | "bundle";
type PermanentScope = Exclude<Scope, "work">;
type Eligibility = { preview: DeletePreview } | { reason: string };

const permanentScopes: readonly PermanentScope[] = ["member", "bundle"];
const reuseLabels: Record<DraftNumberingReuse["status"], string> = {
  reusable: "刪除後可重新配發",
  not_reusable: "刪除後不可重新配發",
  unknown: "尚無法確認能否重新配發"
};
const kindLabels: Record<DraftNumberingReuse["kind"], string> = { root: "根號", drawing: "圖號", part: "料號" };

function NumberReuseList({ numbers }: { numbers: readonly DraftNumberingReuse[] }) {
  return <ul className="canonical-delete-number-list" aria-label="依工作台建立編號規則判定的重新配發結果">
    {numbers.map(number => <li key={number.kind + ":" + number.code}>
      <b>{kindLabels[number.kind]} {number.code}</b><span>{reuseLabels[number.status]}</span>
    </li>)}
  </ul>;
}

function validPreview(body: unknown, rootCode: string, target: DraftNumberingMemberTarget | undefined): body is DeletePreview {
  const preview = body as DeletePreview | null;
  if (preview?.rootCode !== rootCode || !/^[a-f0-9]{64}$/u.test(preview.fingerprint)
    || !Array.isArray(preview.drawingNumbers) || !Array.isArray(preview.partNumbers)
    || !Array.isArray(preview.numberReuse) || !Array.isArray(preview.fileNames)
    || !Array.isArray(preview.transferReferences)) return false;
  const numbers = [
    ...preview.drawingNumbers.map(code => "drawing:" + code),
    ...preview.partNumbers.map(code => "part:" + code)
  ];
  if (target) {
    if (preview.target?.code !== target.code || preview.target.kind !== target.kind
      || numbers.length !== 1 || numbers[0] !== target.kind + ":" + target.code) return false;
  } else {
    if (preview.target) return false;
    numbers.push("root:" + rootCode);
  }
  return preview.numberReuse.length === numbers.length && numbers.every(key =>
    preview.numberReuse.some(number => number && number.kind + ":" + number.code === key && Object.hasOwn(reuseLabels, number.status)));
}

export function WorkbenchDeleteAction({
  code, entityType, version, rootCode, workBlockedReason, permanentBlockedReason, onBeforeDelete, onDeleteWork, onPermanentDeleted
}: {
  code: string;
  entityType: DraftNumberingMemberTarget["kind"];
  version: string;
  rootCode: string | null;
  workBlockedReason: string | null;
  permanentBlockedReason: string | null;
  onBeforeDelete: () => boolean;
  onDeleteWork: () => Promise<string | null>;
  onPermanentDeleted: () => void;
}) {
  const id = useId();
  const endpoint = rootCode ? "/api/numbering/records/" + encodeURIComponent(rootCode) + "/draft" : null;
  const dialog = useRef<HTMLDialogElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<Scope | null>(null);
  const [eligibility, setEligibility] = useState<Partial<Record<PermanentScope, Eligibility>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState<DeleteResult | null>(null);

  useEffect(() => {
    if (open) dismiss.current?.focus();
  }, [open, deleted]);

  useEffect(() => {
    if (!open || !endpoint || !rootCode || permanentBlockedReason) return;
    const controller = new AbortController();
    for (const scope of permanentScopes) {
      const fallback = "無法確認刪除範圍或編號結果，請關閉視窗後再試。";
      const target = scope === "member" ? { kind: entityType, code } : undefined;
      const href = target ? endpoint + "?" + new URLSearchParams({ kind: target.kind, code: target.code }) : endpoint;
      void fetch(href, { cache: "no-store", signal: controller.signal }).then(async response => {
        const body = await readJson(response);
        if (controller.signal.aborted) return;
        const result = response.ok && validPreview(body, rootCode, target)
          ? { preview: body }
          : { reason: response.status === 401 ? "登入已失效，請重新登入後再試。" : errorMessage(body, fallback) };
        setEligibility(previous => ({ ...previous, [scope]: result }));
      }).catch(() => {
        if (!controller.signal.aborted) setEligibility(previous => ({ ...previous, [scope]: { reason: fallback } }));
      });
    }
    return () => controller.abort();
  }, [code, endpoint, entityType, open, permanentBlockedReason, rootCode]);

  const selected = selection && selection !== "work" ? eligibility[selection] : null;
  const preview = !permanentBlockedReason && selected && "preview" in selected ? selected.preview : null;
  const canConfirm = !busy && !error && (selection === "work" ? !workBlockedReason : Boolean(preview));
  const confirmationLabel = selection === "work" ? "確認捨棄此版未核准的修改"
    : selection === "member" ? "確認永久刪除 " + code
    : selection === "bundle" ? "確認永久刪除 " + rootCode + " 整組" : "確認刪除";

  function openDialog() {
    if (!dialog.current || dialog.current.open) return;
    setSelection(null);
    setEligibility({});
    setError("");
    setDeleted(null);
    setOpen(true);
    dialog.current.showModal();
  }

  async function confirmDelete() {
    if (!canConfirm || pending.current || !onBeforeDelete()) return;
    pending.current = true;
    setBusy(true);
    try {
      if (selection === "work") {
        const failure = await onDeleteWork();
        if (failure) setError(failure);
        else dialog.current?.close();
      } else if (endpoint && preview) {
        const href = preview.target ? endpoint + "?" + new URLSearchParams({ kind: preview.target.kind, code: preview.target.code }) : endpoint;
        const response = await pdmPermissionFetch(href, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmDelete: true, fingerprint: preview.fingerprint })
        });
        const body = await readJson(response);
        const result = (body as { result?: DeleteResult } | null)?.result;
        if (response.ok && result?.rootCode === rootCode && Array.isArray(result.numberReuse)
          && result.target?.kind === preview.target?.kind && result.target?.code === preview.target?.code) {
          setDeleted(result);
        } else {
          setError(errorMessage(body, "刪除結果尚未確認，請重新整理後核對資料。"));
        }
      }
    } catch {
      setError("刪除結果尚未確認，請重新整理後核對資料。");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="danger-button" aria-haspopup="dialog" onClick={openDialog}>刪除…</button>
    <dialog ref={dialog} className="canonical-modal canonical-delete-modal" aria-labelledby={id + "-title"} aria-modal={open || undefined}
      onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
      onCancel={event => { if (pending.current) event.preventDefault(); }}
      onClose={() => {
        setOpen(false);
        if (deleted) onPermanentDeleted();
      }}>
      {open && (deleted ? <>
        <header><h2 id={id + "-title"}>已永久刪除 {deleted.target?.code ?? deleted.rootCode + " 整組圖號與料號"}</h2></header>
        <div className="canonical-modal-status" role="status">
          <NumberReuseList numbers={deleted.numberReuse} />
        </div>
        <div className="canonical-modal-actions">
          <button ref={dismiss} type="button" className="primary-button" onClick={() => dialog.current?.close()}>完成</button>
        </div>
      </> : <>
        <header><div><h2 id={id + "-title"}>你要刪除什麼？</h2><p>{code} · {version}</p></div></header>
        <fieldset className="canonical-delete-options" aria-label="刪除範圍" disabled={busy}>
          <div className="canonical-delete-option">
            <label>
              <input type="radio" name={id} checked={selection === "work"} disabled={Boolean(workBlockedReason)}
                aria-describedby={id + "-work-scope"} onChange={() => setSelection("work")} />
              <strong>{workBlockedReason && <LockKeyhole size={15} aria-hidden="true" />}捨棄此版所有未核准的修改</strong>
            </label>
            <div id={id + "-work-scope"}>
              <p>結束此版的修改工作，移除所有未核准的修改，包含先前已儲存的修改及其專屬附件。</p>
              {workBlockedReason ? <p className="canonical-delete-lock-reason">{workBlockedReason}</p> : <p><b>保留編號 {code}。</b></p>}
            </div>
          </div>
          {permanentScopes.map(scope => {
            const state = eligibility[scope];
            const reason = permanentBlockedReason ?? (state && "reason" in state ? state.reason : null);
            const optionPreview = !reason && state && "preview" in state ? state.preview : null;
            const descriptionId = id + "-" + scope + "-scope";
            return <div key={scope} className="canonical-delete-option">
              <label>
                <input type="radio" name={id} checked={selection === scope} disabled={!optionPreview}
                  aria-describedby={descriptionId} onChange={() => setSelection(scope)} />
                <strong>{reason && <LockKeyhole size={15} aria-hidden="true" />}
                  {scope === "member" ? "永久刪除這筆" + kindLabels[entityType] : "永久刪除整組圖號與料號"}</strong>
              </label>
              <div id={descriptionId}>
                <p>{scope === "member" ? "只刪除 " + code + " 及其專屬附件，保留同組的其他編號。"
                  : "刪除" + (rootCode ? "根號 " + rootCode + " 下" : "同一根號下") + "的整組圖號與料號。"}</p>
                {reason ? <p className="canonical-delete-lock-reason" role="status">{reason}</p> : optionPreview ? <>
                  <p>編號結果依工作台的建立編號規則判定。</p>
                  <NumberReuseList numbers={optionPreview.numberReuse} />
                  {optionPreview.affectedFileAssets > 0 && <p>附件 {optionPreview.affectedFileAssets} 筆{optionPreview.fileNames.length ? " · " + optionPreview.fileNames.join("、") : ""}</p>}
                  {optionPreview.affectedAuxiliaryJobs > 0 && <p>已終止的 OpenSWX 工作 {optionPreview.affectedAuxiliaryJobs} 筆</p>}
                  {Boolean(optionPreview.affectedRecognitionSessions) && <p>未正式化的圖面辨識 {optionPreview.affectedRecognitionSessions} 筆</p>}
                  {optionPreview.transferReferences.length > 0 && <ul aria-label="將移除的技轉引用">{optionPreview.transferReferences.map(ref =>
                    <li key={ref.packageCode + "/" + ref.entityCode}>{ref.packageCode} · {ref.entityCode}</li>)}</ul>}
                </> : <p role="status"><LoadingIndicator>正在確認刪除範圍與編號…</LoadingIndicator></p>}
              </div>
            </div>;
          })}
        </fieldset>
        {selection && <p className="canonical-delete-notice">刪除後無法復原。</p>}
        {error && <p className="canonical-error" role="alert">{error}</p>}
        <div className="canonical-modal-actions">
          <button ref={dismiss} type="button" className="secondary-button" disabled={busy} onClick={() => dialog.current?.close()}>取消</button>
          <button type="button" className="danger-button" disabled={!canConfirm} onClick={() => void confirmDelete()}>
            {busy ? <LoadingIndicator>處理中</LoadingIndicator> : confirmationLabel}
          </button>
        </div>
      </>)}
    </dialog>
  </>;
}
