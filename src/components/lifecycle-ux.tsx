"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  Factory,
  GitPullRequestArrow,
  ListTree,
  PackagePlus,
  Search,
  UploadCloud,
  type LucideIcon
} from "lucide-react";
import { PageHelpDrawerButton, type SecondaryHelpContent } from "@/components/secondary-help";

export type LifecycleStageId = "numbering" | "submission" | "review" | "bom" | "gate" | "handoff" | "ecr";

type LifecycleStage = {
  id: LifecycleStageId;
  title: string;
  phase: string;
  owner: string;
  state: string;
  intent: string;
  risk: string;
  doneSignal: string;
  href: string;
  cta: string;
  icon: LucideIcon;
};

export type LifecycleMetric = {
  label: string;
  value: string | number;
  tone?: "neutral" | "warning" | "critical" | "success";
};

export type ObjectLifecycleStatus =
  | "Draft"
  | "NeedInfo"
  | "Active"
  | "PendingReview"
  | "Released"
  | "Rejected"
  | "Obsolete"
  | "Merged"
  | "EVTDisabled"
  | "PendingAdminConfirm"
  | "MainDrawingInvalid"
  | string;

export type ObjectLifecycleIdentity = {
  label: string;
  value: string | number | null | undefined;
};

type ObjectLifecycleAction = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
};

const lifecycleStages: LifecycleStage[] = [
  {
    id: "numbering",
    title: "需求與領號",
    phase: "EVT",
    owner: "RD",
    state: "Draft / Active",
    intent: "確認要開發的是新料件、共用件或既有料件延伸，先避免重複建號。",
    risk: "重複料號、缺主 MA 圖、品名或分類不清會讓後續 BOM 與交接失準。",
    doneSignal: "料號、圖號、開發階段與基本屬性已建立，下一步可送設計資料。",
    href: "/numbering/request",
    cta: "建立料號",
    icon: PackagePlus
  },
  {
    id: "submission",
    title: "設計送審",
    phase: "EVT / DVT",
    owner: "RD",
    state: "Pending",
    intent: "從受控圖料主資料確認圖面、3D、PDF、DWG 與變更原因後送進 PDM。",
    risk: "主圖、主料、材質、表面處理或附件缺漏會讓審核者無法判斷可否放行。",
    doneSignal: "Submission 進入 Pending，審核者能看到完整檔案與變更脈絡。",
    href: "/numbering/search",
    cta: "送審設計",
    icon: UploadCloud
  },
  {
    id: "review",
    title: "審核與放行",
    phase: "DVT / Release",
    owner: "R&D Manager",
    state: "Releasing / Released",
    intent: "判斷此版是否能成為正式工程資料，而不是只看檔案是否存在。",
    risk: "未 Released 子件、舊版子件、同名 Released 檔案、較新 revision 都要先處理。",
    doneSignal: "核准後完成發行包；發行未完成時產生主管/Admin 待辦。",
    href: "/numbering/approvals",
    cta: "審核待辦",
    icon: ClipboardCheck
  },
  {
    id: "bom",
    title: "BOM 建立與審核",
    phase: "DVT / PVT",
    owner: "RD / Manager",
    state: "Draft / PendingReview / Released",
    intent: "從 CAD reference、SolidWorks XLS 或手動資料建立可追溯的階層 BOM。",
    risk: "缺子件、子件未放行、數量/階層錯誤會直接影響採購與製造版本。",
    doneSignal: "BOM Draft 審核通過後形成 Released Snapshot，可供 where-used 與交接使用。",
    href: "/bom/workbench",
    cta: "整理 BOM",
    icon: ListTree
  },
  {
    id: "gate",
    title: "DVT / Release Gate",
    phase: "DVT / Release",
    owner: "RD / Manager / Admin",
    state: "Ready / Override / Blocked",
    intent: "主動整理候選料件，讓 gate 決策集中處理而不是靠人工翻表。",
    risk: "缺 MA 圖、缺審核、資料不完整或 override 未核准時不可直接晉升。",
    doneSignal: "gate 決策更新料號、圖號與 BOM 使用限制，必要時產生審核批次。",
    href: "/numbering/dvt",
    cta: "檢查 Gate",
    icon: GitPullRequestArrow
  },
  {
    id: "handoff",
    title: "製造與採購交接",
    phase: "Release",
    owner: "Manufacturing / Procurement",
    state: "Released only",
    intent: "只取正式 Released 圖料、審核紀錄、交接包與完整性資訊。",
    risk: "Pending、Rejected、Obsolete 或缺交接包的資料不可混入正式取用清單。",
    doneSignal: "交接包、檔案 SHA256、核准紀錄與 CSV/列印資料可被下游使用。",
    href: "/handoff",
    cta: "開啟交接",
    icon: Factory
  },
  {
    id: "ecr",
    title: "ECR / 改版 / 廢止",
    phase: "ECR",
    owner: "RD / Manager / Admin",
    state: "Impact / Obsolete",
    intent: "從既有料件啟動變更前，先看上層 BOM、圖面、供應商與交接影響。",
    risk: "未確認影響範圍就改版或廢止，會造成製造端拿錯版或缺文件。",
    doneSignal: "新版 Released 後舊版轉 Obsolete；廢止與合併都有審核與稽核紀錄。",
    href: "/numbering/impact",
    cta: "分析影響",
    icon: Search
  }
];

