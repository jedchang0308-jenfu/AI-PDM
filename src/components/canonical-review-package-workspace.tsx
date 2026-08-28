"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CanonicalReviewTargetWorkspace } from "@/components/canonical-review-target-workspace";
import { RelationMatrixTable } from "@/components/relation-matrix-table";
import { ReviewSnapshotCompare } from "@/components/review-snapshot-compare";
import { splitReviewPackageTargetKey, type ReviewPackageEntityType, type ReviewPackageMarkerFacts, type ReviewPackageScope, type ReviewPackageTarget, type ReviewPackageTargetKey, type ReviewPackageWorkspaceSnapshot } from "@/lib/pdm-review-package-contract";
import { normalizePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";

type ShellTarget = { targetKey: ReviewPackageTargetKey; targetId: string; entityType: ReviewPackageEntityType; number: string; identity: Record<string, unknown>; revision: string | null; scope: ReviewPackageScope; markers: ReviewPackageMarkerFacts; evidenceHash: string; fileCount: number; attachmentCount: number };
export type CanonicalReviewPackageShell = {
  schemaVersion: "pdm-review-package-v2"; requestId: string; requestKind: string; entityType: ReviewPackageEntityType; entityId: string; rowVersion: number; packageHash: string; submittedAt: string;
  primaryTargetKey: ReviewPackageTargetKey; root: { id: string; code: string };
  matrix: { rootId: string; rootCode: string; evidenceHash: string; drawings: Array<{ axisId: string; targetKey: `drawing:${string}`; code: string; revision: string | null }>; parts: Array<{ axisId: string; targetKey: `part:${string}`; code: string; revision: null }>; cells: Array<{ drawingNumberId: string; partNumberId: string; drawingNumber: string; partNumber: string; relationType: "manufacturing_basis" | "reference" | null }> };
  targets: ShellTarget[]; actions: Array<{ key: "approve" | "return_for_correction"; label: string }>;
};
type Target = ReviewPackageTarget & { drift: { status: "unchanged" | "changed" | "missing"; changed: boolean; changedSections: string[]; currentEvidenceHash: string | null } };
type TargetApiData = { snapshot: ReviewPackageTarget; drift: Target["drift"] };
type ComparisonData = { snapshot: ReviewPackageWorkspaceSnapshot; current: ReviewPackageWorkspaceSnapshot | null; comparison: Target["drift"] };
type ApiResult<T> = { data: T; meta: { contractToken: string; correlationId?: string } };

function apiMessage(body: unknown, fallback: string) {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string" ? String((error as { message: string }).message) : fallback;
}

export function CanonicalReviewPackageWorkspace({ requestId, returnTo, initialShell, initialContractToken = "" }: { requestId: string; returnTo?: string | null; initialShell?: CanonicalReviewPackageShell | null; initialContractToken?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const safeReturn = normalizePdmApprovalReturnTo(returnTo);
  const [shell, setShell] = useState<CanonicalReviewPackageShell | null>(initialShell ?? null);
  const [contractToken, setContractToken] = useState(initialContractToken);
  const [target, setTarget] = useState<Target | null>(null);
  const [activeKey, setActiveKey] = useState("");
  const [loading, setLoading] = useState(!initialShell);
  const [targetLoading, setTargetLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const targetRequestRef = useRef(0);
  const normalizedUrlRef = useRef("");
  const compareScrollRef = useRef(0);

  const loadShell = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/pdm/review-requests/${encodeURIComponent(requestId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as ApiResult<CanonicalReviewPackageShell> | { error?: unknown } | null;
      if (!response.ok || !body || !("data" in body)) throw new Error(apiMessage(body, "審核包目前無法載入。"));
      setShell(body.data); setContractToken(body.meta.contractToken); setLoading(false);
    } catch (caught) { setLoading(false); setError(caught instanceof Error ? caught.message : "審核包目前無法載入。"); }
  }, [requestId]);
  useEffect(() => { if (!initialShell) void loadShell(); }, [initialShell, loadShell]);

  const targets = useMemo(() => shell?.targets ?? [], [shell]);
  const targetByKey = useMemo(() => new Map((shell?.targets ?? []).map((item) => [item.targetKey, item])), [shell]);
  const selectedFromUrl = searchParams.get("activeTarget") ?? "";
  useEffect(() => {
    if (!shell) return;
    const next = targetByKey.has(selectedFromUrl as ReviewPackageTargetKey) ? selectedFromUrl : shell.primaryTargetKey;
    if (next !== activeKey) setActiveKey(next);
    if (selectedFromUrl !== next) {
      const query = new URLSearchParams(searchParams.toString()); query.set("activeTarget", next);
      const normalizedUrl = `${pathname}?${query.toString()}`;
      if (normalizedUrlRef.current !== normalizedUrl) { normalizedUrlRef.current = normalizedUrl; router.replace(normalizedUrl, { scroll: false }); }
    } else normalizedUrlRef.current = "";
  }, [activeKey, pathname, router, searchParams, selectedFromUrl, shell, targetByKey]);

  const selectTarget = useCallback((targetKey: ReviewPackageTargetKey | null) => {
    if (!targetKey || !targetByKey.has(targetKey)) return;
    if (targetKey === activeKey) return;
    targetRequestRef.current += 1;
    setTarget(null); setComparison(null); setNotice(""); setError("");
    const query = new URLSearchParams(searchParams.toString()); query.set("activeTarget", targetKey);
    router.push(`${pathname}?${query.toString()}`, { scroll: false });
  }, [activeKey, pathname, router, searchParams, targetByKey]);

  const loadTarget = useCallback(async () => {
    if (!shell || !activeKey) return;
    const requestSequence = ++targetRequestRef.current;
    const { entityType, targetId: entityId } = splitReviewPackageTargetKey(activeKey as ReviewPackageTargetKey);
    setTargetLoading(true); setError("");
    try {
      const response = await fetch(`/api/pdm/review-requests/${encodeURIComponent(requestId)}/targets/${entityType}/${encodeURIComponent(entityId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as ApiResult<TargetApiData> | { error?: unknown } | null;
      if (!response.ok || !body || !("data" in body)) throw new Error(apiMessage(body, "審核對象目前無法載入。"));
      if (requestSequence !== targetRequestRef.current) return;
      setTarget({ ...body.data.snapshot, drift: body.data.drift }); setContractToken(body.meta.contractToken); setTargetLoading(false);
    } catch (caught) {
      if (requestSequence !== targetRequestRef.current) return;
      setTargetLoading(false); setError(caught instanceof Error ? caught.message : "審核對象目前無法載入。");
    }
  }, [activeKey, requestId, shell]);
  useEffect(() => { void loadTarget(); }, [loadTarget]);

  async function compareTarget() {
    if (!target) return;
    compareScrollRef.current = window.scrollY;
    const { entityType, targetId } = splitReviewPackageTargetKey(target.targetKey);
    const response = await fetch(`/api/pdm/review-requests/${encodeURIComponent(requestId)}/targets/${entityType}/${encodeURIComponent(targetId)}/comparison`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { data?: ComparisonData; error?: unknown };
    if (!response.ok) { setError(apiMessage(body, "無法檢查審核包差異。")); return; }
    if (!body.data) { setError("差異證據不完整，請重新整理後再試。"); return; }
    const status = body.data.comparison.status;
    setComparison(status === "unchanged" ? null : body.data);
    setNotice(status === "unchanged" ? "目前資料與送審快照一致。" : status === "missing" ? "目前資料已不存在；送審快照仍保留，核准時會重驗送審基準。" : "目前資料與送審快照存在差異；差異供判讀，核准時會重驗送審基準。");
  }

  function closeComparison() {
    setComparison(null);
    requestAnimationFrame(() => window.scrollTo({ top: compareScrollRef.current, behavior: "auto" }));
  }

  async function decide(decision: "approve" | "return_for_correction") {
    if (!shell || busy) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/pdm/review-requests/${encodeURIComponent(requestId)}/decisions`, { method: "POST", headers: { "content-type": "application/json", "if-match": `"${shell.rowVersion}"`, "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": contractToken }, body: JSON.stringify({ decision }) });
    const body = await response.json().catch(() => null); setBusy(false);
    if (!response.ok) { setError(apiMessage(body, "審核決策未完成。")); return; }
    router.push(safeReturn);
  }

  const activeSummary = targetByKey.get(activeKey as ReviewPackageTargetKey) ?? targets[0] ?? null;
  const drawingIdentities = shell?.matrix.drawings.map((item) => ({ id: item.axisId, number: item.code, detailHref: null, targetId: item.targetKey, markers: targetByKey.get(item.targetKey)?.markers })) ?? [];
  const partIdentities = shell?.matrix.parts.map((item) => ({ id: item.axisId, number: item.code, detailHref: null, targetId: item.targetKey, markers: targetByKey.get(item.targetKey)?.markers })) ?? [];
  if (loading) return <main className="dev079-workspace-loading" role="status"><LoaderCircle className="spin" size={20} />正在載入不可變審核包...</main>;
  if (!shell) return <main className="dev079-workspace-state"><h1>審核工作區</h1><p role="alert">{error || "找不到這筆審核包。"}</p><button className="secondary-button" type="button" onClick={() => void loadShell()}><RefreshCcw size={15} />重新載入</button></main>;

  return <main className="dev079-workspace canonical-review-package" data-dev="DEV-101" data-review-schema={shell.schemaVersion}>
    <header className="dev079-workspace-header"><div className="dev079-workspace-heading"><button className="icon-button" type="button" onClick={() => router.push(safeReturn)} aria-label="返回審核清單"><XCircle size={18} /></button><div><span className="eyebrow">不可變審核包 · {shell.root.code}</span><h1>{activeSummary?.number || shell.root.code}</h1><p>審核者與編輯者共用同一份圖號／料號工作視圖</p></div></div><div className="dev079-workspace-header-actions">{target?.drift.changed ? <button className="icon-button canonical-review-drift-trigger" type="button" onClick={() => void compareTarget()} aria-label="目前資料與送審快照不同；開啟差異比較" title="目前資料與送審快照不同；開啟差異比較"><CircleAlert size={18} /></button> : null}<button className="secondary-button" type="button" onClick={() => void loadShell()}><RefreshCcw size={15} />重新整理</button><span className="canonical-layer is-rd">快照 {shell.packageHash.slice(0, 10)}</span></div></header>
    {error ? <div className="dev079-workspace-notice is-error" role="alert"><CircleAlert size={16} />{error}</div> : null}
    {notice ? <div className="dev079-workspace-notice is-success" role="status"><CheckCircle2 size={16} />{notice}</div> : null}
    <section className="pdm-edit-page-card canonical-review-matrix-card" aria-label="圖料關聯矩陣"><div className="pdm-edit-page-card-heading"><div><span className="eyebrow">關聯矩陣</span><h2>圖號 × 料號</h2></div></div><RelationMatrixTable rootCode={shell.matrix.rootCode} drawings={drawingIdentities} parts={partIdentities} matrix={shell.matrix.cells} activeTarget={activeSummary ? { entityType: activeSummary.entityType, targetId: activeSummary.targetKey } : undefined} onSelectDrawing={(targetKey) => selectTarget(targetKey as ReviewPackageTargetKey)} onSelectPart={(targetKey) => selectTarget(targetKey as ReviewPackageTargetKey)} showVisualMarkers /></section>
    {comparison ? <ReviewSnapshotCompare snapshot={comparison.snapshot} current={comparison.current} snapshotHash={target?.evidenceHash ?? ""} currentHash={comparison.comparison.currentEvidenceHash} changedSections={comparison.comparison.changedSections} onClose={closeComparison} /> : null}
    {targetLoading || !target ? <div className="dev079-workspace-loading" role="status"><LoaderCircle className="spin" size={18} />正在載入快照明細...</div> : <CanonicalReviewTargetWorkspace target={target} requestId={requestId} returnTo={safeReturn} rowVersion={shell.rowVersion} actions={shell.actions} />}
    <footer className="pdm-edit-page-action-dock canonical-review-decision-dock" aria-label="審核決策"><div><span className="eyebrow">審核決策</span><small>決策以送審快照為準；伺服器會在核准前重驗送審基準。</small></div><div className="pdm-edit-page-action-dock-actions"><button className="secondary-button" type="button" disabled={busy || !target} onClick={() => void compareTarget()}><CircleAlert size={15} />檢查差異</button><button className="secondary-button" type="button" disabled={busy} onClick={() => void decide("return_for_correction")}><XCircle size={15} />退回修改</button><button className="primary-button" type="button" disabled={busy} onClick={() => void decide("approve")}><ShieldCheck size={15} />核准</button></div></footer>
  </main>;
}
