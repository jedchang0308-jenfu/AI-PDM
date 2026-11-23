"use client";

import { useEffect, useState, type ReactNode } from "react";

import { PdfDocumentViewport } from "@/components/pdf-document-viewport";
import { PdfPageViewport, type PdfPageFocusRegion } from "@/components/pdf-page-viewport";
import { LoadingIndicator } from "@/components/loading-indicator";
import { normalizeMediaType } from "@/lib/media-type";
import { invalidatePdmPermissions } from "@/lib/pdm-permission-client";
import { usePdmPreviewImageCache } from "./pdm-preview-image-cache-context";

export type CanonicalPreviewMediaModel = {
  href: string;
  mode: "image" | "document";
  title: string;
  alt?: string;
  pageNumber?: number | null;
  openInNewTab?: boolean;
  focusRegion?: PdfPageFocusRegion;
  renderPdfPage?: boolean;
  fullPdf?: boolean;
  contentHash?: string | null;
  /** Optional current-revision PNG/native fallback used only after the full
   * PDF cannot be read. Historical files must never be supplied here. */
  fallback?: CanonicalPreviewMediaModel;
  fallbackNotice?: string;
};

const retryIntervalMs = 2_000;
const retryLimit = 30;
const requestTimeoutMs = 20_000;

class PreviewResponseError extends Error {
  constructor(
    readonly pending: boolean,
    readonly state: string | null,
    readonly status: number,
    readonly code: string | null,
    readonly jobErrorCode: string | null
  ) {
    super("preview-response");
  }
}

class PreviewRequestTimeoutError extends Error {
  constructor() { super("preview-request-timeout"); }
}

function previewErrorFields(body: unknown) {
  if (!body || typeof body !== "object" || !("error" in body) || !body.error || typeof body.error !== "object") {
    return { code: null, jobErrorCode: null };
  }
  const error = body.error as Record<string, unknown>;
  return {
    code: typeof error.code === "string" ? error.code : null,
    jobErrorCode: typeof error.jobErrorCode === "string" ? error.jobErrorCode : null
  };
}

function terminalPreviewReason(error: PreviewResponseError) {
  if (error.status === 401) return "登入狀態已失效，請重新開啟工作區。";
  if (error.status === 403) return "目前沒有讀取這份預覽的權限。";
  if (error.state === "cancelled" || error.code === "PREVIEW_CANCELLED") return "預覽已取消；可下載原檔。";
  if (error.state === "unsupported" || error.code === "PREVIEW_UNSUPPORTED") return "此格式目前不支援預覽，可下載原檔。";
  if (error.code === "PREVIEW_OUTPUT_MISSING") return "預覽工作已完成，但找不到輸出檔。";
  if (error.jobErrorCode === "preview_worker_unavailable" || error.jobErrorCode === "preview_worker_heartbeat_timeout") {
    return "Windows 預覽服務目前未連線，可稍後重新讀取。";
  }
  if (error.code === "PREVIEW_FAILED" || error.state === "failed") return "預覽產生失敗，可下載原檔或稍後重新讀取。";
  return "預覽無法顯示，可下載原檔。";
}

