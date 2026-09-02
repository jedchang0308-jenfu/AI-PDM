"use client";

import { useRouter } from "next/navigation";
import type { CanonicalPartBomContext } from "@/lib/pdm-canonical-workbench-contract";
import { buildBomCreateHref } from "@/lib/bom-create-navigation";

export function PartBomContext({ context, partNumberId, partNumber, mode = "workspace", returnTo = "/parts", alwaysShow = false }: {
  context: CanonicalPartBomContext;
  partNumberId: string;
  partNumber: string;
  mode?: "readonly" | "workspace";
  returnTo?: string;
  alwaysShow?: boolean;
}) {
  const router = useRouter();
  if (context.action === "none" && !context.blocker && !alwaysShow) return null;
  const requiresStructureSetup = context.action === "none"
    && !context.blocker
    && !context.bomRevision
    && context.structureType !== "assembly";
  const maintenanceHref = mode === "workspace" && requiresStructureSetup ? buildMaintenanceHref(returnTo) : null;

  const openExisting = () => {
    if (mode === "workspace" && context.draftId) router.push(`/bom/workbench/${encodeURIComponent(context.draftId)}?parentPartNumberId=${encodeURIComponent(partNumberId)}&returnTo=${encodeURIComponent(returnTo)}`);
  };
  const openCreatePage = () => {
    if (mode !== "workspace") return;
    router.push(buildBomCreateHref({
      partNumberId,
      returnTo
    }));
  };
  const openMaintenance = () => {
    if (!maintenanceHref) return;
    const target = new URL(maintenanceHref, window.location.origin);
    if (target.pathname === window.location.pathname) {
      window.history.pushState({}, "", `${target.pathname}${target.search}${target.hash}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    router.push(maintenanceHref);
  };

  return <section className="part-bom-context" data-section="part-bom-context">
    <div className="canonical-drawer-section-heading"><h3>BOM</h3>
      {mode === "workspace" && context.action === "create_bom" ? <button type="button" className="primary-button" onClick={openCreatePage}>建立 BOM</button> : null}
      {mode === "workspace" && context.action === "open_bom" ? <button type="button" className="primary-button" disabled={!context.draftId} onClick={openExisting}>{context.status === "Obsolete" ? "查看 BOM 歷史" : "開啟 BOM"}</button> : null}
      {maintenanceHref ? <button type="button" className="secondary-button" onClick={openMaintenance}>前往維護調整結構型態</button> : null}
    </div>
    {context.blocker ? <p className="canonical-error" role="alert" data-bom-blocker={context.blocker.code}>{context.blocker.message}</p> : context.bomRevision ? <p className="part-bom-context-summary">Rev {context.bomRevision} · {statusLabel(context.status)} · {context.applicableParentCount} 個適用料號</p> : <p className="part-bom-context-summary" data-bom-empty-reason={requiresStructureSetup ? context.structureType : "not-available"}>{emptyBomMessage(context, requiresStructureSetup)}</p>}
    {context.action === "create_bom" ? <p className="part-bom-context-summary">Parent：{partNumber} · 進入建立頁確認適用料號</p> : null}
  </section>;
}

function emptyBomMessage(context: CanonicalPartBomContext, requiresStructureSetup: boolean) {
  if (!requiresStructureSetup) return "目前尚未建立 BOM";
  if (context.structureType === "single_part") return "此料號為單一零件，不適用 BOM";
  return "請先設定結構型態後再建立 BOM";
}

function buildMaintenanceHref(returnTo: string) {
  const fallback = "/parts";
  if (typeof window === "undefined") return fallback;
  try {
    const url = new URL(returnTo || fallback, window.location.origin);
    if (url.origin !== window.location.origin || !/^\/parts\/[^/]+\/workspace$/u.test(url.pathname)) return fallback;
    url.searchParams.set("tab", "maintenance");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function statusLabel(status: CanonicalPartBomContext["status"]) {
  if (status === "PendingReview") return "審核中";
  if (status === "Released") return "已發行";
  if (status === "Rejected") return "已退回";
  if (status === "Archived") return "已封存";
  if (status === "Obsolete") return "已作廢";
  return "草稿";
}
