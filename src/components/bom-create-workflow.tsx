"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  FileClock,
  FileSpreadsheet,
  GitBranch,
  ListPlus,
  Search,
  UploadCloud
} from "lucide-react";
import { SearchHighlight } from "@/components/search-highlight";
import { StatusScopeHelp } from "@/components/status-help-popover";
import { getStatusDisplay } from "@/lib/status-display";

type PartOption = {
  id: string;
  partNumber: string;
  partName: string;
  itemKind: string;
  recordStatus: string;
  bomUsagePolicy: string;
  suggestedBomRevision: string;
};

type CadSource = {
  id: string;
  sourceKind: "submission" | "revision_package";
  drawingNumber: string;
  drawingRevision: string;
  status: string;
  updatedAt: string;
};

type CreateContext = {
  parts: PartOption[];
  assemblyParts: PartOption[];
  drafts: DraftOption[];
  cadSources: CadSource[];
};

type DraftOption = {
  id: string;
  ownerPartNumberId: string | null;
  partNumber: string;
  partName: string;
  bomRevision: string;
  status: "Draft" | "PendingReview" | "Rejected";
  source: BomSource;
  lineCount: number;
  updatedAt: string;
};

type BomSource = "cad_reference" | "solidworks_xls" | "manual";

const sourceOptions: Array<{
  value: BomSource;
  title: string;
  description: string;
  icon: typeof GitBranch;
}> = [
  { value: "cad_reference", title: "從 CAD 結構帶入", description: "讀取受控圖面中的組合件參考。", icon: GitBranch },
  { value: "solidworks_xls", title: "匯入 SolidWorks XLS", description: "先預覽檔案，再建立可編輯草稿。", icon: FileSpreadsheet },
  { value: "manual", title: "建立空白 BOM", description: "從空白草稿開始，之後逐筆加入子件。", icon: ListPlus }
];

