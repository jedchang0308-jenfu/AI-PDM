"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSearch, Send, X } from "lucide-react";
import { FileDropzone } from "@/components/file-dropzone";
import { LifecycleStageGuidance, ObjectLifecycleStatusPanel } from "@/components/lifecycle-ux";
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
type CompanyOption = {
  companyCode: string;
  displayName: string;
  is_default?: boolean;
};
type AuthUserPayload = {
  default_company?: CompanyOption;
  companies?: CompanyOption[];
};
type UploadPrefillContext = {
  rootCode: string;
  developmentPhase: string;
  metadata: Partial<PdmMetadata>;
};

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [metadata, setMetadata] = useState<PdmMetadata>(emptyMetadata);
  const [detection, setDetection] = useState<PdmMetadataDetection | null>(null);
  const [prefillContext, setPrefillContext] = useState<UploadPrefillContext | null>(null);
  const [changeDescription, setChangeDescription] = useState("");
  const [approvalRequired, setApprovalRequired] = useState<"1" | "2">("1");
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [selectedCompanyCode, setSelectedCompanyCode] = useState("JENFU");
  const [detecting, setDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const submissionFiles = useMemo(() => files.filter((file) => !isMetadataSidecar(file.name)), [files]);
  const propertyFiles = useMemo(() => files.filter((file) => isMetadataSidecar(file.name)), [files]);
  const missingRequiredMetadata = useMemo(
    () => Array.from(requiredMetadataFields).filter((field) => !metadata[field].trim()),
    [metadata]
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { user?: AuthUserPayload } | null) => {
        if (cancelled) return;
        const user = body?.user;
        const companies = user?.companies?.length ? user.companies : user?.default_company ? [user.default_company] : [];
        if (companies.length > 0) {
          setCompanyOptions(companies);
          setSelectedCompanyCode((user?.default_company?.companyCode || companies.find((company) => company.is_default)?.companyCode || companies[0].companyCode || "JENFU").toUpperCase());
        }
      })
      .catch(() => {
        if (!cancelled) setCompanyOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "numbering_draft") return;
    const nextMetadata: Partial<PdmMetadata> = {
      drawing_number: params.get("drawingNumber") ?? "",
      part_number: params.get("partNumber") ?? "",
      part_name: params.get("partName") ?? ""
    };
    const nextPrefill: UploadPrefillContext = {
      rootCode: params.get("rootCode") ?? "",
      developmentPhase: params.get("developmentPhase") ?? "",
      metadata: nextMetadata
    };
    setPrefillContext(nextPrefill);
    setMetadata((current) => mergeMetadataWithPrefill(current, nextPrefill.metadata));
  }, []);

  async function handleFiles(nextFiles: FileList | File[]) {
    const selected = Array.from(nextFiles);
    setFiles(selected);
    setMessage(null);
    setDetection(null);
    if (selected.length === 0) {
      setMetadata(prefillContext ? { ...emptyMetadata, ...prefillContext.metadata } : emptyMetadata);
      return;
    }
    await detectMetadata(selected);
  }

  async function detectMetadata(selected: File[]) {
    setDetecting(true);
    const form = new FormData();
    selected.forEach((file) => form.append("files", file));
    form.append("pdm_company_code", selectedCompanyCode);

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
    setMetadata(mergeDetectedMetadataWithPrefill(prefillContext?.metadata ?? {}, body.metadata ?? {}));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const form = new FormData();
    for (const file of submissionFiles) form.append("files", file);
    for (const [key, value] of Object.entries(metadata)) form.append(key, value);
    form.append("pdm_company_code", selectedCompanyCode);
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

      <LifecycleStageGuidance
        activeStage="submission"
        metrics={[
          { label: "Submission files", value: submissionFiles.length, tone: submissionFiles.length > 0 ? "success" : "warning" },
          { label: "Metadata gaps", value: missingRequiredMetadata.length, tone: missingRequiredMetadata.length > 0 ? "warning" : "success" },
          { label: "Reviewers", value: approvalRequired }
        ]}
      />

      {prefillContext ? (
        <ObjectLifecycleStatusPanel
          title="從領號草稿接續送審"
          objectName={`${prefillContext.rootCode || "未帶入主根號"} / ${metadata.part_number || "未帶入料號"} / ${metadata.drawing_number || "未帶入圖號"}`}
          status="Draft"
          phase={prefillContext.developmentPhase || "EVT"}
          owner="RD"
          identities={[
            { label: "主根號", value: prefillContext.rootCode || "-" },
            { label: "料號", value: metadata.part_number || "-" },
            { label: "圖號", value: metadata.drawing_number || "-" },
            { label: "品名", value: metadata.part_name || "-" }
          ]}
          blockers={missingRequiredMetadata.length > 0 ? missingRequiredMetadata.map((field) => `尚缺 ${fieldLabels[field]}`) : ["欄位已帶入，仍需確認檔案與變更原因"]}
          nextStep="補齊必要欄位與送審檔案後送出，submission 會進入 Pending 並交由審核者處理。"
          secondaryActions={[{ href: prefillContext.rootCode ? `/numbering/search?query=${encodeURIComponent(prefillContext.rootCode)}` : "/numbering/search", label: "回主根明細" }]}
        />
      ) : null}

      <form className="upload-layout" onSubmit={submit}>
        <section className="panel">
          <div className="panel-header">
            <h2>1. 選擇檔案</h2>
          </div>
          <div className="upload-panel-body">
            <FileDropzone
              multiple
              label="拖拉檔案到這裡，或點選從 Windows 總管選檔"
              description="送審檔支援 .sldprt、.sldasm、.slddrw、.pdf、.dwg；屬性 sidecar 支援 .pdm.json / .properties / .txt。"
              onFilesSelected={(selected) => {
                handleFiles(selected).catch(console.error);
              }}
            />

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

            <label>
              PDM Company
              <select
                className="dropdown-select"
                value={selectedCompanyCode}
                onChange={(event) => setSelectedCompanyCode(event.target.value)}
                disabled={companyOptions.length <= 1}
              >
                {(companyOptions.length > 0 ? companyOptions : [{ companyCode: "JENFU", displayName: "鉦富" }]).map((company) => (
                  <option key={company.companyCode} value={company.companyCode}>
                    {company.displayName || company.companyCode} ({company.companyCode})
                  </option>
                ))}
              </select>
              <small>Server validates this company against your account permissions.</small>
            </label>

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

function mergeMetadataWithPrefill(current: PdmMetadata, prefill: Partial<PdmMetadata>) {
  const next = { ...current };
  for (const [field, value] of Object.entries(prefill) as Array<[keyof PdmMetadata, string | undefined]>) {
    if (value && !next[field].trim()) next[field] = value;
  }
  return next;
}

function mergeDetectedMetadataWithPrefill(prefill: Partial<PdmMetadata>, detected: Partial<PdmMetadata>) {
  const next: PdmMetadata = { ...emptyMetadata, ...prefill };
  for (const [field, value] of Object.entries(detected) as Array<[keyof PdmMetadata, string | undefined]>) {
    if (value?.trim()) next[field] = value;
  }
  return next;
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