export function canonicalPreviewResponseDisposition(status: number, state: string | null, body: unknown) {
  const error = body && typeof body === "object" && "error" in body ? body.error : null;
  const retryable = error && typeof error === "object" && "retryable" in error && error.retryable === true;
  return status === 202 && state === "pending" && retryable ? "pending" : "terminal";
}

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
  const [terminalReason, setTerminalReason] = useState("");
  const [loadedHref, setLoadedHref] = useState("");
  const [deniedHref, setDeniedHref] = useState("");
  const previewContext = usePdmPreviewImageCache();
  const pdfCache = previewContext?.pdfCache;
  const imageCache = media.mode === "image" ? previewContext?.cache : null;
  const enabled = previewContext?.enabled ?? true;
  const deniedHrefs = previewContext?.deniedHrefs;
  const previewBlocked = deniedHrefs ? deniedHrefs.has(media.href) : deniedHref === media.href;
  const renderDocumentAsPdfPage = media.mode === "document" && Boolean(media.renderPdfPage || media.focusRegion);
  const requiresFullPdf = media.mode === "document" && Boolean(media.fullPdf) && !renderDocumentAsPdfPage;
  const fullViewer = media.mode === "document" && !renderDocumentAsPdfPage && interactive && !compact;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let nextObjectUrl = "";
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let releaseImage: (() => void) | null = null;
    const readDeadline = enabled && requiresFullPdf ? setTimeout(() => {
      cancelled = true; controller.abort();
      setTerminalReason("PDF 讀取逾時，可下載原檔。"); setLoadState("failed");
    }, 60_000) : null;
    setLoadState("loading");
    setObjectUrl("");
    setPdfBytes(null);
    setResolvedMode(null);
    setTerminalReason("");
    setLoadedHref("");

    const readBlob = async (signal: AbortSignal) => {
      const requestController = new AbortController();
      const abortRequest = () => requestController.abort();
      if (signal.aborted) abortRequest();
      else signal.addEventListener("abort", abortRequest, { once: true });
      const requestDeadline = requiresFullPdf ? null : setTimeout(abortRequest, requestTimeoutMs);
      try {
        const response = requiresFullPdf && media.contentHash && pdfCache
          ? await pdfCache.read(media.href, media.contentHash, requestController.signal)
          : await fetch(media.href, { credentials: "same-origin", cache: "no-store", signal: requestController.signal });
        if (signal.aborted) throw new DOMException("Preview read aborted", "AbortError");
        if (response.status === 401 || response.status === 403) {
          if (deniedHrefs) deniedHrefs.add(media.href);
          else setDeniedHref(media.href);
          invalidatePdmPermissions(response.status === 401 ? "unauthenticated" : "forbidden");
        }
        if (!response.ok || response.status === 202) {
          const state = response.headers.get("x-pdm-preview-state");
          const body: unknown = await response.json().catch(() => null);
          const fields = previewErrorFields(body);
          throw new PreviewResponseError(canonicalPreviewResponseDisposition(response.status, state, body) === "pending", state,
            response.status, fields.code, fields.jobErrorCode);
        }
        return response.blob();
      } catch (error) {
        if (!signal.aborted && requestController.signal.aborted) throw new PreviewRequestTimeoutError();
        throw error;
      } finally {
        if (requestDeadline) clearTimeout(requestDeadline);
        signal.removeEventListener("abort", abortRequest);
      }
    };

    const load = async () => {
      try {
        let blob: Blob;
        if (imageCache) {
          const lease = imageCache.acquire(media.href, readBlob);
          releaseImage = lease.release;
          blob = await lease.promise;
        } else {
          blob = await readBlob(controller.signal);
        }
        if (cancelled) return;
        if (requiresFullPdf) {
          const header = await blob.slice(0, 5).text();
          if (cancelled) return;
          if (normalizeMediaType(blob.type) !== "application/pdf" || header !== "%PDF-") {
            if (readDeadline) clearTimeout(readDeadline);
            setTerminalReason("PDF 預覽無法顯示，可下載原檔。");
            setLoadState("failed");
            return;
          }
        }
        const nextMode = media.mode === "document" && blob.type.toLowerCase().startsWith("image/") ? "image" : media.mode;
        if (nextMode === "document" && (renderDocumentAsPdfPage || requiresFullPdf)) {
          const bytes = await blob.arrayBuffer();
          if (cancelled) return;
          setPdfBytes(bytes);
        } else {
          nextObjectUrl = URL.createObjectURL(blob);
          setObjectUrl(nextObjectUrl);
        }
        setResolvedMode(nextMode);
        setLoadedHref(media.href);
        if (readDeadline) clearTimeout(readDeadline);
        setLoadState("ready");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof PreviewResponseError) {
          if (error.pending && retryCount < retryLimit) {
            retryCount += 1;
            setLoadState("waiting");
            retryTimer = setTimeout(() => { retryTimer = null; void load(); }, retryIntervalMs);
            return;
          }
          setTerminalReason(error.pending ? "預覽服務處理逾時，可稍後重新讀取。" : terminalPreviewReason(error));
        } else if (error instanceof PreviewRequestTimeoutError) {
          setTerminalReason("預覽服務回應逾時，請稍後重新讀取。");
        } else {
          setTerminalReason("無法連線到預覽服務，請稍後重新讀取。");
        }
        if (readDeadline) clearTimeout(readDeadline);
        if (!cancelled) setLoadState("failed");
      } finally {
        releaseImage?.();
        releaseImage = null;
      }
    };
    const stop = () => {
      cancelled = true;
      controller.abort();
      releaseImage?.();
      releaseImage = null;
      if (readDeadline) clearTimeout(readDeadline);
      if (retryTimer) clearTimeout(retryTimer);
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
      nextObjectUrl = "";
    };
    const unsubscribe = imageCache?.subscribe(() => {
      stop();
      setLoadedHref("");
      setObjectUrl("");
      setRetryToken(token => token + 1);
    });
    if (enabled && (deniedHrefs ? deniedHrefs.has(media.href) : deniedHref === media.href)) {
      setTerminalReason("預覽無法顯示，可下載原檔。");
      setLoadState("failed");
    } else if (enabled) void load();
    return () => {
      unsubscribe?.();
      stop();
    };
  }, [media.href, media.mode, media.contentHash, renderDocumentAsPdfPage, requiresFullPdf, retryToken, imageCache, pdfCache, enabled, deniedHrefs, deniedHref]);

  let rendered: ReactNode = null;
  const hasLoadedMedia = enabled && !previewBlocked && loadedHref === media.href && loadState === "ready";
  if (hasLoadedMedia && resolvedMode === "document" && pdfBytes && renderDocumentAsPdfPage) {
    rendered = <PdfPageViewport bytes={pdfBytes} pageNumber={media.pageNumber ?? 1} title={media.title} sourceKey={media.href} focusRegion={media.focusRegion} />;
  } else if (hasLoadedMedia && pdfBytes && requiresFullPdf) {
    rendered = <PdfDocumentViewport bytes={pdfBytes} sourceKey={media.href} title={media.title} showControls={false} fitPage={fullViewer} />;
  } else if (hasLoadedMedia && objectUrl) {
    rendered = resolvedMode === "image"
      // Blob URLs are created from the protected endpoint at runtime.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={objectUrl} alt={interactive ? (media.alt ?? media.title) : ""} data-preview-media="image" onError={() => { imageCache?.evict(media.href); setLoadState("failed"); }} />
      : <iframe title={media.title} src={pdfViewerUrl(objectUrl, media.pageNumber, !fullViewer)} data-preview-media="document" />;
  }

  if (rendered) {
    if (fullViewer && resolvedMode === "document") return <div className="drawing-preview-media-link is-full-pdf" data-preview-full-pdf="true" data-preview-rendered-mode="document">
      {rendered}
      <a className="dev122-pdf-open" href={pdfViewerUrl(media.href, media.pageNumber)} target={media.openInNewTab === false ? undefined : "_blank"} rel={media.openInNewTab === false ? undefined : "noreferrer"} aria-label={`開啟 ${media.title}`}>開啟 PDF</a>
    </div>;
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

  if (loadState === "failed" && media.fallback) {
    const { fallback: _nestedFallback, fallbackNotice: _nestedNotice, ...fallback } = media.fallback;
    return <div className="drawing-preview-fallback" data-preview-state="fallback">
      <div className="drawing-preview-fallback-status" role="status"><strong>{terminalReason || "PDF 預覽無法顯示。"}</strong><span>{media.fallbackNotice || "已改用本版簡易預覽。若要查看完整圖面，請重新上傳 PDF。"}</span></div>
      <CanonicalPreviewMedia media={fallback} interactive={interactive} compact={compact} />
      {interactive && !compact ? <button className="secondary-button preview-generate-button" type="button" onClick={() => { deniedHrefs?.delete(media.href); setDeniedHref(""); setRetryToken((token) => token + 1); }}>重新讀取 PDF</button> : null}
    </div>;
  }

  return <span className={`drawing-preview-placeholder ${loadState === "failed" ? "unavailable" : "pending"}`} data-preview-state={loadState === "failed" ? "unavailable" : "pending"}>
    <strong>{loadState === "failed" ? terminalReason || "預覽尚未就緒" : <LoadingIndicator>{compact ? "載入中…" : loadState === "waiting" ? "正在產生預覽" : "正在讀取來源檔"}</LoadingIndicator>}</strong>
    {!compact && loadState !== "failed" ? <span>{loadState === "waiting" ? "預覽服務已接單，完成後會自動顯示。" : "正在確認來源、權限與既有預覽。"}</span> : null}
    {loadState === "failed" && interactive && !compact ? <button className="secondary-button preview-generate-button" type="button" onClick={() => { deniedHrefs?.delete(media.href); setDeniedHref(""); setRetryToken((token) => token + 1); }}>重新讀取結果</button> : null}
  </span>;
}
