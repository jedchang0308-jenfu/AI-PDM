"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const labels: Record<string, string> = {
  queued: "等待辨識", extracting: "辨識中", review_ready: "待人工核對", extraction_partial: "部分完成，待核對",
  extraction_failed: "辨識失敗", ready_to_formalize: "可確認寫入", formalized: "已寫入 PDM", cancelled: "已由新版取代"
};

export function DrawingRecognitionStatusChip({
  drawingNumber,
  sourceAssetIds,
  refreshKey = "",
  returnTo,
  emptyLabel = "尚未開始辨識"
}: {
  drawingNumber: string;
  sourceAssetIds?: string[];
  refreshKey?: string | number | null;
  returnTo?: string | null;
  emptyLabel?: string;
}) {
  const [session, setSession] = useState<{ id: string; status: string; warningCount: number; conflictCount: number } | null | undefined>(undefined);
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const sourceAssetIdsKey = sourceAssetIds === undefined ? null : JSON.stringify([...sourceAssetIds].filter(Boolean).sort());
  useEffect(() => {
    let active = true;
    void fetch(`/api/numbering/drawings/${encodeURIComponent(drawingNumber)}/recognition-session`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (!active) return;
        setFeatureEnabled(body?.feature?.enabled !== false && response.status !== 404);
        const latest = response.ok ? body?.session ?? null : null;
        const expected = sourceAssetIdsKey ? JSON.parse(sourceAssetIdsKey) as string[] : [];
        const actual = [...(latest?.sourceAssetIds ?? [])].filter(Boolean).sort();
        const matchingSourceSet = sourceAssetIdsKey === null || (expected.length > 0 && expected.length === actual.length && expected.every((id, index) => id === actual[index]));
        setSession(matchingSourceSet ? latest : null);
      })
      .catch(() => { if (active) { setFeatureEnabled(false); setSession(null); } });
    return () => { active = false; };
  }, [drawingNumber, refreshKey, sourceAssetIdsKey]);
  if (session === undefined) return <span className="drawing-recognition-chip is-loading">辨識狀態讀取中</span>;
  if (!featureEnabled) {
    return <span className="drawing-recognition-chip is-empty"><span>圖面辨識</span><strong>尚未啟用</strong><small>請啟用辨識功能後再使用</small></span>;
  }
  if (!session) return <span className="drawing-recognition-chip is-empty"><span>圖面辨識</span><strong>{emptyLabel}</strong></span>;
  const needsAttention = session.warningCount > 0 || session.conflictCount > 0;
  const recognitionHref = new URLSearchParams(returnTo ? { returnTo } : {}).toString();
  const href = `/numbering/recognition/${encodeURIComponent(session.id)}${recognitionHref ? `?${recognitionHref}` : ""}`;
  return (
    <Link className={`drawing-recognition-chip ${needsAttention ? "is-warning" : ""}`} href={href}>
      <span>圖面辨識</span>
      <strong>{labels[session.status] ?? session.status}</strong>
      {needsAttention ? <small>{session.conflictCount > 0 ? `${session.conflictCount} 筆衝突` : `${session.warningCount} 項提醒`}</small> : null}
    </Link>
  );
}