export function BomCreateWorkflow() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [parts, setParts] = useState<PartOption[]>([]);
  const [assemblyParts, setAssemblyParts] = useState<PartOption[]>([]);
  const [drafts, setDrafts] = useState<DraftOption[]>([]);
  const [cadSources, setCadSources] = useState<CadSource[]>([]);
  const [query, setQuery] = useState("");
  const [ownerPartNumberId, setOwnerPartNumberId] = useState("");
  const [manualOwnerPartNumberId, setManualOwnerPartNumberId] = useState("");
  const [manualBomRevision, setManualBomRevision] = useState("");
  const [bomRevision, setBomRevision] = useState("");
  const [source, setSource] = useState<BomSource>("cad_reference");
  const [sourceCadId, setSourceCadId] = useState("");
  const [xlsFile, setXlsFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKeyRef = useRef("");

  const selectedPart = useMemo(
    () => [...assemblyParts, ...parts].find((part) => part.id === ownerPartNumberId) ?? null,
    [assemblyParts, ownerPartNumberId, parts]
  );
  const selectedManualPart = useMemo(
    () => parts.find((part) => part.id === manualOwnerPartNumberId) ?? null,
    [manualOwnerPartNumberId, parts]
  );
  const selectedCadSource = cadSources.find((item) => item.id === sourceCadId) ?? null;

  const loadContext = useCallback(async (search = "", ownerId = "") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("query", search.trim());
      if (ownerId) params.set("ownerPartNumberId", ownerId);
      const response = await fetch(`/api/bom/create-context?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as CreateContext & { error?: string };
      if (!response.ok) throw new Error(humanizeError(body.error));
      setParts(body.parts ?? []);
      setAssemblyParts(body.assemblyParts ?? []);
      setDrafts(body.drafts ?? []);
      setCadSources(body.cadSources ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "目前無法載入可建立 BOM 的料號，請稍後重試。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialOwner = params.get("ownerPartNumberId") ?? "";
    const initialRevision = params.get("bomRevision") ?? "";
    const initialSource = params.get("source") as BomSource | null;
    const initialStep = params.get("step") === "2" ? 2 : 1;
    setOwnerPartNumberId(initialOwner);
    setManualOwnerPartNumberId(initialOwner);
    setBomRevision(initialRevision);
    setManualBomRevision(initialRevision);
    if (initialSource && sourceOptions.some((option) => option.value === initialSource)) setSource(initialSource);
    setStep(initialStep);
    void loadContext("", initialOwner);
  }, [loadContext]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (ownerPartNumberId) params.set("ownerPartNumberId", ownerPartNumberId);
    if (bomRevision) params.set("bomRevision", bomRevision);
    params.set("source", source);
    params.set("step", String(step));
    window.history.replaceState(null, "", `/bom/new?${params.toString()}`);
  }, [bomRevision, ownerPartNumberId, source, step]);

  function selectPart(part: PartOption) {
    setOwnerPartNumberId(part.id);
    setBomRevision(part.suggestedBomRevision);
    setSourceCadId("");
    idempotencyKeyRef.current = "";
  }

  function selectManualPart(part: PartOption) {
    setManualOwnerPartNumberId(part.id);
    setManualBomRevision(part.suggestedBomRevision);
    idempotencyKeyRef.current = "";
  }

  async function goToSourceStep() {
    if (!selectedPart || !bomRevision.trim()) {
      setError("請先選擇料號並確認 BOM Rev。");
      return;
    }
    setStep(2);
    await loadContext(query, selectedPart.id);
  }

  async function goToXlsStep() {
    if (!selectedManualPart || !manualBomRevision.trim()) {
      setError("請先選擇料號並確認 BOM Rev。");
      return;
    }
    setOwnerPartNumberId(selectedManualPart.id);
    setBomRevision(manualBomRevision);
    setSource("solidworks_xls");
    setSourceCadId("");
    setStep(2);
    await loadContext(query, selectedManualPart.id);
  }

  async function createDraft(input?: {
    selectedPart?: PartOption | null;
    bomRevision?: string;
    source?: BomSource;
    sourceSubmissionId?: string;
  }) {
    const part = input?.selectedPart ?? selectedPart;
    const revision = input?.bomRevision ?? bomRevision;
    const sourceValue = input?.source ?? source;
    const sourceId = input?.sourceSubmissionId ?? sourceCadId;
    const cadSource = cadSources.find((item) => item.id === sourceId) ?? null;
    if (!part) return;
    if (sourceValue === "cad_reference" && !sourceId) {
      setError("請選擇一份 CAD 圖面來源。");
      return;
    }
    if (sourceValue === "solidworks_xls" && !xlsFile) {
      setError("請先選擇一個 SolidWorks BOM 檔案。");
      return;
    }
    const idempotencyKey = idempotencyKeyRef.current || crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;
    setSubmitting(true);
    setError("");
    try {
      const response =
        sourceValue === "solidworks_xls"
          ? await submitXls({ selectedPart: part, bomRevision: revision, xlsFile: xlsFile!, idempotencyKey })
          : await fetch("/api/bom/drafts", {
              method: "POST",
              headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
              body: JSON.stringify({
                ownerPartNumberId: part.id,
                bomRevision: revision,
                source: sourceValue,
                sourceSubmissionId: sourceValue === "cad_reference" && cadSource?.sourceKind === "submission" ? sourceId : null,
                sourceRevisionPackageId:
                  sourceValue === "cad_reference" && cadSource?.sourceKind === "revision_package" ? sourceId : null
              })
            });
      const body = (await response.json().catch(() => ({}))) as { draft?: { id?: string }; error?: string; message?: string };
      if (!response.ok || !body.draft?.id) throw new Error(humanizeError(body.message ?? body.error));
      router.push(`/bom/workbench/${encodeURIComponent(body.draft.id)}`);
    } catch (caught) {
      const recovered = await readBackCreateEffect(idempotencyKey);
      if (recovered) {
        router.push(`/bom/workbench/${encodeURIComponent(recovered)}`);
        return;
      }
      setError(caught instanceof Error ? caught.message : "BOM 建立未完成，已保留目前選擇，請再試一次。");
    } finally {
      setSubmitting(false);
    }
  }

  async function readBackCreateEffect(idempotencyKey: string) {
    try {
      const response = await fetch(`/api/bom/drafts?idempotencyKey=${encodeURIComponent(idempotencyKey)}`, { cache: "no-store" });
      if (!response.ok) return "";
      const body = (await response.json()) as { draft?: { id?: string } };
      return body.draft?.id ?? "";
    } catch {
      return "";
    }
  }

  return (
    <main className="bom-create-page">
      <header className="bom-create-header">
        <div>
          <p className="eyebrow">工程 BOM 管理</p>
          <h1>建立 BOM <StatusScopeHelp scope="bomCreate" /></h1>
          <p>料號代表物料身份，沒有版次；這裡建立的是該料號的一份受控 BOM Revision。</p>
        </div>
        <Link className="secondary-button" href="/bom/workbench">回 BOM 工作台</Link>
      </header>

      <ol className="bom-create-progress" aria-label="建立進度">
        <li className={step >= 1 ? "active" : ""}><span>1</span><div><strong>選擇建立方式</strong><small>選擇建立路徑</small></div></li>
        <li className={step >= 2 ? "active" : ""}><span>2</span><div><strong>選擇來源</strong><small>預覽並建立</small></div></li>
      </ol>

      {error ? <div className="bom-create-alert" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="關閉錯誤">×</button></div> : null}

      {step === 1 ? (
        <section className="bom-create-card bom-create-entry-card" aria-labelledby="bom-owner-title">
          <div className="bom-create-card-heading">
            <div><span className="section-label">步驟 1</span><h2 id="bom-owner-title">選擇 BOM 建立方式</h2></div>
            <p>把偵測到的組合件、全新空白 BOM 與既有草稿分開處理。</p>
          </div>
          <form className="bom-create-search" onSubmit={(event) => { event.preventDefault(); void loadContext(query); }}>
            <label><span>搜尋組合件或既有草稿</span><div><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如 A0005-P01" /></div></label>
            <button className="secondary-button" type="submit" disabled={loading}>搜尋</button>
          </form>
          <div className="bom-create-entry-grid">
            <article className="bom-create-entry-option" aria-labelledby="detected-assembly-title">
              <div className="bom-create-entry-heading">
                <span className="bom-create-entry-icon"><Boxes size={20} aria-hidden="true" /></span>
                <div><h3 id="detected-assembly-title">從已偵測的組合件建立</h3><small>只顯示有 CAD 組合件證據、且沒有進行中草稿的料號。</small></div>
                <span className="bom-create-badge recommended">推薦</span>
              </div>
              <div className="bom-create-part-list bom-create-assembly-list" role="radiogroup" aria-label="已偵測的組合件">
                {assemblyParts.map((part) => (
                  <button key={part.id} type="button" role="radio" aria-checked={part.id === ownerPartNumberId} className={part.id === ownerPartNumberId ? "selected" : ""} onClick={() => selectPart(part)}>
                    <span className="bom-create-radio">{part.id === ownerPartNumberId ? <Check size={15} /> : null}</span>
                    <span><strong><SearchHighlight value={part.partNumber} query={query} /></strong><small><SearchHighlight value={part.partName || "未填品名"} query={query} /></small></span>
                    <em>CAD 組合件</em>
                  </button>
                ))}
                {!loading && assemblyParts.length === 0 ? <div className="bom-create-empty-state"><Boxes size={22} aria-hidden="true" /><strong>目前沒有可直接建立的組合件</strong><small>沒有可用的 CAD 組合件證據，或對應料號已有進行中的 BOM 草稿。</small></div> : null}
              </div>
            </article>

            <article className="bom-create-entry-option" aria-labelledby="blank-bom-title">
              <div className="bom-create-entry-heading">
                <span className="bom-create-entry-icon"><ListPlus size={20} aria-hidden="true" /></span>
                <div><h3 id="blank-bom-title">建立全新空白 BOM</h3><small>沒有 CAD 來源時，直接從零開始編輯產品結構。</small></div>
              </div>
              <label className="bom-create-inline-field">
                <span>物料身份</span>
                <select value={manualOwnerPartNumberId} onChange={(event) => { const part = parts.find((item) => item.id === event.target.value); if (part) selectManualPart(part); else setManualOwnerPartNumberId(""); }} disabled={loading || parts.length === 0}>
                  <option value="">例如 A0005-P02</option>
                  {parts.map((part) => <option key={part.id} value={part.id}>{part.partNumber} · {part.partName || "未填品名"}</option>)}
                </select>
              </label>
              <label className="bom-create-inline-field">
                <span>BOM Rev</span>
                <input value={manualBomRevision} onChange={(event) => { setManualBomRevision(event.target.value); idempotencyKeyRef.current = ""; }} inputMode="numeric" placeholder="1" disabled={!selectedManualPart} />
              </label>
              <div className="bom-create-entry-actions">
                <button className="secondary-button" type="button" disabled={!selectedManualPart || !manualBomRevision || submitting} onClick={() => void goToXlsStep()}>
                  匯入 XLS
                </button>
                <button className="primary-button" type="button" disabled={!selectedManualPart || !manualBomRevision || submitting} onClick={() => void createDraft({ selectedPart: selectedManualPart, bomRevision: manualBomRevision, source: "manual" })}>
                  {submitting ? "建立中…" : "建立空白 BOM"} <ArrowRight size={17} aria-hidden="true" />
                </button>
              </div>
              {!loading && parts.length === 0 ? <p className="bom-create-inline-empty">目前沒有可直接建立空白 BOM 的料號；已有草稿請從右側繼續編輯。</p> : null}
            </article>

            <article className="bom-create-entry-option" aria-labelledby="draft-bom-title">
              <div className="bom-create-entry-heading">
                <span className="bom-create-entry-icon"><FileClock size={20} aria-hidden="true" /></span>
                <div><h3 id="draft-bom-title">已有 BOM 草稿</h3><small>已有進行中的 BOM 不重複建立，直接回到原草稿。</small></div>
              </div>
              <div className="bom-create-draft-list">
                {drafts.map((draft) => (
                  <Link key={draft.id} className="bom-create-draft-row" href={`/bom/workbench/${encodeURIComponent(draft.id)}`}>
                    <span><strong>{draft.partNumber}</strong><small>{draft.partName || "未填品名"} · BOM Rev {draft.bomRevision || "-"}</small></span>
                    <span className="bom-create-draft-meta"><em className={`bom-create-status status-${draft.status.toLowerCase()}`}>{getStatusDisplay(draft.status, "bomDraft").label}</em><ArrowRight size={16} aria-hidden="true" /></span>
                  </Link>
                ))}
                {!loading && drafts.length === 0 ? <div className="bom-create-empty-state compact"><FileClock size={22} aria-hidden="true" /><strong>目前沒有未完成的 BOM 草稿</strong><small>完成建立後，草稿會在這裡提供續作入口。</small></div> : null}
              </div>
            </article>
          </div>
          <div className="bom-create-entry-footer">
            <div><span>已選擇建立方式</span><strong>{selectedPart ? `從 CAD 組合件建立 · ${selectedPart.partNumber} · BOM Rev ${bomRevision || selectedPart.suggestedBomRevision}` : "請先選擇左側的組合件"}</strong></div>
            <button className="primary-button" type="button" disabled={!selectedPart || !bomRevision || loading} onClick={() => void goToSourceStep()}>
              下一步：選擇來源 <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : (
        <section className="bom-create-card" aria-labelledby="bom-source-title">
          <div className="bom-create-card-heading">
            <div><span className="section-label">步驟 2</span><h2 id="bom-source-title">要從哪裡開始？</h2></div>
            <p><strong>{selectedPart?.partNumber}</strong> · BOM Rev {bomRevision}</p>
          </div>
          <div className="bom-create-source-grid" role="radiogroup" aria-label="BOM 資料來源">
            {sourceOptions.map((option) => {
              const Icon = option.icon;
              return <button key={option.value} type="button" role="radio" aria-checked={source === option.value} className={source === option.value ? "selected" : ""} onClick={() => { setSource(option.value); idempotencyKeyRef.current = ""; }}><Icon size={22} aria-hidden="true" /><span><strong>{option.title}</strong><small>{option.description}</small></span><span className="bom-create-radio">{source === option.value ? <Check size={15} /> : null}</span></button>;
            })}
          </div>

          {source === "cad_reference" ? (
            <label className="bom-create-source-detail"><span>CAD 圖面來源</span><select value={sourceCadId} onChange={(event) => { setSourceCadId(event.target.value); idempotencyKeyRef.current = ""; }}><option value="">選擇一份可讀取的受控圖面</option>{cadSources.map((item) => <option key={`${item.sourceKind}:${item.id}`} value={item.id}>{item.drawingNumber} · Drawing Rev {item.drawingRevision} · {getStatusDisplay(item.status, "fileStatus").label}</option>)}</select>{cadSources.length === 0 ? <small>此料號目前沒有你可讀取的 CAD 組合件來源；可改用 XLS 或空白 BOM。</small> : null}</label>
          ) : null}
          {source === "solidworks_xls" ? (
            <label className="bom-create-upload"><UploadCloud size={22} aria-hidden="true" /><span><strong>{xlsFile?.name ?? "選擇 SolidWorks BOM 檔案"}</strong><small>支援 XLS、XLSX、CSV、TSV、TXT 或 HTML</small></span><input type="file" accept=".xls,.xlsx,.csv,.tsv,.txt,.html" onChange={(event) => { setXlsFile(event.target.files?.[0] ?? null); idempotencyKeyRef.current = ""; }} /></label>
          ) : null}

          <div className="bom-create-summary"><span>即將建立</span><strong>{selectedPart?.partNumber} · BOM Rev {bomRevision}</strong><small>{sourceOptions.find((option) => option.value === source)?.title}{selectedCadSource ? ` · ${selectedCadSource.drawingNumber} Drawing Rev ${selectedCadSource.drawingRevision}` : ""}</small></div>
          <div className="bom-create-primary-action split">
            <button className="secondary-button" type="button" onClick={() => setStep(1)} disabled={submitting}><ArrowLeft size={17} aria-hidden="true" />上一步</button>
            <button className="primary-button" type="button" onClick={() => void createDraft()} disabled={submitting || (source === "cad_reference" && !sourceCadId) || (source === "solidworks_xls" && !xlsFile)}>{submitting ? "建立中…" : "建立 BOM 草稿"}<ArrowRight size={17} aria-hidden="true" /></button>
          </div>
        </section>
      )}
    </main>
  );
}

async function submitXls(input: { selectedPart: PartOption; bomRevision: string; xlsFile: File; idempotencyKey: string }) {
  const form = new FormData();
  form.set("ownerPartNumberId", input.selectedPart.id);
  form.set("bomRevision", input.bomRevision);
  form.set("file", input.xlsFile);
  return fetch("/api/bom/drafts/import-xls", { method: "POST", headers: { "idempotency-key": input.idempotencyKey }, body: form });
}

function humanizeError(value: unknown) {
  const code = String(value ?? "");
  const messages: Record<string, string> = {
    BOM_CREATE_FORBIDDEN: "你沒有權限為這個料號建立 BOM。",
    BOM_CREATE_IDEMPOTENCY_CONFLICT: "建立內容已改變，請重新確認後再建立。",
    BOM_REVISION_OCCUPIED: "這個 BOM Rev 已經使用，請回上一步選擇建議的新版本。",
    BOM_REVISION_NOT_FORWARD: "BOM Rev 必須高於目前已發行版本。",
    BOM_OWNER_SOURCE_MISMATCH: "選擇的 CAD 圖面不屬於這個料號，請重新選擇來源。",
    BOM_CAD_SOURCE_SUBMISSION_REQUIRED: "請選擇一份 CAD 圖面來源。",
    REVISION_RELEASE_REQUIRES_MAJOR: "BOM Rev 請輸入整數，例如 1、2、3。",
    REVISION_MUST_BE_NUMERIC: "BOM Rev 只能使用數字。",
    BOM_XLS_EMPTY_FILE: "選擇的檔案沒有內容。"
  };
  return messages[code] ?? (code && !code.includes("_") ? code : "BOM 建立未完成，請檢查輸入後再試一次。");
}
