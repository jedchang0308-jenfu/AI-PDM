"use client";

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { HumanStatusBadge } from "@/components/human-status-badge";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";
import { DrawingProjection } from "@/components/drawing-projection";
import { PartProjection } from "@/components/part-projection";
import { RelationProjection } from "@/components/relation-projection";
import { ReviewContextProjection } from "@/components/review-context-projection";
import { PdmDetailActionControl } from "@/components/pdm-detail-action-control";
import { NumberingContextualEntrypoints } from "@/components/numbering-contextual-entrypoints";
import type { PdmDetailActionDescriptor, PdmDetailActionExecution, PdmDetailSurface, PdmEntityDetailResponse } from "@/lib/pdm-entity-detail-contract";

type PdmDetailCommandExecution = Extract<PdmDetailActionExecution, { type: "command" }>;
type PendingCommand = { action: PdmDetailActionDescriptor; execution: PdmDetailCommandExecution };

type UnifiedPdmEntityDetailDrawerProps = {
  open: boolean;
  entityKey: string | null;
  surface: PdmDetailSurface;
  reviewRequestId?: string | null;
  width: number;
  returnTo: string;
  onClose: () => void;
  onStartResize: (clientX: number) => void;
  onCommandSuccess?: (action: PdmDetailActionDescriptor) => void | Promise<void>;
  onRelationChange?: (input: { operation: "link" | "set_primary" | "set_reference" | "remove"; drawingNumber: string; partNumber: string }) => Promise<void>;
  contextualActions?: ReactNode;
  onContextualChanged?: () => void | Promise<void>;
};

function readError(body: unknown) {
  if (!body || typeof body !== "object") return "明細目前無法載入，請重新整理。";
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") return (error as { message: string }).message;
  return "明細目前無法載入，請重新整理。";
}

