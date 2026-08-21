"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, FileText, LoaderCircle, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";
import { DrawingProjection } from "@/components/drawing-projection";
import { PartProjection } from "@/components/part-projection";
import { RelationProjection } from "@/components/relation-projection";
import { normalizePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";
import { resolvePdmApprovalOwnerContext } from "@/lib/pdm-approval-owner-route";
import type { PdmEntityDetailResponse } from "@/lib/pdm-entity-detail-contract";

type ApprovalDecision = "approved" | "rejected" | "needs_info";
type ApprovalTarget = { id: string; role: string; type: string; targetId: string; code: string | null; label: string; status: string | null; snapshot: Record<string, unknown> };
type ApprovalRequest = {
  id: string;
  actionCode: string;
  actionTitle: string;
  domainCode: string;
  title: string;
  status: string;
  reason: string;
  requestedByName: string | null;
  requestedAt: string;
  primaryTarget?: { type: string; targetId: string; code: string | null; label: string };
  targets: ApprovalTarget[];
  decisions: Array<{ id: string; approverName: string | null; decision: string; comment: string | null; decidedAt: string }>;
  payload: Record<string, unknown>;
  applyStatus: string | null;
  applyError: string | null;
  cleanupPending?: boolean;
};

function apiMessage(body: { error?: string | { message?: string }; message?: string }, fallback: string) {
  return typeof body.error === "object" ? body.error.message ?? fallback : body.message ?? body.error ?? fallback;
}

function decisionLabel(decision: ApprovalDecision) {
  return ({ approved: "核准", rejected: "退回修正", needs_info: "要求補資料" } as const)[decision];
}

export function ApprovalRequestWorkspace({ requestId }: { requestId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = normalizePdmApprovalReturnTo(searchParams.get("returnTo"));
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [projection, setProjection] = useState<PdmEntityDetailResponse | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ApprovalDecision | "retry" | "reload" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/approvals/requests/${encodeURIComponent(requestId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiMessage(body, response.status === 410 ? "此審核已完成，不需再處理。" : "審核明細目前無法載入。"));
      const nextRequest = body.request as ApprovalRequest;
      setRequest(nextRequest);
      const ownerContext = resolvePdmApprovalOwnerContext({ actionCode: nextRequest.actionCode, primaryTarget: nextRequest.primaryTarget });
      if (!ownerContext) throw new Error("此審核案件缺少有效的 PDM 對象資訊。");
      const detailResponse = await fetch(`/api/pdm/entity-details/${encodeURIComponent(ownerContext.entityKey)}?surface=${encodeURIComponent(ownerContext.surface)}&reviewRequestId=${encodeURIComponent(requestId)}&returnTo=${encodeURIComponent(returnTo)}`, { cache: "no-store" });
      if (!detailResponse.ok) throw new Error("審核對象目前無法載入，請重新整理。");
      setProjection(await detailResponse.json() as PdmEntityDetailResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "審核明細目前無法載入。 ");
    } finally {
      setLoading(false);
    }
  }, [requestId, returnTo]);

  useEffect(() => { void load(); }, [load]);

  async function decide(decision: ApprovalDecision) {
    if (!request || busy) return;
    setBusy(decision);
    setError("");
    try {
      const response = await fetch(`/api/approvals/requests/${encodeURIComponent(request.id)}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": `dev079:approval:${request.id}:${decision}:${crypto.randomUUID()}` },
        body: JSON.stringify({ decision, comment })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiMessage(body, "審核決策未完成。"));
      setNotice(`已${decision === "approved" ? "核准" : decision === "needs_info" ? "要求補資料" : "退回修正"}。`);
      setComment("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "審核決策未完成，請重新整理後再試。 ");
    } finally {
      setBusy(null);
    }
  }

  async function retryApply() {
    if (!request || busy) return;
    setBusy("retry");
    setError("");
    try {
      const response = await fetch(`/api/approvals/requests/${encodeURIComponent(request.id)}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": `dev079:approval-retry:${request.id}:${crypto.randomUUID()}` },
        body: "{}"
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiMessage(body, "正式化重試未完成。"));
      setNotice("已送出正式化重試。 ");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "正式化重試未完成。 ");
    } finally {
      setBusy(null);
    }
  }

  const isOpen = request?.status === "pending" || request?.status === "needs_info";
  const projectionFull = projection?.projections.drawing?.level === "full" ? projection.projections.drawing : null;
  const partProjection = projection?.projections.part;
  const relationProjection = projection?.projections.relation;

  if (loading) return <main className="dev079-workspace-loading" role="status"><LoaderCircle className="spin" size={20} />正在載入審核工作區...</main>;
  if (!request) return <main className="dev079-workspace-state"><h1>審核工作區</h1><p role="alert">{error || "找不到這筆審核。"}</p><button className="secondary-button" type="button" onClick={() => void load()}>重新載入</button></main>;

  return (
    <main className="dev079-workspace" data-dev="DEV-079" data-workspace-kind="reviewer">
      <header className="dev079-workspace-header">
        <div className="dev079-workspace-heading"><button className="icon-button" type="button" onClick={() => router.push(returnTo)} aria-label="返回審核清單"><ArrowLeft size={18} /></button><div><span className="eyebrow">審核工作區</span><h1>{request.title || request.actionTitle}</h1><p>{request.actionTitle} · {request.status}</p></div></div>
        <button className="secondary-button" type="button" disabled={busy === "reload"} onClick={() => void load()}><RefreshCcw size={15} />重新整理</button>
      </header>
      {notice ? <div className="dev079-workspace-notice is-success" role="status"><CheckCircle2 size={16} />{notice}</div> : null}
      {error ? <div className="dev079-workspace-notice is-error" role="alert">{error}</div> : null}
      <div className="dev079-workspace-grid">
        <section className="dev079-workspace-editor approval-request-workspace-body" aria-label="審核證據與決策">
          <section className="dev079-card"><div className="dev079-section-heading"><div><span className="eyebrow">審核證據</span><h2>{request.actionTitle}</h2></div><span className="dev079-readonly-tag">資料唯讀</span></div><dl className="dev079-fact-grid"><div><dt>申請人</dt><dd>{request.requestedByName || "未提供"}</dd></div><div><dt>送審時間</dt><dd>{request.requestedAt?.slice(0, 19).replace("T", " ")}</dd></div><div><dt>領域</dt><dd>{request.domainCode}</dd></div><div><dt>狀態</dt><dd>{request.status}</dd></div></dl><p className="dev079-request-reason">{request.reason || "未提供送審說明。"}</p></section>
          <section className="dev079-card"><div className="dev079-section-heading"><div><span className="eyebrow">影響範圍</span><h2>審核對象</h2></div></div><ul className="dev079-target-list">{request.targets.map((target) => <li key={target.id}><FileText size={15} /><span><strong>{target.code || target.label}</strong><small>{target.type} · {target.role}</small></span></li>)}</ul></section>
          {request.decisions.length > 0 ? <section className="dev079-card"><div className="dev079-section-heading"><div><span className="eyebrow">歷程</span><h2>先前決策</h2></div></div><ul className="dev079-decision-history">{request.decisions.map((decision) => <li key={decision.id}><strong>{decision.decision}</strong><span>{decision.approverName || "審核人"}</span><small>{decision.comment || decision.decidedAt}</small></li>)}</ul></section> : null}
          {isOpen ? <section className="dev079-card dev079-decision-card"><label><span>決策備註</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={4} placeholder="補充核准、退回或要求補資料的原因（選填）" /></label><div className="dev079-decision-actions"><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void decide("needs_info")}><FileText size={15} />{decisionLabel("needs_info")}</button><button className="danger-button" type="button" disabled={Boolean(busy)} onClick={() => void decide("rejected")}><XCircle size={15} />{decisionLabel("rejected")}</button><button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => void decide("approved")}><ShieldCheck size={15} />{decisionLabel("approved")}</button></div></section> : null}
          {request.status === "apply_failed" ? <section className="dev079-card dev079-decision-card"><p>{request.applyError || "正式化套用失敗，請確認後重試。"}</p><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void retryApply()}><RefreshCcw size={15} />重試正式化</button></section> : null}
        </section>
        <aside className="dev079-workspace-preview" aria-label="審核對象唯讀預覽"><div className="dev079-sticky-panel"><div className="dev079-section-heading"><div><span className="eyebrow">唯讀預覽</span><h2>審核對象資料</h2></div><span className="dev079-readonly-tag">不可在此編輯</span></div>{projectionFull ? <DrawingProjection projection={projectionFull} returnTo={returnTo} showStatusBadge={false} showMaintenancePanel={false} /> : partProjection ? <PartProjection projection={partProjection} showStatusBadge={false} /> : relationProjection ? <RelationProjection projection={relationProjection} /> : <p className="dev079-preview-fallback">此審核沒有可呈現的 PDM 預覽，請以左側證據與影響範圍為準。</p>}</div></aside>
      </div>
    </main>
  );
}
