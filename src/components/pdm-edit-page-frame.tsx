"use client";

import type { ReactNode } from "react";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";

export type PdmEditPageStatus = "loading" | "ready" | "restricted" | "not_found" | "conflict" | "error";

export function PdmEditPageFrame({
  returnHref,
  eyebrow,
  title,
  subtitle,
  headingLayout = "stacked",
  status,
  identity,
  children,
  actionDock,
  notice,
  error,
  isDirty = false,
  onRetry,
  embedded = false
}: {
  returnHref: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  headingLayout?: "stacked" | "inline" | "breadcrumb";
  status: PdmEditPageStatus;
  identity?: ReactNode;
  children?: ReactNode;
  actionDock?: ReactNode;
  notice?: ReactNode;
  error?: ReactNode;
  isDirty?: boolean;
  onRetry?: () => void;
  embedded?: boolean;
}) {
  const router = useRouter();
  const canLeave = useUnsavedChangesGuard(isDirty);
  const goBack = () => { if (canLeave()) router.push(returnHref); };
  const stateMessage = status === "loading" ? "正在載入工作區…" : status === "restricted" ? "你目前只能查看這筆資料。" : status === "not_found" ? "找不到這筆資料或已被移轉。" : status === "conflict" ? "資料已更新，請重新載入後確認差異。" : status === "error" ? "工作區目前無法載入。" : null;
  return (
    <div className={`pdm-edit-page${embedded ? " is-embedded" : ""}`} data-pdm-edit-page="true">
      {embedded ? null : <header className="pdm-edit-page-header">
        <button className="icon-button" type="button" onClick={goBack} aria-label="返回上一個工作清單"><ArrowLeft size={18} /></button>
        <div className={`pdm-edit-page-heading${headingLayout === "inline" ? " is-inline" : headingLayout === "breadcrumb" ? " is-breadcrumb" : ""}`}>
          {headingLayout === "breadcrumb" ? (
            <nav className="pdm-edit-page-breadcrumb" aria-label="目前位置">
              <ol>
                <li><span>{eyebrow}</span></li>
                {subtitle ? <li><span>{subtitle}</span></li> : null}
                <li aria-current="page"><h1>{title}</h1></li>
              </ol>
            </nav>
          ) : (
            <><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</>
          )}
        </div>
        <div className="pdm-edit-page-identity">{identity}</div>
      </header>}
      {notice ? <div className="pdm-edit-page-notice" role="status">{notice}</div> : null}
      {error || stateMessage ? <div className="pdm-edit-page-error" role="alert"><span>{error ?? stateMessage}</span>{onRetry ? <button className="secondary-button" type="button" onClick={onRetry}><RefreshCcw size={15} />重新載入</button> : null}</div> : null}
      {status === "ready" ? <section className="pdm-edit-page-body">{children}</section> : null}
      {actionDock ? <footer className="pdm-edit-page-action-dock">{actionDock}</footer> : null}
    </div>
  );
}
