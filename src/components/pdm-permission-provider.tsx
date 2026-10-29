"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createPdmPermissionStore, subscribePdmPermissionInvalidation, subscribePdmMutationInvalidation, type PdmPermissionInvalidationReason } from "@/lib/pdm-permission-client";
import { createPdmWorkbenchCache } from "@/lib/pdm-workbench-cache";
import type { NumberingPagePermissionCode, NumberingActionPermissionCode } from "@/lib/numbering-permission-codes";

const Context = createContext<ReturnType<typeof usePermissionValue> | null>(null);
const anonymous = { kind: "unauthenticated" } as const;
const initial = { kind: "loading" } as const;

function usePermissionValue(store: ReturnType<typeof createPdmPermissionStore>, publicPage: boolean, workbenchCache: ReturnType<typeof createPdmWorkbenchCache>) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => initial);
  const state = publicPage ? anonymous : snapshot;
  return useMemo(() => ({
    state,
    workbenchCache,
    allowsPage: (code: NumberingPagePermissionCode) => state.kind === "ready" && state.projection.pages[code] === true,
    allowsAction: (code: NumberingActionPermissionCode) => state.kind === "ready" && state.projection.actions[code] === true,
    invalidate: (reason: PdmPermissionInvalidationReason) => { workbenchCache.clear(); store.invalidate(reason); },
    retry: () => { void store.retry(); }
  }), [state, store, workbenchCache]);
}

export function PdmPermissionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const publicPage = pathname === "/login" || /^\/(?:invite|account-recovery|account-invitation|public)(?:\/|$)/u.test(pathname);
  const store = useMemo(() => createPdmPermissionStore(), []);
  const workbenchCache = useMemo(() => createPdmWorkbenchCache(), []);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    if (publicPage) { workbenchCache.clear(); store.invalidate("logout"); }
    else if (store.getSnapshot().kind === "unauthenticated") store.invalidate("account-changed");
    else void store.ensure();
    const unsubscribe = subscribePdmPermissionInvalidation(reason => { workbenchCache.clear(); store.invalidate(reason); });
    const unsubscribeMutation = subscribePdmMutationInvalidation(() => workbenchCache.clear(false));
    return () => {
      active.current = false;
      unsubscribe();
      unsubscribeMutation();
      // React StrictMode remounts effects synchronously. Preserve its one in-flight request.
      queueMicrotask(() => { if (!active.current) { workbenchCache.clear(); store.dispose(); } });
    };
  }, [publicPage, store, workbenchCache]);
  const value = usePermissionValue(store, publicPage, workbenchCache);
  return <Context.Provider value={value}>
    {!publicPage && value.state.kind === "unauthenticated" ? <div role="alert" className="inline-error">登入已失效，請重新登入。<Link href="/login">返回登入</Link></div> : null}
    {!publicPage && value.state.kind === "unavailable" ? <div role="alert" className="inline-error">
      目前無法確認操作權限，請稍後重試。<button type="button" onClick={value.retry}>重試權限</button>
    </div> : null}
    {children}
  </Context.Provider>;
}

export function usePdmPermissions() {
  const context = useContext(Context);
  if (!context) throw new Error("usePdmPermissions requires PdmPermissionProvider");
  return context;
}
