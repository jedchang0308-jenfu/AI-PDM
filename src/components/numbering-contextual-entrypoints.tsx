"use client";

import { useEffect, useMemo, useState } from "react";
import { FilePlus2, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import { displayDrawingPurposeLabel, isManufacturingDrawingPurpose } from "@/lib/numbering-identity";

type RecordStatus =
  | "Draft"
  | "NeedInfo"
  | "Active"
  | "PendingReview"
  | "Released"
  | "Rejected"
  | "Obsolete"
  | "Merged"
  | "EVTDisabled"
  | "PendingAdminConfirm"
  | "MainDrawingInvalid";

type ContextMode = "root" | "drawing" | "part";
type DialogMode = "add_drawing" | "add_part" | "delete_draft_root" | "obsolete_root" | "obsolete_drawing" | "obsolete_part" | null;
const CONTEXTUAL_DIALOG_OPEN_EVENT = "pdm-numbering-contextual-open";

type AppendPolicy = {
  locked: boolean;
  reasonRequired: boolean;
  nextNumbers: {
    part: string;
    drawingM: string;
    drawingR: string;
  };
};

type RootObsoleteImpact = {
  formalTargets: Array<{ entityType: "part_number" | "drawing_number"; entityCode: string; recordStatus: RecordStatus }>;
  parts: Array<{ partNumber: string; recordStatus: RecordStatus }>;
  drawings: Array<{ drawingNumber: string; purposeCode: string; recordStatus: RecordStatus }>;
  links: Array<{ drawingNumber: string; partNumber: string; linkType: "primary_manufacturing" | "reference" }>;
  warnings: string[];
  pendingRequestId: string | null;
};

export function NumberingContextualEntrypoints({
  mode,
  rootCode,
  coreName,
  rootRecordStatus,
  rootFormalChildCount = 0,
  rootPartCount = 0,
  rootDrawingCount = 0,
  drawing,
  part,
  onChanged
}: {
  mode: ContextMode;
  rootCode: string;
  coreName?: string | null;
  rootRecordStatus?: RecordStatus;
  rootFormalChildCount?: number;
  rootPartCount?: number;
  rootDrawingCount?: number;
  drawing?: { drawingNumber: string; purposeCode: string; recordStatus: RecordStatus; linkedPartNumbers?: string[] };
  part?: { partNumber: string; partName?: string | null; recordStatus: RecordStatus; linkedDrawingNumbers?: string[] };
  onChanged?: () => Promise<void> | void;
}) {
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [policy, setPolicy] = useState<AppendPolicy | null>(null);
  const [impact, setImpact] = useState<RootObsoleteImpact | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const instanceId = useMemo(() => createIdempotencyKey(), []);

  useEffect(() => {
    function closeWhenPeerOpens(event: Event) {
      const detail = (event as CustomEvent<{ instanceId?: string }>).detail;
      if (detail?.instanceId === instanceId) return;
      setDialog(null);
      setMessage("");
      setError("");
    }
    window.addEventListener(CONTEXTUAL_DIALOG_OPEN_EVENT, closeWhenPeerOpens);
    return () => {
      window.removeEventListener(CONTEXTUAL_DIALOG_OPEN_EVENT, closeWhenPeerOpens);
    };
  }, [instanceId]);

  useEffect(() => {
    let cancelled = false;
    async function loadPolicy() {
      if (!rootCode) return;
      const response = await fetch(`/api/numbering/roots/${encodeURIComponent(rootCode)}/append-policy`);
      const body = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (response.ok) setPolicy(body as AppendPolicy);
    }
    void loadPolicy();
    return () => {
      cancelled = true;
    };
  }, [rootCode]);

  useEffect(() => {
    if (dialog !== "obsolete_root") return;
    let cancelled = false;
    async function loadImpact() {
      setBusy(true);
      setError("");
      const response = await fetch(`/api/numbering/roots/${encodeURIComponent(rootCode)}/obsolete-impact`);
      const body = await response.json().catch(() => ({}));
      setBusy(false);
      if (cancelled) return;
      if (response.ok) setImpact(body as RootObsoleteImpact);
      else setError(humanizeError(body.error ?? "主根作廢影響預覽失敗"));
    }
    void loadImpact();
    return () => {
      cancelled = true;
    };
  }, [dialog, rootCode]);

  const disabledReason = policy?.locked ? "此主根已關閉，不能再追加圖號或料號。" : "";
  const canObsoleteRoot = Boolean(rootRecordStatus && isRootObsoleteCandidate(rootRecordStatus, rootFormalChildCount));
  const canDeleteDraftRoot = Boolean(rootRecordStatus && isDraftDeleteCandidate(rootRecordStatus) && rootFormalChildCount === 0);

  function open(nextDialog: DialogMode) {
    if (nextDialog) window.dispatchEvent(new CustomEvent(CONTEXTUAL_DIALOG_OPEN_EVENT, { detail: { instanceId } }));
    setDialog(nextDialog);
    setMessage("");
    setError("");
  }

  function close() {
    setDialog(null);
    setMessage("");
    setError("");
  }

  return (
    <div className="pdm-contextual-actions">
      <div className="pdm-contextual-action-row" data-numbering-contextual-entrypoints={mode}>
        {mode === "root" ? (
          <>
            <button className="primary-button" type="button" disabled={policy?.locked || busy} onClick={() => open("add_drawing")}>
              <FilePlus2 size={16} />
              新增圖號
            </button>
            <button className="secondary-button" type="button" disabled={policy?.locked || busy} onClick={() => open("add_part")}>
              <Plus size={16} />
              新增料號
            </button>
            {canDeleteDraftRoot ? (
              <button className="secondary-button danger-button" type="button" disabled={busy} onClick={() => open("delete_draft_root")}>
                <Trash2 size={16} />
                刪除草稿
              </button>
            ) : (
              <button className="secondary-button danger-button" type="button" disabled={!canObsoleteRoot || busy} onClick={() => open("obsolete_root")}>
                <ShieldAlert size={16} />
                申請主根作廢
              </button>
            )}
          </>
        ) : null}
        {mode === "drawing" && drawing ? (
          <>
            <button className="secondary-button" type="button" disabled={policy?.locked || busy} onClick={() => open("add_drawing")}>
              <FilePlus2 size={16} />
              新增同根圖號
            </button>
            <button className="primary-button" type="button" disabled={policy?.locked || busy} onClick={() => open("add_part")}>
              <Plus size={16} />
              新增同圖料號
            </button>
            {isFormalObsoleteCandidate(drawing.recordStatus) ? (
              <button className="secondary-button danger-button" type="button" disabled={busy} onClick={() => open("obsolete_drawing")}>
                <ShieldAlert size={16} />
                申請圖號作廢
              </button>
            ) : null}
          </>
        ) : null}
        {mode === "part" && part ? (
          <>
            <button className="primary-button" type="button" disabled={policy?.locked || busy} onClick={() => open("add_part")}>
              <Plus size={16} />
              以此料號新增同根料號
            </button>
            <button className="secondary-button" type="button" disabled={policy?.locked || busy} onClick={() => open("add_drawing")}>
              <FilePlus2 size={16} />
              新增同根圖號
            </button>
            {isFormalObsoleteCandidate(part.recordStatus) ? (
              <button className="secondary-button danger-button" type="button" disabled={busy} onClick={() => open("obsolete_part")}>
                <ShieldAlert size={16} />
                申請料號作廢
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {disabledReason ? <p className="pdm-contextual-hint">{disabledReason}</p> : null}
      {canDeleteDraftRoot && mode === "root" ? <p className="pdm-contextual-hint">尚未送審的草稿可直接刪除；正式資料才使用申請作廢。</p> : null}
      {!canDeleteDraftRoot && !canObsoleteRoot && mode === "root" ? <p className="pdm-contextual-hint">目前狀態不可新增、刪除或申請作廢，請先查看待辦或審核狀態。</p> : null}
      {message ? <p className="pdm-contextual-message">{message}</p> : null}
      {error ? <p className="pdm-contextual-error">{error}</p> : null}
      {dialog === "add_drawing" ? (
        <AddDrawingDialog rootCode={rootCode} coreName={coreName} policy={policy} part={part} busy={busy} setBusy={setBusy} setMessage={setMessage} setError={setError} onChanged={onChanged} onClose={close} mode={mode} />
      ) : null}
      {dialog === "add_part" ? (
        <AddPartDialog rootCode={rootCode} coreName={coreName} policy={policy} drawing={drawing} part={part} busy={busy} setBusy={setBusy} setMessage={setMessage} setError={setError} onChanged={onChanged} onClose={close} mode={mode} />
      ) : null}
      {dialog === "delete_draft_root" ? (
        <DeleteDraftRootDialog rootCode={rootCode} coreName={coreName} rootPartCount={rootPartCount} rootDrawingCount={rootDrawingCount} busy={busy} setBusy={setBusy} setMessage={setMessage} setError={setError} onChanged={onChanged} onClose={close} />
      ) : null}
      {dialog === "obsolete_part" && part ? (
        <ObsoleteDialog entityType="part_number" entityCode={part.partNumber} title="申請料號作廢" impactLines={part.linkedDrawingNumbers?.length ? [`關聯圖號：${part.linkedDrawingNumbers.join("、")}`] : ["此料號目前沒有關聯圖號。"]} busy={busy} setBusy={setBusy} setMessage={setMessage} setError={setError} onChanged={onChanged} onClose={close} />
      ) : null}
      {dialog === "obsolete_drawing" && drawing ? (
        <ObsoleteDialog entityType="drawing_number" entityCode={drawing.drawingNumber} title="申請圖號作廢" impactLines={drawing.linkedPartNumbers?.length ? [`關聯料號：${drawing.linkedPartNumbers.join("、")}`] : ["此圖號目前沒有關聯料號。"]} busy={busy} setBusy={setBusy} setMessage={setMessage} setError={setError} onChanged={onChanged} onClose={close} />
      ) : null}
      {dialog === "obsolete_root" ? (
        <RootObsoleteDialog rootCode={rootCode} impact={impact} busy={busy} setBusy={setBusy} setMessage={setMessage} setError={setError} onChanged={onChanged} onClose={close} />
      ) : null}
    </div>
  );
}

function AddDrawingDialog({
  rootCode,
  coreName,
  policy,
  part,
  busy,
  setBusy,
  setMessage,
  setError,
  onChanged,
  onClose,
  mode
}: {
  rootCode: string;
  coreName?: string | null;
  policy: AppendPolicy | null;
  part?: { partNumber: string; partName?: string | null };
  busy: boolean;
  setBusy: (value: boolean) => void;
  setMessage: (value: string) => void;
  setError: (value: string) => void;
  onChanged?: () => Promise<void> | void;
  onClose: () => void;
  mode: ContextMode;
}) {
  const [purposeCode, setPurposeCode] = useState<"M" | "R">("M");
  const [purposeDescription, setPurposeDescription] = useState("");
  const [reason, setReason] = useState("");
  const [linkPart, setLinkPart] = useState(Boolean(part));
  const [linkRelationType, setLinkRelationType] = useState<"auto" | "reference">("auto");
  const idempotencyKey = useMemo(() => createIdempotencyKey(), []);
  const preview = purposeCode === "M" ? policy?.nextNumbers.drawingM : policy?.nextNumbers.drawingR;
  const effectiveLinkRelationType = purposeCode === "R" ? "reference" : linkRelationType;
  const dirty = purposeCode !== "M" || Boolean(purposeDescription.trim()) || Boolean(reason.trim()) || linkPart !== Boolean(part) || linkRelationType !== "auto";

  function cancel() {
    if (dirty && !window.confirm("放棄未儲存的新增圖號內容？")) return;
    onClose();
  }

  async function submit() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/numbering/roots/${encodeURIComponent(rootCode)}/drawings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purposeCode,
        purposeDescription,
        reason,
        linkPartNumber: linkPart ? part?.partNumber : undefined,
        linkRelationType: linkPart ? effectiveLinkRelationType : "none",
        sourceEntrypoint: `${mode}_drawer`,
        idempotencyKey
      })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(humanizeError(body.error ?? "新增圖號失敗"));
      return;
    }
    const linkedText = body.linkedPart?.partNumber ? `，並已建立與 ${body.linkedPart.partNumber} 的圖料關係` : "";
    setMessage(`已新增圖號 ${body.drawingNumber?.drawingNumber ?? ""}${linkedText}，仍在同一個主根 ${rootCode}。`);
    await onChanged?.();
    onClose();
  }

  return (
    <div className="pdm-contextual-dialog" role="dialog" aria-label="新增同根圖號">
      <DialogHeader title={part ? `新增同根圖號：${part.partNumber}` : "新增同根圖號"} onClose={cancel} />
      <LockedRoot rootCode={rootCode} coreName={coreName} />
      <div className="pdm-contextual-segmented">
        <button className={purposeCode === "M" ? "selected" : ""} type="button" onClick={() => setPurposeCode("M")}>製造圖 M</button>
        <button className={purposeCode === "R" ? "selected" : ""} type="button" onClick={() => setPurposeCode("R")}>參考圖 R</button>
      </div>
      <p className="pdm-contextual-preview">預計產生：<strong>{preview ?? "讀取中"}</strong></p>
      {purposeCode === "R" ? <TextInput label="參考用途" value={purposeDescription} onChange={setPurposeDescription} /> : null}
      {part ? (
        <label className="pdm-contextual-check">
          <input type="checkbox" checked={linkPart} onChange={(event) => setLinkPart(event.target.checked)} />
          <span>建立與 {part.partNumber} 的圖料關係</span>
        </label>
      ) : null}
      {part && linkPart && purposeCode === "R" ? (
        <p className="pdm-contextual-hint">參考圖不可作為製造依據，系統會建立參考關係。</p>
      ) : null}
      {part && linkPart && purposeCode === "M" ? (
        <label className="pdm-contextual-field">
          <span>關係</span>
          <select value={linkRelationType} onChange={(event) => setLinkRelationType(event.target.value === "reference" ? "reference" : "auto")}>
            <option value="auto">製造依據</option>
            <option value="reference">參考</option>
          </select>
        </label>
      ) : null}
      {policy?.reasonRequired ? <TextAreaInput label="追加原因" value={reason} onChange={setReason} /> : null}
      <div className="pdm-contextual-dialog-actions">
        <button className="secondary-button" type="button" disabled={busy} onClick={cancel}>
          取消
        </button>
        <button className="primary-button" type="button" disabled={busy || policy?.locked || (purposeCode === "R" && !purposeDescription.trim()) || (policy?.reasonRequired && !reason.trim())} onClick={submit}>
          建立圖號
        </button>
      </div>
    </div>
  );
}

function AddPartDialog({
  rootCode,
  coreName,
  policy,
  drawing,
  part,
  busy,
  setBusy,
  setMessage,
  setError,
  onChanged,
  onClose,
  mode
}: {
  rootCode: string;
  coreName?: string | null;
  policy: AppendPolicy | null;
  drawing?: { drawingNumber: string; purposeCode: string };
  part?: { partNumber: string; partName?: string | null };
  busy: boolean;
  setBusy: (value: boolean) => void;
  setMessage: (value: string) => void;
  setError: (value: string) => void;
  onChanged?: () => Promise<void> | void;
  onClose: () => void;
  mode: ContextMode;
}) {
  const [itemKind, setItemKind] = useState("manufactured");
  const [customSpecification, setCustomSpecification] = useState("");
  const [reason, setReason] = useState("");
  const [linkDrawing, setLinkDrawing] = useState(Boolean(drawing));
  const [linkRelationType, setLinkRelationType] = useState<"auto" | "reference">(drawing && !isManufacturingDrawingPurpose(drawing.purposeCode) ? "reference" : "auto");
  const idempotencyKey = useMemo(() => createIdempotencyKey(), []);
  const initialItemKind = "manufactured";
  const initialLinkDrawing = Boolean(drawing);
  const initialLinkRelationType = drawing && !isManufacturingDrawingPurpose(drawing.purposeCode) ? "reference" : "auto";
  const dirty =
    itemKind !== initialItemKind ||
    Boolean(customSpecification.trim()) ||
    Boolean(reason.trim()) ||
    linkDrawing !== initialLinkDrawing ||
    linkRelationType !== initialLinkRelationType;

  function cancel() {
    if (dirty && !window.confirm("放棄未儲存的新增料號內容？")) return;
    onClose();
  }

  async function submit() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/numbering/roots/${encodeURIComponent(rootCode)}/parts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemKind,
        customSpecification,
        reason,
        linkDrawingNumber: linkDrawing ? drawing?.drawingNumber : undefined,
        linkRelationType: linkDrawing ? linkRelationType : "none",
        sourceEntrypoint: `${mode}_drawer`,
        idempotencyKey
      })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(humanizeError(body.error ?? "新增料號失敗"));
      return;
    }
    setMessage(`已新增料號 ${body.partNumber?.partNumber ?? ""}，仍在同一個主根 ${rootCode}。`);
    await onChanged?.();
    onClose();
  }

  return (
    <div className="pdm-contextual-dialog" role="dialog" aria-label="新增同根料號">
      <DialogHeader title={drawing ? "新增同圖料號" : part ? `以 ${part.partNumber} 新增同根料號` : "新增同根料號"} onClose={cancel} />
      <LockedRoot rootCode={rootCode} coreName={coreName} />
      <p className="pdm-contextual-preview">預計產生：<strong>{policy?.nextNumbers.part ?? "讀取中"}</strong></p>
      <p className="pdm-contextual-preview">品名跟隨主根：<strong>{coreName?.trim() || "-"}</strong></p>
      <label className="pdm-contextual-field">
        <span>料號類型</span>
        <select value={itemKind} onChange={(event) => setItemKind(event.target.value)}>
          <option value="manufactured">自製件</option>
          <option value="outsourced">委外件</option>
          <option value="purchased">採購件</option>
          <option value="shared">共用件</option>
          <option value="custom">客製件</option>
        </select>
      </label>
      {itemKind === "custom" ? <TextInput label="客製規格" value={customSpecification} onChange={setCustomSpecification} /> : null}
      {drawing ? (
        <label className="pdm-contextual-check">
          <input type="checkbox" checked={linkDrawing} onChange={(event) => setLinkDrawing(event.target.checked)} />
          <span>
            建立與 {drawing.drawingNumber} 的圖料關係（{isManufacturingDrawingPurpose(drawing.purposeCode) ? "製造依據" : "參考"}）
          </span>
        </label>
      ) : null}
      {drawing && linkDrawing && !isManufacturingDrawingPurpose(drawing.purposeCode) ? (
        <p className="pdm-contextual-hint">參考圖不可作為製造依據，系統會建立參考關係。</p>
      ) : null}
      {drawing && linkDrawing && isManufacturingDrawingPurpose(drawing.purposeCode) ? (
        <label className="pdm-contextual-field">
          <span>關係</span>
          <select value={linkRelationType} onChange={(event) => setLinkRelationType(event.target.value === "reference" ? "reference" : "auto")}>
            <option value="auto">製造依據</option>
            <option value="reference">參考</option>
          </select>
        </label>
      ) : null}
      {policy?.reasonRequired ? <TextAreaInput label="追加原因" value={reason} onChange={setReason} /> : null}
      <div className="pdm-contextual-dialog-actions">
        <button className="secondary-button" type="button" disabled={busy} onClick={cancel}>
          取消
        </button>
        <button className="primary-button" type="button" disabled={busy || policy?.locked || !coreName?.trim() || (itemKind === "custom" && !customSpecification.trim()) || (policy?.reasonRequired && !reason.trim())} onClick={submit}>
          建立料號
        </button>
      </div>
    </div>
  );
}

