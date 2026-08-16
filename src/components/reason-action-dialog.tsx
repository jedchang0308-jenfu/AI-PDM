"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

type ReasonActionDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  defaultReason?: string;
  busy?: boolean;
  tone?: "default" | "danger";
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function ReasonActionDialog({
  open,
  title,
  description,
  confirmLabel,
  defaultReason = "",
  busy = false,
  tone = "default",
  onCancel,
  onConfirm
}: ReasonActionDialogProps) {
  const [reason, setReason] = useState(defaultReason);
  const [validationError, setValidationError] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open) return;
    setReason(defaultReason);
    setValidationError("");
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [defaultReason, open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled])") ?? []
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = reason.trim();
    if (!normalized) {
      setValidationError("請填寫原因後再確認。");
      return;
    }
    setValidationError("");
    void onConfirm(normalized);
  }

  return (
    <div
      className="number-state-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className="number-state-modal number-state-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="number-state-modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} disabled={busy} aria-label="關閉原因輸入">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="number-state-form-grid">
            <label className="number-state-field">
              <span>原因（必填）</span>
              <textarea
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setValidationError("");
                }}
                maxLength={500}
                required
                aria-invalid={Boolean(validationError)}
                aria-describedby={validationError ? errorId : descriptionId}
              />
              {validationError ? <small id={errorId} role="alert">{validationError}</small> : <small>原因會保留在異動紀錄中。</small>}
            </label>
          </div>
          <div className="number-state-modal-actions">
            <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>返回</button>
            <button className={tone === "danger" ? "danger-button" : "primary-button"} type="submit" disabled={busy || !reason.trim()}>
              {busy ? "處理中..." : confirmLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
