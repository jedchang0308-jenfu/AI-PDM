import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const expect = (name, condition) => checks.push({ name, condition: Boolean(condition) });

const ownerRoute = read("src/app/numbering/drawings/[drawingId]/workspace/page.tsx");
const owner = [
  read("src/components/canonical-change-workspace.tsx"),
  read("src/components/canonical-drawing-change-workspace.tsx")
].join("\n");
const preview = [
  read("src/components/drawing-detail-preview.tsx"),
  read("src/components/canonical-preview-panel.tsx"),
  read("src/components/canonical-preview-media.tsx")
].join("\n");
const pdfPageViewport = read("src/components/pdf-page-viewport.tsx");
const recognitionPanel = read("src/components/drawing-recognition-workspace-panel.tsx");
const recognitionRepo = read("src/lib/repositories/drawing-recognition-async-repository.ts");
const getProjectionSource = recognitionRepo.slice(recognitionRepo.indexOf("  async getProjection"), recognitionRepo.indexOf("  async getObservationEvidence"));
const ownerResolver = read("src/lib/drawing-recognition-part-owner.ts");
const ownerInvariantQc = read("scripts/qc-dev-079-owner-invariant.mjs");
const ownerInvariantPostgresQc = read("scripts/qc-dev-079-owner-invariant-postgres.mjs");
const ownerReconciliation = read("scripts/reconcile-dev-079-recognition-owner.mjs");
const ownerSchemaApply = read("scripts/apply-dev-079-recognition-owner-schema.mjs");
const sqliteSchema = read("db/schema.sql");
const postgresInvariant = read("db/postgres/050_drawing_recognition_part_owner_invariant.sql");
const reviewerRoute = read("src/app/approvals/[requestId]/page.tsx");
const reviewer = read("src/components/approval-request-workspace.tsx");
const reviewPackage = read("src/components/canonical-review-package-workspace.tsx");
const drawingWorkbench = [read("src/components/canonical-pdm-workbench.tsx"), read("src/components/drawing-workspace-drawer.tsx")].join("\n");
const drawingDetailContent = read("src/components/drawing-detail-content.tsx");
const unifiedDrawer = read("src/components/pdm-entity-detail-drawer.tsx");
const controller = read("src/components/use-pdm-workbench-controller.ts");
const drawingList = read("src/lib/pdm-canonical-workbench.ts");
const workbenchState = read("src/lib/pdm-canonical-workbench-state.ts");
const drawingRepo = read("src/lib/repositories/pdm-canonical-workbench-async-repository.ts");
const editor = owner;
const lifecycle = read("src/lib/number-lifecycle-simplification.ts");
const styles = read("src/app/globals.css");