function DeleteDraftRootDialog({
  rootCode,
  coreName,
  rootPartCount,
  rootDrawingCount,
  busy,
  setBusy,
  setMessage,
  setError,
  onChanged,
  onClose
}: {
  rootCode: string;
  coreName?: string | null;
  rootPartCount: number;
  rootDrawingCount: number;
  busy: boolean;
  setBusy: (value: boolean) => void;
  setMessage: (value: string) => void;
  setError: (value: string) => void;
  onChanged?: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/numbering/records/${encodeURIComponent(rootCode)}/draft`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        confirmDelete: true,
        reason
      })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(humanizeError(body.error ?? "刪除草稿失敗"));
      return;
    }
    setMessage(`已刪除草稿主根 ${rootCode}。`);
    await onChanged?.();
    onClose();
  }

  return (
    <div className="pdm-contextual-dialog" role="dialog" aria-label="刪除草稿">
      <DialogHeader title="刪除草稿" onClose={onClose} />
      <LockedRoot rootCode={rootCode} coreName={coreName} />
      <ul className="pdm-contextual-impact-list">
        <li>會刪除這組尚未送審的主根草稿。</li>
        <li>包含料號 {rootPartCount} 筆、圖號 {rootDrawingCount} 筆與草稿圖料關係。</li>
        <li>若已有附件，附件會移到已刪除狀態；正式或送審資料不允許走這個動作。</li>
      </ul>
      <TextInput label="刪除原因（選填）" value={reason} onChange={setReason} />
      <label className="pdm-contextual-check">
        <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
        <span>我確認這是尚未送審的草稿，刪除後會從目前主資料清單移除。</span>
      </label>
      <div className="pdm-contextual-dialog-actions">
        <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>
          取消
        </button>
        <button className="danger-button" type="button" disabled={busy || !ack} onClick={submit}>
          刪除草稿
        </button>
      </div>
    </div>
  );
}

function ObsoleteDialog({
  entityType,
  entityCode,
  title,
  impactLines,
  busy,
  setBusy,
  setMessage,
  setError,
  onChanged,
  onClose
}: {
  entityType: "part_number" | "drawing_number";
  entityCode: string;
  title: string;
  impactLines: string[];
  busy: boolean;
  setBusy: (value: boolean) => void;
  setMessage: (value: string) => void;
  setError: (value: string) => void;
  onChanged?: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/lifecycle/obsolete-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entityType, entityCode, reason })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(humanizeError(body.error ?? "建立作廢申請失敗"));
      return;
    }
    setMessage(`已建立 ${entityCode} 作廢審核申請。`);
    await onChanged?.();
    onClose();
  }
  return (
    <div className="pdm-contextual-dialog" role="dialog" aria-label={title}>
      <DialogHeader title={title} onClose={onClose} />
      <ul className="pdm-contextual-impact-list">
        {impactLines.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <TextAreaInput label="作廢原因" value={reason} onChange={setReason} />
      <div className="pdm-contextual-dialog-actions">
        <button className="danger-button" type="button" disabled={busy || !reason.trim()} onClick={submit}>建立作廢申請</button>
      </div>
    </div>
  );
}

function RootObsoleteDialog({
  rootCode,
  impact,
  busy,
  setBusy,
  setMessage,
  setError,
  onChanged,
  onClose
}: {
  rootCode: string;
  impact: RootObsoleteImpact | null;
  busy: boolean;
  setBusy: (value: boolean) => void;
  setMessage: (value: string) => void;
  setError: (value: string) => void;
  onChanged?: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  async function submit() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/lifecycle/obsolete-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entityType: "part_root", entityCode: rootCode, reason })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(humanizeError(body.error ?? "建立主根作廢申請失敗"));
      return;
    }
    setMessage(`已建立主根 ${rootCode} 作廢審核申請，正式資料會在核准後才異動。`);
    await onChanged?.();
    onClose();
  }
  return (
    <div className="pdm-contextual-dialog" role="dialog" aria-label="主根作廢影響預覽">
      <DialogHeader title="主根作廢影響預覽" onClose={onClose} />
      {!impact && busy ? <p className="pdm-contextual-hint">正在讀取影響範圍...</p> : null}
      {impact ? (
        <>
          <div className="pdm-contextual-impact-grid">
            <span>料號 {impact.parts.length}</span>
            <span>圖號 {impact.drawings.length}</span>
            <span>圖料關係 {impact.links.length}</span>
            <span>正式目標 {impact.formalTargets.length}</span>
          </div>
          <ul className="pdm-contextual-impact-list">
            {impact.formalTargets.slice(0, 8).map((target) => <li key={`${target.entityType}:${target.entityCode}`}>{target.entityCode} / {target.recordStatus}</li>)}
            {impact.formalTargets.length > 8 ? <li>另有 {impact.formalTargets.length - 8} 筆正式目標</li> : null}
          </ul>
          {impact.warnings.map((warning) => <p className="pdm-contextual-hint" key={warning}>{warning}</p>)}
        </>
      ) : null}
      <TextAreaInput label="作廢原因" value={reason} onChange={setReason} />
      <label className="pdm-contextual-check">
        <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
        <span>已確認主根底下正式料號、圖號與圖料關係會一起形成審核範圍；核准前不直接作廢。</span>
      </label>
      <div className="pdm-contextual-dialog-actions">
        <button className="danger-button" type="button" disabled={busy || !impact || impact.pendingRequestId !== null || impact.formalTargets.length === 0 || !reason.trim() || !ack} onClick={submit}>建立作廢申請</button>
      </div>
    </div>
  );
}

function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="pdm-contextual-dialog-header">
      <strong>{title}</strong>
      <button className="icon-button" type="button" aria-label="關閉" onClick={onClose}><X size={15} /></button>
    </div>
  );
}

function LockedRoot({ rootCode, coreName }: { rootCode: string; coreName?: string | null }) {
  return <p className="pdm-contextual-preview">主根鎖定：<strong>{rootCode}</strong>{coreName ? ` / ${coreName}` : ""}</p>;
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="pdm-contextual-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAreaInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="pdm-contextual-field">
      <span>{label}</span>
      <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function createIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isFormalObsoleteCandidate(status: RecordStatus) {
  return status === "Active" || status === "Released";
}

function isDraftDeleteCandidate(status: RecordStatus) {
  return status === "Draft" || status === "NeedInfo";
}

function isRootObsoleteCandidate(status: RecordStatus, formalChildCount: number) {
  return isFormalObsoleteCandidate(status) || status === "MainDrawingInvalid" || formalChildCount > 0;
}

function humanizeError(error: unknown) {
  const message = String(error ?? "").trim();
  if (!message) return "操作失敗，請重新整理後再試。";
  if (message.includes("APPEND_REASON_REQUIRED_FOR_FORMAL_ROOT")) return "這個主根已有正式資料，追加前請填寫原因。";
  if (message.includes("PRIMARY_RELATION_REQUIRES_MANUFACTURING_DRAWING")) return "參考圖不可作為製造依據，請改建立參考關係。";
  if (message.includes("NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES")) return "這組資料已進入送審、版本、製造基準或其他受控流程，不能直接刪除草稿。";
  if (message.includes("NUMBERING_ROOT_NOT_DRAFT") || message.includes("NUMBERING_PART_NOT_DRAFT") || message.includes("NUMBERING_DRAWING_NOT_DRAFT")) return "只有尚未送審的草稿可以直接刪除；正式或審核中資料請使用作廢或審核流程。";
  if (message.includes("LIFE_OBSOLETE_ALREADY_REQUESTED")) return "此資料已有作廢審核中申請，請到正式資料審核查看。";
  if (message.includes("LIFE_OBSOLETE_NOT_FORMAL")) return "只有正式資料可申請作廢；草稿請走草稿清理流程。";
  if (message.includes("LOCKED")) return "目前狀態已鎖定，不能執行此操作。";
  if (message.includes("NOT_FOUND")) return "找不到目標資料，請重新整理後再試。";
  if (message.includes("MISMATCH")) return "目標資料不在同一個主根或公司範圍，操作已被阻擋。";
  return message;
}

export function drawingPurposeText(code: string) {
  return `${code} ${displayDrawingPurposeLabel(code)}`;
}
