"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw, ShieldAlert } from "lucide-react";

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/invite/",
  "/account-invitation/",
  "/account-recovery",
  "/privacy",
  "/production-slice-blocked"
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function PrivacyAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [state, setState] = useState<"checking" | "ready" | "error">(isPublicPath(pathname) ? "ready" : "checking");

  const check = useCallback(() => {
    if (isPublicPath(pathname)) {
      setState("ready");
      return () => undefined;
    }

    let cancelled = false;
    setState("checking");
    fetch("/api/privacy/acknowledgements/current", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) return { required: false };
        const body = (await response.json().catch(() => ({}))) as { required?: boolean };
        if (!response.ok) throw new Error("PRIVACY_GATE_CHECK_FAILED");
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        if (body.required) {
          const returnTo = `${pathname}${window.location.search}`;
          window.location.replace(`/privacy/acknowledgement?returnTo=${encodeURIComponent(returnTo)}`);
          return;
        }
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => check(), [check]);

  if (state === "checking") {
    return <div className="privacy-gate-state" role="status">正在確認帳號使用狀態...</div>;
  }
  if (state === "error") {
    return (
      <div className="privacy-gate-state is-error" role="alert">
        <ShieldAlert size={22} aria-hidden="true" />
        <strong>目前無法確認帳號使用狀態</strong>
        <span>請重新嘗試；若持續發生，請聯絡系統管理員。</span>
        <button className="secondary-button" type="button" onClick={check}>
          <RefreshCw size={16} aria-hidden="true" />
          重新嘗試
        </button>
      </div>
    );
  }
  return children;
}
