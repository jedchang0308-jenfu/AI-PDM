"use client";

import { ShieldCheck } from "lucide-react";
import type { ReviewContextProjectionFull } from "@/lib/pdm-entity-detail-contract";

export function ReviewContextProjection({ data }: { data: ReviewContextProjectionFull }) {
  return (
    <section className="unified-pdm-projection unified-pdm-review-context" data-component="ReviewContextProjection" aria-labelledby="unified-review-projection-title">
      <div className="unified-pdm-projection-heading"><div><span className="unified-pdm-section-kicker">ReviewContextProjection</span><h3 id="unified-review-projection-title">審核快照</h3></div><ShieldCheck size={21} aria-label="審核鎖定" /></div>
      <div className="unified-pdm-fact-grid"><div><span>審核動作</span><strong>{data.actionTitle}</strong></div><div><span>申請人</span><strong>{data.requester.label ?? "送審者"}</strong></div><div><span>審核狀態</span><strong>{data.status}</strong></div><div><span>審核範圍</span><strong>{data.targetRefs.length} 個目標</strong></div></div>
      <div className="unified-pdm-review-assignment"><span>目前責任</span><strong>{data.eligibleReviewer.actorResponsibility}</strong><span className={data.decisionReady ? "unified-pdm-review-ready" : "unified-pdm-review-not-ready"}>{data.decisionReady ? "可判定" : "待確認"}</span></div>
      <div className="unified-pdm-review-targets"><span>送審目標</span>{data.targetAnchors.map((target) => <span className="unified-pdm-review-target" key={target.id}>{target.label}</span>)}</div>
      <div data-component="ApprovalSnapshotProjection"><div className="unified-pdm-review-snapshot"><span>快照一致性</span><strong>{data.snapshot.checkStatus}</strong><small>{data.snapshot.mismatchReason ?? "目前資料與送審範圍一致。"}</small></div></div>
      <p className="unified-pdm-review-note">審核期間讀取送審時的同一份鎖定資料；此區僅顯示範圍、雜湊與差異，不另複製附件快照。</p>
    </section>
  );
}
