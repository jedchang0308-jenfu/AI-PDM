"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createPdmPermissionStore, subscribePdmPermissionInvalidation, type PdmPermissionInvalidationReason } from "@/lib/pdm-permission-client";
import type { NumberingPagePermissionCode, NumberingActionPermissionCode } from "@/lib/numbering-permission-codes";

const Context = createContext<ReturnType<typeof usePermissionValue> | null>(null);
const anonymous = { kind: "unauthenticated" } as const;
const initial = { kind: "loading" } as const;

function usePermissionValue(store: ReturnType<typeof createPdmPermissionStore>, publicPage: boolean) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => initial);
  const state = publicPage ? anonymous : snapshot;
  return useMemo(() => ({
    state,
    allowsPage: (code: NumberingPagePermissionCode) => state.kind === "ready" && state.projection.pages[code] === true,
    allowsAction: (code: NumberingActionPermissionCode) => state.kind === "ready" && state.projection.actions[code] === true,
    invalidate: (reason: PdmPermissionInvalidationReason) => store.invalidate(reason),
    retry: () => { void store.retry(); }
  }), [state, store]);
}

export function PdmPermissionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const publicPage = pathname === "/login" || /^\/(?:invite|account-recovery|account-invitation|public)(?:\/|$)/u.test(pathname);
  const store = useMemo(() => createPdmPermissionStore(), []);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    if (publicPage) store.invalidate("logout");
    else if (store.getSnapshot().kind === "unauthenticated") store.invalidate("account-changed");
    else void store.ensure();
    const unsubscribe = subscribePdmPermissionInvalidation(reason => store.invalidate(reason));
    return () => {
      active.current = false;
      unsubscribe();
      // React StrictMode remounts effects synchronously. Preserve its one in-flight request.
      queueMicrotask(() => { if (!active.current) store.dispose(); });
    };
  }, [publicPage, store]);
  const value = usePermissionValue(store, publicPage);
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
