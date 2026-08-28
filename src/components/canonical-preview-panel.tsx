"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Box, Clock3, FileText, ImageIcon, WifiOff } from "lucide-react";

import { CanonicalPreviewMedia, type CanonicalPreviewMediaModel } from "@/components/canonical-preview-media";
import type { CanonicalPreviewState } from "@/lib/pdm-canonical-preview";

export type CanonicalPreviewPanelCard = {
  key: string;
  title: string;
  fileName?: string | null;
  state: CanonicalPreviewState;
  stateTitle?: string;
  stateText?: string;
  visual?: "model" | "document" | "image";
  media?: CanonicalPreviewMediaModel;
  content?: ReactNode;
  action?: ReactNode;
  actions?: ReactNode;
  overlay?: ReactNode;
};

function stateIcon(card: CanonicalPreviewPanelCard) {
  if (card.state === "pending" || card.state === "delayed") return <Clock3 className={`drawing-preview-status-icon ${card.state}`} size={34} aria-hidden="true" />;
  if (card.state === "failed") return <AlertTriangle className="drawing-preview-status-icon failed" size={34} aria-hidden="true" />;
  if (card.state === "unavailable") return <WifiOff className="drawing-preview-status-icon unavailable" size={34} aria-hidden="true" />;
  if (card.visual === "document") return <FileText className="drawing-preview-status-icon missing" size={34} aria-hidden="true" />;
  if (card.visual === "image") return <ImageIcon className="drawing-preview-status-icon missing" size={34} aria-hidden="true" />;
  return <Box className="drawing-preview-status-icon missing" size={34} aria-hidden="true" />;
}

export function CanonicalPreviewPanel({
  cards,
  title = "預覽",
  meta,
  className = "",
  dataSection = "canonical-preview",
  showHeader = true,
  showMeta = true,
  showTabFileNames = true,
  showTabs = true,
  showCardHeader = true,
  showFileName = true,
  headerActions,
  layout = "grid",
  activeKey,
  defaultActiveKey,
  onActiveKeyChange
}: {
  cards: CanonicalPreviewPanelCard[];
  title?: ReactNode;
  meta?: ReactNode;
  className?: string;
  dataSection?: string;
  showHeader?: boolean;
  showMeta?: boolean;
  showTabFileNames?: boolean;
  showTabs?: boolean;
  showCardHeader?: boolean;
  showFileName?: boolean;
  headerActions?: ReactNode;
  layout?: "grid" | "tabs" | "single";
  activeKey?: string;
  defaultActiveKey?: string;
  onActiveKeyChange?: (key: string) => void;
}) {
  const [internalActiveKey, setInternalActiveKey] = useState(defaultActiveKey ?? cards[0]?.key ?? "");
  const selectedKey = activeKey ?? internalActiveKey;
  const tabbed = layout === "tabs";
  const visibleCards = tabbed ? [cards.find((card) => card.key === selectedKey) ?? cards[0]].filter(Boolean) : cards;
  const availableCount = cards.filter((card) => card.fileName || card.state === "ready").length;
  const select = (key: string) => {
    if (activeKey === undefined) setInternalActiveKey(key);
    onActiveKeyChange?.(key);
  };
  return <section
    className={`drawing-preview-board canonical-preview-panel ${className}${tabbed ? " is-tabbed" : ""}`}
    aria-label={typeof title === "string" ? title : "預覽"}
    data-canonical-preview-section={dataSection}
    data-component="canonical-preview-panel"
    data-preview-layout={layout}
  >
    {showHeader || headerActions ? <div className={`drawing-preview-board-header${title === null ? " is-meta-only" : ""}${headerActions && !showHeader ? " is-actions-only" : ""}`}>
      {showHeader && title !== null ? <h3>{title}</h3> : null}
      {showHeader && showMeta ? <strong>{meta ?? `${availableCount} 類`}</strong> : null}
      {headerActions ? <div className="drawing-preview-board-actions">{headerActions}</div> : null}
    </div> : null}
    {tabbed && showTabs ? <div className="drawing-preview-tabs" role="tablist" aria-label="預覽類型">
      {cards.map((card) => <button key={card.key} type="button" role="tab" aria-selected={card.key === selectedKey} className={card.key === selectedKey ? "is-active" : ""} onClick={() => select(card.key)}>
        {card.title}{showTabFileNames ? <span>{card.fileName || "尚無檔案"}</span> : null}
      </button>)}
    </div> : null}
    <div className={`drawing-preview-grid${tabbed ? " is-tabbed" : ""}`}>
      {visibleCards.map((card) => {
        const ready = card.state === "ready" && (card.content || card.media);
        return <article className={`drawing-preview-card ${card.key}${showCardHeader ? "" : " no-header"}`} key={card.key} role={tabbed ? "tabpanel" : undefined}>
          {showCardHeader ? <div className="drawing-preview-card-header"><div><strong>{card.title}</strong></div></div> : null}
          <div className={`drawing-preview-frame${ready ? "" : " placeholder-frame"}`}>
            {ready ? (card.content ?? (card.media ? <CanonicalPreviewMedia media={card.media} /> : null)) : <div className={`drawing-preview-placeholder ${card.state}`} data-preview-state={card.state}>
              {stateIcon(card)}<strong>{card.stateTitle ?? "預覽尚未建立"}</strong><span>{card.stateText ?? "完成檔案準備後，系統會在這裡顯示預覽。"}</span>
              {card.action ? <div className="drawing-preview-actions-inline">{card.action}</div> : null}
            </div>}
            {card.overlay}
          </div>
          {showFileName || card.actions ? <div className="drawing-preview-footer">
            {showFileName ? <div><strong title={card.fileName ?? undefined}>{card.fileName || "尚無正式檔案"}</strong></div> : null}
            {card.actions ? <div className="drawing-preview-actions">{card.actions}</div> : null}
          </div> : null}
        </article>;
      })}
    </div>
  </section>;
}
