"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Box, Clock3, FileText, WifiOff } from "lucide-react";
import { PdfPageViewport, type PdfPageFocusRegion } from "@/components/pdf-page-viewport";

export type DrawingDetailPreviewKind = "three-d" | "two-d";
export type DrawingDetailPreviewState = "ready" | "pending" | "delayed" | "failed" | "unavailable" | "missing";

export type DrawingDetailPreviewMedia = {
  href: string;
  mode: "image" | "document";
  title: string;
  alt?: string;
  pageNumber?: number | null;
  openInNewTab?: boolean;
  focusRegion?: PdfPageFocusRegion;
};

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

const previewRetryIntervalMs = 2_000;
const previewRetryLimit = 30;

const defaultCards: DrawingDetailPreviewCard[] = [
  {
    kind: "three-d",
    title: "3D 模型",
    state: "missing",
    stateTitle: "尚無可預覽圖面",
    stateText: "有正式 3D 檔後，預覽會顯示在這裡。"
  },
  {
    kind: "two-d",
    title: "2D 圖面",
    state: "missing",
    stateTitle: "尚無可預覽圖面",
    stateText: "有正式 2D 檔後，預覽會顯示在這裡。"
  }
];

function previewStateIcon(state: DrawingDetailPreviewState, kind: DrawingDetailPreviewKind) {
  if (state === "pending" || state === "delayed") return <Clock3 className={`drawing-preview-status-icon ${state}`} size={34} aria-hidden="true" />;
  if (state === "failed") return <AlertTriangle className="drawing-preview-status-icon failed" size={34} aria-hidden="true" />;
  if (state === "unavailable") return <WifiOff className="drawing-preview-status-icon unavailable" size={34} aria-hidden="true" />;
  return kind === "three-d"
    ? <Box className="drawing-preview-status-icon missing" size={34} aria-hidden="true" />
    : <FileText className="drawing-preview-status-icon missing" size={34} aria-hidden="true" />;
}

function normalizeCards(cards: DrawingDetailPreviewCard[] | undefined) {
  const byKind = new Map((cards ?? []).map((card) => [card.kind, card]));
  return defaultCards.map((fallback) => ({ ...fallback, ...byKind.get(fallback.kind) }));
}

function pdfViewerUrl(url: string, pageNumber?: number | null, hideToolbar = false) {
  const [baseUrl, fragment = ""] = url.split("#", 2);
  const params = new URLSearchParams(fragment);
  if (pageNumber) params.set("page", String(pageNumber));
  params.set("navpanes", "0");
  if (hideToolbar) params.set("toolbar", "0");
  return `${baseUrl}#${params.toString()}`;
}

