"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RelationMatrixTable, type RelationMatrixCell, type RelationMatrixIdentity } from "@/components/relation-matrix-table";
import type { CanonicalRelationMatrixProjection } from "@/lib/pdm-canonical-workbench-contract";

type RelationMatrixChange = {
  drawingNumberId: string;
  partNumberId: string;
  relationType: RelationMatrixCell["relationType"] | null;
};

type SaveState = "idle" | "saving" | "ambiguous" | "readback" | "readback-failed" | "stale" | "recovering";

type PendingCommand = {
  fingerprint: string;
  key: string;
  expectedEtag: string;
  changes: RelationMatrixChange[];
};

function errorMessage(body: unknown, fallback: string) {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
    ? String((error as { message: string }).message)
    : fallback;
}

async function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

function pairKey(drawingNumberId: string, partNumberId: string) {
  return `${drawingNumberId}:${partNumberId}`;
}

function normalizedChanges(changes: RelationMatrixChange[]) {
  return [...changes]
    .map((change) => ({ ...change }))
    .sort((left, right) => pairKey(left.drawingNumberId, left.partNumberId).localeCompare(pairKey(right.drawingNumberId, right.partNumberId))
      || String(left.relationType ?? "").localeCompare(String(right.relationType ?? "")));
}

export function relationCommandFingerprint(rootId: string, matrixEtag: string, changes: RelationMatrixChange[]) {
  return JSON.stringify({ rootId, matrixEtag, changes: normalizedChanges(changes) });
}

