"use client";

import type { CSSProperties } from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileDropzone } from "@/components/file-dropzone";
import { StatusScopeHelp } from "@/components/status-help-popover";
import { AlertTriangle, CheckCircle2, GitPullRequestArrow, Info, Loader2, RotateCcw, Search, Send, UploadCloud } from "lucide-react";
import {
  classifyRevisionPackageFiles,
  evaluateRevisionPackageCompleteness,
  inferRevisionPackageRole,
  revisionPackageRoleLabel,
  revisionPackageRoleOptions,
  revisionPackageRoleToDocumentCategory,
  type RevisionPackageFileRole,
  type RevisionPackageWarning
} from "@/lib/revision-package";
import { compareRevisionCodes } from "@/lib/revision-policy";

type FffState = "no_impact" | "suspected_impact" | "confirmed_impact";
type ItemType = "self_made" | "purchased" | "standard";
type ResolveStatus = "no_input" | "not_found" | "ambiguous_query" | "resolved" | "resolved_with_missing_part" | "multiple_primary_parts";
type LookupKind = "query" | "drawingNumber" | "drawingNumberId" | "partNumber";
type RevisionWorkflowIntent = "rd_workspace" | "design_change_workspace" | "release_area";

type ResolvedDrawing = {
  id: string;
  drawingNumber: string;
  purposeCode: string;
  purposeDescription: string;
  developmentPhase: string;
  recordStatus: string;
  rootCode: string | null;
  coreName: string | null;
};

type ResolvedPart = {
  id: string;
  partNumber: string;
  partName: string;
  itemKind: string;
  developmentPhase: string;
  recordStatus: string;
};

type ResolveResult = {
  status: ResolveStatus;
  drawing: ResolvedDrawing | null;
  primaryParts: ResolvedPart[];
  selectedPrimaryPart: ResolvedPart | null;
  suggestedRevision: string;
  latestRevision: string | null;
  revisionCount: number;
  candidates: ResolvedDrawing[];
};

type DrawingSubmissionBlockerGroup =
  | "master_data_missing"
  | "attachment_conflict"
  | "submission_conflict"
  | "state_or_permission_blocked"
  | "system_recoverable";

type DrawingSubmissionBlocker = {
  code: string;
  group?: DrawingSubmissionBlockerGroup;
  message: string;
  recoveryHref?: string;
  existingSubmission?: {
    submissionId: string;
  } | null;
};

type DrawingSubmissionAttachment = {
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
};

type DrawingSubmissionContext = {
  drawing: {
    id: string;
    drawingNumber: string;
  };
  primaryPart: null | {
    id: string;
    partNumber: string;
  };
  attachments: DrawingSubmissionAttachment[];
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
};

type ActionableError = {
  title: string;
  reasons: string[];
  nextStep: string;
  detail?: string;
};

type PendingRevisionUploadFile = {
  key: string;
  file: File;
  role: RevisionPackageFileRole;
};

const fffOptions: { value: FffState; label: string }[] = [
  { value: "no_impact", label: "無影響" },
  { value: "suspected_impact", label: "疑似影響" },
  { value: "confirmed_impact", label: "確認影響" }
];

const reasonOptions = ["標註 / 文字修正", "尺寸 / 公差修正", "材質 / 製程修正", "BOM / 料件影響", "其他"];
const documentCategoryOptions = [
  { value: "drawing_2d", label: "2D 圖面" },
  { value: "cad_3d", label: "3D CAD" },
  { value: "dwg", label: "DWG/DXF" },
  { value: "pdf", label: "PDF" },
  { value: "other", label: "其他" }
];
const weakRevisionChangeDescriptions = new Set(["change", "update", "modify", "fix"]);

export default function DrawingRevisionPage() {
  return (
    <Suspense fallback={null}>
      <DrawingRevisionWorkbench />
    </Suspense>
  );
}

