"use client";

import { useEffect, useState, type ReactNode } from "react";

import { PdfPageViewport, type PdfPageFocusRegion } from "@/components/pdf-page-viewport";

export type CanonicalPreviewMediaModel = {
  href: string;
  mode: "image" | "document";
  title: string;
  alt?: string;
  pageNumber?: number | null;
  openInNewTab?: boolean;
  focusRegion?: PdfPageFocusRegion;
};

const retryIntervalMs = 2_000;
const retryLimit = 30;

function pdfViewerUrl(url: string, pageNumber?: number | null, hideToolbar = false) {
  const [baseUrl, fragment = ""] = url.split("#", 2);
  const params = new URLSearchParams(fragment);
  if (pageNumber) params.set("page", String(pageNumber));
  params.set("navpanes", "0");
  if (hideToolbar) params.set("toolbar", "0");
  return `${baseUrl}#${params.toString()}`;
}

export function CanonicalPreviewMedia({
  media,
  interactive = true,
  compact = false
}: {
  media: CanonicalPreviewMediaModel;
  interactive?: boolean;
  compact?: boolean;
}) {
  const [objectUrl, setObjectUrl] = useState("");
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [resolvedMode, setResolvedMode] = useState<CanonicalPreviewMediaModel["mode"] | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "waiting" | "ready" | "failed">("loading");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let nextObjectUrl = "";
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    setLoadState("loading");
    setObjectUrl("");
    setPdfBytes(null);
    setResolvedMode(null);

    const load = async () => {
      try {
        const response = await fetch(media.href, { credentials: "same-origin", cache: "no-store" });
        if ((response.status === 202 || response.status === 409) && retryCount < retryLimit) {
          retryCount += 1;
          if (!cancelled) {
            setLoadState("waiting");
            retryTimer = setTimeout(() => { retryTimer = null; void load(); }, retryIntervalMs);
          }
          return;
        }
        if (!response.ok) throw new Error(`preview-${response.status}`);
        const blob = await response.blob();
        if (cancelled) return;
        const nextMode = media.mode === "document" && blob.type.toLowerCase().startsWith("image/") ? "image" : media.mode;
        setResolvedMode(nextMode);
        if (nextMode === "document" && media.focusRegion) {
          setPdfBytes(await blob.arrayBuffer());
        } else {
          nextObjectUrl = URL.createObjectURL(blob);
          setObjectUrl(nextObjectUrl);
        }
        if (!cancelled) setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("failed");
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [media.focusRegion, media.href, media.mode, retryToken]);

  let rendered: ReactNode = null;
  if (loadState === "ready" && resolvedMode === "document" && pdfBytes && media.focusRegion) {
    rendered = <PdfPageViewport bytes={pdfBytes} pageNumber={media.pageNumber ?? 1} title={media.title} sourceKey={media.href} focusRegion={media.focusRegion} />;
  } else if (loadState === "ready" && objectUrl) {
    rendered = resolvedMode === "image"
      // Blob URLs are created from the protected endpoint at runtime.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={objectUrl} alt={interactive ? (media.alt ?? media.title) : ""} data-preview-media="image" />
      : <iframe title={media.title} src={pdfViewerUrl(objectUrl, media.pageNumber, true)} data-preview-media="document" />;
  }

  if (rendered) {
    if (!interactive) return <span className="drawing-preview-media-link" data-preview-rendered-mode={resolvedMode ?? media.mode}>{rendered}</span>;
    return <a
      className={`drawing-preview-media-link${pdfBytes ? " is-evidence-page" : ""}`}
      href={resolvedMode === "document" ? pdfViewerUrl(media.href, media.pageNumber) : media.href}
      target={media.openInNewTab === false ? undefined : "_blank"}
      rel={media.openInNewTab === false ? undefined : "noreferrer"}
      aria-label={`${media.title}，點擊開啟預覽`}
      data-preview-rendered-mode={resolvedMode ?? media.mode}
    >{rendered}</a>;
  }

  return <span className={`drawing-preview-placeholder ${loadState === "failed" ? "unavailable" : "pending"}`} data-preview-state={loadState === "failed" ? "unavailable" : "pending"}>
    <strong>{loadState === "failed" ? "預覽尚未就緒" : compact ? "載入中…" : "預覽正在準備"}</strong>
    {!compact ? <span>{loadState === "failed" ? "可重新整理預覽。" : "完成後會自動顯示，請稍候。"}</span> : null}
    {loadState === "failed" && interactive ? <button className="secondary-button preview-generate-button" type="button" onClick={() => setRetryToken((token) => token + 1)}>重新整理預覽</button> : null}
  </span>;
}