function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `pdm-relation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function matrixFromResponse(body: unknown): CanonicalRelationMatrixProjection | null {
  const data = body && typeof body === "object" ? (body as { data?: unknown }).data : null;
  if (!data || typeof data !== "object") return null;
  const candidate = data as { rootId?: unknown; matrixEtag?: unknown; cells?: unknown };
  return typeof candidate.rootId === "string" && typeof candidate.matrixEtag === "string" && Array.isArray(candidate.cells)
    ? data as CanonicalRelationMatrixProjection
    : null;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMatrix(rootId: string) {
  const response = await fetchWithTimeout(`/api/pdm/relations/${encodeURIComponent(rootId)}/matrix`, { cache: "no-store" });
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, "關聯矩陣目前無法重新載入。"));
  const matrix = matrixFromResponse(body);
  if (!matrix) throw new Error("關聯矩陣回應格式無法確認。");
  return matrix;
}

export function CanonicalRelationMatrixSection({
  matrix,
  contractToken,
  mode = "readonly",
  activationMode = "explicit",
  editing = false,
  onEditingChange,
  onReloadRequested,
  onSaved,
  onDirtyChange,
  onOpenDrawing,
  onOpenPart,
  editAction,
  createAction,
  className = ""
}: {
  matrix: CanonicalRelationMatrixProjection;
  contractToken: string;
  mode?: "readonly" | "manage";
  activationMode?: "explicit" | "immediate";
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  onReloadRequested?: () => Promise<boolean | void> | boolean | void;
  onSaved?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onOpenDrawing: (detailHref: string) => void;
  onOpenPart: (detailHref: string) => void;
  editAction?: ReactNode;
  createAction?: ReactNode;
  className?: string;
}) {
  const editable = mode === "manage";
  const canManage = editable && Boolean(matrix.rootId) && matrix.drawings.length > 0 && matrix.parts.length > 0;
  const editReady = canManage && (activationMode === "immediate" || editing);
  const [cells, setCells] = useState(matrix.cells as RelationMatrixCell[]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const commandRef = useRef<PendingCommand | null>(null);

  useEffect(() => {
    setCells(matrix.cells as RelationMatrixCell[]);
    commandRef.current = null;
    setSaveState("idle");
    setError("");
    if (activationMode === "explicit") onEditingChange?.(false);
  }, [activationMode, matrix, onEditingChange]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const changes = useMemo(() => {
    const original = new Map(matrix.cells.map((cell) => [pairKey(cell.drawingNumberId, cell.partNumberId), cell.relationType]));
    const next = new Map(cells.map((cell) => [pairKey(cell.drawingNumberId ?? "", cell.partNumberId ?? ""), cell.relationType]));
    const result: RelationMatrixChange[] = [];
    const keys = new Set([...original.keys(), ...next.keys()]);
    for (const key of keys) {
      const relationType = next.get(key) ?? null;
      if (original.get(key) === relationType) continue;
      const [drawingNumberId, partNumberId] = key.split(":");
      result.push({ drawingNumberId, partNumberId, relationType });
    }
    return result;
  }, [cells, matrix.cells]);
  const orderedChanges = useMemo(() => normalizedChanges(changes), [changes]);
  const dirtyKeys = useMemo(() => new Set(changes.map((change) => pairKey(change.drawingNumberId, change.partNumberId))), [changes]);
  useEffect(() => { onDirtyChange?.(canManage && changes.length > 0); }, [canManage, changes.length, onDirtyChange]);

  const handleChange = useCallback((change: RelationMatrixChange) => {
    setCells((current) => {
      const next = current.filter((cell) => !(cell.drawingNumberId === change.drawingNumberId && cell.partNumberId === change.partNumberId));
      if (change.relationType) {
        const drawing = matrix.drawings.find((item) => item.id === change.drawingNumberId);
        const part = matrix.parts.find((item) => item.id === change.partNumberId);
        if (drawing && part) next.push({ ...change, drawingNumber: drawing.number, partNumber: part.number });
      }
      return next;
    });
  }, [matrix.drawings, matrix.parts]);

  const settleSaved = useCallback((next: CanonicalRelationMatrixProjection) => {
    setCells(next.cells as RelationMatrixCell[]);
    commandRef.current = null;
    setSaveState("idle");
    setError("");
    onEditingChange?.(false);
    onDirtyChange?.(false);
    onSaved?.();
  }, [onDirtyChange, onEditingChange, onSaved]);

  const reloadCommitted = useCallback(async () => {
    if (!matrix.rootId || (saveState !== "readback-failed" && saveState !== "readback")) return;
    setSaveState("readback");
    setError("");
    try {
      settleSaved(await fetchMatrix(matrix.rootId));
    } catch {
      setSaveState("readback-failed");
      setError("已收到儲存回覆，但目前無法讀回結果；請重新載入已儲存結果。");
    }
  }, [matrix.rootId, saveState, settleSaved]);

  const save = useCallback(async () => {
    if (!editReady || !orderedChanges.length || saveState === "saving" || saveState === "readback" || saveState === "recovering") return;
    const fingerprint = relationCommandFingerprint(matrix.rootId, matrix.matrixEtag, orderedChanges);
    const command = commandRef.current?.fingerprint === fingerprint
      ? commandRef.current
      : { fingerprint, key: newIdempotencyKey(), expectedEtag: matrix.matrixEtag, changes: orderedChanges };
    commandRef.current = command;
    setSaveState("saving");
    setError("");
    try {
      const response = await fetchWithTimeout(`/api/pdm/relations/${encodeURIComponent(matrix.rootId)}/matrix`, {
        method: "PATCH",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "if-match": `"${command.expectedEtag}"`,
          "idempotency-key": command.key,
          "x-pdm-workbench-contract": contractToken
        },
        body: JSON.stringify({ changes: command.changes })
      });
      const body = await readJson(response);
      if (!response.ok) {
        const message = errorMessage(body, "關聯矩陣儲存失敗。");
        if (response.status === 409 || response.status === 412) {
          setSaveState("stale");
          setError("關聯矩陣已被其他人修改，草稿仍保留。");
          return;
        }
        if (response.status >= 400 && response.status < 500) {
          commandRef.current = null;
          setSaveState("idle");
          setError(message);
          return;
        }
        setSaveState("ambiguous");
        setError("關聯儲存結果尚未確認，請重試確認儲存結果。");
        return;
      }
      setSaveState("readback");
      try {
        settleSaved(await fetchMatrix(matrix.rootId));
      } catch {
        setSaveState("readback-failed");
        setError("已收到儲存回覆，但目前無法讀回結果；請重新載入已儲存結果。");
      }
    } catch {
      setSaveState("ambiguous");
      setError("關聯儲存結果尚未確認，請重試確認儲存結果。");
    }
  }, [contractToken, editReady, matrix.matrixEtag, matrix.rootId, orderedChanges, saveState, settleSaved]);

  const recoverStale = useCallback(async () => {
    if (saveState !== "stale") return;
    setSaveState("recovering");
    setError("");
    try {
      if (onReloadRequested) {
        const result = await onReloadRequested();
        if (result === false) throw new Error("reload failed");
      } else if (matrix.rootId) {
        setCells((await fetchMatrix(matrix.rootId)).cells as RelationMatrixCell[]);
      }
      commandRef.current = null;
      setSaveState("idle");
      setError("");
      onDirtyChange?.(false);
    } catch {
      setSaveState("stale");
      setError("最新關聯資料目前無法載入，草稿仍保留。");
    }
  }, [matrix.rootId, onDirtyChange, onReloadRequested, saveState]);

  const cancel = useCallback(() => {
    if (!changes.length || saveState !== "idle") return;
    setCells(matrix.cells as RelationMatrixCell[]);
    commandRef.current = null;
    setError("");
    onEditingChange?.(false);
    onDirtyChange?.(false);
  }, [changes.length, matrix.cells, onDirtyChange, onEditingChange, saveState]);

  const recoveryActionLabel = saveState === "ambiguous"
    ? "重試確認儲存結果"
    : saveState === "readback-failed"
      ? "重新載入已儲存結果"
      : saveState === "stale"
        ? "放棄草稿並載入最新資料"
        : null;
  const handleRecovery = useCallback(() => {
    if (saveState === "ambiguous") void save();
    else if (saveState === "readback-failed") void reloadCommitted();
    else if (saveState === "stale") void recoverStale();
  }, [recoverStale, reloadCommitted, save, saveState]);

  return <section className={`canonical-drawer-matrix${className ? ` ${className}` : ""}`} data-relation-scope={matrix.rootCode} data-relation-state={saveState}>
    <div className="canonical-drawer-section-heading"><h3>{matrix.rootCode} 全根號圖料關聯</h3><div className="canonical-drawer-section-actions">{canManage && activationMode === "explicit" && !editing ? editAction : null}{createAction}</div></div>
    {matrix.issue ? <p className="canonical-error" role="alert" data-anomaly-code={matrix.issue.code}>{matrix.issue.message}</p> : null}
    {error ? <p className="canonical-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p> : null}
    {matrix.rootId ? <RelationMatrixTable rootCode={matrix.rootCode} drawings={matrix.drawings as RelationMatrixIdentity[]} parts={matrix.parts as RelationMatrixIdentity[]} matrix={cells} editable={editReady && saveState === "idle"} dirtyKeys={dirtyKeys} onChange={handleChange} onOpenDrawing={onOpenDrawing} onOpenPart={onOpenPart} /> : matrix.issue ? null : <p className="pdm-relation-empty-line">目前尚未建立圖料根號，暫無可顯示的關聯矩陣。</p>}
    {editReady && (changes.length > 0 || saveState !== "idle") ? <div className={`canonical-matrix-actions is-${saveState}`} data-save-state={saveState}>
      {saveState === "idle" ? <>
        <button type="button" className="primary-button" disabled={!changes.length} onClick={() => void save()}>儲存關聯</button>
        <button type="button" className="secondary-button" onClick={cancel}>取消</button>
        <span role="status">已變更 {changes.length} 格</span>
      </> : recoveryActionLabel ? <button type="button" className="primary-button" onClick={handleRecovery}>{recoveryActionLabel}</button> : <span role="status">{saveState === "saving" ? "正在儲存…" : saveState === "readback" ? "正在確認儲存結果…" : "正在載入最新資料…"}</span>}
    </div> : null}
  </section>;
}