function PreviewMedia({ media, kind }: { media: DrawingDetailPreviewMedia; kind: DrawingDetailPreviewKind }) {
  const [objectUrl, setObjectUrl] = useState("");
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [resolvedMode, setResolvedMode] = useState<DrawingDetailPreviewMedia["mode"] | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "waiting" | "ready" | "failed">("loading");
  const [retryLimitReached, setRetryLimitReached] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let nextObjectUrl = "";
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    setLoadState("loading");
    setRetryLimitReached(false);
    setObjectUrl("");
    setPdfBytes(null);
    setResolvedMode(null);

    const loadPreview = async () => {
      try {
        const response = await fetch(media.href, { credentials: "same-origin" });
        if ((response.status === 202 || response.status === 409) && retryCount < previewRetryLimit) {
          retryCount += 1;
          if (!cancelled) {
            setLoadState("waiting");
            retryTimer = setTimeout(() => {
              retryTimer = null;
              void loadPreview();
            }, previewRetryIntervalMs);
          }
          return;
        }
        if (!response.ok) throw new Error(`preview-${response.status}`);
        const blob = await response.blob();
        if (cancelled) return;
        // A CAD drawing preview can be returned as either a PDF or an image
        // derivative. Do not put image derivatives in an iframe: the browser
        // PDF/image viewer keeps their intrinsic size and pins them to the
        // upper-left corner instead of allowing the preview stage to scale it.
        const nextMode = media.mode === "document" && blob.type.toLowerCase().startsWith("image/") ? "image" : media.mode;
        setResolvedMode(nextMode);
        if (nextMode === "document" && media.focusRegion) {
          const bytes = await blob.arrayBuffer();
          if (cancelled) return;
          setPdfBytes(bytes);
        } else {
          nextObjectUrl = URL.createObjectURL(blob);
          setObjectUrl(nextObjectUrl);
        }
        setLoadState("ready");
      } catch {
        if (!cancelled) {
          setRetryLimitReached(retryCount >= previewRetryLimit);
          setLoadState("failed");
        }
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [media.focusRegion, media.href, media.mode, retryToken]);

  if (loadState === "ready" && resolvedMode === "document" && pdfBytes && media.focusRegion) {
    return (
      <a
        className="drawing-preview-media-link is-evidence-page"
        href={pdfViewerUrl(media.href, media.pageNumber)}
        target={media.openInNewTab === false ? undefined : "_blank"}
        rel={media.openInNewTab === false ? undefined : "noreferrer"}
        aria-label={`${media.title}，點擊開啟預覽`}
        data-preview-rendered-mode="pdf-page"
      >
        <PdfPageViewport bytes={pdfBytes} pageNumber={media.pageNumber ?? 1} title={media.title} sourceKey={media.href} focusRegion={media.focusRegion} />
      </a>
    );
  }

  if (loadState === "ready" && objectUrl) {
    const renderedMedia = resolvedMode === "image"
      ? (
        // Blob URLs are produced by the protected preview endpoint at runtime;
        // next/image cannot optimize them without weakening the access boundary.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={objectUrl} alt={media.alt ?? media.title} data-preview-media="image" />
      )
      : <iframe title={media.title} src={pdfViewerUrl(objectUrl, media.pageNumber, true)} data-preview-media="document" />;
    return (
      <a
        className="drawing-preview-media-link"
        href={resolvedMode === "document" ? pdfViewerUrl(media.href, media.pageNumber) : media.href}
        target={media.openInNewTab === false ? undefined : "_blank"}
        rel={media.openInNewTab === false ? undefined : "noreferrer"}
        aria-label={`${media.title}，點擊開啟預覽`}
        data-preview-rendered-mode={resolvedMode ?? media.mode}
      >
        {renderedMedia}
      </a>
    );
  }
  const waiting = loadState === "loading" || loadState === "waiting";
  const failed = loadState === "failed";
  return (
    <div className={`drawing-preview-placeholder ${waiting ? "pending" : "unavailable"}`} data-preview-state={waiting ? "pending" : "unavailable"}>
      {previewStateIcon(waiting ? "pending" : "unavailable", kind)}
      <strong>{waiting ? "預覽正在準備" : retryLimitReached ? "預覽等待逾時" : "預覽尚未就緒"}</strong>
      <span>{waiting ? `${kind === "three-d" ? "3D" : "2D"} 預覽轉檔完成後會自動顯示，請稍候。` : "檔案已保留，可先下載原檔；預覽產生後會顯示在這裡。"}</span>
      {failed ? (
        <button className="secondary-button preview-generate-button" type="button" onClick={() => setRetryToken((token) => token + 1)}>
          重新整理預覽
        </button>
      ) : null}
    </div>
  );
}

/**
 * One preview board for every drawing detail mode. The adapter only supplies
 * state, media and actions; the 3D/2D layout and empty-state language stay shared.
 */
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
  const classes = ["drawing-preview-board", className].filter(Boolean).join(" ");
  const normalizedCards = normalizeCards(cards);
  const [internalActiveKind, setInternalActiveKind] = useState<DrawingDetailPreviewKind>(defaultActiveKind);
  const selectedKind = activeKind ?? internalActiveKind;
  const visibleCards = layout === "tabs"
    ? [normalizedCards.find((card) => card.kind === selectedKind) ?? normalizedCards[0]]
    : normalizedCards;
  const availableCount = normalizedCards.filter((card) => card.fileName || card.state === "ready").length;
  function selectKind(kind: DrawingDetailPreviewKind) {
    if (activeKind === undefined) setInternalActiveKind(kind);
    onActiveKindChange?.(kind);
  }
  return (
    <section className={`${classes}${layout === "tabs" ? " is-tabbed" : ""}`} aria-label="圖面預覽" data-drawing-detail-section={dataSection} data-component="drawing-detail-preview" data-preview-layout={layout}>
      {showHeader ? (
        <div className={`drawing-preview-board-header${title === null ? " is-meta-only" : ""}`}>
          {title !== null ? <h3>{title}</h3> : null}
          {showMeta ? <strong>{meta ?? `${availableCount} 類`}</strong> : null}
        </div>
      ) : null}
      {layout === "tabs" && showTabs ? (
        <div className="drawing-preview-tabs" role="tablist" aria-label="圖面預覽類型">
          {normalizedCards.map((card) => (
            <button
              key={card.kind}
              type="button"
              role="tab"
              aria-selected={card.kind === selectedKind}
              className={card.kind === selectedKind ? "is-active" : ""}
              onClick={() => selectKind(card.kind)}
            >
              {card.title}
              {showTabFileNames ? <span>{card.fileName || "尚無檔案"}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className={`drawing-preview-grid${layout === "tabs" ? " is-tabbed" : ""}`}>
        {visibleCards.map((card) => {
          const isReady = card.state === "ready" && (card.content || card.media);
          return (
            <article className={`drawing-preview-card ${card.kind}${showCardHeader ? "" : " no-header"}`} key={card.kind} role={layout === "tabs" ? "tabpanel" : undefined}>
              {showCardHeader ? (
                <div className="drawing-preview-card-header">
                  <div><strong>{card.title}</strong></div>
                </div>
              ) : null}
              <div className={`drawing-preview-frame${isReady ? "" : " placeholder-frame"}`}>
                {isReady ? (card.content ?? (card.media ? <PreviewMedia media={card.media} kind={card.kind} /> : null)) : (
                  <div className={`drawing-preview-placeholder ${card.state}`} data-preview-state={card.state}>
                    {previewStateIcon(card.state, card.kind)}
                    <strong>{card.stateTitle ?? "預覽尚未建立"}</strong>
                    <span>{card.stateText ?? "完成檔案準備後，系統會在這裡顯示預覽。"}</span>
                    {card.action ? <div className="drawing-preview-actions-inline">{card.action}</div> : null}
                  </div>
                )}
                {card.overlay}
              </div>
              {showFileName || card.actions ? (
                <div className="drawing-preview-footer">
                  {showFileName ? <div><strong title={card.fileName ?? undefined}>{card.fileName || "尚無正式檔案"}</strong></div> : null}
                  {card.actions ? <div className="drawing-preview-actions">{card.actions}</div> : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
