"use client";

import { ShieldCheck } from "lucide-react";
import type { ReviewContextProjectionFull } from "@/lib/pdm-entity-detail-contract";

const impactLabels: Record<string, string> = {
  no_impact: "無影響",
  suspected_impact: "疑似影響",
  confirmed_impact: "確認影響"
};

function impactLabel(value: string) {
  return (impactLabels[value] ?? value) || "未提供";
}

export function ReviewContextProjection({ data }: { data: ReviewContextProjectionFull }) {
  return (
    <section className="unified-pdm-projection unified-pdm-review-context" data-component="ReviewContextProjection" aria-labelledby="unified-review-projection-title">
      <div className="unified-pdm-projection-heading"><div><span className="unified-pdm-section-kicker">ReviewContextProjection</span><h3 id="unified-review-projection-title">審核快照</h3></div><ShieldCheck size={21} aria-label="審核鎖定" /></div>
      <div className="unified-pdm-fact-grid"><div><span>審核動作</span><strong>{data.actionTitle}</strong></div><div><span>申請人</span><strong>{data.requester.label ?? "送審者"}</strong></div><div><span>審核狀態</span><strong>{data.status}</strong></div><div><span>審核範圍</span><strong>{data.targetRefs.length} 個目標</strong></div></div>
      {data.requestReason ? <div className="unified-pdm-review-assignment" data-review-request-reason="true"><span>申請理由</span><strong>{data.requestReason}</strong></div> : null}
      <div className="unified-pdm-review-assignment"><span>目前責任</span><strong>{data.eligibleReviewer.actorResponsibility}</strong><span className={data.decisionReady ? "unified-pdm-review-ready" : "unified-pdm-review-not-ready"}>{data.decisionReady ? "可判定" : "待確認"}</span></div>
      <div className="unified-pdm-review-targets"><span>送審目標</span>{data.targetAnchors.map((target) => <span className="unified-pdm-review-target" key={target.id}>{target.label}</span>)}</div>
      {data.drawingRevisionEvidence ? (
        <div className="unified-pdm-review-evidence" data-component="DrawingRevisionReviewEvidence">
          <h4>進版影響與 FFF</h4>
          <div className="unified-pdm-fact-grid">
            <div><span>FFF 結論</span><strong>{impactLabel(data.drawingRevisionEvidence.fff.outcome)}</strong></div>
            <div><span>Form</span><strong>{impactLabel(data.drawingRevisionEvidence.fff.formState)}</strong></div>
            <div><span>Fit</span><strong>{impactLabel(data.drawingRevisionEvidence.fff.fitState)}</strong></div>
            <div><span>Function</span><strong>{impactLabel(data.drawingRevisionEvidence.fff.functionState)}</strong></div>
          </div>
          <div className="unified-pdm-review-targets">
            <span>受影響料號</span>
            {data.drawingRevisionEvidence.parts.map((part) => (
              <span className="unified-pdm-review-target" key={part.id || part.number}>
                {part.number}{part.name ? ` · ${part.name}` : ""}
              </span>
            ))}
          </div>
          <div className="unified-pdm-review-targets">
            <span>送審附件</span>
            {data.drawingRevisionEvidence.files.map((file) => (
              <span className="unified-pdm-review-target" key={file.id || file.displayName}>{file.displayName}</span>
            ))}
          </div>
        </div>
      ) : null}
      <div data-component="ApprovalSnapshotProjection"><div className="unified-pdm-review-snapshot"><span>快照一致性</span><strong>{data.snapshot.checkStatus}</strong><small>{data.snapshot.mismatchReason ?? (data.snapshot.checkStatus === "未提供" ? "此舊審核直接讀取鎖定中的 PDM 共用資料，未另存 aggregate hash。" : "目前資料與送審範圍一致。")}</small></div></div>
      <p className="unified-pdm-review-note">審核期間讀取送審時的同一份鎖定資料；此區僅顯示範圍、雜湊與差異，不另複製附件快照。</p>
    </section>
  );
}