export function getLifecycleStepTitles() {
  return lifecycleStages.map((stage) => stage.title);
}

function stageIndex(stageId: LifecycleStageId) {
  return lifecycleStages.findIndex((stage) => stage.id === stageId);
}

function getStage(stageId: LifecycleStageId) {
  return lifecycleStages.find((stage) => stage.id === stageId) ?? lifecycleStages[0];
}

export function LifecycleMap({
  activeStage,
  roleLabel,
  metrics = []
}: {
  activeStage: LifecycleStageId;
  roleLabel: string;
  metrics?: LifecycleMetric[];
}) {
  const activeIndex = stageIndex(activeStage);

  return (
    <section className="lifecycle-map" aria-label="料件開發生命週期">
      <div className="lifecycle-map-header">
        <div>
          <span className="section-label">Lifecycle UX</span>
          <h2>料件從領號到 ECR 的跨角色操作路徑</h2>
          <p>每一步都標出主要角色、狀態、風險與交接訊號，讓使用者知道目前卡在哪裡。</p>
        </div>
        <div className="lifecycle-map-meta">
          <span className="metadata-badge">目前角色 {roleLabel}</span>
          {metrics.map((metric) => (
            <span className={`lifecycle-metric ${metric.tone ?? "neutral"}`} key={`${metric.label}-${metric.value}`}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </span>
          ))}
        </div>
      </div>
      <ol className="lifecycle-stage-list">
        {lifecycleStages.map((stage, index) => {
          const Icon = stage.icon;
          const isActive = stage.id === activeStage;
          const isDone = index < activeIndex;
          return (
            <li className={isActive ? "active" : isDone ? "done" : undefined} key={stage.id}>
              <Link href={stage.href}>
                <span className="lifecycle-stage-icon">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="lifecycle-stage-body">
                  <strong>{stage.title}</strong>
                  <small>{stage.phase}</small>
                  <span>{stage.owner}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function LifecycleStageGuidance({
  activeStage,
  metrics = [],
  variant = "compact",
  helpContent
}: {
  activeStage: LifecycleStageId;
  metrics?: LifecycleMetric[];
  variant?: "compact" | "expanded";
  helpContent?: SecondaryHelpContent;
}) {
  const stage = getStage(activeStage);
  const index = stageIndex(activeStage);
  const nextStage = lifecycleStages[Math.min(index + 1, lifecycleStages.length - 1)];
  const Icon = stage.icon;
  const resolvedHelpContent: SecondaryHelpContent = helpContent ?? {
    title: stage.title,
    summary: stage.intent,
    sections: [
      {
        title: "Responsibility and status",
        items: [stage.owner, stage.state]
      },
      {
        title: "Risk",
        body: stage.risk
      },
      {
        title: "Done signal",
        body: stage.doneSignal
      }
    ],
    actions: [
      { href: stage.href, label: stage.cta, variant: "primary" },
      ...(nextStage.id !== stage.id ? [{ href: nextStage.href, label: nextStage.title }] : [])
    ]
  };

  return (
    <section className={variant === "expanded" ? "lifecycle-guidance expanded" : "lifecycle-guidance compact"} aria-label={stage.title}>
      <div className="lifecycle-guidance-main">
        <span className="lifecycle-stage-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
        <div>
          <span className="section-label">{stage.phase}</span>
          <h2>{stage.title}</h2>
          {variant === "expanded" ? <p>{stage.intent}</p> : null}
        </div>
        <PageHelpDrawerButton content={resolvedHelpContent} className="lifecycle-help-trigger" />
      </div>
      <div className="lifecycle-guidance-grid">
        <GuidanceItem title="Owner" value={stage.owner} />
        <GuidanceItem title="State" value={stage.state} />
        {variant === "expanded" ? (
          <>
            <GuidanceItem title="Risk" value={stage.risk} icon={AlertTriangle} />
            <GuidanceItem title="Done signal" value={stage.doneSignal} />
          </>
        ) : null}
      </div>
      {metrics.length > 0 ? (
        <div className="lifecycle-guidance-metrics">
          {metrics.map((metric) => (
            <span className={`lifecycle-metric ${metric.tone ?? "neutral"}`} key={`${metric.label}-${metric.value}`}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div className="lifecycle-guidance-actions">
        <span className="primary-button lifecycle-current-action" aria-current="step">
          Current: {stage.cta}
        </span>
        {nextStage.id !== stage.id ? (
          <Link className="secondary-button" href={nextStage.href}>
            Next: {nextStage.title}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function buildUploadPrefillHref({
  rootCode,
  drawingNumber,
  partNumber,
  partName,
  developmentPhase
}: {
  rootCode?: string | null;
  drawingNumber?: string | null;
  partNumber?: string | null;
  partName?: string | null;
  developmentPhase?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("submission", "1");
  if (rootCode) params.set("query", rootCode);
  else if (drawingNumber) params.set("query", drawingNumber);
  else if (partNumber) params.set("query", partNumber);
  if (drawingNumber) params.set("drawingNumber", drawingNumber);
  if (partNumber) params.set("partNumber", partNumber);
  if (partName) params.set("partName", partName);
  if (developmentPhase) params.set("developmentPhase", developmentPhase);
  return `/numbering/search?${params.toString()}`;
}

export function ObjectLifecycleStatusPanel({
  title = "Object lifecycle",
  objectName,
  status,
  phase,
  owner,
  identities,
  blockers = [],
  nextStep,
  primaryAction,
  secondaryActions = [],
  helpContent
}: {
  title?: string;
  objectName: string;
  status: ObjectLifecycleStatus;
  phase?: string | null;
  owner: string;
  identities: ObjectLifecycleIdentity[];
  blockers?: string[];
  nextStep?: string;
  primaryAction?: ObjectLifecycleAction;
  secondaryActions?: ObjectLifecycleAction[];
  helpContent?: SecondaryHelpContent;
}) {
  const statusCopy = describeObjectLifecycleStatus(status);
  const visibleIdentities = identities.filter((identity) => identity.value !== null && identity.value !== undefined && String(identity.value).trim());
  const visibleBlockers = blockers.length > 0 ? blockers : statusCopy.defaultBlockers;
  const showBlockersInline = visibleBlockers.length > 0 && (statusCopy.tone === "warning" || statusCopy.tone === "critical");
  const actions = [primaryAction, ...secondaryActions].filter(Boolean) as ObjectLifecycleAction[];
  const resolvedHelpContent: SecondaryHelpContent = helpContent ?? {
    title,
    summary: statusCopy.description,
    sections: [
      {
        title: "Object",
        items: [objectName, phase ? `${phase} / ${owner}` : owner, statusCopy.label]
      },
      {
        title: "Blockers and notes",
        items: visibleBlockers
      },
      {
        title: "Next step",
        body: nextStep ?? statusCopy.nextStep
      },
      {
        title: "Identity",
        items: visibleIdentities.map((identity) => `${identity.label}: ${identity.value}`)
      }
    ],
    actions
  };

  return (
    <section className={`object-lifecycle-panel ${statusCopy.tone}`} aria-label={title}>
      <div className="object-lifecycle-header">
        <div>
          <span className="section-label">Object lifecycle</span>
          <h2>{title}</h2>
          <p>{objectName}</p>
        </div>
        <div className="object-lifecycle-header-actions">
          <PageHelpDrawerButton content={resolvedHelpContent} className="object-lifecycle-help-trigger" />
          <span className={`badge ${status}`}>{status}</span>
        </div>
      </div>
      <div className="object-lifecycle-grid">
        <div className="object-lifecycle-state">
          <span className="object-lifecycle-dot" aria-hidden="true" />
          <div>
            <span className="metadata-badge">{phase ? `${phase} / ${owner}` : owner}</span>
            <strong>{statusCopy.label}</strong>
          </div>
        </div>
        <div className="object-lifecycle-identity">
          {visibleIdentities.map((identity) => (
            <span className="metadata-pair" key={`${identity.label}-${identity.value}`}>
              <span className="metadata-label">{identity.label}</span>
              <span className="metadata-value">{identity.value}</span>
            </span>
          ))}
        </div>
      </div>
      {showBlockersInline || actions.length > 0 ? (
        <div className="object-lifecycle-next compact">
          {showBlockersInline ? (
            <div>
              <span className="section-label">Notes</span>
              <ul>
                {visibleBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {actions.length > 0 ? (
            <div className="object-lifecycle-actions-panel">
              <span className="section-label">Actions</span>
              <div className="object-lifecycle-actions">
                {primaryAction ? (
                  <Link className={primaryAction.variant === "secondary" ? "secondary-button" : "primary-button"} href={primaryAction.href}>
                    {primaryAction.label}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                ) : null}
                {secondaryActions.map((action) => (
                  <Link className={action.variant === "primary" ? "primary-button" : "secondary-button"} href={action.href} key={`${action.href}-${action.label}`}>
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function describeObjectLifecycleStatus(status: ObjectLifecycleStatus) {
  const descriptions: Record<
    string,
    {
      label: string;
      description: string;
      nextStep: string;
      tone: "neutral" | "warning" | "critical" | "success";
      defaultBlockers: string[];
    }
  > = {
    Draft: {
      label: "草稿已建立，尚未送審",
      description: "這個圖料已取得號碼，但還不是可用工程資料，也不會出現在正式交接清單。",
      nextStep: "RD 需上傳圖面、3D/PDF/DWG、PDM 屬性與變更原因，建立 Pending submission。",
      tone: "warning",
      defaultBlockers: ["尚未建立 submission", "尚未完成檔案與工程屬性送審"]
    },
    NeedInfo: {
      label: "需要補資料",
      description: "資料不足，後續審核或 gate 無法安全判斷。",
      nextStep: "補齊缺漏欄位、圖面或說明後再送審。",
      tone: "warning",
      defaultBlockers: ["仍有必要欄位或工程資料缺漏"]
    },
    Active: {
      label: "可接續開發",
      description: "物件已啟用，但仍需依階段完成送審、BOM 或 gate。",
      nextStep: "依目前階段建立送審、BOM Draft 或進入 DVT/PVT gate 檢查。",
      tone: "neutral",
      defaultBlockers: ["需確認是否已有最新 submission 與 BOM 狀態"]
    },
    PendingReview: {
      label: "審核中",
      description: "此物件正在等待主管或指定審核者判斷，RD 不應自行視為 Released。",
      nextStep: "查看審核待辦與補件要求，等待核准或駁回。",
      tone: "warning",
      defaultBlockers: ["等待審核決策"]
    },
    Released: {
      label: "已放行",
      description: "此物件可作為正式工程資料來源，後續仍需確認交接包與 BOM snapshot。",
      nextStep: "進入製造交接、BOM Released Snapshot 或 ECR 影響分析。",
      tone: "success",
      defaultBlockers: ["確認交接包、SHA256 與 released BOM 是否完整"]
    },
    Rejected: {
      label: "已駁回",
      description: "此版本不可使用，需依駁回原因修正後重新送審。",
      nextStep: "查看駁回理由，修正資料後建立新版送審。",
      tone: "critical",
      defaultBlockers: ["需處理駁回原因"]
    },
    Obsolete: {
      label: "已廢止",
      description: "此版本只供追溯，不可作為正式製造、採購或供應商交接來源。",
      nextStep: "查看新版 revision、ECR 影響範圍或歷史稽核紀錄。",
      tone: "critical",
      defaultBlockers: ["不可用於正式交接"]
    },
    ReleaseFailed: {
      label: "發行未完成",
      description: "系統尚未完成正式發行包，使用者不可誤認為已發行。",
      nextStep: "由主管或 Admin 查看原因，重新發行或退回修正。",
      tone: "critical",
      defaultBlockers: ["發行包尚未完成"]
    },
    PendingAdminConfirm: {
      label: "等待管理員確認",
      description: "此草稿或異常狀態需要管理員確認後才能往下走。",
      nextStep: "通知 PDM 管理員處理逾期草稿或狀態異常。",
      tone: "critical",
      defaultBlockers: ["等待 PDM 管理員確認"]
    },
    MainDrawingInvalid: {
      label: "主要 MA 圖失效",
      description: "主要製造圖已失效，相關料號不可直接進 gate 或交接。",
      nextStep: "重新送審有效 MA 圖，並確認受影響料號。",
      tone: "critical",
      defaultBlockers: ["缺有效主要 MA 圖"]
    }
  };

  return (
    descriptions[status] ?? {
      label: "狀態待確認",
      description: "系統已記錄狀態，但需要進入明細確認下一步。",
      nextStep: "查看物件明細、待辦與稽核紀錄。",
      tone: "neutral" as const,
      defaultBlockers: ["需確認明細資料"]
    }
  );
}

function GuidanceItem({ title, value, icon: Icon }: { title: string; value: string; icon?: LucideIcon }) {
  return (
    <div className="lifecycle-guidance-item">
      <span>
        {Icon ? <Icon size={14} aria-hidden="true" /> : null}
        {title}
      </span>
      <strong>{value}</strong>
    </div>
  );
}
