"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CanonicalPartBomContext } from "@/lib/pdm-canonical-workbench-contract";

type Candidate = {
  partNumberId: string;
  partNumber: string;
  name: string;
  specification: string;
  selected: boolean;
  selectable: boolean;
  blockedReason: string | null;
  rowVersion: string;
};

type CandidateContract = {
  mode: "initial" | "next_revision";
  definitionId: string | null;
  baseReleaseSnapshotId: string | null;
  contextPart: { partNumberId: string; partNumber: string; name: string };
  candidates: Candidate[];
  suggestedBomRevision: string;
  selectionEtag: string;
};

export function PartBomContext({ context, partNumberId, partNumber }: {
  context: CanonicalPartBomContext;
  partNumberId: string;
  partNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contract, setContract] = useState<CandidateContract | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => { if (open) cancelRef.current?.focus(); }, [open]);
  if (context.action === "none" && !context.blocker) return null;

  const openExisting = () => {
    if (context.draftId) router.push(`/bom/workbench/${encodeURIComponent(context.draftId)}?parentPartNumberId=${encodeURIComponent(partNumberId)}`);
  };
  const beginCreate = async () => {
    setOpen(true); setLoading(true); setError("");
    try {
      const response = await fetch(`/api/bom/applicability-candidates?contextPartNumberId=${encodeURIComponent(partNumberId)}`, { cache: "no-store" });
      const body = await response.json() as CandidateContract & { error?: string; message?: string };
      if (!response.ok) throw new Error(body.message || body.error || "無法取得適用料號");
      const next = { ...body, selectionEtag: response.headers.get("etag") || body.selectionEtag };
      setContract(next);
      setSelected(next.candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.partNumberId));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "無法取得適用料號"); }
    finally { setLoading(false); }
  };
  const close = () => {
    if (saving) return;
    setOpen(false); setContract(null); setError("");
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  const create = async () => {
    if (!contract || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/bom/drafts", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID(), "if-match": contract.selectionEtag },
        body: JSON.stringify({ contextPartNumberId: partNumberId, applicableParentPartNumberIds: selected, bomRevision: contract.suggestedBomRevision, source: "manual", baseReleaseSnapshotId: contract.baseReleaseSnapshotId })
      });
      const body = await response.json() as { workbenchUrl?: string; error?: string; message?: string };
      if (!response.ok || !body.workbenchUrl) throw new Error(body.message || body.error || "建立 BOM 失敗");
      router.push(body.workbenchUrl);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "建立 BOM 失敗"); }
    finally { setSaving(false); }
  };

  return <section className="part-bom-context" data-section="part-bom-context">
    <div className="canonical-drawer-section-heading"><h3>BOM</h3>
      {context.action === "create_bom" ? <button ref={triggerRef} type="button" className="primary-button" onClick={() => void beginCreate()}>建立 BOM</button> : null}
      {context.action === "open_bom" ? <button ref={triggerRef} type="button" className="primary-button" disabled={!context.draftId} onClick={openExisting}>{context.status === "Obsolete" ? "查看 BOM 歷史" : "開啟 BOM"}</button> : null}
    </div>
    {context.blocker ? <p className="canonical-error" role="alert" data-bom-blocker={context.blocker.code}>{context.blocker.message}</p> : context.bomRevision ? <p className="part-bom-context-summary">Rev {context.bomRevision} · {statusLabel(context.status)} · {context.applicableParentCount} 個適用料號</p> : null}
    {open ? <div className="canonical-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} className="canonical-modal part-bom-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); close(); return; }
        if (event.key !== "Tab") return;
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? [])]
          .filter((element) => !element.hasAttribute("hidden"));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        <header><h2 id={titleId}>建立 BOM</h2></header>
        <div className="part-bom-dialog-body">
          <label><span>目前料號</span><input value={partNumber} readOnly /></label>
          <fieldset disabled={loading || saving}><legend>適用料號</legend>
            {contract?.candidates.map((candidate) => <label key={candidate.partNumberId} className="part-bom-candidate"><input type="checkbox" checked={selected.includes(candidate.partNumberId)} disabled={!candidate.selectable || candidate.partNumberId === partNumberId} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, candidate.partNumberId])] : current.filter((id) => id !== candidate.partNumberId))} /><span><strong>{candidate.partNumber}</strong>{candidate.name ? ` ${candidate.name}` : ""}<small>{candidate.partNumberId === partNumberId ? "目前料號（必要）" : "同根號適用料號（可複選）"}{candidate.blockedReason ? ` · 不可選：${candidate.blockedReason}` : ""}</small></span></label>)}
            {!loading && contract?.candidates.length === 0 ? <p role="status">沒有可加入的同根號組立件。</p> : null}
            {loading ? <p role="status">載入中…</p> : null}
          </fieldset>
          <label><span>BOM Rev</span><input value={contract?.suggestedBomRevision ?? ""} readOnly /></label>
          {error ? <p className="canonical-error" role="alert" aria-live="assertive">{error}</p> : null}
        </div>
        <div className="part-bom-dialog-actions"><button type="button" className="primary-button" disabled={!contract || !selected.includes(partNumberId) || saving || loading} onClick={() => void create()}>{saving ? "建立中…" : "建立 BOM"}</button><button ref={cancelRef} type="button" className="secondary-button" disabled={saving} onClick={close}>取消</button></div>
      </div>
    </div> : null}
  </section>;
}

function statusLabel(status: CanonicalPartBomContext["status"]) {
  if (status === "PendingReview") return "審核中";
  if (status === "Released") return "已發行";
  if (status === "Rejected") return "已退回";
  if (status === "Archived") return "已封存";
  if (status === "Obsolete") return "已作廢";
  return "草稿";
}