expect("canonical owner route exists", ownerRoute.includes("DrawingOwnerWorkspace") && ownerRoute.includes("params: Promise"));
expect("owner workspace uses canonical drawing-revision read and mutation authorities", owner.includes("/api/pdm/drawing-revision-works/") && owner.includes("ownerCommand") && owner.includes("DrawingRecognitionWorkspacePanel") && owner.includes("/files"));
expect("owner workspace is visual-first with detail panel second", owner.indexOf("dev079-workspace-visual") > -1 && owner.indexOf("dev079-workspace-visual") < owner.indexOf("dev079-workspace-detail") && styles.includes("grid-template-columns: minmax(0, 1fr) minmax(360px, var(--dev079-detail-panel-width, 34%))"));
expect("workspace removes the legacy ghost resizer and collapses to one column on narrow screens", !owner.includes('role="separator"') && styles.includes("canonical drawing workspace has no rendered column-resizer node") && styles.includes("grid-template-columns: minmax(0, 1fr);"));
expect("primary visual switches one large 2D or 3D preview", owner.includes('layout="tabs"') && owner.includes('activeKind={visualKind}') && preview.includes('layout?: "grid" | "tabs"') && preview.includes('role="tablist"'));
expect("embedded browser PDF previews hide the toolbar and thumbnail navigation while source links remain locatable", preview.includes("function pdfViewerUrl") && preview.includes('params.set("navpanes", "0")') && preview.includes('params.set("toolbar", "0")') && preview.includes("src={pdfViewerUrl(objectUrl, media.pageNumber, true)}") && preview.includes("pdfViewerUrl(media.href, media.pageNumber)"));
expect("locatable PDF renders the exact page inside the existing preview surface and opens the source in a new tab", owner.includes("pageNumber,") && owner.includes("focusRegion:") && owner.includes("openInNewTab: true") && preview.includes("PdfPageViewport") && preview.includes("focusRegion?: PdfPageFocusRegion") && preview.includes("renderDocumentAsPdfPage") && preview.includes("data-preview-rendered-mode") && preview.includes("<a") && preview.includes('target={media.openInNewTab === false ? undefined : "_blank"}') && pdfPageViewport.includes("drawing-preview-pdf-page") && pdfPageViewport.includes("ResizeObserver"));
expect("manual return-to-original preview control is removed", !owner.includes("dev079-clear-evidence") && !owner.includes(">返回原圖面</button>"));
expect("workspace removes the recognition status help trigger", !owner.includes('StatusScopeHelp scope="drawingRecognition"') && !owner.includes("查看圖面辨識狀態說明"));
expect("workspace removes the redundant recognition eyebrow", !owner.includes('<span className="eyebrow">智慧辨識</span>'));
expect("right detail panel keeps files, impact and recognition in one continuous task flow", owner.includes("dev079-unified-task-content") && owner.includes("版次與檔案") && owner.includes("FFF／變更影響") && owner.includes("智慧辨識") && styles.includes(".dev079-task-panel > .dev079-unified-task-content"));
expect("right detail owns scrolling while visual remains fixed in viewport", styles.includes("height: 100dvh") && styles.includes(".dev079-workspace-detail { overflow: hidden;") && styles.includes("overflow-y: auto"));
const detailStart = owner.indexOf('className="dev079-workspace-detail"');
const detailEnd = owner.indexOf("</aside>", detailStart);
const lifecycleFooter = owner.indexOf('className="dev079-workspace-footer"');
expect("lifecycle actions are docked inside the right detail while the preview has no reserved blank footer cell", detailStart > -1 && lifecycleFooter > detailStart && lifecycleFooter < detailEnd && !owner.includes("dev079-workspace-footer-preview-space") && !styles.includes("dev079-workspace-footer-preview-space") && styles.includes(".dev079-workspace-detail > .dev079-task-panel"));
expect("recognition evidence uses a yellow highlighter and same-page PDF.js crop magnifier anchored to the rendered PDF page", owner.includes("evidenceRegion") && owner.includes('setVisualKind("two-d")') && preview.includes("focusRegion?: PdfPageFocusRegion") && pdfPageViewport.includes("pdfPage.render({ canvas: cropCanvas") && pdfPageViewport.includes("magnifierContext.drawImage(cropEntry.canvas") && pdfPageViewport.includes('data-evidence-marker="highlighter"') && pdfPageViewport.includes('data-magnifier-state="loading"') && styles.includes(".dev079-evidence-highlighter") && styles.includes(".dev079-evidence-magnifier"));
expect("recognition evidence preview omits the redundant caption overlay", !owner.includes("RecognitionEvidenceCaption") && !owner.includes("dev079-evidence-caption") && !styles.includes(".dev079-evidence-caption"));
expect("recognition evidence locates the best observation when its review-group value receives focus", recognitionPanel.includes("onFocus={() => selectEvidence(group.observations)}") && recognitionPanel.includes("isNormalizedPageGeometry") && !recognitionPanel.includes("在圖面定位"));
expect("multi-source review groups expose concise PDF/CAD evidence controls", recognitionPanel.includes("dev079-recognition-evidence-source") && recognitionPanel.includes("preferredObservationId") && recognitionPanel.includes("evidenceSourceLabel") && recognitionPanel.includes('return observation.sourceRole') && !recognitionPanel.includes("無圖面座標") && !recognitionPanel.includes("${role} · ${fileName}"));
expect("recognition value and source controls share a compact row with narrow fallback", recognitionPanel.includes("dev079-recognition-value-row") && styles.includes(".dev079-recognition-value-row") && styles.includes("@media (max-width: 360px)"));
expect("recognition review fields use a compact vertical rhythm while preserving mobile dock clearance", styles.includes(".dev079-recognition-panel { gap: 8px; }") && styles.includes(".dev079-recognition-sections { gap: 7px; }") && styles.includes(".dev079-recognition-candidate { gap: 4px; padding: 6px 0; }") && styles.includes(".dev079-recognition-candidate label input { padding: 6px 8px; }") && styles.includes(".dev079-recognition-save-all { justify-content: center; width: 100%; min-height: 40px; margin-bottom: 8px; }"));
expect("recognition removes the redundant heading and keeps candidate rows visually flat", !owner.includes("辨識與人工核對") && styles.includes(".dev079-recognition-candidate { border: 0; background: transparent; }") && styles.includes(".dev079-recognition-candidate.is-conflict,") && styles.includes(".dev079-recognition-candidate.is-blocked { border: 0; background: transparent; }"));
expect("recognition field titles use compact regular typography", styles.includes(".dev079-recognition-candidate header > strong { color: #304b5d; font-size: 13px; font-weight: 500; line-height: 1.25; }"));
expect("one canonical field surface coalesces aliases, categories, owners and scopes without discarding observations or candidate decisions", recognitionPanel.includes('fieldKey === "surface_treatment"') && recognitionPanel.includes('fieldKey === "drawn_by"') && recognitionPanel.includes("sw_custom_(?:2d圖號_用途|圖號)") && recognitionPanel.includes("sw_custom_swformatsize") && recognitionPanel.includes('return `field:${fieldKey}`') && recognitionPanel.includes("coalesceReviewGroupsForDisplay") && recognitionPanel.includes("preferredCandidate") && recognitionPanel.includes("candidate.proposedValue?.trim() === preferredValue") && recognitionPanel.includes("data-review-group-count") && recognitionPanel.includes("data-observation-count") && recognitionPanel.includes("data-merged-candidate-count") && recognitionPanel.includes("memberCandidateIds.map"));
expect("an empty blocked observation does not override one recognized canonical value", recognitionPanel.includes("preferredValue !== null") && recognitionPanel.includes("primaryGroup.reviewState") && recognitionRepo.includes("hasBlockedMember") && recognitionRepo.includes("preferredValue !== null") && recognitionRepo.includes("primary.reviewState"));
expect("same-kind evidence observations share one concise source control while retaining their observation count", recognitionPanel.includes("observationsBySourceLabel") && recognitionPanel.includes("data-evidence-observation-count") && recognitionPanel.includes("selectEvidence(observations)"));
expect("coalesced recognition fields keep conflict-specific scopes without redundant summaries", recognitionPanel.includes("scopeLabelsForGroup") && recognitionPanel.includes("observation.configurationName") && recognitionPanel.includes("dev079-recognition-scope-row") && !recognitionPanel.includes("dev079-recognition-scope-summary") && !styles.includes(".dev079-recognition-scope-summary"));
expect("different values remain separately editable inside one semantic field surface", recognitionPanel.includes("crossScopeConflict") && recognitionPanel.includes("dev079-recognition-scope-row") && recognitionPanel.includes("不同適用範圍辨識出不同值"));
expect("property-only or unlocatable evidence uses a truthful transient explanation instead of false coordinates", owner.includes("但沒有可用的定位座標") && owner.includes("evidenceLocationNotice") && owner.includes("!evidence.locatable || !region") && styles.includes(".dev079-evidence-flash"));
expect("recognition reuses the canonical drawing revision and controlled source assets", owner.includes('sourceContextType="drawing_revision"') && owner.includes("sourceAssetIds={sourceAssetIds}") && recognitionPanel.includes("sourceContextType") && recognitionPanel.includes("/api/numbering/recognition-sessions"));
expect("candidate uploads enqueue deduplicated recognition automatically", lifecycle.includes("ensureDrawingRecognitionSessionForSourceContext") && lifecycle.includes('sourceContextType: "candidate_revision"') && !lifecycle.includes('if (fileLinkResult === "created")'));
expect("workspace removes manual recognition start and backfills legacy files automatically", !recognitionPanel.includes("DrawingRecognitionPreSubmitPanel") && !recognitionPanel.includes(">開始辨識</button>") && recognitionPanel.includes('fetch("/api/numbering/recognition-sessions"') && recognitionPanel.includes("自動辨識工作目前無法建立"));
expect("workspace hides the verbose PDF OCR status card while keeping background browser OCR", recognitionPanel.includes("useDrawingRecognitionBrowserOcr") && !recognitionPanel.includes("DrawingRecognitionPdfOcrStatus") && !recognitionPanel.includes("PDF 圖框智慧辨識"));
expect("workspace polls automatic recognition and renders a quiet processing state", recognitionPanel.includes('session.status') && recognitionPanel.includes("智慧辨識處理中") && recognitionPanel.includes("完成後會自動顯示辨識結果"));
expect("recognition saves all valid review-group decisions through one batch action", recognitionPanel.includes("saveAllDecisions") && recognitionPanel.includes("visibleReviewGroups.reduce<BatchDecision[]>") && recognitionPanel.includes("儲存核對結果") && recognitionPanel.includes("action: \"accept\"") && recognitionPanel.includes("action: \"correct\"") && recognitionPanel.includes("requiresPartOwner") && !recognitionPanel.includes("套用修正") && !recognitionPanel.includes(">接受</button>"));
expect("recognition keeps the default review state quiet and shows only real exceptions", !recognitionPanel.includes("待處理") && !recognitionPanel.includes("dev079-recognition-filters") && recognitionPanel.includes('["conflict", "blocked"]') && recognitionPanel.includes("is-exception"));
expect("recognition exception labels expose one accessible hover and focus explanation", recognitionPanel.includes("TextHint") && recognitionPanel.includes("exceptionHelp") && styles.includes(".ui-hint-text") && styles.includes(".dev079-recognition-exception-hint"));
expect("recognition explains unresolved part-number ownership separately from OCR accuracy", recognitionPanel.includes("尚未連結正式料號主檔") && recognitionPanel.includes("不代表 OCR 辨識錯誤") && recognitionPanel.includes("系統正式值：${group.currentFormalValue ?? \"尚無\"}"));
expect("recognition projection GET is zero-write and contains no compatibility owner repair", getProjectionSource.includes("SELECT * FROM drawing_recognition_sessions") && getProjectionSource.includes("SELECT * FROM drawing_recognition_candidates") && !getProjectionSource.includes(".transaction(") && !getProjectionSource.includes(".execute(") && !getProjectionSource.includes("FOR UPDATE") && !recognitionRepo.includes("assignUniquePartOwner"));
expect("one resolver, command guard, provider invariant and explicit reconciliation replace read self-heal", ownerResolver.includes("resolveRecognitionPartOwner") && recognitionRepo.includes("listPartOwnerTargets") && recognitionRepo.includes("RECOGNITION_PART_OWNER_INVALID") && sqliteSchema.includes("RECOGNITION_PART_OWNER_INVARIANT") && postgresInvariant.includes("dev079_enforce_recognition_part_owner") && ownerReconciliation.includes("APPLY_TARGET_FINGERPRINT_MISMATCH") && ownerSchemaApply.includes("DEV079_SCHEMA_TARGET_FINGERPRINT_MISMATCH") && ownerSchemaApply.includes("DEV079_SCHEMA_REVIEW_FINGERPRINT_MISMATCH") && ownerInvariantQc.includes("schemaFingerprintGateMutantDetected") && ownerInvariantQc.includes("repeated GET projection must be zero-write") && ownerInvariantPostgresQc.includes("concurrent PostgreSQL GET projections must be zero-write"));
expect("recognition treats null, blank and 無 formal values as unset instead of conflicts", recognitionRepo.includes("function isUnsetFormalValue") && recognitionRepo.includes('return !normalized || normalized === "無"') && recognitionRepo.includes("NOT IN ('', '無')") && recognitionRepo.includes("!hasUsableFormalValue") && recognitionRepo.includes("isUnsetFormalValue(currentFormalValue)"));
expect("recognition marks actual draft changes with color and text", recognitionPanel.includes("已修改") && recognitionPanel.includes("is-modified") && styles.includes(".dev079-recognition-candidate.is-modified input"));
expect("unresolved recognition stays outside the file-readiness submission gate", owner.includes("const submitReady = filesReady && fffReady") && owner.includes("disabled={busy || recognitionDirty || !submitReady}") && !owner.match(/const submitReady[^;]*(recognition|ocr)/iu));
expect("workspace removes the non-gating recognition footnote", !recognitionPanel.includes("智慧辨識為輔助工具，不影響此版次是否可送審") && !recognitionPanel.includes("dev079-recognition-footnote"));
expect("owner workspace has unsaved-change guard for payload, file and recognition drafts", owner.includes("useUnsavedChangesGuard(payloadDirty || recognitionDirty || uploadEntries.some") && owner.includes("onDirtyChange={setRecognitionDirty}"));
expect("canonical reviewer route exists", reviewerRoute.includes("ApprovalRequestWorkspace") && reviewer.includes("/api/approvals/requests/") && reviewer.includes("/decisions"));
expect("reviewer workspace keeps immutable evidence and decision authority canonical", reviewer.includes("CanonicalReviewPackageWorkspace") && owner.includes("snapshotMode ? isReviewPackageRecognitionProjection") && reviewPackage.includes("/api/pdm/review-requests/") && reviewPackage.includes('"idempotency-key": crypto.randomUUID()'));
expect("drawing drawer renders the canonical detail projection and only projected actions", drawingWorkbench.includes("PdmEntityDetailDrawer") && drawingWorkbench.includes('presentation.kind === "drawing"') && drawingWorkbench.includes("footerActions") && drawingWorkbench.includes("onAction(detail!.data.row, action)"));
expect("canonical drawing drawer keeps 3D and 2D preview in one adaptive grid", drawingWorkbench.includes("DrawingCanonicalPreview") && drawingWorkbench.includes('dataSection="canonical-drawing-preview"') && styles.includes("grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr))"));
expect("canonical drawing drawer removes redundant preview and attachment headings", drawingWorkbench.includes("title={null} showHeader={false}") && !drawingWorkbench.includes('dataSection="drawing-readonly-preview"') && drawingDetailContent.includes('model.bodyTitle === undefined ? "圖面與附件" : model.bodyTitle'));
expect("readonly candidate drawer removes the redundant readonly explanation", !drawingWorkbench.includes("唯讀說明") && !drawingWorkbench.includes("清單抽屜只保留辨識、狀態與預覽"));
expect("canonical drawing drawer exposes a read-only history drill-in", drawingWorkbench.includes("歷史版次清單") && drawingWorkbench.includes("DrawingHistoryRevision") && drawingWorkbench.includes("canonical-history-readonly") && drawingWorkbench.includes("唯讀 ·"));
expect("unified entity drawer is a presentation shell without domain mutation endpoints", unifiedDrawer.includes("PdmDetailDrawer") && unifiedDrawer.includes('role="complementary"') && !unifiedDrawer.includes("fetch(") && !unifiedDrawer.includes('method: "POST"'));
expect("drawing action resolver routes to a stable canonical owner URL", drawingWorkbench.includes('/numbering/drawings/${encodeURIComponent(row.entityId)}/workspace') && drawingWorkbench.includes("workId"));
expect("drawer detail entry stays available independently from mutation actions", workbenchState.includes("const detailHref = record.entityType") && workbenchState.includes("detailHref,") && workbenchState.includes("actions: resolveCanonicalWorkbenchActions(record, actor)"));
expect("canonical workspace separates navigation from mutation permission", workbenchState.includes("actor.permissions.updateWork") && workbenchState.includes("submitWork: boolean") && owner.includes("const canMutateContent") && owner.includes("const canSubmit") && owner.includes("目前為唯讀"));
expect("readonly workspace hides upload controls and explains the local reason", owner.includes("!canMutateContent") && owner.includes("目前為唯讀；欄位、檔案、預覽與智慧辨識位置和編輯者相同") && owner.includes("canMutateContent ? <div className=\"dev079-workspace-file-upload\""));
expect("cursor and page state recover in URL", drawingWorkbench.includes('url.searchParams.set("cursor"') && drawingWorkbench.includes('url.searchParams.set("direction"') && drawingWorkbench.includes('url.searchParams.set("page"'));
expect("drawing API supports bidirectional cursor", drawingWorkbench.includes('direction: "after" | "before"') && drawingList.includes("previousCursor") && drawingRepo.includes('cursorDirection === "before"'));
expect("file requirement help stays concise", editor.includes("本版次 2D 與 3D 主檔已齊備") && editor.includes("送審前須重新上傳本版次主檔") && editor.includes(".SLDPRT／.SLDASM"));

for (const check of checks) console.log(`${check.condition ? "PASS" : "FAIL"} ${check.name}`);
if (checks.some((check) => !check.condition)) process.exitCode = 1;
