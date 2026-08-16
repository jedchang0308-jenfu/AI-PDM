"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Box, Clock3, FileText, WifiOff } from "lucide-react";

export type DrawingDetailPreviewKind = "three-d" | "two-d";
export type DrawingDetailPreviewState = "ready" | "pending" | "delayed" | "failed" | "unavailable" | "missing";

export type DrawingDetailPreviewMedia = {
  href: string;
  mode: "image" | "document";
  title: string;
  alt?: string;
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
};

type DrawingDetailPreviewProps = {
  cards?: DrawingDetailPreviewCard[];
  title?: ReactNode;
  meta?: ReactNode;
  className?: string;
  dataSection?: string;
  showHeader?: boolean;
  showFileName?: boolean;
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

function PreviewMedia({ media, kind }: { media: DrawingDetailPreviewMedia; kind: DrawingDetailPreviewKind }) {
  const [objectUrl, setObjectUrl] = useState("");
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
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
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
  }, [media.href, retryToken]);

  if (loadState === "ready" && objectUrl) {
    const renderedMedia = media.mode === "image"
      ? <img src={objectUrl} alt={media.alt ?? media.title} />
      : <iframe title={media.title} src={objectUrl} />;
    return (
      <a
        className="drawing-preview-media-link"
        href={media.href}
        target="_blank"
        rel="noreferrer"
        aria-label={`${media.title}，點擊開啟預覽`}
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
  showFileName = true
}: DrawingDetailPreviewProps) {
  const classes = ["drawing-preview-board", className].filter(Boolean).join(" ");
  const normalizedCards = normalizeCards(cards);
  const availableCount = normalizedCards.filter((card) => card.fileName || card.state === "ready").length;
  return (
    <section className={classes} aria-label="圖面預覽" data-drawing-detail-section={dataSection} data-component="drawing-detail-preview">
      {showHeader ? (
        <div className="drawing-preview-board-header">
          <h3>{title}</h3>
          <strong>{meta ?? `${availableCount} 類`}</strong>
        </div>
      ) : null}
      <div className="drawing-preview-grid">
        {normalizedCards.map((card) => {
          const isReady = card.state === "ready" && (card.content || card.media);
          return (
            <article className={`drawing-preview-card ${card.kind}`} key={card.kind}>
              <div className="drawing-preview-card-header">
                <div><strong>{card.title}</strong></div>
              </div>
              <div className={`drawing-preview-frame${isReady ? "" : " placeholder-frame"}`}>
                {isReady ? (card.content ?? (card.media ? <PreviewMedia media={card.media} kind={card.kind} /> : null)) : (
                  <div className={`drawing-preview-placeholder ${card.state}`} data-preview-state={card.state}>
                    {previewStateIcon(card.state, card.kind)}
                    <strong>{card.stateTitle ?? "預覽尚未建立"}</strong>
                    <span>{card.stateText ?? "完成檔案準備後，系統會在這裡顯示預覽。"}</span>
                    {card.action ? <div className="drawing-preview-actions-inline">{card.action}</div> : null}
                  </div>
                )}
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
