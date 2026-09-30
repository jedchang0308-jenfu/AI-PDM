"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ApprovalWorkbenchRow } from "@/lib/approval-workbench-contract";
import { normalizePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";

export function PrincipalTransferReviewWorkspace({ requestId }: { requestId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = normalizePdmApprovalReturnTo(searchParams.get("returnTo"));
  const [item, setItem] = useState<ApprovalWorkbenchRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/approvals/inbox?status=active&domain=transfer&action=transfer.package_review&limit=100&query=${encodeURIComponent(requestId)}`,
        { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { items?: ApprovalWorkbenchRow[] };
      if (!response.ok) throw new Error("無法讀取指派給你的技轉審核。");
      const match = body.items?.find((candidate) => candidate.id === requestId &&
        candidate.source === "platform" && candidate.actionCode === "transfer.package_review" &&
        candidate.status === "pending") ?? null;
      if (!match) throw new Error("找不到指派給你的待審技轉包，可能已撤回或完成。");
      setItem(match);
    } catch (caught) {
      setItem(null);
      setError(caught instanceof Error ? caught.message : "技轉審核目前無法讀取。");
    } finally { setLoading(false); }
  }, [requestId]);

  useEffect(() => { void load(); }, [load]);

  async function decide(decision: "approved" | "rejected" | "needs_info") {
    if (!item || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/approvals/requests/${encodeURIComponent(requestId)}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ decision, comment: comment.trim() || null })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { code?: string; error?: string };
        throw new Error(body.code ?? body.error ?? "技轉審核決策未完成，請重新整理確認狀態。");
      }
      router.push(returnTo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "技轉審核決策未完成。");
    } finally { setBusy(false); }
  }

  return <main className="dev079-workspace-state">
    <h1>技轉包審核</h1>
    {loading ? <p role="status">正在讀取指派與案件快照…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {item ? <section className="panel" aria-label="技轉包審核內容">
      <h2>{item.title}</h2>
      <p>{item.targetSummary}</p>
      <p>送審者：{item.requestedByName ?? item.requestedBy ?? "未知"}</p>
      <p>送審時間：{item.requestedAt}</p>
      {item.reason ? <p>原因：{item.reason}</p> : null}
      {item.packageId ? <Link href={`/transfer-packages/${encodeURIComponent(item.packageId)}?section=scope`}
        className="secondary-button">檢視技轉包內容</Link> : null}
      <label>審核意見<textarea value={comment} onChange={(event) => setComment(event.target.value)}
        disabled={busy} maxLength={2000} /></label>
      <div className="dev079-workspace-actions">
        <button type="button" disabled={busy} onClick={() => void decide("approved")}>核准</button>
        <button type="button" disabled={busy} onClick={() => void decide("needs_info")}>退回補件</button>
        <button type="button" disabled={busy} onClick={() => void decide("rejected")}>駁回</button>
      </div>
    </section> : null}
    <button className="secondary-button" type="button" onClick={() => router.push(returnTo)}>返回審核清單</button>
    <button className="secondary-button" type="button" onClick={() => void load()} disabled={busy}>重新整理</button>
  </main>;
}