export function UnifiedPdmEntityDetailDrawer({ open, entityKey, surface, reviewRequestId, width, returnTo, onClose, onStartResize, onCommandSuccess, onRelationChange, contextualActions, onContextualChanged }: UnifiedPdmEntityDetailDrawerProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<PdmEntityDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);
  const [drawingMaintenanceOpen, setDrawingMaintenanceOpen] = useState(false);
  const [partMaintenanceOpen, setPartMaintenanceOpen] = useState(false);
  const [relationMaintenanceOpen, setRelationMaintenanceOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const load = useCallback(async (signal: AbortSignal) => {
    if (!entityKey || !open) return;
    setLoading(true); setError("");
    const params = new URLSearchParams({ surface, returnTo });
    if (reviewRequestId) params.set("reviewRequestId", reviewRequestId);
    try {
      const response = await fetch(`/api/pdm/entity-details/${encodeURIComponent(entityKey)}?${params.toString()}`, { cache: "no-store", signal });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(body));
      setDetail(body as PdmEntityDetailResponse);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setDetail(null); setError(caught instanceof Error ? caught.message : "明細目前無法載入，請重新整理。");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [entityKey, open, reviewRequestId, returnTo, surface]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    setDrawingMaintenanceOpen(false);
    setPartMaintenanceOpen(false);
    setRelationMaintenanceOpen(false);
    setPendingCommand(null);
  }, [entityKey, reviewRequestId]);

  useEffect(() => {
    if (!open || !detail || actionBusy) return;
    const pendingPreview = Object.values(detail.projections)
      .some((projection) => projection?.level === "full" && "previews" in projection.data && projection.data.previews.some((slot) => ["queued", "running", "delayed"].includes(slot.state)));
    if (!pendingPreview) return;
    const timer = window.setInterval(() => setRefreshToken((value) => value + 1), 2500);
    return () => window.clearInterval(timer);
  }, [actionBusy, detail, open]);

  useEffect(() => {
    if (refreshToken === 0 || !open || !entityKey) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [entityKey, load, open, refreshToken]);

  const runCommand = useCallback(async (pending: PendingCommand, inputValue = "") => {
    if (actionBusy) return;
    const { action, execution } = pending;
    const body = { ...execution.body };
    const normalizedInput = inputValue.trim();
    if (execution.input === "required_comment") body.comment = normalizedInput;
    if (execution.input === "optional_reason" && normalizedInput) body.reason = normalizedInput;
    setPendingCommand(null);
    setActionBusy(action.id);
    setError("");
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (action.idempotencyRequired) headers["Idempotency-Key"] = `pdm-detail:${action.kind}:${crypto.randomUUID()}`;
      const response = await fetch(execution.href, {
        method: execution.method,
        headers,
        body: JSON.stringify(body)
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 403 || response.status === 409) setRefreshToken((value) => value + 1);
        throw new Error(readError(responseBody));
      }
      if (execution.success === "return_to_inbox" && detail) {
        if (onCommandSuccess) await onCommandSuccess(action);
        else {
          onClose();
          router.push(detail.navigation.returnTo);
        }
      } else {
        setRefreshToken((value) => value + 1);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作結果尚未確認；系統會重新讀取目前狀態，請確認後再決定下一步。");
      setRefreshToken((value) => value + 1);
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, detail, onClose, onCommandSuccess, router]);

  const handleAction = useCallback(async (action: PdmDetailActionDescriptor) => {
    if (!action.enabled || !action.execution || actionBusy) return;
    if (action.execution.type === "local" && action.execution.command === "refresh") {
      setRefreshToken((value) => value + 1);
      return;
    }
    if (action.execution.type === "local" && action.execution.command === "return") {
      onClose();
      return;
    }
    if (action.execution.type === "navigate") {
      setDrawingMaintenanceOpen(surface === "drawing" && action.kind === "edit");
      setPartMaintenanceOpen(surface === "part" && action.kind === "edit");
      setRelationMaintenanceOpen(surface === "relation" && action.kind === "manage_relation");
      router.push(action.execution.href);
      return;
    }
    if (action.execution.type !== "command") {
      setError("這個操作目前無法執行，請重新整理明細。");
      return;
    }
    const pending = { action, execution: action.execution };
    if (action.requiresConfirmation || action.execution.input !== "none") {
      setPendingCommand(pending);
      return;
    }
    await runCommand(pending);
  }, [actionBusy, onClose, router, runCommand, surface]);
  const header = detail?.header;
  const title = header?.entityCode ?? entityKey ?? "明細";
  const surfaceLabel = surface === "drawing" ? "圖號" : surface === "part" ? "料號" : "圖料";
  const actionBar = detail?.actionBar ?? null;
  const orderedActions = actionBar ? [actionBar.primary, ...actionBar.secondary].filter((action): action is PdmDetailActionDescriptor => Boolean(action)).sort((left, right) => left.order - right.order) : [];
  const projectedContextualActions = (() => {
    if (!detail || surface !== "relation" || reviewRequestId || !["root", "part", "drawing"].includes(detail.header.entityKind)) return null;
    const relation = detail.projections.relation;
    if (!relation || relation.level !== "full") return null;
    const relationData = relation.data;
    const recordStatus = pdmStateFamilyRecordStatus(detail.header.stateFamily);
    const changed = async () => {
      setRefreshToken((value) => value + 1);
      await onContextualChanged?.();
    };
    if (detail.header.entityKind === "part") {
      const part = detail.projections.part;
      if (!part || part.level !== "full") return null;
      return <NumberingContextualEntrypoints mode="part" rootId={relationData.rootId} rootCode={part.data.rootCode} rootRecordStatus={pdmStateFamilyRecordStatus(relationData.parts.length + relationData.drawings.length > 0 ? "released" : detail.header.stateFamily)} part={{ id: part.data.partId, partNumber: part.data.partNumber, partName: part.data.displayName, recordStatus, linkedDrawingNumbers: part.data.linkedDrawings.map((drawing) => drawing.drawingNumber) }} actionEmphasis="secondary" onChanged={changed} />;
    }
    if (detail.header.entityKind === "drawing") {
      const drawing = detail.projections.drawing;
      if (!drawing || drawing.level !== "full" || !drawing.data.drawingNumber) return null;
      return <NumberingContextualEntrypoints mode="drawing" rootId={relationData.rootId} rootCode={relationData.rootCode} rootRecordStatus={pdmStateFamilyRecordStatus(relationData.parts.length + relationData.drawings.length > 0 ? "released" : detail.header.stateFamily)} drawing={{ id: drawing.data.drawingId, drawingNumber: drawing.data.drawingNumber, purposeCode: drawing.data.purposeCode ?? "", recordStatus, linkedPartNumbers: drawing.data.linkedParts.map((part) => part.partNumber) }} actionEmphasis="secondary" onChanged={changed} />;
    }
    const formalChildCount = [...relationData.parts, ...relationData.drawings].filter((item) => ["Active", "Released", "MainDrawingInvalid"].includes(item.recordStatus)).length;
    return <NumberingContextualEntrypoints mode="root" rootId={relationData.rootId} rootCode={relationData.rootCode} coreName={detail.header.displayName} rootRecordStatus={recordStatus} rootFormalChildCount={formalChildCount} rootPartCount={relationData.counts.parts} rootDrawingCount={relationData.counts.drawings} actionEmphasis="secondary" onChanged={changed} />;
  })();

  return <>
    <PdmEntityDetailDrawer
      open={open}
      width={width}
      ariaLabel={`${surfaceLabel}統一明細`}
      title={title}
      subtitle={header?.displayName ?? (loading ? "正在載入明細…" : "")}
      className="unified-pdm-entity-detail-drawer"
      actions={header && !reviewRequestId ? <HumanStatusBadge status={header.humanStatus} viewerStatus={header.viewerStatus} availabilityScope={header.availabilityScope} /> : null}
      entityType={header?.entityKind}
      entityCode={header?.entityCode}
      sourceContext={`${surface}_workbench`}
      detailFamily={header?.stateFamily}
      keepOpenSelector={`[data-${surface}-workbench-row='true'], [data-search-row='true']`}
      onClose={onClose}
      onStartResize={onStartResize}
      footer={actionBar ? <div className="unified-pdm-action-bar" data-component="ContextActionBar">{orderedActions.map((action) => <PdmDetailActionControl action={action} busy={Boolean(actionBusy) && action.execution?.type === "command"} onAction={handleAction} key={action.id} />)}</div> : null}
    >
      <div className="pdm-entity-drawer-body unified-pdm-entity-detail-body" data-component="unified-pdm-entity-detail-drawer">
        {loading && !detail ? <div className="unified-pdm-loading" role="status">正在載入統一明細…</div> : null}
        {error ? <div className="unified-pdm-error" role="alert"><span>{error}</span><button className="secondary-button" type="button" onClick={() => setRefreshToken((value) => value + 1)}>重新載入</button></div> : null}
        {detail ? <div data-component="ProjectionComposer">
          {detail.projections.drawing ? <DrawingProjection projection={detail.projections.drawing} returnTo={returnTo} showStatusBadge={!reviewRequestId} showPreviewHeader={false} showMaintenancePanel={drawingMaintenanceOpen} onMaintenanceChanged={() => setRefreshToken((value) => value + 1)} /> : null}
          {detail.projections.part ? <PartProjection projection={detail.projections.part} showStatusBadge={!reviewRequestId} showMaintenancePanel={partMaintenanceOpen} onMaintenanceChanged={() => setRefreshToken((value) => value + 1)} /> : null}
          {detail.projections.relation ? <RelationProjection projection={detail.projections.relation} showMaintenancePanel={relationMaintenanceOpen} onRelationChange={onRelationChange ? async (input) => { await onRelationChange(input); setRefreshToken((value) => value + 1); } : undefined} /> : null}
          {detail.projections.review ? <ReviewContextProjection data={detail.projections.review.data} /> : null}
          {contextualActions || projectedContextualActions ? <section className="panel unified-pdm-contextual-actions" aria-label="正式生命週期操作"><h3>正式生命週期操作</h3>{contextualActions ?? projectedContextualActions}</section> : null}
        </div> : null}
      </div>
    </PdmEntityDetailDrawer>
    {pendingCommand ? (
      <PdmDetailCommandDialog
        pending={pendingCommand}
        busy={actionBusy === pendingCommand.action.id}
        onClose={() => setPendingCommand(null)}
        onConfirm={(inputValue) => void runCommand(pendingCommand, inputValue)}
      />
    ) : null}
  </>;
}

function pdmStateFamilyRecordStatus(stateFamily: PdmEntityDetailResponse["header"]["stateFamily"] | "released") {
  if (stateFamily === "released") return "Released" as const;
  if (stateFamily === "rd_controlled") return "Active" as const;
  if (stateFamily === "in_review" || stateFamily === "auto_finalizing") return "PendingReview" as const;
  if (stateFamily === "correction_required") return "NeedInfo" as const;
  if (stateFamily === "recovery_required") return "Rejected" as const;
  if (stateFamily === "history_only" || stateFamily === "terminal") return "Obsolete" as const;
  return "Draft" as const;
}

function PdmDetailCommandDialog({ pending, busy, onClose, onConfirm }: { pending: PendingCommand; busy: boolean; onClose: () => void; onConfirm: (inputValue: string) => void }) {
  const { action, execution } = pending;
  const [inputValue, setInputValue] = useState("");
  const [validationError, setValidationError] = useState("");
  const generatedId = useId().replace(/:/gu, "");
  const titleId = `pdm-detail-command-title-${generatedId}`;
  const descriptionId = `pdm-detail-command-description-${generatedId}`;
  const dialogRef = useRef<HTMLElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const needsInput = execution.input !== "none";
  const requiresComment = execution.input === "required_comment";

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  }, [busy, onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const container = dialogRef.current;
    const focusableSelector = "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    (container?.querySelector<HTMLElement>("[data-autofocus]") ?? container?.querySelector<HTMLElement>(focusableSelector))?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    const stopUnderlyingDrawerPointer = (event: PointerEvent) => event.stopPropagation();
    const closeFromNativeClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-pdm-command-modal-close='true']") || busyRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    backdrop.addEventListener("pointerdown", stopUnderlyingDrawerPointer, true);
    backdrop.addEventListener("click", closeFromNativeClick, true);
    return () => {
      backdrop.removeEventListener("pointerdown", stopUnderlyingDrawerPointer, true);
      backdrop.removeEventListener("click", closeFromNativeClick, true);
    };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = inputValue.trim();
    if (requiresComment && !normalized) {
      setValidationError("請填寫原因後再確認。");
      return;
    }
    setValidationError("");
    onConfirm(normalized);
  }

  const confirmLabel = `確認${action.label}`;
  const description = requiresComment
    ? "你填寫的原因會保留在審核紀錄中，供後續修正與追蹤。"
    : execution.input === "optional_reason"
      ? "請確認目前內容與狀態；如有需要，可補充本次操作原因。"
      : "請確認目前內容與狀態後再執行。";

  return (
    <div ref={backdropRef} className="number-state-modal-backdrop" role="presentation">
      <section ref={dialogRef} className="number-state-modal number-state-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="number-state-modal-header">
          <div><h2 id={titleId}>{action.label}</h2><p id={descriptionId}>{description}</p></div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy} data-pdm-command-modal-close="true" aria-label="關閉確認"><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          {needsInput ? (
            <div className="number-state-form-grid">
              <label className="number-state-field">
                <span>{requiresComment ? "原因（必填）" : "補充原因（選填）"}</span>
                <textarea value={inputValue} onChange={(event) => { setInputValue(event.target.value); setValidationError(""); }} maxLength={2000} required={requiresComment} data-autofocus aria-invalid={Boolean(validationError)} aria-describedby={validationError ? `${descriptionId}-error` : undefined} />
                {validationError ? <small id={`${descriptionId}-error`} role="alert">{validationError}</small> : <small>{requiresComment ? "此原因會保留在審核紀錄。" : "未填寫時沿用系統預設操作原因。"}</small>}
              </label>
            </div>
          ) : <div className={`number-state-confirm-summary${action.tone === "danger" ? " is-danger" : ""}`}><div><strong>這項操作會立即執行</strong><p>{description}</p></div></div>}
          <div className="number-state-modal-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={busy} data-pdm-command-modal-close="true" {...(!needsInput ? { "data-autofocus": true } : {})}>返回檢查</button>
            <button className={action.tone === "danger" ? "danger-button" : "primary-button"} type="submit" disabled={busy}>{busy ? "處理中..." : confirmLabel}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
