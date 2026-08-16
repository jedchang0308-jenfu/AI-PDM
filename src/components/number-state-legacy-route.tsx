"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, Search } from "lucide-react";
import { StatusScopeHelp } from "@/components/status-help-popover";
import type { StatusScopeId } from "@/lib/status-scope-display";

type LegacyRouteStrategy = "redirect" | "upload" | "guidance";

type NumberStateLegacyRouteProps = {
  title: string;
  message: string;
  destination: string;
  destinationLabel: string;
  strategy?: LegacyRouteStrategy;
  statusScope?: StatusScopeId;
};

function destinationWithSource(destination: string) {
  if (typeof window === "undefined") return destination;
  const source = new URL(window.location.href);
  const target = new URL(destination, source.origin);
  source.searchParams.forEach((value, key) => {
    if (!target.searchParams.has(key)) target.searchParams.set(key, value);
  });
  target.searchParams.set("legacyFrom", source.pathname);
  return `${target.pathname}${target.search}`;
}

function uploadDestination(fallback: string) {
  if (typeof window === "undefined") return fallback;
  const source = new URL(window.location.href);
  const drawingNumber = source.searchParams.get("drawingNumber") ?? source.searchParams.get("drawing_number");
  if (!drawingNumber) return destinationWithSource(fallback);
  return destinationWithSource(`/drawings/${encodeURIComponent(drawingNumber)}/submission-workbench`);
}

export function NumberStateLegacyRoute({
  title,
  message,
  destination,
  destinationLabel,
  strategy = "redirect",
  statusScope
}: NumberStateLegacyRouteProps) {
  const [target, setTarget] = useState(destination);
  const [shouldRedirect, setShouldRedirect] = useState(strategy === "redirect");

  useEffect(() => {
    const nextTarget = strategy === "upload" ? uploadDestination(destination) : destinationWithSource(destination);
    const uploadHasContext = strategy !== "upload" || nextTarget.startsWith("/drawings/");
    const redirect = strategy === "redirect" || (strategy === "upload" && uploadHasContext);
    setTarget(nextTarget);
    setShouldRedirect(redirect);
    if (redirect) window.location.replace(nextTarget);
  }, [destination, strategy]);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{title} {statusScope ? <StatusScopeHelp scope={statusScope} /> : null}</h1>
          <p>{message}</p>
        </div>
      </div>
      <section className="panel number-state-legacy-panel">
        <div className="empty" aria-live="polite">
          {shouldRedirect ? <ArrowRight size={26} aria-hidden="true" /> : strategy === "upload" ? <Search size={26} aria-hidden="true" /> : <LockKeyhole size={26} aria-hidden="true" />}
          <strong>{shouldRedirect ? "正在前往新的操作入口" : "請改從物件或案件開始"}</strong>
          <p>{shouldRedirect ? "原網址與查詢條件會保留，不會啟動舊的資料寫入流程。" : message}</p>
          <div className="next-step-actions">
            <Link className="primary-button" href={target}>
              {destinationLabel}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="secondary-button" href="/numbering/search">
              回圖料工作台
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
