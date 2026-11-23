"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { pdmPermissionFetch as fetch } from "@/lib/pdm-permission-client";
import { errorMessage, readJson } from "@/lib/pdm-workbench-response";
import type { DrawingWorkspacePayload } from "./canonical-drawing-change-workspace";

/** Submit the saved work; the existing server command remains the readiness authority. */
export function DrawingWorkSubmitAction({ drawingId, submitHref, disabled, onBeforeSubmit, onBusyChange, onSubmitted }: {
  drawingId: string;
  submitHref: string;
  disabled: boolean;
  onBeforeSubmit: () => boolean;
  onBusyChange: (busy: boolean) => void;
  onSubmitted: () => void;
}) {
  const router = useRouter();
  const pending = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function submit() {
    if (disabled || pending.current || uncertain || !onBeforeSubmit()) return;
    const match = /^\/api\/pdm\/drawing-revision-works\/([^/]+)\/submit$/u.exec(submitHref);
    if (!match) { setError("找不到可送審的工作資料，請重新整理。"); return; }
    pending.current = true; setBusy(true); setError(""); onBusyChange(true);
    let writeStarted = false;
    const edit = () => {
      const destination = new URL(`/numbering/drawings/${encodeURIComponent(drawingId)}/workspace`, window.location.origin);
      destination.searchParams.set("workId", decodeURIComponent(match[1]));
      destination.searchParams.set("returnTo", window.location.pathname + window.location.search);
      router.push(destination.pathname + destination.search);
    };
    try {
      const response = await fetch(submitHref.slice(0, -"/submit".length), { cache: "no-store" });
      const packet = await readJson(response) as { data?: DrawingWorkspacePayload; meta?: { contractToken?: string } } | null;
      if (!mounted.current) return;
      if (!response.ok) { setError(errorMessage(packet, "無法確認最新工作資料，未送審。")); return; }
      const work = packet?.data;
      if (!work || work.entityType !== "drawing" || work.entityId !== drawingId || work.workId !== decodeURIComponent(match[1])
        || !Number.isSafeInteger(work.rowVersion) || !packet?.meta?.contractToken || !work.interaction) {
        setError("工作資料已改變，請重新整理後再送審。"); return;
      }
      // Formal submission must expose the server-projected four-file status and
      // any filename warning before the write. Keep the compact drawer from
      // becoming a second, less-informative submit path.
      if (work.targetKind === "formal") { edit(); return; }
      if (!work.interaction.canSubmit) {
        if (work.interaction.canMutateContent && work.assemblyPackage?.canSubmit === false) edit();
        else setError("此版目前無法送審，請重新整理確認工作狀態與權限。");
        return;
      }
      writeStarted = true;
      const submitted = await fetch(submitHref, {
        method: "POST", headers: { "content-type": "application/json", "if-match": `"${work.rowVersion}"`,
          "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": packet.meta.contractToken }, body: "{}"
      });
      const result = await readJson(submitted);
      if (!mounted.current) return;
      if (submitted.ok && typeof (result as { data?: { requestId?: unknown } } | null)?.data?.requestId === "string") { onSubmitted(); return; }
      if (submitted.status === 422) { edit(); return; }
      if (submitted.ok || submitted.status >= 500) {
        setUncertain(true); setError("送審結果尚未確認，請重新整理狀態。");
      } else setError(errorMessage(result, "未能送審，請確認工作狀態與權限。"));
    } catch {
      if (!mounted.current) return;
      setUncertain(writeStarted);
      setError(writeStarted ? "送審結果尚未確認，請重新整理狀態。" : "無法讀取工作資料，未送審。請稍後再試。");
    } finally {
      pending.current = false;
      if (mounted.current) { setBusy(false); onBusyChange(false); }
    }
  }
  return <>
    {error ? <span role="alert">{error}</span> : null}
    {uncertain ? <button type="button" className="secondary-button" onClick={onSubmitted}>重新整理狀態</button>
      : <button type="button" className="primary-button" disabled={disabled || busy} onClick={() => void submit()}><Send size={15} aria-hidden="true" />{busy ? "送審中…" : "送審"}</button>}
  </>;
}
