"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { ReviewPackageWorkspaceSnapshot } from "@/lib/pdm-review-package-contract";

type Side = "snapshot" | "current";

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  return JSON.stringify(value, null, 2);
}

function EvidencePane({ label, value, evidenceHash, changedSections }: { label: string; value: ReviewPackageWorkspaceSnapshot | null; evidenceHash: string | null; changedSections: string[] }) {
  if (!value) return <article className="review-compare-pane is-missing" aria-label={label}><header><span className="eyebrow">證據版本</span><h3>{label}</h3></header><p role="status">目前資料已不存在或不可取得；送審快照仍保留為決策證據。</p></article>;
  const sections = [
    { key: "identity", label: "身分", value: value.identity },
    { key: "fields", label: "欄位", value: value.payload },
    { key: "files", label: "檔案與附件", value: { files: value.files, attachments: value.attachments } },
    { key: "recognition", label: "辨識與風險", value: value.recognition }
  ].sort((left, right) => Number(changedSections.includes(right.key)) - Number(changedSections.includes(left.key)));
  return <article className="review-compare-pane" aria-label={label}>
    <header><span className="eyebrow">證據版本</span><h3>{label}</h3><strong>{value.identity.code}</strong>{evidenceHash ? <code title={evidenceHash}>{evidenceHash.slice(0, 12)}</code> : null}</header>
    {sections.map((section) => <details key={section.key} open={changedSections.includes(section.key)} data-changed={changedSections.includes(section.key) ? "true" : "false"}>
      <summary>{section.label}</summary>
      <pre>{display(section.value)}</pre>
    </details>)}
  </article>;
}

export function ReviewSnapshotCompare({ snapshot, current, snapshotHash, currentHash, changedSections, onClose }: { snapshot: ReviewPackageWorkspaceSnapshot; current: ReviewPackageWorkspaceSnapshot | null; snapshotHash: string; currentHash: string | null; changedSections: string[]; onClose: () => void }) {
  const [mobileSide, setMobileSide] = useState<Side>("snapshot");
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  return <section
    className={`review-snapshot-compare is-${mobileSide}`}
    role="region"
    aria-label="送審快照與目前資料比較"
    onPointerDown={(event) => { if (event.clientX > 24) pointerStart.current = { x: event.clientX, y: event.clientY }; }}
    onPointerUp={(event) => {
      const start = pointerStart.current; pointerStart.current = null;
      if (!start || Math.abs(event.clientY - start.y) > Math.abs(event.clientX - start.x) || Math.abs(event.clientX - start.x) < 50) return;
      setMobileSide(event.clientX < start.x ? "current" : "snapshot");
    }}
  >
    <header className="review-compare-header"><div><span className="eyebrow">差異比較</span><h2>{snapshot.identity.code}</h2></div><button className="icon-button" type="button" aria-label="關閉差異比較" onClick={onClose}><X size={18} /></button></header>
    <div className="review-compare-mobile-switch" role="group" aria-label="比較資料版本">
      <button type="button" aria-pressed={mobileSide === "snapshot"} onClick={() => setMobileSide("snapshot")}>送審快照</button>
      <button type="button" aria-pressed={mobileSide === "current"} onClick={() => setMobileSide("current")}>目前資料</button>
    </div>
    <div className="review-compare-grid">
      <EvidencePane label="送審快照" value={snapshot} evidenceHash={snapshotHash} changedSections={changedSections} />
      <EvidencePane label="目前資料" value={current} evidenceHash={currentHash} changedSections={changedSections} />
    </div>
  </section>;
}
