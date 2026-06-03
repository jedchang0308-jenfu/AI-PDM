"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSearch, Send, UploadCloud, X } from "lucide-react";
import { WorkflowStrip } from "@/components/workflow-strip";
import type { PdmMetadata, PdmMetadataDetection } from "@/lib/pdm-metadata";

const emptyMetadata: PdmMetadata = {
  drawing_number: "",
  part_number: "",
  part_name: "",
  revision: "",
  product_line: "",
  customer: "",
  project_code: "",
  process_name: "",
  machine: "",
  material: "",
  surface_finish: "",
  document_type: ""
};

const fieldLabels: Record<keyof PdmMetadata, string> = {
  product_line: "產品線",
  customer: "客戶",
  project_code: "專案",
  process_name: "製程",
  machine: "機台",
  drawing_number: "圖號",
  part_number: "料號",
  part_name: "品名",
  revision: "版次",
  material: "材質",
  surface_finish: "表面處理",
  document_type: "文件類型"
};

const requiredMetadataFields = new Set<keyof PdmMetadata>([
  "drawing_number",
  "part_number",
  "part_name",
  "revision",
  "material",
  "surface_finish",
  "document_type"
]);

type Message = { type: "success" | "error"; text: string; submissionId?: string };

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [metadata, setMetadata] = useState<PdmMetadata>(emptyMetadata);
  const [detection, setDetection] = useState<PdmMetadataDetection | null>(null);
  const [changeDescription, setChangeDescription] = useState("");
  const [approvalRequired, setApprovalRequired] = useState<"1" | "2">("1");
  const [detecting, setDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const submissionFiles = useMemo(() => files.filter((file) => !isMetadataSidecar(file.name)), [files]);
  const propertyFiles = useMemo(() => files.filter((file) => isMetadataSidecar(file.name)), [files]);

  async function handleFiles(nextFiles: FileList | File[]) {
    const selected = Array.from(nextFiles);
    setFiles(selected);
    setMessage(null);
    setDetection(null);
    if (selected.length === 0) {
      setMetadata(emptyMetadata);
      return;
    }
    await detectMetadata(selected);
  }

  async function detectMetadata(selected: File[]) {
    setDetecting(true);
    const form = new FormData();
    selected.forEach((file) => form.append("files", file));

    const response = await fetch("/api/file-metadata/detect", {
      method: "POST",
      body: form
    });
    const body = await response.json().catch(() => ({}));
    setDetecting(false);

    if (!response.ok) {
      setMessage({ type: "error", text: body.error ?? "屬性偵測失敗，請手動填寫欄位。" });
      return;
    }

    setDetection(body);
    setMetadata({ ...emptyMetadata, ...(body.metadata ?? {}) });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const form = new FormData();
    for (const file of submissionFiles) form.append("files", file);
    for (const [key, value] of Object.entries(metadata)) form.append(key, value);
    form.append("change_description", changeDescription);
    form.append("approval_required", approvalRequired);
    form.append("cad_references_json", JSON.stringify(detection?.cadReferences ?? []));

    const response = await fetch("/api/submissions", {
      method: "POST",
      body: form
    });
    const body = await response.json().catch(() => ({}));
    setSubmitting(false);

    if (!response.ok) {
      const details = Array.isArray(body.details) ? `：${body.details.join("、")}` : "";
      setMessage({ type: "error", text: `${body.error ?? "送審失敗"}${details}` });
      return;
    }

    setMessage({ type: "success", text: "送審已建立，狀態為待審核。", submissionId: body.submissionId });
    setFiles([]);
    setDetection(null);
    setMetadata(emptyMetadata);
    setChangeDescription("");
  }

  function updateField(field: keyof PdmMetadata, value: string) {
    setMetadata((current) => ({ ...current, [field]: value }));
  }

  function applyCandidate(field: keyof PdmMetadata, value: string) {
    setMetadata((current) => ({ ...current, [field]: value }));
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Windows 檔案送審</h1>
          <p>從總管拖拉或選取檔案，系統先自動帶入 PDM 屬性，使用者只需補變更原因。</p>
        </div>
      </div>

      <WorkflowStrip
        title="送審流程"
        description="先確認圖料號，再補檔案與 PDM 屬性，送出後進入待辦與審核。"
        steps={["領號", "上傳送審", "審核", "發行", "交接"]}
        currentStep="上傳送審"
        actions={[
          { href: "/numbering/request", label: "先領號" },
          { href: "/numbering/tasks", label: "看待辦", variant: "primary" }
        ]}
      />

      <form className="upload-layout" onSubmit={submit}>
        <section className="panel">
          <div className="panel-header">
            <h2>1. 選擇檔案</h2>
          </div>
          <div className="upload-panel-body">
            <label
              className={dragOver ? "dropzone drag-over" : "dropzone"}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                handleFiles(event.dataTransfer.files).catch(console.error);
              }}
            >
              <UploadCloud size={28} aria-hidden="true" />
              <strong>拖拉檔案到這裡，或點選從 Windows 總管選檔</strong>
              <span>送審檔支援 .sldprt、.sldasm、.slddrw、.pdf、.dwg；屬性 sidecar 支援 .pdm.json / .properties / .txt。</span>
              <input
                type="file"
                multiple
                onChange={(event) => {
                  handleFiles(event.target.files ?? []).catch(console.error);
                  event.currentTarget.value = "";
                }}
              />
            </label>

            {files.length > 0 ? (
              <div className="upload-file-list">
                {files.map((file) => (
                  <div className="upload-file-item" key={`${file.name}-${file.size}-${file.lastModified}`}>
                    <FileSearch size={16} aria-hidden="true" />
                    <div>
                      <strong className="file-title">
                        <span className="file-kind-badge" aria-label={`檔案格式 ${fileExtensionLabel(file.name)}`}>
                          {fileExtensionLabel(file.name)}
                        </span>
                        <span className="file-name">{file.name}</span>
                      </strong>
                      <div className="metadata-list">
                        <span className="metadata-pair">
                          <span className="metadata-label">大小</span>
                          <span className="metadata-value">{formatBytes(file.size)}</span>
                        </span>
                        <span className="metadata-pair">
                          <span className="metadata-label">用途</span>
                          <span className="metadata-value">{isMetadataSidecar(file.name) ? "屬性檔，不送入 PDM 檔案庫" : "送審檔"}</span>
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      title="移除檔案"
                      onClick={() => {
                        const nextFiles = files.filter((item) => item !== file);
                        handleFiles(nextFiles).catch(console.error);
                      }}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>2. PDM 屬性</h2>
            {detecting ? <span className="section-label">偵測中...</span> : null}
          </div>
          <div className="upload-panel-body">
            {detection?.warnings?.length ? (
              <div className="upload-warning">
                <AlertTriangle size={16} aria-hidden="true" />
                <div>
                  {detection.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="upload-fields">
              {(Object.keys(emptyMetadata) as Array<keyof PdmMetadata>).map((field) => (
                <label key={field}>
                  {fieldLabels[field]}
                  <input value={metadata[field]} onChange={(event) => updateField(field, event.target.value)} required={requiredMetadataFields.has(field)} />
                  <small>{sourceText(detection, field)}</small>
                </label>
              ))}
            </div>

            {detection?.candidates?.length ? (
              <div className="ocr-candidate-list">
                <span className="section-label">AI/OCR 候選欄位（送審前需人工確認）</span>
                {detection.candidates.slice(0, 12).map((candidate, index) => (
                  <button
                    className="ocr-candidate"
                    type="button"
                    key={`${candidate.field}-${candidate.value}-${index}`}
                    onClick={() => applyCandidate(candidate.field, candidate.value)}
                  >
                    <strong className="identity-stack">
                      <span className="identity-line">
                        <span className="metadata-badge">{fieldLabels[candidate.field]}</span>
                        <span className="identity-primary">{candidate.value}</span>
                      </span>
                    </strong>
                    <span className="metadata-list">
                      <span className="metadata-pair">
                        <span className="metadata-label">信心度</span>
                        <span className="metadata-value">{candidate.confidence}</span>
                      </span>
                      <span className="metadata-pair">
                        <span className="metadata-label">來源</span>
                        <span className="metadata-value">{candidate.source}</span>
                      </span>
                    </span>
                    <small>{candidate.snippet}</small>
                  </button>
                ))}
              </div>
            ) : null}

            <label className="upload-textarea-label">
              變更原因
              <textarea
                value={changeDescription}
                onChange={(event) => setChangeDescription(event.target.value)}
                minLength={5}
                maxLength={100}
                required
                placeholder="例如：現場實機送審測試，確認 PDM 流程可追溯"
              />
              <small>{changeDescription.length} / 100</small>
            </label>

            <label>
              簽審層級
              <select className="dropdown-select" value={approvalRequired} onChange={(event) => setApprovalRequired(event.target.value as "1" | "2")}>
                <option value="1">1 位審核者</option>
                <option value="2">2 位審核者</option>
              </select>
            </label>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>3. 送審確認</h2>
          </div>
          <div className="upload-panel-body">
            <div className="detail-row">
              <span>送入 PDM 的檔案</span>
              <strong>{submissionFiles.length} 個</strong>
            </div>
            <div className="detail-row">
              <span>只用於自動填欄位的屬性檔</span>
              <strong>{propertyFiles.length} 個</strong>
            </div>
            {message ? (
              <div className={message.type === "success" ? "upload-message success" : "upload-message error"}>
                {message.type === "success" ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
                <div>
                  <p>{message.text}</p>
                  {message.submissionId ? (
                    <>
                      <span className="diagnostic-value">送審 ID {message.submissionId}</span>
                      <div className="next-step-inline-actions">
                        <Link className="primary-button" href="/numbering/tasks">
                          看待辦
                        </Link>
                        <Link className="secondary-button" href="/">
                          回工作台
                        </Link>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
            <button className="primary-button" type="submit" disabled={submitting || submissionFiles.length === 0}>
              <Send size={16} aria-hidden="true" />
              {submitting ? "送審中..." : "建立待審核送審"}
            </button>
          </div>
        </section>
      </form>
    </>
  );
}

function sourceText(detection: PdmMetadataDetection | null, field: keyof PdmMetadata) {
  const source = detection?.sources?.find((item) => item.field === field);
  if (!source) return "未偵測到時可手動填寫。";
  return `來源：${source.source}，信心度：${source.confidence}`;
}

function isMetadataSidecar(filename: string) {
  const lower = filename.toLowerCase();
  const isPropertyExt = /\.(json|txt|properties|csv)$/u.test(lower);
  return isPropertyExt && (lower.includes("pdm") || lower.includes("property") || lower.includes("properties") || lower.includes("屬性"));
}

function fileExtensionLabel(filename: string) {
  const extension = filename.split(".").pop()?.trim();
  return extension ? extension.toUpperCase() : "FILE";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
