"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { usePdmLoginHref } from "./use-pdm-login-href";
import { clearCurrentPdmUser, clearPendingPdmApprovalCount } from "@/lib/pdm-current-user-client";
import { createPdmPermissionStore, subscribePdmPermissionInvalidation, subscribePdmMutationInvalidation, type PdmPermissionInvalidationReason } from "@/lib/pdm-permission-client";
import { createPdmWorkbenchCache } from "@/lib/pdm-workbench-cache";
import { createPdmPreviewImageCache, createPdmPreviewImageDenials } from "@/lib/pdm-preview-image-cache";
import { PdmPreviewImageCacheContext } from "./pdm-preview-image-cache-context";
import { createPdmProtectedPdfCache } from "@/lib/pdm-protected-pdf-cache";
import { pdmPermissionFetch } from "@/lib/pdm-permission-client";
import type { NumberingPagePermissionCode, NumberingActionPermissionCode } from "@/lib/numbering-permission-codes";

const Context = createContext<ReturnType<typeof usePermissionValue> | null>(null);
const anonymous = { kind: "unauthenticated" } as const;
const initial = { kind: "loading" } as const;

function usePermissionValue(store: ReturnType<typeof createPdmPermissionStore>, publicPage: boolean, workbenchCache: ReturnType<typeof createPdmWorkbenchCache>, previewImageCache: ReturnType<typeof createPdmPreviewImageCache>, deniedHrefs: ReturnType<typeof createPdmPreviewImageDenials>) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => initial);
  const state = publicPage ? anonymous : snapshot;
  return useMemo(() => ({
    state,
    workbenchCache,
    allowsPage: (code: NumberingPagePermissionCode) => state.kind === "ready" && state.projection.pages[code] === true,
    allowsAction: (code: NumberingActionPermissionCode) => state.kind === "ready" && state.projection.actions[code] === true,
    invalidate: (reason: PdmPermissionInvalidationReason) => { workbenchCache.clear(); if (reason !== "forbidden") deniedHrefs.clear(); previewImageCache.clear(); store.invalidate(reason); },
    retry: () => { workbenchCache.clear(); deniedHrefs.clear(); previewImageCache.clear(); void store.retry(); }
  }), [state, store, workbenchCache, previewImageCache, deniedHrefs]);
}

export function PdmPermissionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const loginHref = usePdmLoginHref(pathname);
  const publicPage = pathname === "/login" || /^\/(?:invite|account-recovery|account-invitation|public)(?:\/|$)/u.test(pathname);
  const store = useMemo(() => createPdmPermissionStore(), []);
  const workbenchCache = useMemo(() => createPdmWorkbenchCache(), []);
  const previewImageCache = useMemo(() => createPdmPreviewImageCache(), []);
  const pdfCache = useMemo(() => createPdmProtectedPdfCache(pdmPermissionFetch), []);
  const deniedHrefs = useMemo(() => createPdmPreviewImageDenials(), []);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    if (publicPage) { clearCurrentPdmUser(); clearPendingPdmApprovalCount(); workbenchCache.clear(); deniedHrefs.clear(); previewImageCache.clear(); pdfCache.clear(); store.invalidate("logout"); }
    else if (store.getSnapshot().kind === "unauthenticated") store.invalidate("account-changed");
    else void store.ensure();
    const unsubscribe = subscribePdmPermissionInvalidation(reason => { workbenchCache.clear(); if (reason !== "forbidden") deniedHrefs.clear(); previewImageCache.clear(); pdfCache.clear(); store.invalidate(reason); });
    // PDF reuse always reauthorizes its binding/hash. Unrelated writes such as
    // OCR-result submission must not force a second download of the same bytes.
    const unsubscribeMutation = subscribePdmMutationInvalidation(() => { workbenchCache.clear(false); deniedHrefs.clear(); previewImageCache.clear(); });
    return () => {
      active.current = false;
      unsubscribe();
      unsubscribeMutation();
      // React StrictMode remounts effects synchronously. Preserve its one in-flight request.
      queueMicrotask(() => { if (!active.current) { workbenchCache.clear(); deniedHrefs.clear(); previewImageCache.clear(); pdfCache.clear(); store.dispose(); } });
    };
  }, [publicPage, store, workbenchCache, previewImageCache, pdfCache, deniedHrefs]);
  const value = usePermissionValue(store, publicPage, workbenchCache, previewImageCache, deniedHrefs);
  const previewValue = useMemo(() => ({ cache: previewImageCache, pdfCache, deniedHrefs, enabled: value.state.kind === "ready" }), [previewImageCache, pdfCache, deniedHrefs, value.state.kind]);
  return <Context.Provider value={value}>
    <PdmPreviewImageCacheContext.Provider value={previewValue}>
    {!publicPage && value.state.kind === "unauthenticated" ? <div role="alert" className="inline-error">登入已失效，請重新登入。<Link href={loginHref}>返回登入</Link></div> : null}
    {!publicPage && value.state.kind === "unavailable" ? <div role="alert" className="inline-error">
      目前無法確認操作權限，請稍後重試。<button type="button" onClick={value.retry}>重試權限</button>
    </div> : null}
    {children}
    </PdmPreviewImageCacheContext.Provider>
  </Context.Provider>;
}

export function usePdmPermissions() {
  const context = useContext(Context);
  if (!context) throw new Error("usePdmPermissions requires PdmPermissionProvider");
  return context;
}
