"use client";

import { useEffect, useState } from "react";
import { Link2, Package, Save } from "lucide-react";
import { HumanStatusBadge } from "@/components/human-status-badge";
import type { PartProjectionFull, PartProjectionSummary, PdmProjectionEnvelope } from "@/lib/pdm-entity-detail-contract";

type PartVariantForm = {
  materialLabel: string;
  colorLabel: string;
  surfaceTreatment: string;
  variantNote: string;
};

function variantFormFromProjection(data: PartProjectionFull): PartVariantForm {
  return {
    materialLabel: data.attributes.materialLabel ?? "",
    colorLabel: data.attributes.colorLabel ?? "",
    surfaceTreatment: data.attributes.surfaceTreatment ?? "",
    variantNote: data.attributes.variantNote ?? ""
  };
}

function readSaveError(body: unknown) {
  if (!body || typeof body !== "object") return "料號資料尚未儲存，請重新整理後再試。";
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") return (error as { message: string }).message;
  return "料號資料尚未儲存，請重新整理後再試。";
}

export function PartProjection({ projection, showStatusBadge = true, showMaintenancePanel = false, onMaintenanceChanged }: { projection: PdmProjectionEnvelope<PartProjectionSummary, PartProjectionFull>; showStatusBadge?: boolean; showMaintenancePanel?: boolean; onMaintenanceChanged?: () => void }) {
  const data = projection.data;
  const full = projection.level === "full" ? projection.data : null;
  const [form, setForm] = useState<PartVariantForm>(() => full ? variantFormFromProjection(full) : { materialLabel: "", colorLabel: "", surfaceTreatment: "", variantNote: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!full) return;
    setForm(variantFormFromProjection(full));
  }, [full]);

  async function saveVariant() {
    if (!full || busy) return;
    setBusy(true);
    setMessage("");
    setSaveError("");
    try {
      const response = await fetch(`/api/parts/${encodeURIComponent(full.partNumber)}/variant`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readSaveError(body));
      setMessage("料號資料已儲存。");
      onMaintenanceChanged?.();
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "料號資料尚未儲存，請重新整理後再試。");
    } finally {
      setBusy(false);
    }
  }

  function setField(field: keyof PartVariantForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setSaveError("");
  }

  return (
    <section id="part-data-maintenance" className="unified-pdm-projection" data-component="PartProjection" aria-labelledby="unified-part-projection-title">
      <div className="unified-pdm-projection-heading">
        <div><h3 id="unified-part-projection-title">料號資料</h3></div>
        {showStatusBadge ? <HumanStatusBadge status={data.humanStatus} viewerStatus={data.viewerStatus} availabilityScope={data.availabilityScope} /> : null}
      </div>
      <div className="unified-pdm-fact-grid">
        <div><span>料號</span><strong>{data.partNumber}</strong></div>
        <div><span>圖料根號</span><strong>{data.rootCode || "尚未指定"}</strong></div>
        <div><span>品項類型</span><strong>{data.itemKind || "尚未指定"}</strong></div>
        <div><span>關聯圖面</span><strong>{data.linkedDrawingCount} 個</strong></div>
      </div>
      {full ? <>
        <div className="unified-pdm-subsection">
          <h4><Package size={15} aria-hidden="true" />料號屬性</h4>
          {showMaintenancePanel ? (
            <div className="unified-pdm-part-maintenance" aria-label="料號資料維護">
              <div className="unified-pdm-part-maintenance-grid">
                <PartField label="材質" value={form.materialLabel} required onChange={(value) => setField("materialLabel", value)} disabled={busy} />
                <PartField label="顏色" value={form.colorLabel} onChange={(value) => setField("colorLabel", value)} disabled={busy} />
                <PartField label="表面處理" value={form.surfaceTreatment} required onChange={(value) => setField("surfaceTreatment", value)} disabled={busy} />
                <PartField label="差異說明" value={form.variantNote} onChange={(value) => setField("variantNote", value)} disabled={busy} />
              </div>
              <div className="unified-pdm-part-maintenance-actions">
                <button className="primary-button" type="button" disabled={busy} onClick={() => void saveVariant()}><Save size={15} aria-hidden="true" />{busy ? "儲存中…" : "儲存料號資料"}</button>
                {message ? <span className="unified-pdm-save-success" role="status">{message}</span> : null}
                {saveError ? <span className="unified-pdm-save-error" role="alert">{saveError}</span> : null}
              </div>
            </div>
          ) : <p>材質：{full.attributes.materialLabel ?? "未填寫"}；表面處理：{full.attributes.surfaceTreatment ?? "未填寫"}；自訂規格：{full.attributes.customSpecification ?? "未填寫"}；系列：{full.attributes.seriesCode ?? "未指定"}</p>}
        </div>
        <div className="unified-pdm-subsection"><h4><Link2 size={15} aria-hidden="true" />關聯圖面</h4>{full.linkedDrawings.length > 0 ? <ul>{full.linkedDrawings.map((drawing) => <li key={drawing.id}>{drawing.drawingNumber} · {drawing.linkType}</li>)}</ul> : <p>目前尚無關聯圖面。</p>}</div>
      </> : null}
    </section>
  );
}

function PartField({ label, value, required = false, disabled, onChange }: { label: string; value: string; required?: boolean; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="pdm-master-field"><span>{label}{required ? "（必填）" : ""}</span><input className={!value.trim() && required ? "pdm-missing-field" : undefined} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} data-field-missing={!value.trim() && required ? "true" : undefined} /></label>;
}