function DrawingRevisionWorkbench() {
  const searchParams = useSearchParams();
  const initialLookup = getInitialLookup(searchParams);
  const workflowIntent = getInitialWorkflowIntent(searchParams);
  const fromNumberStateWorkspace = searchParams.get("source") === "number_state_workspace";
  const [query, setQuery] = useState(initialLookup.value);
  const [lookupKind, setLookupKind] = useState<LookupKind>(initialLookup.kind);
  const [resolved, setResolved] = useState<ResolveResult | null>(null);
  const [revision, setRevision] = useState("0.1");
  const [reasonCategory, setReasonCategory] = useState(reasonOptions[0]);
  const [formState, setFormState] = useState<FffState>("no_impact");
  const [fitState, setFitState] = useState<FffState>("no_impact");
  const [functionState, setFunctionState] = useState<FffState>("no_impact");
  const [replacementReservedPartNumber, setReplacementReservedPartNumber] = useState("");
  const [replacementItemType, setReplacementItemType] = useState<ItemType>("self_made");
  const [detectedPartNumber, setDetectedPartNumber] = useState("");
  const [correctedPartNumber, setCorrectedPartNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"idle" | "resolving" | "submitting">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [errorGuidance, setErrorGuidance] = useState<ActionableError | null>(null);
  const [createdSubmissionId, setCreatedSubmissionId] = useState("");
  const [submissionContext, setSubmissionContext] = useState<DrawingSubmissionContext | null>(null);
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<PendingRevisionUploadFile[]>([]);
  const [packageRoleByAttachmentId, setPackageRoleByAttachmentId] = useState<Record<string, RevisionPackageFileRole>>({});
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const revisionManuallyEditedRef = useRef(false);

  const outcome = useMemo(() => {
    if ([formState, fitState, functionState].includes("confirmed_impact")) return "confirmed_impact";
    if ([formState, fitState, functionState].includes("suspected_impact")) return "suspected_impact";
    return "no_impact";
  }, [formState, fitState, functionState]);
  const replacementRequired = outcome === "confirmed_impact";
  const comparedPartNumber = correctedPartNumber.trim() || detectedPartNumber.trim();
  const mismatch = replacementRequired && comparedPartNumber && replacementReservedPartNumber.trim() && comparedPartNumber !== replacementReservedPartNumber.trim();
  const changeDescriptionIssues = useMemo(() => validateRevisionChangeDescription(note), [note]);
  const targetRevision = revision.trim();
  const revisionIntentNotice = useMemo(
    () => buildRevisionIntentNotice(targetRevision, resolved?.latestRevision ?? null, resolved?.suggestedRevision ?? null),
    [resolved?.latestRevision, resolved?.suggestedRevision, targetRevision]
  );
  const selectedAttachments = useMemo(
    () => submissionContext?.attachments.filter((attachment) => selectedAttachmentIds.includes(attachment.id)) ?? [],
    [selectedAttachmentIds, submissionContext]
  );
  const selectedPackageFiles = useMemo(
    () =>
      classifyRevisionPackageFiles(
        selectedAttachments.map((attachment) => ({
          id: attachment.id,
          filename: attachment.fileName,
          documentCategory: attachment.documentCategory,
          userCorrectedRole: packageRoleByAttachmentId[attachment.id] ?? null
        }))
      ),
    [packageRoleByAttachmentId, selectedAttachments]
  );
  const selectedPackageFileByAttachmentId = useMemo(
    () => new Map(selectedPackageFiles.map((file) => [file.id, file])),
    [selectedPackageFiles]
  );
  const selectedPackageWarnings = useMemo(
    () =>
      evaluateRevisionPackageCompleteness({
        drawingNumber: resolved?.drawing?.drawingNumber ?? "",
        revision: revision.trim(),
        files: selectedPackageFiles.map((file) => ({
          id: file.id,
          filename: file.filename,
          role: file.role
        }))
      }),
    [resolved?.drawing?.drawingNumber, revision, selectedPackageFiles]
  );
  const selectedReleaseConflicts = selectedAttachments.filter((attachment) => attachment.releaseConflict);
  const selectedRevisionMismatch = selectedAttachments.some((attachment) => (attachment.revision ?? "").trim() !== revision.trim());
  const targetRevisionAttachments = useMemo(
    () => submissionContext?.attachments.filter((attachment) => isTargetRevisionAttachment(attachment, targetRevision)) ?? [],
    [submissionContext, targetRevision]
  );
  const referenceRevisionAttachments = useMemo(
    () => submissionContext?.attachments.filter((attachment) => !isTargetRevisionAttachment(attachment, targetRevision)) ?? [],
    [submissionContext, targetRevision]
  );
  const referenceRevisionLabels = useMemo(() => uniqueAttachmentRevisionLabels(referenceRevisionAttachments), [referenceRevisionAttachments]);
  const handledTargetAttachmentGap = Boolean(
    submissionContext && targetRevisionAttachments.length === 0 && submissionContext.blockers.some((blocker) => blocker.code === "missing_attachment")
  );
  const hardSubmissionBlockers =
    submissionContext?.blockers.filter((blocker) => {
      const group = submissionBlockerGroup(blocker);
      return group === "submission_conflict" || group === "state_or_permission_blocked";
    }) ?? [];
  const visibleSubmissionBlockers =
    submissionContext?.blockers.filter((blocker) => !isJustCreatedSubmissionBlocker(blocker, createdSubmissionId) && !(handledTargetAttachmentGap && blocker.code === "missing_attachment")) ?? [];
  const canUploadRevisionAttachment = Boolean(resolved?.drawing) && busy !== "submitting" && !submissionLoading && !attachmentBusy && hardSubmissionBlockers.length === 0;
  const canCreateRevisionSubmission =
    busy === "idle" &&
    Boolean(resolved?.drawing) &&
    Boolean(submissionContext) &&
    Boolean(revision.trim()) &&
    !submissionLoading &&
    selectedAttachmentIds.length > 0 &&
    (submissionContext?.blockers.length ?? 0) === 0 &&
    selectedReleaseConflicts.length === 0 &&
    !selectedRevisionMismatch &&
    !mismatch &&
    changeDescriptionIssues.length === 0 &&
    (!replacementRequired || (Boolean(replacementReservedPartNumber.trim()) && Boolean(comparedPartNumber)));

  useEffect(() => {
    if (initialLookup.value) void resolveDrawing(initialLookup.value, initialLookup.kind);
    // The initial query string is only an entry hint; later edits are user-controlled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const drawingNumber = resolved?.drawing?.drawingNumber;
    const targetRevision = revision.trim();
    if (!drawingNumber || !targetRevision) {
      setSubmissionContext(null);
      setSelectedAttachmentIds([]);
      setPackageRoleByAttachmentId({});
      setPendingUploadFiles([]);
      setCreatedSubmissionId("");
      return;
    }
    setCreatedSubmissionId("");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void loadSubmissionContext(drawingNumber, targetRevision, {
        signal: controller.signal,
        preserveSelection: true
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [resolved?.drawing?.drawingNumber, revision, workflowIntent]);

  async function resolveDrawing(nextQuery = query, nextLookupKind = lookupKind) {
    const text = nextQuery.trim();
    if (!text) return;
    revisionManuallyEditedRef.current = false;
    setBusy("resolving");
    setError("");
    setErrorGuidance(null);
    setMessage("");
    const params = new URLSearchParams({ limit: "8" });
    params.set(nextLookupKind, text);
    params.set("workflowIntent", workflowIntent);
    const response = await fetch(`/api/numbering/drawings/resolve?${params.toString()}`);
    const body = (await response.json().catch(() => ({}))) as Partial<ResolveResult> & { error?: string };
    setBusy("idle");
    if (!response.ok) {
      setResolved(null);
      setSubmissionContext(null);
      setSelectedAttachmentIds([]);
      setCreatedSubmissionId("");
      setErrorGuidance(null);
      setError(humanError(body.error ?? "drawing_resolve_failed"));
      return;
    }
    const nextResolved = body as ResolveResult;
    setResolved(nextResolved);
    if (nextResolved.suggestedRevision && !revisionManuallyEditedRef.current) setRevision(nextResolved.suggestedRevision);
    if (!nextResolved.drawing) {
      setSubmissionContext(null);
      setSelectedAttachmentIds([]);
      setCreatedSubmissionId("");
      setErrorGuidance(null);
      setError(resolveStatusMessage(nextResolved));
    }
  }

  async function pickCandidate(drawingNumber: string) {
    setQuery(drawingNumber);
    setLookupKind("drawingNumber");
    await resolveDrawing(drawingNumber, "drawingNumber");
  }

  async function loadSubmissionContext(
    drawingNumber: string,
    targetRevision: string,
    options: { signal?: AbortSignal; preserveSelection?: boolean; selectAttachmentId?: string; selectAttachmentIds?: string[] } = {}
  ) {
    setSubmissionLoading(true);
    const params = new URLSearchParams({ revision: targetRevision, workflowIntent });
    try {
      const response = await fetch(`/api/numbering/drawings/${encodeURIComponent(drawingNumber)}/submission-workbench?${params.toString()}`, {
        signal: options.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(humanError(body.error ?? body.code ?? "drawing_submission_context_failed", body.details, body.message));
      }
      const nextContext = body as DrawingSubmissionContext;
      setSubmissionContext(nextContext);
      const serverSuggestedRevision =
        nextContext.revisionPolicySuggestion?.suggestedRevision ?? nextContext.suggestedRevision.policySuggestedRevision;
      if (!revisionManuallyEditedRef.current && serverSuggestedRevision && serverSuggestedRevision !== targetRevision) {
        setRevision(serverSuggestedRevision);
      }
      setPackageRoleByAttachmentId((current) => {
        const validIds = new Set(nextContext.attachments.map((attachment) => attachment.id));
        return Object.fromEntries(Object.entries(current).filter(([attachmentId]) => validIds.has(attachmentId)));
      });
      setSelectedAttachmentIds((current) => {
        const selected = new Set<string>();
        if (options.preserveSelection) {
          for (const id of current) {
            if (nextContext.attachments.some((attachment) => attachment.id === id && canSelectForTargetRevision(attachment, targetRevision))) selected.add(id);
          }
        }
        if (options.selectAttachmentId && nextContext.attachments.some((attachment) => attachment.id === options.selectAttachmentId && canSelectForTargetRevision(attachment, targetRevision))) {
          selected.add(options.selectAttachmentId);
        }
        for (const id of options.selectAttachmentIds ?? []) {
          if (nextContext.attachments.some((attachment) => attachment.id === id && canSelectForTargetRevision(attachment, targetRevision))) selected.add(id);
        }
        if (selected.size > 0) return Array.from(selected);
        return nextContext.attachments
          .filter((attachment) => canSelectForTargetRevision(attachment, targetRevision))
          .map((attachment) => attachment.id);
      });
    } catch (contextError) {
      if (contextError instanceof DOMException && contextError.name === "AbortError") return;
      setSubmissionContext(null);
      setSelectedAttachmentIds([]);
      setPackageRoleByAttachmentId({});
      setErrorGuidance(null);
      setError(contextError instanceof Error ? contextError.message : "圖面送審資料讀取失敗。");
    } finally {
      if (!options.signal?.aborted) setSubmissionLoading(false);
    }
  }

  async function uploadRevisionAttachment() {
    if (!resolved?.drawing || pendingUploadFiles.length === 0 || attachmentBusy) return;
    setAttachmentBusy(true);
    setError("");
    setErrorGuidance(null);
    setMessage("");
    const uploaded: Array<{ key: string; id: string; role: RevisionPackageFileRole }> = [];
    const failures: string[] = [];

    for (const pending of pendingUploadFiles) {
      const form = new FormData();
      form.append("file", pending.file);
      form.append("document_category", revisionPackageRoleToDocumentCategory(pending.role));
      form.append("revision", revision.trim());
      form.append("display_name", pending.file.name);
      form.append("description", `從圖面進版工作台補上新版圖面附件；版次包類別：${revisionPackageRoleLabel(pending.role)}。`);
      const response = await fetch(`/api/numbering/drawings/${encodeURIComponent(resolved.drawing.drawingNumber)}/attachments`, {
        method: "POST",
        body: form
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        failures.push(`${pending.file.name}：${humanError(body.error ?? body.code ?? "MASTER_ATTACHMENT_CREATE_FAILED", body.details, body.message)}`);
        continue;
      }
      const uploadedId = typeof body.attachment?.id === "string" ? body.attachment.id : "";
      if (uploadedId) uploaded.push({ key: pending.key, id: uploadedId, role: pending.role });
    }

    setAttachmentBusy(false);
    if (uploaded.length > 0) {
      const uploadedKeys = new Set(uploaded.map((item) => item.key));
      setPendingUploadFiles((current) => current.filter((item) => !uploadedKeys.has(item.key)));
      setPackageRoleByAttachmentId((current) => ({
        ...current,
        ...Object.fromEntries(uploaded.map((item) => [item.id, item.role]))
      }));
      setMessage(`已將 ${uploaded.length} 個版次 ${revision.trim() || "-"} 檔案加入圖號附件庫，並選入本次進版送審。`);
      await loadSubmissionContext(resolved.drawing.drawingNumber, revision.trim(), {
        preserveSelection: true,
        selectAttachmentIds: uploaded.map((item) => item.id)
      });
    }
    if (failures.length > 0) {
      setError(`部分檔案未加入附件庫：${failures.join("；")}`);
    }
  }

  function toggleAttachment(attachmentId: string, checked: boolean) {
    setSelectedAttachmentIds((current) => {
      if (checked) return Array.from(new Set([...current, attachmentId]));
      return current.filter((id) => id !== attachmentId);
    });
  }

  function addPendingUploadFiles(files: File[]) {
    setError("");
    setErrorGuidance(null);
    setPendingUploadFiles((current) => {
      const seen = new Set(current.map((item) => item.key));
      const next = [...current];
      for (const file of files) {
        const key = pendingUploadFileKey(file);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({
          key,
          file,
          role: inferRevisionPackageRole(file.name)
        });
      }
      return next;
    });
  }

  function updatePendingUploadRole(key: string, role: RevisionPackageFileRole) {
    setPendingUploadFiles((current) => current.map((item) => (item.key === key ? { ...item, role } : item)));
  }

  function removePendingUploadFile(key: string) {
    setPendingUploadFiles((current) => current.filter((item) => item.key !== key));
  }

  function updateAttachmentPackageRole(attachmentId: string, role: RevisionPackageFileRole) {
    setPackageRoleByAttachmentId((current) => ({ ...current, [attachmentId]: role }));
  }

  async function submitAssessment() {
    if (!resolved?.drawing || busy !== "idle" || !submissionContext) return;
    if (!canCreateRevisionSubmission) {
      const reason = revisionSubmissionDisabledReason(
        submissionContext,
        selectedAttachmentIds,
        selectedRevisionMismatch,
        selectedReleaseConflicts.length,
        changeDescriptionIssues,
        targetRevision,
        referenceRevisionLabels
      );
      setError(reason);
      setErrorGuidance({
        title: "現在還不能建立圖面進版送審",
        reasons: [reason],
        nextStep: "請依上方提示補齊資料後，再按「建立圖面進版送審」。"
      });
      return;
    }
    setBusy("submitting");
    setError("");
    setErrorGuidance(null);
    setMessage("");
    const response = await fetch("/api/numbering/drawing-revisions/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        drawingNumber: resolved.drawing.drawingNumber,
        revision,
        workflowIntent: submissionContext.revisionPolicySuggestion?.workflowIntent ?? submissionContext.suggestedRevision.workflowIntent ?? workflowIntent,
        revisionPolicySuggestion: submissionContext.revisionPolicySuggestion,
        revisionOverrideReason: note.trim() || null,
        selectedAttachmentIds,
        packageFileRoles: selectedAttachments.map((attachment) => ({
          attachmentId: attachment.id,
          role: packageRoleForAttachment(attachment, packageRoleByAttachmentId)
        })),
        reasonCategory,
        formState,
        fitState,
        functionState,
        replacementReservedPartNumber: replacementReservedPartNumber.trim() || null,
        replacementItemType,
        detectedPartNumber: detectedPartNumber.trim() || null,
        correctedPartNumber: correctedPartNumber.trim() || null,
        currentPartNumberId: resolved.selectedPrimaryPart?.id ?? null,
        note: note.trim() || null,
        idempotencyKey: newSubmissionIdempotencyKey()
      })
    });
    setBusy("idle");
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const cancellationNote = body.submissionCancelled ? "未完整建立的送審已自動取消；請修正資料後重送。" : "";
      const nextError = buildSubmissionErrorGuidance(body.error ?? body.code ?? "drawing_revision_submit_failed", body.details, body.message, cancellationNote);
      setError(nextError.title);
      setErrorGuidance(nextError);
      return;
    }
    setMessage(
      body.replacementDraft
        ? `已建立送審 ${body.submissionId}，替代料號草稿 ${body.replacementDraft.reservedPartNumber}。`
        : outcome === "suspected_impact"
          ? `已建立圖面進版送審 ${body.submissionId}，目前審核中。`
          : `已建立圖面進版送審 ${body.submissionId}，目前審核中。`
    );
    setCreatedSubmissionId(typeof body.submissionId === "string" ? body.submissionId : "");
    await loadSubmissionContext(resolved.drawing.drawingNumber, revision.trim(), { preserveSelection: true });
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>圖面進版 <StatusScopeHelp scope="revisionSubmission" /></h1>
          <p>{fromNumberStateWorkspace ? "已從保留號帶入正式圖號；請在此確認版次並建立首版圖面送審。" : "輸入正式圖號後上傳新版圖面，建立審核中送審並關聯 Form / Fit / Function 判定。"}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => window.location.reload()}>
          <RotateCcw size={16} />
          重新整理
        </button>
      </div>

      <section className="panel" style={workbenchHeroStyle}>
        <div>
          <span style={eyebrowStyle}>Drawing Revision Workbench</span>
          <h2 style={heroTitleStyle}>先定位圖號，再建立受控進版送審</h2>
          <p style={mutedTextStyle}>流程包含正式圖號查詢、新版圖面附件、FFF 判定、必要時建立替代料號草稿。</p>
        </div>
        <div style={stepStripStyle}>
          <StepPill active={!resolved?.drawing} done={Boolean(resolved?.drawing)} label="1 圖號定位" />
          <StepPill active={Boolean(resolved?.drawing)} done={selectedAttachmentIds.length > 0} label="2 新版圖面" />
          <StepPill active={Boolean(resolved?.drawing && selectedAttachmentIds.length > 0)} done={false} label="3 FFF 判定" />
          <StepPill active={replacementRequired} done={false} label="4 替代料號" />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>圖號定位</h2>
            <p style={mutedTextStyle}>可輸入正式圖號或料號，例如 A0001-M01。內部 ID 僅顯示於解析結果，不需要人工填寫。</p>
          </div>
          <button
            className="primary-button"
            style={busy !== "idle" || !query.trim() ? disabledActionStyle : undefined}
            type="button"
            onClick={() => resolveDrawing()}
            disabled={busy !== "idle" || !query.trim()}
          >
            {busy === "resolving" ? <Loader2 size={16} /> : <Search size={16} />}
            解析圖號
          </button>
        </div>
        <div style={resolveStateStyle(resolved?.status, Boolean(resolved?.drawing))}>
          <strong>{resolved?.drawing ? "已定位圖號" : "尚未定位圖號"}</strong>
          <span>{resolved?.drawing ? `${resolved.drawing.drawingNumber} 已載入，內部 ID 已由系統處理。` : "請輸入正式圖號或料號後按「解析圖號」，不要填 UUID。"}</span>
        </div>
        <div style={lookupGridStyle}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>正式圖號 / 料號</span>
            <input
              className="text-input"
              placeholder="請輸入，例如 A0001-M01 或 A0001-P01"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLookupKind("query");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && query.trim()) void resolveDrawing();
              }}
            />
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>新版次</span>
            <input
              className="text-input"
              value={revision}
              onChange={(event) => {
                revisionManuallyEditedRef.current = true;
                setRevision(event.target.value);
              }}
            />
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>變更原因</span>
            <select className="dropdown-select" value={reasonCategory} onChange={(event) => setReasonCategory(event.target.value)}>
              {reasonOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        {revisionIntentNotice ? (
          <div style={revisionIntentNoticeStyle(revisionIntentNotice.tone)}>
            <Info size={16} />
            <span>{revisionIntentNotice.text}</span>
          </div>
        ) : null}
        {resolved?.drawing ? <ResolvedSummary result={resolved} /> : null}
        {resolved?.status === "ambiguous_query" ? <CandidateList candidates={resolved.candidates} onPick={pickCandidate} /> : null}
        {resolved && !resolved.drawing && resolved.status !== "ambiguous_query" ? <p style={errorTextStyle}>{resolveStatusMessage(resolved)}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>新版圖面</h2>
            <p style={mutedTextStyle}>本區只顯示版次 {revision.trim() || "-"} 可納入本次送審的檔案；其他版次只保留在參考區。</p>
          </div>
          <span className="section-label">進版 {revision.trim() || "-"}</span>
        </div>
        {!resolved?.drawing ? (
          <p style={hintTextStyle}>
            <Info size={16} />
            請先定位正式圖號。
          </p>
        ) : (
          <>
            <div style={attachmentToolsGridStyle}>
              <div style={attachmentDropzoneStyle}>
                <FileDropzone
                  label="上傳版次檔案包"
                  description={`版次 ${revision.trim() || "-"}，可一次加入 2D / 3D / PDF / DWG / DXF / STEP`}
                  multiple
                  selectedFiles={pendingUploadFiles.map((item) => item.file)}
                  variant="compact"
                  disabled={!canUploadRevisionAttachment}
                  onClearSelected={() => setPendingUploadFiles([])}
                  onFilesSelected={addPendingUploadFiles}
                  onReject={(reason) => {
                    setErrorGuidance(null);
                    if (reason === "disabled") {
                      setError(
                        revisionSubmissionDisabledReason(
                          submissionContext,
                          selectedAttachmentIds,
                          selectedRevisionMismatch,
                          selectedReleaseConflicts.length,
                          changeDescriptionIssues,
                          targetRevision,
                          referenceRevisionLabels
                        )
                      );
                    }
                  }}
                />
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={uploadRevisionAttachment}
                disabled={pendingUploadFiles.length === 0 || !canUploadRevisionAttachment}
              >
                {attachmentBusy ? <Loader2 size={16} /> : <UploadCloud size={16} />}
                加入附件庫
              </button>
            </div>

            {pendingUploadFiles.length > 0 ? (
              <div style={pendingFileListStyle}>
                <div style={pendingFileListHeaderStyle}>
                  <strong>待加入檔案 {pendingUploadFiles.length} 個</strong>
                  <span style={mutedTextStyle}>系統已依副檔名分類；若判斷錯誤，請在加入附件庫前修正。</span>
                </div>
                {pendingUploadFiles.map((pending) => (
                  <div key={pending.key} style={pendingFileRowStyle}>
                    <span style={attachmentInfoStyle}>
                      <strong>{pending.file.name}</strong>
                      <span style={mutedTextStyle}>{formatBytes(pending.file.size)}</span>
                    </span>
                    <label style={packageRoleControlStyle}>
                      <span style={fieldLabelStyle}>類別</span>
                      <select
                        className="dropdown-select"
                        value={pending.role}
                        onChange={(event) => updatePendingUploadRole(pending.key, event.target.value as RevisionPackageFileRole)}
                        disabled={attachmentBusy}
                      >
                        {revisionPackageRoleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="secondary-button" type="button" disabled={attachmentBusy} onClick={() => removePendingUploadFile(pending.key)}>
                      移除
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {submissionLoading ? (
              <p style={hintTextStyle}>
                <Loader2 size={16} />
                讀取附件與送審狀態中。
              </p>
            ) : null}

            {visibleSubmissionBlockers.length ? (
              <div style={blockerListStyle}>
                {visibleSubmissionBlockers.map((blocker) => (
                  <p key={`${blocker.code}-${blocker.message}`} style={warningTextStyle}>
                    <AlertTriangle size={16} />
                    {blocker.message}
                  </p>
                ))}
              </div>
            ) : null}

            {submissionContext && submissionContext.attachments.length === 0 ? (
              <p style={mutedTextStyle}>此圖號目前沒有附件，請先上傳新版圖面。</p>
            ) : null}

            {submissionContext && submissionContext.attachments.length > 0 && targetRevisionAttachments.length === 0 ? (
              <div style={nextActionBoxStyle}>
                <strong>要送審版次 {revision.trim() || "-"}，請先上傳同版次的新版圖面。</strong>
                <span>{missingTargetRevisionAttachmentMessage(targetRevision, referenceRevisionLabels)}</span>
              </div>
            ) : null}

            {targetRevisionAttachments.length ? (
              <div style={attachmentListStyle}>
                {targetRevisionAttachments.map((attachment) => {
                  const revisionMatches = (attachment.revision ?? "").trim() === revision.trim();
                  const disabled = !attachment.eligibleForSubmission || Boolean(attachment.releaseConflict) || !revisionMatches || busy === "submitting";
                  const packageFile = selectedPackageFileByAttachmentId.get(attachment.id);
                  const packageRole = packageRoleForAttachment(attachment, packageRoleByAttachmentId);
                  return (
                    <div key={attachment.id} style={{ ...attachmentRowStyle, opacity: disabled && !selectedAttachmentIds.includes(attachment.id) ? 0.62 : 1 }}>
                      <input
                        type="checkbox"
                        aria-label={`選擇 ${attachment.displayName || attachment.fileName}`}
                        checked={selectedAttachmentIds.includes(attachment.id)}
                        disabled={disabled}
                        onChange={(event) => toggleAttachment(attachment.id, event.target.checked)}
                      />
                      <span style={attachmentInfoStyle}>
                        <strong>{attachment.displayName || attachment.fileName}</strong>
                        <span style={mutedTextStyle}>
                          {attachment.fileExt.toUpperCase()} / {documentCategoryLabel(attachment.documentCategory)} / {attachment.revision ? `版次 ${attachment.revision}` : "未標版次"} / {formatBytes(attachment.fileSize)}
                        </span>
                        {attachment.displayName && attachment.displayName !== attachment.fileName ? <span style={mutedTextStyle}>檔名 {attachment.fileName}</span> : null}
                        {!attachment.eligibleForSubmission ? <span style={errorTextStyle}>{attachment.ineligibleReason ?? "此附件不可送審。"}</span> : null}
                        {attachment.releaseConflict ? (
                          <span style={errorTextStyle}>已被正式紀錄 {attachment.releaseConflict.drawingNumber} 版次 {attachment.releaseConflict.revision} 使用。</span>
                        ) : null}
                        {attachment.eligibleForSubmission && !revisionMatches ? <span style={warningInlineStyle}>附件版次與本次進版不一致。</span> : null}
                      </span>
                      <label style={packageRoleControlStyle}>
                        <span style={fieldLabelStyle}>版次包類別</span>
                        <select
                          className="dropdown-select"
                          value={packageRole}
                          disabled={busy === "submitting"}
                          onChange={(event) => updateAttachmentPackageRole(attachment.id, event.target.value as RevisionPackageFileRole)}
                        >
                          {revisionPackageRoleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {packageFile?.source === "user" ? <span style={mutedTextStyle}>已手動修正</span> : null}
                      </label>
                      {selectedAttachmentIds.includes(attachment.id) ? <span style={selectedBadgeStyle}>本次送審</span> : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {selectedPackageWarnings.length > 0 ? <RevisionPackageWarningPanel warnings={selectedPackageWarnings} audience="submitter" /> : null}

            {referenceRevisionAttachments.length ? (
              <details style={referenceDetailsStyle}>
                <summary style={referenceSummaryStyle}>上一版 / 其他版次參考檔 {referenceRevisionAttachments.length} 個（不可送審）</summary>
                <div style={referenceListStyle}>
                  {referenceRevisionAttachments.map((attachment) => (
                    <div key={attachment.id} style={referenceAttachmentRowStyle}>
                      <span style={attachmentInfoStyle}>
                        <strong>{attachment.displayName || attachment.fileName}</strong>
                        <span style={mutedTextStyle}>
                          {attachment.fileExt.toUpperCase()} / {documentCategoryLabel(attachment.documentCategory)} / {attachment.revision ? `版次 ${attachment.revision}` : "未標版次"} / {formatBytes(attachment.fileSize)}
                        </span>
                        {attachment.displayName && attachment.displayName !== attachment.fileName ? <span style={mutedTextStyle}>檔名 {attachment.fileName}</span> : null}
                        <span style={mutedTextStyle}>這是歷史/參考附件，僅供比對，不會納入本次版次 {revision.trim() || "-"} 進版送審。</span>
                        {attachment.releaseConflict ? (
                          <span style={mutedTextStyle}>已連到正式紀錄 {attachment.releaseConflict.drawingNumber} 版次 {attachment.releaseConflict.revision}。</span>
                        ) : null}
                      </span>
                      <span style={referenceBadgeStyle}>參考</span>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>FFF 判定</h2>
            <p style={mutedTextStyle}>只要任一項為確認影響，就必須建立替代料號草稿並比對新版圖面上的料號讀值。</p>
          </div>
          <button className={canCreateRevisionSubmission ? "primary-button" : "secondary-button"} type="button" onClick={submitAssessment} disabled={!canCreateRevisionSubmission} style={!canCreateRevisionSubmission ? disabledActionStyle : undefined}>
            {busy === "submitting" ? <Loader2 size={16} /> : <Send size={16} />}
            建立圖面進版送審
          </button>
        </div>

        <div style={fffGridStyle}>
          <FffControl label="Form" value={formState} onChange={setFormState} />
          <FffControl label="Fit" value={fitState} onChange={setFitState} />
          <FffControl label="Function" value={functionState} onChange={setFunctionState} />
        </div>

        <div style={resultBandStyle}>
          {outcome === "confirmed_impact" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <strong>{outcomeLabel(outcome)}</strong>
          <span style={mutedTextStyle}>{outcomeMessage(outcome)}</span>
        </div>
      </section>

      {replacementRequired ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>替代料號與圖面料號比對</h2>
              <p style={mutedTextStyle}>請填新版圖面實際讀到的料號；若 OCR 或人工讀值需修正，填 RD 修正讀值。</p>
            </div>
            <GitPullRequestArrow size={20} />
          </div>
          <div style={formGridStyle}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>替代料號草稿</span>
              <input className="text-input" value={replacementReservedPartNumber} onChange={(event) => setReplacementReservedPartNumber(event.target.value)} />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>料件類型</span>
              <select className="dropdown-select" value={replacementItemType} onChange={(event) => setReplacementItemType(event.target.value as ItemType)}>
                <option value="self_made">自製件</option>
                <option value="purchased">採購件</option>
                <option value="standard">標準件</option>
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>新版圖面讀取料號</span>
              <input className="text-input" value={detectedPartNumber} onChange={(event) => setDetectedPartNumber(event.target.value)} />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>RD 修正讀值</span>
              <input className="text-input" value={correctedPartNumber} onChange={(event) => setCorrectedPartNumber(event.target.value)} />
            </label>
          </div>
          {mismatch ? <p style={errorTextStyle}>新版圖面料號與替代料號不一致，不能送出。</p> : null}
        </section>
      ) : null}

      <section className="panel">
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>變更說明 / 備註（必填）</span>
          <textarea className="text-input" rows={4} maxLength={100} value={note} onChange={(event) => setNote(event.target.value)} placeholder="請填 5 到 100 字，例如：修正尺寸標註，Form/Fit/Function 無影響。" />
        </label>
        <p style={changeDescriptionIssues.length > 0 ? warningTextStyle : mutedTextStyle}>
          {changeDescriptionIssues.length > 0 ? changeDescriptionIssues[0] : "請簡短寫明本次修改原因。"}
        </p>
        {changeDescriptionIssues.length > 0 ? <p style={mutedTextStyle}>下一步：請在此欄補上 5 到 100 字的變更說明，再建立圖面進版送審。</p> : null}
        {!resolved?.drawing ? (
          <p style={hintTextStyle}>
            <Info size={16} />
            送出前需先解析正式圖號。
          </p>
        ) : null}
        {resolved?.drawing && !canCreateRevisionSubmission && visibleSubmissionBlockers.length === 0 && changeDescriptionIssues.length === 0 && !message ? (
          <p style={hintTextStyle}>
            <Info size={16} />
            {revisionSubmissionDisabledReason(
              submissionContext,
              selectedAttachmentIds,
              selectedRevisionMismatch,
              selectedReleaseConflicts.length,
              changeDescriptionIssues,
              targetRevision,
              referenceRevisionLabels
            )}
          </p>
        ) : null}
        {message ? <p style={successTextStyle}>{message}</p> : null}
        {createdSubmissionId ? (
          <div style={nextActionBoxStyle} aria-live="polite">
            <strong>送審已建立，下一步是進到審核頁處理。</strong>
            <span>版次 {revision.trim() || "-"} 目前是審核中，不是正式發布；附件庫只保留這次送審用檔案供比對。</span>
            <div className="next-step-inline-actions">
              <a className="primary-button" href={`/submissions/${encodeURIComponent(createdSubmissionId)}`}>
                前往圖面送審審核
              </a>
              <a className="secondary-button" href="/numbering/change-reviews">
                查看圖面進版影響審核
              </a>
            </div>
          </div>
        ) : null}
        {errorGuidance ? <ActionableErrorPanel error={errorGuidance} /> : error ? <p style={errorTextStyle}>{error}</p> : null}
      </section>
    </>
  );
}

function ResolvedSummary({ result }: { result: ResolveResult }) {
  const drawing = result.drawing;
  if (!drawing) return null;
  return (
    <div style={summaryGridStyle}>
      <SummaryItem label="正式圖號" value={drawing.drawingNumber} />
      <SummaryItem label="內部圖號 ID" value={drawing.id} />
      <SummaryItem label="主料號" value={result.selectedPrimaryPart?.partNumber ?? primaryPartFallback(result)} />
      <SummaryItem label="品名 / 根代碼" value={result.selectedPrimaryPart?.partName ?? drawing.coreName ?? drawing.rootCode ?? "-"} />
      <SummaryItem label="最新送審版次" value={result.latestRevision ?? "尚無送審紀錄"} />
      <SummaryItem label="建議新版次" value={result.suggestedRevision} />
    </div>
  );
}

function CandidateList({ candidates, onPick }: { candidates: ResolvedDrawing[]; onPick: (drawingNumber: string) => void }) {
  return (
    <div style={candidateListStyle}>
      <strong>找到多筆可能圖號，請選一筆：</strong>
      {candidates.map((candidate) => (
        <button className="secondary-button" key={candidate.id} type="button" onClick={() => onPick(candidate.drawingNumber)}>
          {candidate.drawingNumber}
        </button>
      ))}
    </div>
  );
}

function StepPill({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return <span style={stepPillStyle(active, done)}>{label}</span>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryItemStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <strong style={summaryValueStyle}>{value}</strong>
    </div>
  );
}

function FffControl({ label, value, onChange }: { label: string; value: FffState; onChange: (value: FffState) => void }) {
  return (
    <div style={fieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <div className="status-tabs">
        {fffOptions.map((option) => (
          <button className={value === option.value ? "active" : undefined} key={option.value} type="button" onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionableErrorPanel({ error }: { error: ActionableError }) {
  return (
    <div role="alert" style={actionableErrorPanelStyle}>
      <div style={actionableErrorTitleStyle}>
        <AlertTriangle size={18} />
        <strong>{error.title}</strong>
      </div>
      {error.reasons.length > 0 ? (
        <ul style={actionableErrorListStyle}>
          {error.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <p style={actionableErrorNextStepStyle}>下一步：{error.nextStep}</p>
      {error.detail ? <p style={mutedTextStyle}>{error.detail}</p> : null}
    </div>
  );
}

function RevisionPackageWarningPanel({ warnings, audience }: { warnings: RevisionPackageWarning[]; audience: "submitter" | "reviewer" }) {
  if (warnings.length === 0) return null;
  return (
    <div style={packageWarningPanelStyle}>
      <div style={packageWarningTitleStyle}>
        <AlertTriangle size={17} />
        <strong>{audience === "submitter" ? "仍可送審，但審核者會看到這些提醒" : "審核前請先確認版次檔案包"}</strong>
      </div>
      <ul style={packageWarningListStyle}>
        {warnings.map((warning) => (
          <li key={`${warning.code}-${warning.affectedFileIds?.join(",") ?? ""}`}>
            {audience === "submitter" ? warning.messageForSubmitter : warning.messageForReviewer}
          </li>
        ))}
      </ul>
    </div>
  );
}

function primaryPartFallback(result: ResolveResult) {
  if (result.status === "multiple_primary_parts") return `多筆主料號：${result.primaryParts.map((part) => part.partNumber).join(", ")}`;
  if (result.status === "resolved_with_missing_part") return "未建立主製造料號連結";
  return "-";
}

function resolveStatusMessage(result: ResolveResult) {
  if (result.status === "not_found") return "找不到這個圖號或料號，請確認輸入的是正式編號。";
  if (result.status === "ambiguous_query") return "查到多筆圖號，請選擇正確圖號後再送出。";
  if (result.status === "resolved_with_missing_part") return "圖號已找到，但沒有主製造料號連結；確認影響時需先補齊料號連結。";
  if (result.status === "multiple_primary_parts") return "圖號已找到，但有多筆主製造料號；確認影響前需先釐清主料號。";
  return "請輸入正式圖號或料號。";
}

function outcomeLabel(value: string) {
  if (value === "confirmed_impact") return "確認影響";
  if (value === "suspected_impact") return "疑似影響";
  return "無影響";
}

function outcomeMessage(value: string) {
  if (value === "confirmed_impact") return "需建立替代料號。";
  if (value === "suspected_impact") return "送審後由審核者判定。";
  return "不需建立替代料號。";
}

function humanError(code: string, details?: unknown, fallbackMessage?: string) {
  switch (code) {
    case "DRAWING_SUBMISSION_VALIDATION_FAILED":
      return "送審資料尚未完整，不能建立送審。";
    case "drawing_number_not_found":
      return "找不到圖號。請輸入正式圖號，例如 A0001-M01，不需要填內部 ID。";
    case "drawing_number_ambiguous":
      return "查到多筆可能圖號，請先在圖號定位區選定一筆。";
    case "primary_part_ambiguous":
      return `此圖號連到多筆主料號，需先清理主料號連結：${detailList(details, "primaryParts")}`;
    case "replacement_part_number_required":
      return "確認影響時必須填替代料號草稿。";
    case "drawing_part_number_read_required":
      return "確認影響時必須填新版圖面讀取料號或 RD 修正讀值。";
    case "drawing_part_number_mismatch":
      return "新版圖面料號與替代料號不一致，請先修正後再送出。";
    case "reserved_number_already_formal_part":
      return "替代料號已是正式料號，不能再建立草稿。";
    case "reserved_number_already_active_draft":
      return "替代料號已有使用中的草稿，請改用既有草稿或更換料號。";
    case "DRAWING_SUBMISSION_ATTACHMENT_REQUIRED":
      return "請至少選擇一個新版圖面附件。";
    case "DRAWING_SUBMISSION_ATTACHMENT_NOT_FOUND":
      return "選取的附件不存在或已刪除，請重新整理後再選。";
    case "DRAWING_SUBMISSION_ATTACHMENT_INELIGIBLE":
      return `選取的附件不可送審：${Array.isArray(details) ? details.join("、") : ""}`;
    case "DRAWING_SUBMISSION_REVISION_MISMATCH":
      return `選取附件版次必須與本次進版版次一致。${Array.isArray(details) ? `目前選取：${details.join("、")}` : ""}`;
    case "same_revision_in_progress":
    case "duplicate_active_submission":
      return "這版已有送審在處理。現在請查看既有送審；如果不送審了，先取消審核中送審後再重新建立。";
    case "released_revision_exists":
    case "obsolete_revision_locked":
      return "這版已完成，不用再送審。若內容要變更，請建立新版次。";
    case "release_incomplete_conflict":
      return "這版發行未完成。請先請 R&D Manager 或 Admin 處理發行未完成，再回來建立本次進版。";
    case "missing_attachment":
      return "此圖號尚無可送審附件，請先上傳新版圖面。";
    case "duplicate_attachment_filename":
    case "release_filename_conflict":
      return fallbackMessage || "附件檔名與既有正式紀錄衝突，請更名或更換附件。";
    case "missing_material":
      return "主要料號尚未完成材質主資料，需回料號/圖號模組補齊。";
    case "missing_surface_finish":
      return "主要料號尚未完成表面處理主資料，需回料號/圖號模組補齊。";
    default:
      return fallbackMessage || "操作未完成。請重新整理後再試；若仍失敗，請主管或 Admin 協助確認。";
  }
}

function buildSubmissionErrorGuidance(codeValue: unknown, details: unknown, fallbackMessage?: string, detail?: string): ActionableError {
  const code = String(codeValue ?? "");
  const reasons = detailListItems(details);
  const title = humanError(code, details, fallbackMessage);
  const fallbackReason = fallbackMessage && fallbackMessage !== title ? fallbackMessage : "";

  if (code === "DRAWING_SUBMISSION_VALIDATION_FAILED") {
    return {
      title,
      reasons: reasons.length > 0 ? reasons : [fallbackReason || "送審必填資料或變更說明未通過檢查。"],
      nextStep: reasons.some((reason) => reason.includes("變更原因"))
        ? "請在「變更說明 / 備註」補上 5 到 100 字且可讓審核者理解的變更原因，再重新送審。"
        : "請依上列原因補齊主資料、附件或欄位內容後，再重新送審。",
      detail
    };
  }

  if (code === "drawing_revision_submission_forbidden") {
    return {
      title,
      reasons: [fallbackReason || "目前帳號角色不能建立圖面進版送審。"],
      nextStep: "請改由工程或 Admin 角色處理，或請主管調整權限。",
      detail
    };
  }

  return {
    title,
    reasons: reasons.length > 0 ? reasons : [fallbackReason || title],
    nextStep: nextStepForSubmissionError(code),
    detail
  };
}

function nextStepForSubmissionError(code: string) {
  switch (code) {
    case "drawing_number_not_found":
      return "請回圖號定位區確認正式圖號，再重新送審。";
    case "DRAWING_SUBMISSION_ATTACHMENT_REQUIRED":
    case "missing_attachment":
      return "請先在「新版圖面」上傳並勾選本次版次的圖面附件。";
    case "DRAWING_SUBMISSION_REVISION_MISMATCH":
      return "請移除版次不一致的附件，或把本次新版次改成附件實際版次。";
    case "same_revision_in_progress":
    case "duplicate_active_submission":
      return "請先查看既有送審；若不再送審，取消審核中送審後再重新建立。";
    case "released_revision_exists":
    case "obsolete_revision_locked":
      return "這版不用再送審；若內容要變更，請建立下一個新版次。";
    default:
      return "請依原因修正後重試；若仍失敗，請截圖此區塊交給主管或 Admin 檢查。";
  }
}

function detailListItems(details: unknown): string[] {
  if (Array.isArray(details)) return details.map((item) => String(item).trim()).filter(Boolean);
  if (!details || typeof details !== "object") return [];
  return Object.values(details as Record<string, unknown>)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function detailList(details: unknown, key: string) {
  if (!details || typeof details !== "object" || !(key in details)) return "";
  const value = (details as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

function submissionBlockerGroup(blocker: DrawingSubmissionBlocker): DrawingSubmissionBlockerGroup {
  if (blocker.group) return blocker.group;
  if (
    blocker.code === "duplicate_active_submission" ||
    blocker.code === "same_revision_in_progress" ||
    blocker.code === "release_incomplete_conflict" ||
    blocker.code === "released_revision_exists" ||
    blocker.code === "obsolete_revision_locked"
  ) {
    return "submission_conflict";
  }
  if (blocker.code === "duplicate_attachment_filename" || blocker.code === "release_filename_conflict" || blocker.code === "missing_attachment") return "attachment_conflict";
  if (blocker.code === "drawing_not_submittable") return "state_or_permission_blocked";
  if (blocker.code === "drawing_number_not_found") return "system_recoverable";
  return "master_data_missing";
}

function revisionSubmissionDisabledReason(
  context: DrawingSubmissionContext | null,
  selectedAttachmentIds: string[],
  revisionMismatch: boolean,
  releaseConflictCount: number,
  changeDescriptionIssues: string[] = [],
  targetRevision = "",
  referenceRevisionLabels: string[] = []
) {
  if (!context) return "請先完成新版圖面送審資料讀取。";
  const submissionConflict = context.blockers.find((blocker) => submissionBlockerGroup(blocker) === "submission_conflict");
  if (submissionConflict) return humanError(submissionConflict.code, undefined, submissionConflict.message);
  const stateBlocker = context.blockers.find((blocker) => submissionBlockerGroup(blocker) === "state_or_permission_blocked");
  if (stateBlocker) return humanError(stateBlocker.code, undefined, stateBlocker.message);
  const masterBlocker = context.blockers.find((blocker) => submissionBlockerGroup(blocker) === "master_data_missing");
  if (masterBlocker) return humanError(masterBlocker.code, undefined, masterBlocker.message);
  if (context.blockers.some((blocker) => blocker.code === "missing_attachment")) return missingTargetRevisionAttachmentMessage(targetRevision, referenceRevisionLabels);
  if (releaseConflictCount > 0) return "選取附件已被其他正式紀錄使用，請移除或更換附件。";
  if (revisionMismatch) return "選取附件版次與本次進版版次不一致。";
  if (selectedAttachmentIds.length === 0 && context.attachments.length > 0 && referenceRevisionLabels.length > 0) return missingTargetRevisionAttachmentMessage(targetRevision, referenceRevisionLabels);
  if (selectedAttachmentIds.length === 0) return "請勾選至少一個新版圖面附件納入本次送審。";
  if (changeDescriptionIssues.length > 0) return `${changeDescriptionIssues[0]} 請先補齊變更說明後再送出。`;
  if (context.blockers.length > 0) return humanError(context.blockers[0].code, undefined, context.blockers[0].message);
  return "請確認 FFF 判定與替代料號資料。";
}

function validateRevisionChangeDescription(value: string) {
  const text = value.trim();
  if (text.length < 5) return ["變更說明需為 5 到 100 個字。"];
  if (text.length > 100) return ["變更說明最多 100 個字。"];
  if (/^\d+$/.test(text)) return ["變更說明不可只有數字。"];
  if (weakRevisionChangeDescriptions.has(text.toLowerCase())) return ["變更說明過於籠統，請描述本次圖面進版原因。"];
  if (!/[A-Za-z\u4e00-\u9fff]/.test(text)) return ["變更說明需包含文字。"];
  return [];
}

function isTargetRevisionAttachment(attachment: DrawingSubmissionAttachment, targetRevision: string) {
  return Boolean(targetRevision) && (attachment.revision ?? "").trim() === targetRevision;
}

function uniqueAttachmentRevisionLabels(attachments: DrawingSubmissionAttachment[]) {
  return Array.from(new Set(attachments.map((attachment) => attachment.revision?.trim() || "未標版次")));
}

function missingTargetRevisionAttachmentMessage(targetRevision: string, referenceRevisionLabels: string[]) {
  const submitTargetText = targetRevision ? `版次 ${targetRevision}` : "本次進版";
  const uploadTargetText = targetRevision ? `版次 ${targetRevision} 的新版圖面` : "本次進版版次的新版圖面";
  const referenceLabel = referenceRevisionLabels.length > 0 ? `目前附件庫只有 ${referenceRevisionLabels.join("、")} 的參考檔；` : "";
  return `${referenceLabel}要送審${submitTargetText}，請先上傳${uploadTargetText}。若剛剛上傳的是新版檔案，請確認「新版次」欄位後重新加入附件庫。`;
}

function buildRevisionIntentNotice(targetRevision: string, latestRevision: string | null, suggestedRevision: string | null) {
  if (!targetRevision || !latestRevision) return null;
  try {
    const comparedToLatest = compareRevisionCodes(targetRevision, latestRevision, { allowLegacy: true });
    if (comparedToLatest < 0) {
      return {
        tone: "history" as const,
        text: `此版次低於目前最新版 ${latestRevision}；核准後會進入歷史區，不會取代最新版。`
      };
    }
    if (comparedToLatest > 0) {
      return {
        tone: "latest" as const,
        text: `此版次高於目前最新版 ${latestRevision}；核准後會成為最新版。`
      };
    }
    if (suggestedRevision && compareRevisionCodes(targetRevision, suggestedRevision, { allowLegacy: true }) !== 0) {
      return {
        tone: "history" as const,
        text: `此版次不是系統建議的 ${suggestedRevision}；請確認是要補同版正式紀錄，或改用新的版次。`
      };
    }
  } catch {
    return null;
  }
  return null;
}

function canSelectForTargetRevision(attachment: DrawingSubmissionAttachment, targetRevision: string) {
  return isTargetRevisionAttachment(attachment, targetRevision) && attachment.eligibleForSubmission && !attachment.releaseConflict;
}

function packageRoleForAttachment(attachment: DrawingSubmissionAttachment, overrides: Record<string, RevisionPackageFileRole>) {
  return overrides[attachment.id] ?? inferRevisionPackageRole(attachment.fileName, attachment.documentCategory);
}

function pendingUploadFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function isJustCreatedSubmissionBlocker(blocker: DrawingSubmissionBlocker, createdSubmissionId: string) {
  return Boolean(createdSubmissionId) && blocker.existingSubmission?.submissionId === createdSubmissionId;
}

function documentCategoryLabel(value: string) {
  return documentCategoryOptions.find((option) => option.value === value)?.label ?? value;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function newSubmissionIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getInitialLookup(searchParams: ReturnType<typeof useSearchParams>): { value: string; kind: LookupKind } {
  const drawingNumber = searchParams.get("drawingNumber") ?? searchParams.get("drawing_number");
  if (drawingNumber) return { value: drawingNumber, kind: "drawingNumber" };
  const partNumber = searchParams.get("partNumber") ?? searchParams.get("part_number");
  if (partNumber) return { value: partNumber, kind: "partNumber" };
  const drawingNumberId = searchParams.get("drawingNumberId") ?? searchParams.get("drawing_number_id");
  if (drawingNumberId) return { value: drawingNumberId, kind: "drawingNumberId" };
  return { value: "", kind: "query" };
}

function getInitialWorkflowIntent(searchParams: ReturnType<typeof useSearchParams>): RevisionWorkflowIntent {
  const value =
    searchParams.get("workflowIntent") ??
    searchParams.get("workflow_intent") ??
    searchParams.get("lifecycleStage");
  return value === "design_change_workspace" || value === "release_area" ? value : "rd_workspace";
}

const mutedTextStyle: CSSProperties = { color: "#64748b", fontSize: "0.85rem" };
const errorTextStyle: CSSProperties = { color: "#b91c1c", fontSize: "0.9rem", fontWeight: 700 };
const successTextStyle: CSSProperties = { color: "#047857", fontSize: "0.9rem", fontWeight: 700 };
const hintTextStyle: CSSProperties = { color: "#475569", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" };
const warningTextStyle: CSSProperties = { color: "#92400e", fontSize: "0.86rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem", margin: 0 };
const warningInlineStyle: CSSProperties = { color: "#92400e", fontSize: "0.82rem", fontWeight: 700 };
const fieldStyle: CSSProperties = { display: "grid", gap: "0.35rem" };
const fieldLabelStyle: CSSProperties = { color: "#475569", fontSize: "0.78rem", fontWeight: 700 };
function revisionIntentNoticeStyle(tone: "history" | "latest"): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.45rem",
    padding: "0.7rem 0.85rem",
    borderRadius: 6,
    border: tone === "history" ? "1px solid #fed7aa" : "1px solid #99f6e4",
    background: tone === "history" ? "#fff7ed" : "#f0fdfa",
    color: tone === "history" ? "#9a3412" : "#115e59",
    fontSize: "0.9rem",
    fontWeight: 700
  };
}
const actionableErrorPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  border: "1px solid #fecaca",
  borderRadius: 6,
  background: "#fff1f2",
  color: "#7f1d1d",
  fontSize: "0.9rem",
  marginTop: "0.75rem",
  padding: "0.75rem 0.85rem"
};
const actionableErrorTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  color: "#991b1b"
};
const actionableErrorListStyle: CSSProperties = {
  margin: "0",
  paddingLeft: "1.25rem"
};
const actionableErrorNextStepStyle: CSSProperties = {
  margin: 0,
  color: "#7f1d1d",
  fontWeight: 800
};
const workbenchHeroStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  background: "#f8fafc",
  borderColor: "#bfd6e3"
};
const eyebrowStyle: CSSProperties = {
  color: "#0f766e",
  fontSize: "0.76rem",
  fontWeight: 800,
  textTransform: "uppercase"
};
const heroTitleStyle: CSSProperties = {
  margin: "0.15rem 0",
  color: "#0f172a",
  fontSize: "1.1rem"
};
const stepStripStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: "0.45rem"
};
const disabledActionStyle: CSSProperties = {
  opacity: 0.45,
  cursor: "not-allowed"
};
const lookupGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.8rem",
  alignItems: "end"
};
const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "0.8rem",
  alignItems: "end"
};
const fffGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.8rem"
};
const attachmentToolsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: "0.75rem",
  alignItems: "stretch"
};
const attachmentDropzoneStyle: CSSProperties = {
  minWidth: 0
};
const pendingFileListStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  background: "#f8fafc",
  marginTop: "0.75rem",
  padding: "0.75rem"
};
const pendingFileListHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap"
};
const pendingFileRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1fr) minmax(150px, 0.45fr) auto",
  gap: "0.75rem",
  alignItems: "center",
  borderTop: "1px solid #e2e8f0",
  paddingTop: "0.55rem"
};
const blockerListStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  borderTop: "1px solid #e2e8f0",
  marginTop: "0.9rem",
  paddingTop: "0.75rem"
};
const attachmentListStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
  borderTop: "1px solid #e2e8f0",
  marginTop: "0.9rem",
  paddingTop: "0.9rem"
};
const nextActionBoxStyle: CSSProperties = {
  display: "grid",
  gap: "0.25rem",
  border: "1px solid #99f6e4",
  borderRadius: 6,
  background: "#f0fdfa",
  color: "#115e59",
  fontSize: "0.9rem",
  marginTop: "0.9rem",
  padding: "0.75rem 0.85rem"
};
const attachmentRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  alignItems: "center",
  gap: "0.65rem",
  border: "1px solid #dbe4ef",
  borderRadius: 6,
  padding: "0.65rem 0.75rem",
  background: "#ffffff"
};
const referenceDetailsStyle: CSSProperties = {
  borderTop: "1px solid #e2e8f0",
  marginTop: "0.9rem",
  paddingTop: "0.75rem"
};
const referenceSummaryStyle: CSSProperties = {
  color: "#475569",
  cursor: "pointer",
  fontSize: "0.86rem",
  fontWeight: 800
};
const referenceListStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
  marginTop: "0.75rem"
};
const referenceAttachmentRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "0.65rem",
  border: "1px solid #dbe4ef",
  borderRadius: 6,
  padding: "0.65rem 0.75rem",
  background: "#f8fafc"
};
const attachmentInfoStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
  minWidth: 0
};
const packageRoleControlStyle: CSSProperties = {
  display: "grid",
  gap: "0.25rem",
  minWidth: 0
};
const selectedBadgeStyle: CSSProperties = {
  border: "1px solid #99f6e4",
  borderRadius: 999,
  background: "#ccfbf1",
  color: "#115e59",
  fontSize: "0.74rem",
  fontWeight: 800,
  padding: "0.25rem 0.5rem",
  whiteSpace: "nowrap"
};
const referenceBadgeStyle: CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 999,
  background: "#ffffff",
  color: "#475569",
  fontSize: "0.74rem",
  fontWeight: 800,
  padding: "0.25rem 0.5rem",
  whiteSpace: "nowrap"
};
const packageWarningPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  border: "1px solid #fed7aa",
  borderRadius: 8,
  background: "#fff7ed",
  color: "#7c2d12",
  marginTop: "0.75rem",
  padding: "0.75rem 0.85rem"
};
const packageWarningTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  fontSize: "0.92rem"
};
const packageWarningListStyle: CSSProperties = {
  display: "grid",
  gap: "0.25rem",
  margin: 0,
  paddingLeft: "1.2rem",
  fontSize: "0.86rem"
};
const resultBandStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  borderTop: "1px solid #e2e8f0",
  marginTop: "1rem",
  paddingTop: "0.9rem"
};
const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "0.65rem",
  borderTop: "1px solid #e2e8f0",
  marginTop: "1rem",
  paddingTop: "0.9rem"
};
const summaryItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.25rem",
  minWidth: 0
};
const summaryValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "0.95rem",
  overflowWrap: "anywhere"
};
const candidateListStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.5rem",
  borderTop: "1px solid #e2e8f0",
  marginTop: "1rem",
  paddingTop: "0.9rem"
};

function stepPillStyle(active: boolean, done: boolean): CSSProperties {
  return {
    border: `1px solid ${done ? "#0f766e" : active ? "#2563eb" : "#cbd5e1"}`,
    background: done ? "#ccfbf1" : active ? "#dbeafe" : "#ffffff",
    color: done ? "#115e59" : active ? "#1e40af" : "#64748b",
    borderRadius: 999,
    padding: "0.35rem 0.65rem",
    fontSize: "0.78rem",
    fontWeight: 800,
    whiteSpace: "nowrap"
  };
}

function resolveStateStyle(status: ResolveStatus | undefined, resolved: boolean): CSSProperties {
  const warning = status === "resolved_with_missing_part" || status === "multiple_primary_parts" || status === "ambiguous_query";
  return {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.45rem",
    border: `1px solid ${resolved ? "#99f6e4" : warning ? "#fed7aa" : "#cbd5e1"}`,
    background: resolved ? "#f0fdfa" : warning ? "#fff7ed" : "#f8fafc",
    color: resolved ? "#115e59" : warning ? "#9a3412" : "#475569",
    borderRadius: 6,
    marginBottom: "0.75rem",
    padding: "0.6rem 0.75rem",
    fontSize: "0.86rem"
  };
}
