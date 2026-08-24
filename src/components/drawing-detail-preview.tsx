"use client";

import type { ReactNode } from "react";

import {
  CanonicalPreviewPanel,
  type CanonicalPreviewPanelCard
} from "@/components/canonical-preview-panel";
import type { CanonicalPreviewMediaModel } from "@/components/canonical-preview-media";
import type { CanonicalPreviewState } from "@/lib/pdm-canonical-preview";

export type DrawingDetailPreviewKind = "three-d" | "two-d";
export type DrawingDetailPreviewState = CanonicalPreviewState;
export type DrawingDetailPreviewMedia = CanonicalPreviewMediaModel;

export type DrawingDetailPreviewCard = {
  kind: DrawingDetailPreviewKind;
  title: string;
  fileName?: string | null;
  state: DrawingDetailPreviewState;
  stateTitle?: string;
  stateText?: string;
  media?: DrawingDetailPreviewMedia;
  content?: ReactNode;
  action?: ReactNode;
  actions?: ReactNode;
  overlay?: ReactNode;
};

type DrawingDetailPreviewProps = {
  cards?: DrawingDetailPreviewCard[];
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
  layout?: "grid" | "tabs";
  activeKind?: DrawingDetailPreviewKind;
  defaultActiveKind?: DrawingDetailPreviewKind;
  onActiveKindChange?: (kind: DrawingDetailPreviewKind) => void;
};

const defaultCards: DrawingDetailPreviewCard[] = [
  { kind: "three-d", title: "3D 模型", state: "missing", stateTitle: "尚無可預覽圖面", stateText: "有正式 3D 檔後，預覽會顯示在這裡。" },
  { kind: "two-d", title: "2D 圖面", state: "missing", stateTitle: "尚無可預覽圖面", stateText: "有正式 2D 檔後，預覽會顯示在這裡。" }
];

function normalizedCards(cards: DrawingDetailPreviewCard[] | undefined): CanonicalPreviewPanelCard[] {
  const byKind = new Map((cards ?? []).map((card) => [card.kind, card]));
  return defaultCards.map((fallback) => {
    const card = { ...fallback, ...byKind.get(fallback.kind) };
    return {
      ...card,
      key: card.kind,
      visual: card.kind === "three-d" ? "model" as const : "document" as const
    };
  });
}

/** Compatibility adapter only: all loading, state and panel layout live in
 * the entity-neutral canonical preview components. */
export function DrawingDetailPreview({
  cards,
  title = "圖面預覽",
  meta,
  className = "",
  dataSection = "drawing-preview",
  showHeader = true,
  showMeta = true,
  showTabFileNames = true,
  showTabs = true,
  showCardHeader = true,
  showFileName = true,
  layout = "grid",
  activeKind,
  defaultActiveKind = "two-d",
  onActiveKindChange
}: DrawingDetailPreviewProps) {
  return <CanonicalPreviewPanel
    cards={normalizedCards(cards)}
    title={title}
    meta={meta}
    className={className}
    dataSection={dataSection}
    showHeader={showHeader}
    showMeta={showMeta}
    showTabFileNames={showTabFileNames}
    showTabs={showTabs}
    showCardHeader={showCardHeader}
    showFileName={showFileName}
    layout={layout}
    activeKey={activeKind}
    defaultActiveKey={defaultActiveKind}
    onActiveKeyChange={(key) => onActiveKindChange?.(key as DrawingDetailPreviewKind)}
  />;
}
