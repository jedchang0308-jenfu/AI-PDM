"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSearch, Send, X } from "lucide-react";
import { FileDropzone } from "@/components/file-dropzone";
import { LifecycleStageGuidance, ObjectLifecycleStatusPanel } from "@/components/lifecycle-ux";
import { StatusScopeHelp } from "@/components/status-help-popover";
import { WorkflowStrip } from "@/components/workflow-strip";
import type { PdmMetadata, PdmMetadataDetection } from "@/lib/pdm-metadata";
import { formatStatusErrorForUser, formatStatusForUser } from "@/lib/status-display";
import { buildTransferPackageHref, type SubmissionMode } from "@/lib/submission-gate";

const emptyMetadata: PdmMetadata = {
  drawing_number: "",
  part_number: "",
  part_name: "",
  revision: "0.1",
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
  product_line: "產品系列",
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
  "surface_finish"
]);

const visibleMetadataFields: Array<keyof PdmMetadata> = [
  "drawing_number",
  "part_number",
  "part_name",
  "revision",
  "product_line",
  "process_name",
  "material",
  "surface_finish"
];

const solidWorksExtensionPriority = new Map([
  ["slddrw", 0],
  ["sldasm", 1],
  ["sldprt", 2]
]);

type Message = { type: "success" | "error"; text: string; submissionId?: string };
type CompanyOption = {
  companyCode: string;
  displayName: string;
  is_default?: boolean;
};
type AuthUserPayload = {
  id?: string;
  role?: string;
  default_company?: CompanyOption;
  companies?: CompanyOption[];
};
type UploadPrefillContext = {
  rootCode: string;
  metadata: Partial<PdmMetadata>;
};
type RevisionSuggestion = {
  suggestedRevisionCode: string;
  lifecycleStage: string;
};
type RouteState = {
  ready: boolean;
  source: string | null;
  drawingNumber: string;
};
type DrawingSubmissionBlockerGroup =
  | "master_data_missing"
  | "attachment_conflict"
  | "submission_conflict"
  | "state_or_permission_blocked"
  | "system_recoverable";
type ExistingDrawingSubmission = {
  submissionId: string;
  drawingNumber: string;
  revision: string;
  status: string;
  createdAt?: string;
  submittedById?: string;
  submittedByDisplayName?: string;
  releaseError?: string | null;
  resolvedBySubmissionId?: string | null;
  resolvedAt?: string | null;
  correctsSubmissionId?: string | null;
};
type SameRevisionSubmissionRecord = ExistingDrawingSubmission & {
  userLabel: string;
  blocking: boolean;
  resolved: boolean;
  historyMessage: string;
};
type DrawingSubmissionBlocker = {
  code: string;
  group?: DrawingSubmissionBlockerGroup;
  severity?: "blocker";
  message: string;
  recoveryHref: string;
  recoveryLabel?: string;
  existingSubmission?: ExistingDrawingSubmission;
};
type DrawingSubmissionContext = {
  pdmCompany: {
    companyId: string;
    companyCode: string;
    displayName: string;
  };
  drawing: {
    id: string;
    drawingNumber: string;
    purposeCode: string;
    purposeLabel: string;
    recordStatus: string;
    coreName: string;
  };
  primaryPart: null | {
    id: string;
    partNumber: string;
    partName: string;
    itemKind: string;
    material: string;
    surfaceFinish: string;
    processName: string;
    productSeries: string;
  };
  linkedParts: Array<{
    id: string;
    partNumber: string;
    partName: string;
    isPrimary: boolean;
  }>;
  attachments: Array<{
    id: string;
    displayName: string;
    fileName: string;
    fileExt: string;
    fileSize: number;
    documentCategory: string;
    revision: string | null;
    createdAt: string;
    eligibleForSubmission: boolean;
    ineligibleReason?: string;
    releaseConflict?: {
      submissionId: string;
      drawingNumber: string;
      revision: string;
      originalFilename: string;
    } | null;
  }>;
  suggestedRevision: {
    revision: string;
    source: "revision_policy" | "latest_attachment" | "manual_master";
    policySuggestedRevision?: string;
    workflowIntent?: string;
    policyVersion?: string;
    basisHash?: string;
    reasonCodes?: string[];
    generatedAt?: string;
  };
  revisionPolicySuggestion?: {
    suggestedRevision: string;
    workflowIntent: string;
    policyVersion: string;
    basisHash: string;
    reasonCodes: string[];
    generatedAt: string;
  };
  blockers: DrawingSubmissionBlocker[];
  sameRevisionRecords: SameRevisionSubmissionRecord[];
  nonBlockingHistory: Array<{ message: string; submissionId: string; href: string }>;
};
type DrawingSubmissionMessage = {
  type: "success" | "error";
  text: string;
  submissionId?: string;
};

export default function UploadPage() {
  const [routeState, setRouteState] = useState<RouteState>({ ready: false, source: null, drawingNumber: "" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRouteState({
      ready: true,
      source: params.get("source"),
      drawingNumber: params.get("drawingNumber") ?? params.get("drawing_number") ?? ""
    });
  }, []);

  if (!routeState.ready) {
    return (
      <section className="panel">
        <div className="empty">正在載入送審頁...</div>
      </section>
    );
  }

  if (routeState.source === "drawing") {
    return <DrawingSourceSubmissionWorkbench drawingNumber={routeState.drawingNumber} />;
  }

  return <RetiredGenericUploadPage />;
}

function RetiredGenericUploadPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <h1>上傳送審已退役</h1>
          <p>送審不再接受空白表單補主資料；請先在圖號／料號工作台完成圖號、料號、材質、表面處理與附件後再送審。</p>
        </div>
      </div>
      <section className="panel">
        <div className="empty">
          <AlertTriangle size={28} aria-hidden="true" />
          <h2>請從受控主資料送審</h2>
          <p>圖號或料號資料缺漏時，應回圖號工作台或料號工作台修正，送審頁只負責確認與建立審核中流程。</p>
          <div className="next-step-inline-actions">
            <Link className="primary-button" href="/numbering/search">
              前往編號搜尋
            </Link>
            <Link className="secondary-button" href="/numbering/drawings">
              前往圖號工作台
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function GenericUploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [metadata, setMetadata] = useState<PdmMetadata>(emptyMetadata);
  const [detection, setDetection] = useState<PdmMetadataDetection | null>(null);
  const [prefillContext, setPrefillContext] = useState<UploadPrefillContext | null>(null);
  const [revisionSuggestion, setRevisionSuggestion] = useState<RevisionSuggestion | null>(null);
  const [revisionTouched, setRevisionTouched] = useState(false);
  const [changeDescription, setChangeDescription] = useState("");
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [selectedCompanyCode, setSelectedCompanyCode] = useState("JENFU");
  const [detecting, setDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const lastSuggestedRevisionRef = useRef("");

  const submissionFiles = useMemo(() => files.filter((file) => !isMetadataSidecar(file.name)), [files]);
  const propertyFiles = useMemo(() => files.filter((file) => isMetadataSidecar(file.name)), [files]);
  const primaryMetadataFile = useMemo(() => selectPrimaryMetadataFile(submissionFiles), [submissionFiles]);
  const uploadWarnings = useMemo(() => buildUploadWarnings(detection), [detection]);
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
      metadata: nextMetadata
    };
    setPrefillContext(nextPrefill);
    setMetadata((current) => mergeMetadataWithPrefill(current, nextPrefill.metadata));
  }, []);

  useEffect(() => {
    const drawingNumber = metadata.drawing_number.trim();
    if (!drawingNumber) {
      setRevisionSuggestion(null);
      lastSuggestedRevisionRef.current = "";
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const params = new URLSearchParams({
        drawingNumber,
        pdm_company_code: selectedCompanyCode
      });

      try {
        const response = await fetch(`/api/submissions/revision-suggestion?${params.toString()}`, {
          signal: controller.signal
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || typeof body.suggestedRevisionCode !== "string") return;

        const suggestedRevisionCode = body.suggestedRevisionCode.trim();
        const previousSuggestedRevision = lastSuggestedRevisionRef.current;
        lastSuggestedRevisionRef.current = suggestedRevisionCode;
        setRevisionSuggestion({
          suggestedRevisionCode,
          lifecycleStage: String(body.lifecycleStage ?? "release_area")
        });
        setMetadata((current) => {
          const currentRevision = current.revision.trim();
          const canApplySuggestion =
            !currentRevision ||
            (Boolean(previousSuggestedRevision) && currentRevision === previousSuggestedRevision);
          return canApplySuggestion ? { ...current, revision: suggestedRevisionCode } : current;
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [metadata.drawing_number, selectedCompanyCode, revisionTouched]);

  async function handleFiles(nextFiles: FileList | File[]) {
    const selected = Array.from(nextFiles);
    setFiles(selected);
    setMessage(null);
    setDetection(null);
    setRevisionTouched(false);
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
    const submissionMetadata: PdmMetadata = {
      ...metadata,
      document_type: metadata.document_type.trim() || documentTypeFromFiles(submissionFiles)
    };
    for (const [key, value] of Object.entries(submissionMetadata)) form.append(key, value);
    form.append("pdm_company_code", selectedCompanyCode);
    form.append("change_description", changeDescription);
    form.append("approval_required", "1");
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

    setMessage({ type: "success", text: "送審已建立，狀態為審核中。", submissionId: body.submissionId });
    setFiles([]);
    setDetection(null);
    setMetadata(emptyMetadata);
    setRevisionSuggestion(null);
    setRevisionTouched(false);
    lastSuggestedRevisionRef.current = "";
    setChangeDescription("");
  }

  function updateField(field: keyof PdmMetadata, value: string) {
    if (field === "revision") setRevisionTouched(true);
    setMetadata((current) => ({ ...current, [field]: value }));
  }

  function applyCandidate(field: keyof PdmMetadata, value: string) {
    if (field === "revision") setRevisionTouched(true);
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
        description="先確認圖料號，再補檔案與 PDM 屬性，送出後進入審核流程。"
        steps={["編號申請", "上傳送審", "審核", "發布", "交接"]}
        currentStep="上傳送審"
        actions={[
          { href: "/numbering/search?tab=reserved", label: "先建立編號" }
        ]}
      />

      <LifecycleStageGuidance
        activeStage="submission"
        metrics={[
          { label: "送審檔案", value: submissionFiles.length, tone: submissionFiles.length > 0 ? "success" : "warning" },
          { label: "資料缺口", value: missingRequiredMetadata.length, tone: missingRequiredMetadata.length > 0 ? "warning" : "success" },
          { label: "審核者", value: 1 }
        ]}
      />

      {prefillContext ? (
        <ObjectLifecycleStatusPanel
          title="從領號草稿接續送審"
          objectName={`${prefillContext.rootCode || "未帶入圖料根號"} / ${metadata.part_number || "未帶入料號"} / ${metadata.drawing_number || "未帶入圖號"}`}
          status="Draft"
          owner="RD"
          identities={[
            { label: "圖料根號", value: prefillContext.rootCode || "-" },
            { label: "料號", value: metadata.part_number || "-" },
            { label: "圖號", value: metadata.drawing_number || "-" },
            { label: "品名", value: metadata.part_name || "-" }
          ]}
          blockers={missingRequiredMetadata.length > 0 ? missingRequiredMetadata.map((field) => `尚缺 ${fieldLabels[field]}`) : ["欄位已帶入，仍需確認檔案與變更原因"]}
          nextStep="補齊必要欄位與送審檔案後送出，送審單會進入審核中並交由審核者處理。"
          secondaryActions={[{ href: prefillContext.rootCode ? `/numbering/search?query=${encodeURIComponent(prefillContext.rootCode)}` : "/numbering/search", label: "回編號搜尋" }]}
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
                        {primaryMetadataFile === file ? (
                          <span className="metadata-pair primary">
                            <span className="metadata-label">主檔</span>
                            <span className="metadata-value">屬性優先</span>
                          </span>
                        ) : null}
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
            {uploadWarnings.length ? (
              <div className="upload-warning">
                <AlertTriangle size={16} aria-hidden="true" />
                <div>
                  {uploadWarnings.map((warning) => (
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
              {visibleMetadataFields.map((field) => (
                <label key={field}>
                  {fieldLabels[field]}
                  <input
                    value={metadata[field]}
                    onChange={(event) => updateField(field, event.target.value)}
                    required={requiredMetadataFields.has(field)}
                    placeholder={field === "revision" ? "1 / 0.1" : undefined}
                  />
                  <small>{field === "revision" ? revisionHelpText(revisionSuggestion, detection) : sourceText(detection, field)}</small>
                </label>
              ))}
            </div>

            {detection?.candidates?.length ? (
              <div className="ocr-candidate-list">
                <span className="section-label">AI/OCR 待確認欄位（送審前需人工確認）</span>
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
              備註
              <textarea
                value={changeDescription}
                onChange={(event) => setChangeDescription(event.target.value)}
                minLength={5}
                maxLength={100}
                required
                placeholder="例如：現場實機送審測試，確認 PDM 流程可追溯"
              />
              <small>{changeDescription.length} / 100；送出後預設 1 位審核者。</small>
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
                        <Link className="primary-button" href={`/submissions/${encodeURIComponent(message.submissionId)}`}>
                          查看送審
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
              {submitting ? "送審中..." : "建立審核中送審"}
            </button>
          </div>
        </section>
      </form>
    </>
  );
}

function revisionHelpText(revisionSuggestion: RevisionSuggestion | null, detection: PdmMetadataDetection | null) {
  if (revisionSuggestion) {
    return `系統預設版次 ${revisionSuggestion.suggestedRevisionCode}，可依圖紙修訂欄編輯；請填 1、2、0.1 或 1.1，不要加 V。`;
  }
  return `${sourceText(detection, "revision")}；版次請填 1、2、0.1 或 1.1，不要加 V。`;
}

function sourceText(detection: PdmMetadataDetection | null, field: keyof PdmMetadata) {
  const source = detection?.sources?.find((item) => item.field === field);
  if (!source) return "未偵測到時可手動填寫。";
  return `來源：${source.source}，信心度：${source.confidence}`;
}

function buildUploadWarnings(detection: PdmMetadataDetection | null) {
  if (!detection) return [];
  const warnings = new Set<string>();

  for (const warning of detection.warnings ?? []) {
    warnings.add(toUserFacingUploadWarning(warning));
  }

  for (const candidate of detection.candidates ?? []) {
    const currentValue = detection.metadata[candidate.field]?.trim();
    if (!currentValue || candidate.value.trim().toUpperCase() === currentValue.toUpperCase()) continue;
    warnings.add(`偵測到不同的${fieldLabels[candidate.field]}待確認值：目前使用「${currentValue}」，另有「${candidate.value}」。送出前請人工確認。`);
  }

  return Array.from(warnings);
}

function toUserFacingUploadWarning(warning: string) {
  if (warning.startsWith("conflicting_filename_hint:")) {
    const [, field] = warning.split(":");
    const label = fieldLabels[field as keyof PdmMetadata] ?? "欄位";
    return `多個檔案偵測到不同${label}，系統已先帶入主檔值；送出前請人工確認。`;
  }
  if (warning.includes("CAD file references") || warning.includes("native CAD references")) {
    return "尚未啟用 CAD 關聯讀取器，組立件/圖面引用關係不會自動帶入；必要時請於備註補充。";
  }
  if (warning.includes("SolidWorks Document Manager") || warning.includes("CAD metadata adapter") || warning.includes("custom-property extraction")) {
    return "尚未啟用公司 SolidWorks 屬性讀取器，系統先用檔名推測欄位；送出前請確認圖號、料號、品名與版次。";
  }
  if (warning.includes("larger than 1 MB") && warning.includes("metadata sidecar")) {
    return "屬性檔超過 1 MB，系統未讀取該屬性檔；請人工確認欄位。";
  }
  if (warning.includes("adapter failed")) {
    return "屬性讀取器執行失敗，系統改用可取得的檔名或屬性檔提示；請人工確認欄位。";
  }
  return warning;
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

function selectPrimaryMetadataFile(files: File[]) {
  return files
    .map((file, index) => ({
      file,
      index,
      priority: solidWorksExtensionPriority.get(getFileExtension(file.name)) ?? 99
    }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)[0]?.file ?? null;
}

function documentTypeFromFiles(files: File[]) {
  const primary = selectPrimaryMetadataFile(files);
  const extension = primary ? getFileExtension(primary.name) : "";
  if (extension === "sldprt") return "Part";
  if (extension === "sldasm") return "Assembly";
  if (extension === "slddrw") return "Drawing";
  if (extension === "pdf") return "PDF";
  if (extension === "dwg") return "DWG";
  return "Drawing";
}

function fileExtensionLabel(filename: string) {
  const extension = filename.split(".").pop()?.trim();
  return extension ? extension.toUpperCase() : "FILE";
}

function getFileExtension(filename: string) {
  const extension = filename.split(".").pop()?.trim().toLowerCase();
  return extension && extension !== filename.toLowerCase() ? extension : "";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function DrawingSourceSubmissionWorkbench({ drawingNumber }: { drawingNumber: string }) {
  const normalizedDrawingNumber = drawingNumber.trim();
  const [context, setContext] = useState<DrawingSubmissionContext | null>(null);
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode>("research");
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<DrawingSubmissionMessage | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUserPayload | null>(null);
  const [cancellingSubmissionId, setCancellingSubmissionId] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentCategory, setAttachmentCategory] = useState("drawing_2d");
  const [attachmentRevision, setAttachmentRevision] = useState("");
  const [attachmentDisplayName, setAttachmentDisplayName] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState<"upload" | `delete:${string}` | null>(null);

  const eligibleAttachments = useMemo(
    () => context?.attachments.filter((attachment) => attachment.eligibleForSubmission) ?? [],
    [context]
  );
  const selectedAttachments = useMemo(
    () => context?.attachments.filter((attachment) => selectedAttachmentIds.includes(attachment.id)) ?? [],
    [context, selectedAttachmentIds]
  );
  const selectedReleaseConflicts = selectedAttachments.filter((attachment) => attachment.releaseConflict);
  const isTechnicalTransferMode = submissionMode === "technical_transfer";
  const transferPackageHref = useMemo(
    () =>
      buildTransferPackageHref({
        sourceType: "drawing",
        sourceId: context?.drawing.drawingNumber ?? normalizedDrawingNumber,
        sourceLabel: context?.drawing.drawingNumber ?? normalizedDrawingNumber,
        caseType: "design_change_case"
      }),
    [context?.drawing.drawingNumber, normalizedDrawingNumber]
  );
  const releaseIncompleteBlocker = context?.blockers.find((blocker) => blocker.code === "release_incomplete_conflict") ?? null;
  const releaseIncompleteSubmissionId = releaseIncompleteBlocker?.existingSubmission?.submissionId ?? null;
  const hasFormalSameRevisionBlocker = context?.blockers.some(isFormalSameRevisionBlocker) ?? false;
  const hasSubmissionConflict = context?.blockers.some((blocker) => drawingSubmissionBlockerGroup(blocker) === "submission_conflict") ?? false;
  const hasStateOrPermissionBlocker = context?.blockers.some((blocker) => drawingSubmissionBlockerGroup(blocker) === "state_or_permission_blocked") ?? false;
  const visibleSameRevisionHistory = useMemo(() => context?.sameRevisionRecords.filter((record) => !record.blocking) ?? [], [context]);
  const canManageDrawingAttachments = Boolean(
    context &&
      !submitting &&
      !message?.submissionId &&
      !hasStateOrPermissionBlocker &&
      (!hasSubmissionConflict || releaseIncompleteBlocker)
  );
  const isSubmissionInputLocked = Boolean(message?.submissionId) || hasStateOrPermissionBlocker || (hasSubmissionConflict && !releaseIncompleteBlocker);
  const hasBlockers = Boolean(context?.blockers.length);
  const noteValidationMessage = drawingSubmissionNoteValidationMessage(note);
  const readyToSubmit = Boolean(context) && !hasBlockers && selectedAttachmentIds.length > 0 && selectedReleaseConflicts.length === 0 && !noteValidationMessage;
  const submitButtonLabel = hasSubmissionConflict && !releaseIncompleteBlocker ? "此版次不可送審" : "送出審核";
  const canSubmit =
    readyToSubmit &&
    !submitting &&
    !isTechnicalTransferMode;
  const canCreateCorrection = Boolean(
    context &&
      releaseIncompleteSubmissionId &&
      selectedAttachmentIds.length > 0 &&
      selectedReleaseConflicts.length === 0 &&
      !noteValidationMessage &&
      !submitting
  );

  const loadDrawingContext = useCallback(
    async (signal?: AbortSignal, options?: { preserveSelection?: boolean; clearMessage?: boolean }) => {
      if (!normalizedDrawingNumber) {
        setLoading(false);
        setMessage({ type: "error", text: "缺少來源圖號，請回圖號工作台重新開啟送審。" });
        return;
      }

      setLoading(true);
      if (options?.clearMessage !== false) setMessage(null);
      try {
        const response = await fetch(`/api/numbering/drawings/${encodeURIComponent(normalizedDrawingNumber)}/submission-workbench`, {
          signal
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(userFacingDrawingSubmissionError(body.message ?? body.error ?? "圖面送審資料讀取失敗。"));
        }
        const nextContext = body as DrawingSubmissionContext;
        setContext(nextContext);
        setAttachmentRevision((current) => current.trim() || nextContext.suggestedRevision.revision);
        setNote((current) => current || (nextContext.blockers.some((blocker) => blocker.code === "release_incomplete_conflict") ? "修正送審附件後重新送審。" : current));
        setSelectedAttachmentIds((current) => {
          const targetRevision = nextContext.suggestedRevision.revision.trim();
          const canSelectTargetRevision = (attachment: DrawingSubmissionContext["attachments"][number]) =>
            attachment.eligibleForSubmission && !attachment.releaseConflict && (!targetRevision || (attachment.revision ?? "").trim() === targetRevision);
          if (options?.preserveSelection) {
            const validCurrent = current.filter((id) => nextContext.attachments.some((attachment) => attachment.id === id && canSelectTargetRevision(attachment)));
            if (validCurrent.length > 0) return validCurrent;
          }
          const defaultAttachment =
            nextContext.attachments.find(canSelectTargetRevision) ??
            nextContext.attachments.find((attachment) => attachment.eligibleForSubmission && !attachment.releaseConflict) ??
            nextContext.attachments.find((attachment) => attachment.eligibleForSubmission);
          return defaultAttachment ? [defaultAttachment.id] : [];
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setContext(null);
        setSelectedAttachmentIds([]);
        setMessage({ type: "error", text: error instanceof Error ? error.message : "圖面送審資料讀取失敗。" });
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [normalizedDrawingNumber]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadDrawingContext(controller.signal);

    return () => controller.abort();
  }, [loadDrawingContext]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { user?: AuthUserPayload } | null) => {
        if (!cancelled) setCurrentUser(body?.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitDrawingSource() {
    if (!context) return;
    if (isTechnicalTransferMode) {
      setMessage({ type: "error", text: "技術移轉送審需先建立移轉包，不能從單一圖號直接建立正式送審。" });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const idempotencyKey =
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const response = await fetch(`/api/numbering/drawings/${encodeURIComponent(context.drawing.drawingNumber)}/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selectedAttachmentIds,
        submissionMode,
        expectedRevision: context.suggestedRevision.revision,
        workflowIntent: context.revisionPolicySuggestion?.workflowIntent ?? context.suggestedRevision.workflowIntent ?? "rd_workspace",
        revisionPolicySuggestion: context.revisionPolicySuggestion,
        revisionOverrideReason: note.trim() || null,
        note,
        idempotencyKey
      })
    });
    const body = await response.json().catch(() => ({}));
    setSubmitting(false);

    if (!response.ok) {
      const details = Array.isArray(body.details) && body.details.length ? `：${body.details.map(formatSubmissionErrorDetail).join("、")}` : "";
      setMessage({
        type: "error",
        text: `${userFacingDrawingSubmissionError(body.message ?? body.code ?? body.error ?? "送審建立失敗")}${details}`
      });
      return;
    }

    setMessage({
      type: "success",
      text: `圖面送審已建立，版次 ${body.revision ?? context.suggestedRevision.revision} 已進入審核中。`,
      submissionId: body.submissionId
    });
  }

  async function createCorrectionSubmission() {
    if (!context || !releaseIncompleteSubmissionId) return;
    setSubmitting(true);
    setMessage(null);
    const response = await fetch(`/api/submissions/${encodeURIComponent(releaseIncompleteSubmissionId)}/return-for-correction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selectedAttachmentIds,
        reason: note.trim() || "修正送審附件後重新送審。"
      })
    });
    const body = await response.json().catch(() => ({}));
    setSubmitting(false);

    if (!response.ok) {
      const details = Array.isArray(body.details) && body.details.length ? `：${body.details.map(formatSubmissionErrorDetail).join("、")}` : "";
      setMessage({
        type: "error",
        text: `${userFacingDrawingSubmissionError(body.message ?? body.code ?? body.error ?? "修正送審建立失敗")}${details}`
      });
      return;
    }

    setMessage({
      type: "success",
      text: `已建立修正送審，版次 ${body.revision ?? context.suggestedRevision.revision} 已進入審核中。`,
      submissionId: body.submissionId
    });
    await loadDrawingContext(undefined, { preserveSelection: true, clearMessage: false });
  }

  async function cancelExistingSubmission(submission: ExistingDrawingSubmission) {
    if (!context || !canCancelExistingDrawingSubmission(submission, currentUser)) return;
    if (!window.confirm(`取消送審 ${submission.submissionId}？取消後可重新建立同版次送審。`)) return;
    setCancellingSubmissionId(submission.submissionId);
    setMessage(null);
    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(submission.submissionId)}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "由圖面送審工作台取消審核中送審。"
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({
          type: "error",
          text: userFacingDrawingSubmissionCancelError(body.message ?? body.error ?? "取消送審失敗")
        });
        return;
      }
      setMessage({
        type: "success",
        text: body.message ?? "送審已取消，可重新建立同版次送審。"
      });
      await loadDrawingContext(undefined, { preserveSelection: true, clearMessage: false });
    } catch {
      setMessage({ type: "error", text: "取消送審失敗，請確認網路後再試。" });
    } finally {
      setCancellingSubmissionId(null);
    }
  }

  async function uploadDrawingAttachment() {
    if (!context) return;
    if (!attachmentFile) {
      setMessage({ type: "error", text: "請先選擇要上傳的附件。" });
      return;
    }
    setAttachmentBusy("upload");
    setMessage(null);
    const form = new FormData();
    form.append("file", attachmentFile);
    form.append("document_category", attachmentCategory);
    form.append("revision", (attachmentRevision || context.suggestedRevision.revision).trim());
    form.append("display_name", attachmentDisplayName.trim());
    form.append("description", "從圖面送審工作台補上修正附件。");
    const response = await fetch(`/api/numbering/drawings/${encodeURIComponent(context.drawing.drawingNumber)}/attachments`, {
      method: "POST",
      body: form
    });
    const body = await response.json().catch(() => ({}));
    setAttachmentBusy(null);
    if (!response.ok) {
      setMessage({ type: "error", text: userFacingMasterAttachmentError(body.message ?? body.error ?? "附件上傳失敗") });
      return;
    }
    setMessage({ type: "success", text: "附件已加入圖號附件庫，請確認是否要納入本次送審。" });
    setAttachmentFile(null);
    setAttachmentDisplayName("");
    await loadDrawingContext(undefined, { preserveSelection: true, clearMessage: false });
  }

  async function deleteDrawingAttachment(attachment: DrawingSubmissionContext["attachments"][number]) {
    if (!context) return;
    if (!window.confirm(`從圖號附件庫移除「${attachment.displayName || attachment.fileName}」？`)) return;
    setAttachmentBusy(`delete:${attachment.id}`);
    setMessage(null);
    const response = await fetch(
      `/api/numbering/drawings/${encodeURIComponent(context.drawing.drawingNumber)}/attachments/${encodeURIComponent(attachment.id)}`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "從圖面送審工作台移除錯誤或不適用附件。" })
      }
    );
    const body = await response.json().catch(() => ({}));
    setAttachmentBusy(null);
    if (!response.ok) {
      setMessage({ type: "error", text: userFacingMasterAttachmentError(body.message ?? body.error ?? "附件移除失敗") });
      return;
    }
    setMessage({ type: "success", text: "附件已從目前圖號附件庫移除。" });
    await loadDrawingContext(undefined, { preserveSelection: true, clearMessage: false });
  }

  function toggleAttachment(attachmentId: string, checked: boolean) {
    setSelectedAttachmentIds((current) => {
      if (checked) return Array.from(new Set([...current, attachmentId]));
      return current.filter((id) => id !== attachmentId);
    });
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖面送審 <StatusScopeHelp scope="uploadSubmission" /></h1>
          <p>從圖號工作台建立審核包；主資料只讀，缺漏請回圖號/料號工作台完成。</p>
        </div>
        <Link className="secondary-button" href="/numbering/drawings">
          回圖號工作台
        </Link>
      </div>

      <WorkflowStrip
        title="送審流程"
        description="確認來源圖號、選擇既有附件、填寫送審備註後建立審核中流程。"
        steps={["圖號主資料", "圖面送審", "審核", "發行", "交接"]}
        currentStep="圖面送審"
        actions={[
          { href: "/numbering/drawings", label: "回圖號工作台" }
        ]}
      />

      <section className="panel" data-submission-mode-selector="true" aria-label="送審模式">
        <div className="panel-header">
          <div>
            <h2>送審模式</h2>
            <p style={drawingSubmissionMutedStyle}>研發送審維持單一圖號審核；技術移轉送審需先進入移轉包。</p>
          </div>
          <span className="section-label">Phase 1</span>
        </div>
        <div className="next-step-inline-actions" style={drawingSubmissionModeSelectorStyle}>
          <button
            className={submissionMode === "research" ? "primary-button" : "secondary-button"}
            type="button"
            aria-pressed={submissionMode === "research"}
            onClick={() => setSubmissionMode("research")}
          >
            研發送審
          </button>
          <button
            className={submissionMode === "technical_transfer" ? "primary-button" : "secondary-button"}
            type="button"
            aria-pressed={submissionMode === "technical_transfer"}
            onClick={() => setSubmissionMode("technical_transfer")}
          >
            技術移轉送審
          </button>
        </div>
      </section>

      {loading ? (
        <section className="panel">
          <div className="empty">正在解析圖號主資料...</div>
        </section>
      ) : null}

      {!loading && context ? (
        <div className="drawing-submission-layout">
          <section className="panel" style={drawingSubmissionMainPanelStyle}>
            <div className="panel-header">
              <div>
                <h2>送審來源：{context.drawing.drawingNumber}</h2>
                <p style={drawingSubmissionMutedStyle}>
                  {context.drawing.purposeLabel} / {formatStatusForUser(context.drawing.recordStatus, "masterRecord")}
                </p>
              </div>
              <span className="section-label">{context.pdmCompany.displayName}</span>
            </div>

            <div style={drawingSubmissionSummaryGridStyle}>
              <ReadOnlyFact label="來源圖號" value={context.drawing.drawingNumber} />
              <ReadOnlyFact label="主料號" value={context.primaryPart?.partNumber ?? "未完成"} tone={context.primaryPart ? undefined : "danger"} />
              <ReadOnlyFact label="品名" value={context.primaryPart?.partName || context.drawing.coreName || "未完成"} />
              <ReadOnlyFact label="建議版次" value={context.suggestedRevision.revision} />
              <ReadOnlyFact label="材質" value={context.primaryPart?.material || "未完成"} tone={context.primaryPart?.material ? undefined : "danger"} />
              <ReadOnlyFact
                label="表面處理"
                value={context.primaryPart?.surfaceFinish || "未完成"}
                tone={context.primaryPart?.surfaceFinish ? undefined : "danger"}
              />
            </div>

            <section style={drawingSubmissionSubsectionStyle}>
              <div className="panel-header">
                <div>
                  <h2>送審附件整理</h2>
                  <p style={drawingSubmissionMutedStyle}>先把圖號附件庫整理正確，再選擇要納入本次送審的圖面/CAD/PDF/DWG。</p>
                </div>
                <span className="section-label">{eligibleAttachments.length} 個可送審</span>
              </div>
              {canManageDrawingAttachments ? (
                <div style={drawingSubmissionAttachmentToolsStyle}>
                  <label>
                    類別
                    <select className="dropdown-select" value={attachmentCategory} onChange={(event) => setAttachmentCategory(event.target.value)} disabled={attachmentBusy !== null}>
                      <option value="drawing_2d">2D 圖面</option>
                      <option value="cad_3d">3D CAD</option>
                      <option value="dwg">DWG/DXF</option>
                      <option value="pdf">PDF</option>
                      <option value="other">其他</option>
                    </select>
                  </label>
                  <label>
                    版次
                    <input
                      value={attachmentRevision}
                      onChange={(event) => setAttachmentRevision(event.target.value)}
                      placeholder={context.suggestedRevision.revision}
                      disabled={attachmentBusy !== null}
                    />
                  </label>
                  <label>
                    顯示名稱
                    <input
                      value={attachmentDisplayName}
                      onChange={(event) => setAttachmentDisplayName(event.target.value)}
                      placeholder="未填則使用檔名"
                      disabled={attachmentBusy !== null}
                    />
                  </label>
                  <div style={drawingSubmissionAttachmentDropzoneStyle}>
                    <FileDropzone
                      label="補上附件"
                      description="上傳後會進入目前圖號附件庫"
                      selectedFile={attachmentFile}
                      variant="compact"
                      onClearSelected={() => setAttachmentFile(null)}
                      onFilesSelected={(selected) => setAttachmentFile(selected[0] ?? null)}
                      onReject={(reason) => {
                        if (reason === "single_file_only") setMessage({ type: "error", text: "此區一次只能上傳一個附件。" });
                      }}
                    />
                  </div>
                  <button className="secondary-button" type="button" disabled={!attachmentFile || attachmentBusy !== null} onClick={uploadDrawingAttachment}>
                    {attachmentBusy === "upload" ? "上傳中..." : "加入附件庫"}
                  </button>
                </div>
              ) : (
                <p style={drawingSubmissionMutedStyle}>此圖號版次已有送審或正式紀錄，附件整理已鎖定；請依右側提示查看紀錄或改用新版次。</p>
              )}
              {context.attachments.length === 0 ? (
                <p style={drawingSubmissionMutedStyle}>此圖號目前沒有附件。</p>
              ) : (
                <div style={drawingSubmissionAttachmentListStyle}>
                  {context.attachments.map((attachment) => (
                    <label
                      key={attachment.id}
                      style={{
                        ...drawingSubmissionAttachmentRowStyle,
                        opacity: attachment.eligibleForSubmission ? 1 : 0.6
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAttachmentIds.includes(attachment.id)}
                        disabled={!attachment.eligibleForSubmission || Boolean(attachment.releaseConflict) || isSubmissionInputLocked}
                        onChange={(event) => toggleAttachment(attachment.id, event.target.checked)}
                      />
                      <span style={drawingSubmissionAttachmentInfoStyle}>
                        <strong>{attachment.displayName}</strong>
                        <span style={drawingSubmissionMutedStyle}>
                          {attachment.fileExt.toUpperCase()} / {attachment.revision ? `版次 ${attachment.revision}` : "未標版次"} / {formatBytes(attachment.fileSize)}
                        </span>
                        {attachment.displayName !== attachment.fileName ? <span style={drawingSubmissionMutedStyle}>檔名 {attachment.fileName}</span> : null}
                        {!attachment.eligibleForSubmission ? <span style={drawingSubmissionDangerTextStyle}>{attachment.ineligibleReason}</span> : null}
                        {attachment.releaseConflict ? (
                          <span style={drawingSubmissionDangerTextStyle}>
                            此檔名已被正式紀錄 {attachment.releaseConflict.drawingNumber} 版次 {attachment.releaseConflict.revision} 使用，不能納入送審。
                          </span>
                        ) : null}
                      </span>
                      {canManageDrawingAttachments ? (
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={attachmentBusy !== null}
                          onClick={(event) => {
                            event.preventDefault();
                            void deleteDrawingAttachment(attachment);
                          }}
                        >
                          {attachmentBusy === `delete:${attachment.id}` ? "移除中..." : "移除"}
                        </button>
                      ) : null}
                    </label>
                  ))}
                </div>
              )}
            </section>

            <label className="upload-textarea-label" style={{ marginTop: "1rem" }}>
              送審備註
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                minLength={5}
                maxLength={100}
                disabled={isSubmissionInputLocked || (hasBlockers && !releaseIncompleteBlocker)}
                placeholder="例如：圖面主資料已確認，提交審核。"
              />
              <small>{note.length} / 100；此欄位只描述送審原因，不修改圖號或料號主資料。</small>
            </label>
          </section>

          <aside className="panel" style={drawingSubmissionSidePanelStyle}>
            <div className="panel-header">
              <h2>送審確認</h2>
            </div>
            {isTechnicalTransferMode ? (
              <div className="upload-message error" style={{ alignItems: "flex-start" }} data-technical-transfer-package-required="true">
                <AlertTriangle size={16} aria-hidden="true" />
                <div>
                  <p>技術移轉送審需先建立移轉包。</p>
                  <p style={drawingSubmissionMutedStyle}>目前圖號已帶入移轉包 context；正式移轉送審不可從單一圖號直接建立。</p>
                  <div className="next-step-inline-actions" style={drawingSubmissionInlineActionsStyle}>
                    <Link className="primary-button" href={transferPackageHref}>
                      建立 / 開啟移轉包
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
            {!isTechnicalTransferMode && releaseIncompleteBlocker ? (
              <div className="upload-message error" style={{ alignItems: "flex-start" }}>
                <AlertTriangle size={16} aria-hidden="true" />
                <div>
                  <p>發行未完成，需要先修正附件再重新送審。</p>
                  <p style={drawingSubmissionMutedStyle}>{releaseIncompleteSummary(releaseIncompleteBlocker.existingSubmission?.releaseError)}</p>
                  {releaseIncompleteSubmissionId ? <Link href={`/submissions/${encodeURIComponent(releaseIncompleteSubmissionId)}`}>查看發行未完成紀錄</Link> : null}
                </div>
              </div>
            ) : null}
            {isTechnicalTransferMode ? null : context.blockers.length ? (
              <>
                {groupDrawingSubmissionBlockers(context.blockers).map((blockerGroup) => {
                  const meta = drawingSubmissionBlockerGroupMeta(blockerGroup.group, blockerGroup.blockers);
                  return (
                    <div key={blockerGroup.group} className="upload-message error" style={{ alignItems: "flex-start" }}>
                      <AlertTriangle size={16} aria-hidden="true" />
                      <div>
                        <p>{meta.headline}</p>
                        <p style={drawingSubmissionMutedStyle}>{meta.description}</p>
                        <div style={drawingSubmissionBlockerListStyle}>
                          {blockerGroup.blockers.map((blocker) => {
                            const blockerText = drawingSubmissionBlockerPrimaryText(blocker);
                            const actionHint = drawingSubmissionBlockerActionHint(blocker, currentUser);
                            return (
                              <div key={`${blocker.code}-${blocker.message}`} style={drawingSubmissionBlockerItemStyle}>
                                {blockerText ? <span>{blockerText}</span> : null}
                                {blocker.existingSubmission ? (
                                  <small style={drawingSubmissionMutedStyle}>
                                    既有送審 {blocker.existingSubmission.submissionId} / {drawingSubmissionStatusLabel(blocker.existingSubmission)}
                                  </small>
                                ) : null}
                                {actionHint ? <small style={drawingSubmissionMutedStyle}>{actionHint}</small> : null}
                                <div className="next-step-inline-actions" style={drawingSubmissionInlineActionsStyle}>
                                  {isFormalSameRevisionBlocker(blocker) ? (
                                    <>
                                      <Link
                                        className="primary-button"
                                        href={`/numbering/drawings?query=${encodeURIComponent(context.drawing.drawingNumber)}`}
                                      >
                                        回圖號工作台建立新版次
                                      </Link>
                                    </>
                                  ) : null}
                                  <Link href={blocker.recoveryHref}>{blocker.recoveryLabel ?? meta.recoveryLabel}</Link>
                                  {canCancelExistingDrawingSubmission(blocker.existingSubmission, currentUser) ? (
                                    <button
                                      className="secondary-button"
                                      type="button"
                                      disabled={cancellingSubmissionId !== null || submitting}
                                      onClick={() => void cancelExistingSubmission(blocker.existingSubmission as ExistingDrawingSubmission)}
                                    >
                                      {cancellingSubmissionId === blocker.existingSubmission?.submissionId ? "取消中..." : "取消送審"}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : selectedAttachmentIds.length === 0 ? (
              <div className="upload-message error" style={{ alignItems: "flex-start" }}>
                <AlertTriangle size={16} aria-hidden="true" />
                <div>
                  <p>尚未選擇來源附件，不能送出審核。</p>
                  <p style={drawingSubmissionMutedStyle}>請至少選擇一個圖號附件庫內的可送審檔案。</p>
                </div>
              </div>
            ) : noteValidationMessage ? (
              <div className="upload-message error" style={{ alignItems: "flex-start" }}>
                <AlertTriangle size={16} aria-hidden="true" />
                <div>
                  <p>送審備註尚未完成，不能送出審核。</p>
                  <p style={drawingSubmissionMutedStyle}>{noteValidationMessage}</p>
                </div>
              </div>
            ) : (
              <div className="upload-message success">
                <CheckCircle2 size={16} aria-hidden="true" />
                <p>主資料、附件與送審備註已通過，可以建立審核中流程。</p>
              </div>
            )}

            {visibleSameRevisionHistory.length > 0 ? (
              <section style={drawingSubmissionHistorySectionStyle}>
                <strong>歷史紀錄</strong>
                <div style={drawingSubmissionBlockerListStyle}>
                  {visibleSameRevisionHistory.map((record) => (
                    <div
                      key={record.submissionId}
                      style={{
                        ...drawingSubmissionHistoryItemStyle,
                        opacity: record.blocking ? 1 : 0.72
                      }}
                    >
                      <span>{record.userLabel}</span>
                      <small style={drawingSubmissionMutedStyle}>
                        {record.historyMessage}
                        {record.submittedByDisplayName ? ` / ${record.submittedByDisplayName}` : ""}
                      </small>
                      <Link href={`/submissions/${encodeURIComponent(record.submissionId)}`}>查看紀錄</Link>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="detail-row">
              <span>選取附件</span>
              <strong>{selectedAttachmentIds.length} 個</strong>
            </div>
            <div className="detail-row">
              <span>送審版次</span>
              <strong>{context.suggestedRevision.revision}</strong>
            </div>
            {selectedReleaseConflicts.length > 0 ? (
              <small style={drawingSubmissionDangerTextStyle}>選取附件含有正式檔名衝突，請移除或更換附件。</small>
            ) : null}

            {message ? (
              <div className={message.type === "success" ? "upload-message success" : "upload-message error"}>
                {message.type === "success" ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
                <div>
                  <p>{message.text}</p>
                  {message.submissionId ? (
                    <div className="next-step-inline-actions">
                      <Link className="primary-button" href={`/submissions/${encodeURIComponent(message.submissionId)}`}>
                        查看送審
                      </Link>
                      <Link className="secondary-button" href="/numbering/drawings">
                        回圖號工作台
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {isTechnicalTransferMode ? (
              <Link className="primary-button" href={transferPackageHref}>
                建立 / 開啟移轉包
              </Link>
            ) : releaseIncompleteBlocker ? (
              <button className="primary-button" type="button" disabled={!canCreateCorrection || Boolean(message?.submissionId)} onClick={createCorrectionSubmission}>
                {submitting ? "建立中..." : "建立修正送審"}
              </button>
            ) : hasFormalSameRevisionBlocker ? null : (
              <button className="primary-button" type="button" disabled={!canSubmit || Boolean(message?.submissionId)} onClick={submitDrawingSource}>
                {submitting ? "送審中..." : submitButtonLabel}
              </button>
            )}
            {!isTechnicalTransferMode && releaseIncompleteBlocker && !canCreateCorrection && !message?.submissionId ? (
              <small style={drawingSubmissionMutedStyle}>{drawingSubmissionDisabledReason(context, selectedAttachmentIds, note, selectedReleaseConflicts.length, true)}</small>
            ) : null}
            {!isTechnicalTransferMode && !releaseIncompleteBlocker && !hasFormalSameRevisionBlocker && !canSubmit && !message?.submissionId ? (
              <small style={drawingSubmissionMutedStyle}>{drawingSubmissionDisabledReason(context, selectedAttachmentIds, note, selectedReleaseConflicts.length, false)}</small>
            ) : null}
          </aside>
        </div>
      ) : null}

      {!loading && !context && message ? (
        <section className="panel">
          <div className="empty">
            <AlertTriangle size={28} aria-hidden="true" />
            <h2>圖面送審無法開啟</h2>
            <p>{message.text}</p>
            <Link className="secondary-button" href="/numbering/drawings">
              回圖號工作台
            </Link>
          </div>
        </section>
      ) : null}
    </>
  );
}

function ReadOnlyFact({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="info-block" style={tone === "danger" ? drawingSubmissionDangerFactStyle : undefined}>
      <strong>{label}</strong>
      <p>{value}</p>
    </div>
  );
}

function drawingSubmissionDisabledReason(
  context: DrawingSubmissionContext,
  selectedAttachmentIds: string[],
  note: string,
  selectedReleaseConflictCount: number,
  correctionMode: boolean
) {
  if (selectedReleaseConflictCount > 0) return "選取附件已撞到其他正式紀錄，請先移除或更換附件。";
  if (correctionMode && selectedAttachmentIds.length === 0) return "請先選擇修正後要送審的附件。";
  if (correctionMode) {
    const noteError = drawingSubmissionNoteValidationMessage(note);
    if (noteError) return noteError;
    return "請先整理附件，確認沒有正式檔名衝突後再建立修正送審。";
  }
  if (context.blockers.some((blocker) => drawingSubmissionBlockerGroup(blocker) === "submission_conflict")) {
    if (context.blockers.some(isFormalSameRevisionBlocker)) {
      return "此版次已是正式紀錄，請建立新版次後再送審。";
    }
    return context.blockers.find((blocker) => drawingSubmissionBlockerGroup(blocker) === "submission_conflict")?.message ?? "此圖號版次已有需處理的送審紀錄。";
  }
  if (context.blockers.some((blocker) => drawingSubmissionBlockerGroup(blocker) === "attachment_conflict")) {
    return "請先修正附件選取或回圖號附件庫處理。";
  }
  if (context.blockers.some((blocker) => drawingSubmissionBlockerGroup(blocker) === "state_or_permission_blocked")) {
    return "目前狀態或權限不可送審，請依提示處理。";
  }
  if (context.blockers.length > 0) return "請先回圖號/料號主資料區處理阻擋原因。";
  if (selectedAttachmentIds.length === 0) return "請選擇至少一個來源附件。";
  const noteError = drawingSubmissionNoteValidationMessage(note);
  if (noteError) return noteError;
  return "送審條件尚未完成。";
}

function drawingSubmissionBlockerGroup(blocker: DrawingSubmissionBlocker): DrawingSubmissionBlockerGroup {
  if (blocker.group) return blocker.group;
  if (
    blocker.code === "duplicate_active_submission" ||
    blocker.code === "same_revision_in_progress" ||
    blocker.code === "release_incomplete_conflict" ||
    blocker.code === "released_revision_exists" ||
    blocker.code === "obsolete_revision_locked" ||
    blocker.code === "DRAWING_SUBMISSION_DUPLICATE_REVISION"
  ) {
    return "submission_conflict";
  }
  if (blocker.code === "duplicate_attachment_filename" || blocker.code === "release_filename_conflict" || blocker.code === "missing_attachment") return "attachment_conflict";
  if (blocker.code === "drawing_not_submittable") return "state_or_permission_blocked";
  if (blocker.code === "drawing_number_not_found") return "system_recoverable";
  return "master_data_missing";
}

function groupDrawingSubmissionBlockers(blockers: DrawingSubmissionBlocker[]) {
  const order: DrawingSubmissionBlockerGroup[] = [
    "submission_conflict",
    "master_data_missing",
    "attachment_conflict",
    "state_or_permission_blocked",
    "system_recoverable"
  ];
  return order
    .map((group) => ({
      group,
      blockers: blockers.filter((blocker) => drawingSubmissionBlockerGroup(blocker) === group)
    }))
    .filter((item) => item.blockers.length > 0);
}

function drawingSubmissionBlockerGroupMeta(group: DrawingSubmissionBlockerGroup, blockers: DrawingSubmissionBlocker[] = []) {
  switch (group) {
    case "submission_conflict":
      if (blockers.length > 0 && blockers.every(isFormalSameRevisionBlocker)) {
        return {
          headline: "這版已完成，不用再送審",
          description: "不改內容：回圖號工作台即可。要改內容：建立新版次。",
          recoveryLabel: "查看正式紀錄"
        };
      }
      if (blockers.length > 0 && blockers.every(isActiveSameRevisionBlocker)) {
        return {
          headline: "同版次送審進行中",
          description: "此圖號版次已有審核中或發行中的送審。審核中送審可由建立者、主管或 Admin 取消。",
          recoveryLabel: "查看既有送審"
        };
      }
      return {
        headline: "同版次送審需處理",
        description: "此圖號版次已有相關送審紀錄，請依提示查看既有送審、處理發行未完成或改用新版次。",
        recoveryLabel: "查看既有送審"
      };
    case "attachment_conflict":
      return {
        headline: "附件選取需修正",
        description: "來源附件不符合送審條件，請回圖號附件庫或調整選取後再送審。",
        recoveryLabel: "處理附件"
      };
    case "state_or_permission_blocked":
      return {
        headline: "目前狀態不可送審",
        description: "此資料的狀態或權限不允許建立送審，請依提示處理。",
        recoveryLabel: "查看狀態"
      };
    case "system_recoverable":
      return {
        headline: "送審資料無法解析",
        description: "系統找不到或無法解析來源資料，請回來源工作台重新開啟。",
        recoveryLabel: "回來源工作台"
      };
    default:
      return {
        headline: "主資料尚未完成",
        description: "主資料缺漏需要回圖號/料號資料區補齊，送審頁不補填主資料。",
        recoveryLabel: "回主資料處理"
      };
  }
}

function isFormalSameRevisionBlocker(blocker: DrawingSubmissionBlocker) {
  return blocker.code === "released_revision_exists" || blocker.code === "obsolete_revision_locked";
}

function isActiveSameRevisionBlocker(blocker: DrawingSubmissionBlocker) {
  return blocker.code === "same_revision_in_progress" || blocker.code === "duplicate_active_submission";
}

function drawingSubmissionBlockerPrimaryText(blocker: DrawingSubmissionBlocker) {
  if (isFormalSameRevisionBlocker(blocker)) return "";
  return blocker.message;
}

function drawingSubmissionBlockerActionHint(blocker: DrawingSubmissionBlocker, currentUser: AuthUserPayload | null) {
  const submission = blocker.existingSubmission;
  if (!submission) return "";
  if (submission.status === "Released" || submission.status === "Obsolete") {
    return "";
  }
  if (submission.status === "Releasing") {
    return "此送審正在發行中，不能從工作台取消；請查看紀錄由主管或 Admin 處理。";
  }
  if (submission.status === "Pending" && !canCancelExistingDrawingSubmission(submission, currentUser)) {
    return "取消送審只開放送審建立者、主管或 Admin。";
  }
  return "";
}

function formatSubmissionErrorDetail(value: unknown) {
  if (typeof value === "object" && value !== null && "message" in value) return String((value as { message?: unknown }).message ?? "");
  return String(value);
}

const weakDrawingSubmissionNotes = new Set(["change", "update", "modify", "fix"]);

function drawingSubmissionNoteValidationMessage(note: string) {
  const text = note.trim();
  if (text.length < 5) return "請填寫 5 到 100 字的送審備註。";
  if (text.length > 100) return "送審備註最多 100 字。";
  if (/^\d+$/.test(text)) return "送審備註不可只有數字。";
  if (weakDrawingSubmissionNotes.has(text.toLowerCase())) return "送審備註過於籠統，請描述送審原因。";
  if (!/[A-Za-z\u4e00-\u9fff]/.test(text)) return "送審備註需包含文字。";
  return "";
}

function userFacingDrawingSubmissionError(value: string) {
  if (value.includes("UNIQUE constraint failed")) return "此圖號版次已有送審紀錄，不能重複建立。";
  if (value.includes("Internal Server Error")) return "圖面送審處理失敗，請重新整理後再試或通知管理員。";
  if (value === "DRAWING_NUMBER_NOT_FOUND") return "找不到此公司範圍內的圖號，請回圖號工作台重新開啟。";
  if (value === "DRAWING_SUBMISSION_DUPLICATE_REVISION") return "此圖號與版次已有送審紀錄，不能重複建立。";
  if (value === "duplicate_active_submission" || value === "same_revision_in_progress") {
    return "此圖號版次正在送審或發行中，請先查看既有送審或聯絡負責人。";
  }
  if (value === "release_incomplete_conflict") return "發行未完成：此圖號版次已通過審核，但尚未完成發行，需要主管或 Admin 處理。";
  if (value === "released_revision_exists" || value === "obsolete_revision_locked") return "此圖號版次已進入正式紀錄，不能重複送審同一版次。";
  if (value === "release_filename_conflict") return "附件檔名已被其他正式紀錄使用，請移除或更換附件後再送審。";
  if (value === "technical_transfer_requires_package") return "技術移轉送審需先建立移轉包，不能從單一圖號或料號直接送審。";
  if (value === "DRAWING_SUBMISSION_BLOCKED") return "主資料尚未完成，不能送審。";
  return formatStatusErrorForUser(value, "submission") || "圖面送審失敗。";
}

function userFacingMasterAttachmentError(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "附件處理失敗，請重新整理後再試。";
  if (text.includes("DUPLICATE")) return "圖號附件庫已有相同檔名、類別與版次的附件，請先移除舊附件或調整檔名。";
  if (text.includes("FILE_REQUIRED")) return "請先選擇要上傳的附件。";
  if (text.includes("ENTITY_NOT_FOUND") || text.includes("NOT_FOUND")) return "找不到目前圖號，請回圖號工作台重新開啟。";
  if (text.includes("PERMISSION") || text.includes("FORBIDDEN")) return "你目前沒有權限管理此圖號附件，請由負責人、主管或 Admin 處理。";
  if (text.includes("TOO_LARGE")) return "附件太大，請改用較小檔案或請 Admin 調整上傳限制。";
  if (text.includes("EXTENSION")) return "此檔案格式目前不能上傳到圖號附件庫。";
  if (text.includes("REVISION")) return "附件版次格式不正確，請使用 0.1、0.2、1、2 這類版次。";
  if (text.includes("Internal Server Error")) return "附件處理失敗，請重新整理後再試或通知管理員。";
  return formatStatusErrorForUser(text, "fileSync");
}

function releaseIncompleteSummary(releaseError: string | null | undefined) {
  const text = String(releaseError ?? "").trim();
  if (!text) return "此送審已通過審核，但發布包尚未完成。請確認附件後建立修正送審。";
  const duplicatePrefix = "DUPLICATE_RELEASE_FILENAME:";
  if (text.startsWith(duplicatePrefix)) {
    const detail = text.slice(duplicatePrefix.length).replace(/\brev\b/gi, "版次").trim();
    return detail ? `附件檔名已被其他正式紀錄使用：${detail}。請移除錯附件或上傳正確檔名後建立修正送審。` : "附件檔名已被其他正式紀錄使用，請修正附件後重新送審。";
  }
  return "此送審已通過審核，但發布包尚未完成。請確認附件後建立修正送審。";
}

function drawingSubmissionStatusLabel(summary: ExistingDrawingSubmission) {
  if (summary.status === "Pending") return "正在送審中";
  if (summary.status === "Releasing") return "正在發行中";
  if (summary.status === "ReleaseFailed" && summary.resolvedBySubmissionId) return "發行未完成，已處理";
  if (summary.status === "ReleaseFailed") return "發行未完成";
  if (summary.status === "Rejected") return "已駁回";
  if (summary.status === "Cancelled") return "已取消";
  if (summary.status === "Released") return "已發布";
  if (summary.status === "Obsolete") return "已作廢";
  return "送審紀錄";
}

function canCancelExistingDrawingSubmission(submission: ExistingDrawingSubmission | undefined, currentUser: AuthUserPayload | null) {
  if (!submission || submission.status !== "Pending" || !currentUser?.id) return false;
  return submission.submittedById === currentUser.id || currentUser.role === "R&D Manager" || currentUser.role === "Admin";
}

function userFacingDrawingSubmissionCancelError(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "取消送審失敗，請重新整理後再試。";
  if (text === "submission_not_pending" || text.includes("只有審核中的送審可以取消")) return "只有審核中的送審可以取消，請重新整理確認目前狀態。";
  if (text === "cancel_not_allowed" || text.includes("不能取消")) return "你目前不能取消這筆送審，請由送審建立者、主管或 Admin 處理。";
  if (text === "submission_not_found" || text.includes("找不到送審")) return "找不到這筆送審，請重新整理後再試。";
  if (text.includes("Internal Server Error")) return "取消送審處理失敗，請重新整理後再試或通知管理員。";
  return formatStatusErrorForUser(text, "submission") || "取消送審失敗，請重新整理後再試。";
}

const drawingSubmissionMainPanelStyle: CSSProperties = {
  minWidth: 0
};

const drawingSubmissionSidePanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.85rem",
  minWidth: 0
};

const drawingSubmissionSummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "0.75rem"
};

const drawingSubmissionSubsectionStyle: CSSProperties = {
  marginTop: "1rem",
  borderTop: "1px solid var(--border)",
  paddingTop: "1rem"
};

const drawingSubmissionModeSelectorStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.65rem"
};

const drawingSubmissionAttachmentListStyle: CSSProperties = {
  display: "grid",
  gap: "0.6rem"
};

const drawingSubmissionAttachmentToolsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "0.65rem",
  alignItems: "end",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.75rem",
  marginBottom: "0.75rem",
  background: "var(--surface)"
};

const drawingSubmissionAttachmentDropzoneStyle: CSSProperties = {
  minWidth: 0
};

const drawingSubmissionAttachmentRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  gap: "0.65rem",
  alignItems: "start",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.75rem",
  background: "var(--surface)"
};

const drawingSubmissionAttachmentInfoStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
  minWidth: 0
};

const drawingSubmissionMutedStyle: CSSProperties = {
  color: "var(--muted)"
};

const drawingSubmissionDangerTextStyle: CSSProperties = {
  color: "var(--danger)",
  fontSize: "0.85rem"
};

const drawingSubmissionDangerFactStyle: CSSProperties = {
  borderColor: "rgba(220, 38, 38, 0.35)",
  color: "var(--danger)"
};

const drawingSubmissionBlockerListStyle: CSSProperties = {
  display: "grid",
  gap: "0.5rem",
  marginTop: "0.5rem"
};

const drawingSubmissionBlockerItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.25rem"
};

const drawingSubmissionInlineActionsStyle: CSSProperties = {
  marginTop: "0.1rem"
};

const drawingSubmissionHistorySectionStyle: CSSProperties = {
  borderTop: "1px solid var(--border)",
  paddingTop: "0.75rem",
  display: "grid",
  gap: "0.5rem"
};

const drawingSubmissionHistoryItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.65rem",
  background: "var(--surface)"
};
