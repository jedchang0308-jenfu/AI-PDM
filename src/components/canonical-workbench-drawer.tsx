"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { usePdmPermissions } from "@/components/pdm-permission-provider";
import { pdmPermissionFetch as fetch } from "@/lib/pdm-permission-client";
import { errorMessage, readJson } from "@/lib/pdm-workbench-response";
import { DrawingDetailPreview, type DrawingDetailPreviewCard } from "@/components/drawing-detail-preview";
import { isPdfPreviewSlot, type DrawingPreviewSlotModel } from "@/lib/pdm-entity-detail-contract";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";
import { CanonicalPartPreviewSection } from "@/components/canonical-part-preview-section";
import { CanonicalRelationMatrixSection } from "@/components/canonical-relation-matrix-section";
import { CanonicalNumberingCreateAction } from "@/components/canonical-numbering-create-action";
import type { PartPreviewMutationResult } from "@/lib/pdm-part-preview";
import type { CanonicalWorkbenchDetailDto, CanonicalWorkbenchRowDto, CanonicalWorkbenchAction, CanonicalDetailReadModelRow } from "@/lib/pdm-canonical-workbench-contract";

type Detail = CanonicalWorkbenchDetailDto;

type HistoryRevisionDetail = {
  data: {
    revision: { revision: string; lifecycleState: string };
    files: Array<{ id: string; role: string; displayName: string; fileName: string; mimeType: string; fileSize: number; contentHash: string; downloadHref: string; isPrimary: boolean }>;
  };
  meta: { readOnly: true };
};

function DetailFields({ fields }: { fields: Detail["data"]["presentation"]["fields"] }) {
  if (!fields.length) return <p className="canonical-empty">無資料</p>;
  return <dl className="canonical-field-grid">{fields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>;
}

function DetailReadModelRows({ rows }: { rows: CanonicalDetailReadModelRow[] }) {
  return <div className="canonical-detail-read-model-rows">
    <div className="canonical-detail-read-model-header" aria-hidden="true"><span>欄位</span><span>值</span><span /></div>
    {rows.map((row) => <details className="canonical-detail-read-model-row" key={row.key}>
      <summary>
        <span className="canonical-detail-read-model-label">{row.label}</span>
        <strong className="canonical-detail-read-model-value">{row.value}</strong>
        <span className="canonical-detail-read-model-toggle" aria-hidden="true">⌄</span>
      </summary>
      {row.details.length ? <dl className="canonical-detail-read-model-details">{row.details.map((detail) => <div key={`${row.key}-${detail.label}`}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl> : null}
    </details>)}
  </div>;
}

function DetailRecognitionSections({ detail }: { detail: Detail }) {
  const recognition = detail.data.presentation.recognition;
  const sections = detail.data.presentation.kind === "part"
    ? [
        { key: "part-attributes", title: "料號屬性", rows: recognition.partAttributes },
        { key: "controlled-notes", title: "受控註記", rows: recognition.controlledNotes },
        { key: "engineering-evidence", title: "辨識證據", rows: recognition.engineeringEvidence }
      ]
    : [
        { key: "revision-metadata", title: "版次資料", rows: recognition.revisionMetadata },
        { key: "controlled-notes", title: "受控註記", rows: recognition.controlledNotes },
        { key: "engineering-evidence", title: "辨識證據", rows: recognition.engineeringEvidence }
      ];
  return <>{sections.filter((section) => section.rows.length > 0).map((section) => <section className="canonical-recognition-section" data-section={section.key} key={section.key}>
    <h3>{section.title}</h3>
    <DetailReadModelRows rows={section.rows} />
  </section>)}</>;
}

export function DrawingCanonicalPreview({ previews }: { previews: [DrawingPreviewSlotModel, DrawingPreviewSlotModel] }) {
  const cards: DrawingDetailPreviewCard[] = (previews ?? []).map((preview) => ({
    kind: preview.kind,
    title: preview.title,
    fileName: preview.fileName,
    state: preview.state === "queued" || preview.state === "running" ? "pending" : preview.state,
    stateTitle: preview.stateTitle,
    stateText: preview.stateText,
    actions: preview.downloadHref ? <a className="secondary-button" href={preview.downloadHref} download aria-label={`下載原檔 ${preview.fileName ?? preview.title}`}>下載原檔</a> : undefined,
    media: preview.mediaHref ? {
      href: preview.mediaHref,
      mode: preview.kind === "three-d" ? "image" : "document",
      title: preview.title,
      alt: preview.fileName ?? preview.title,
      fullPdf: isPdfPreviewSlot(preview)
    } : undefined
  }));
  return <DrawingDetailPreview cards={cards} title={null} showHeader={false} dataSection="canonical-drawing-preview" />;
}

function DrawingHistoryRevision({ drawingId, revisionId, onBack }: { drawingId: string; revisionId: string; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<HistoryRevisionDetail | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void fetch(`/api/numbering/drawings/${encodeURIComponent(drawingId)}/history/${encodeURIComponent(revisionId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await readJson(response);
        if (!response.ok) throw new Error(errorMessage(body, "歷史版次載入失敗"));
        setData(body as HistoryRevisionDetail);
      })
      .catch((requestError: unknown) => { if (!(requestError instanceof Error && requestError.name === "AbortError")) setError(requestError instanceof Error ? requestError.message : "歷史版次載入失敗"); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [drawingId, revisionId]);
  return <section className="canonical-history-detail" aria-label="歷史版次明細">
    <div className="canonical-drawer-section-heading"><h3>歷史版次明細</h3><button type="button" className="secondary-button" onClick={onBack}>返回版次清單</button></div>
    {loading ? <p className="canonical-drawer-message" role="status">正在載入指定版次…</p> : error ? <p className="canonical-error" role="alert">{error}</p> : data ? <><p className="canonical-history-readonly">唯讀 · {data.data.revision.revision} · {data.data.revision.lifecycleState}</p><ul className="canonical-record-list">{data.data.files.map((file) => <li className="canonical-record" key={file.id}><div><strong>{file.displayName || file.fileName}</strong><small>{file.role} · {file.fileSize} bytes · {file.contentHash || "無雜湊"}</small></div><a className="secondary-button" href={file.downloadHref}>下載</a></li>)}</ul>{!data.data.files.length ? <p className="canonical-empty">此版次沒有可讀檔案。</p> : null}</> : null}
  </section>;
}

function AttachmentManagementAction({ allowed, onClick }: { allowed: boolean; onClick: () => void }) {
  const { state } = usePdmPermissions();
  if (!allowed && state.kind !== "loading" && state.kind !== "unavailable") return null;
  return <button type="button" className="secondary-button" disabled={!allowed}
    aria-busy={state.kind === "loading" ? true : undefined} onClick={onClick}>管理附件</button>;
}

export function CanonicalWorkbenchDrawer({ detail, loading, error, width, canManageAttachments, historyRevisionId, onHistoryRevisionChange, onStartResize, onClose, onAction, onManageAttachments, onPartPreviewCommitted, onBeforeCreate, onMatrixSaved, onMatrixDirtyChange, onOpenMatrixDrawing, onOpenMatrixPart }: {
  detail: Detail | null; loading: boolean; error: string; onClose: () => void;
  width: number; onStartResize: (clientX: number) => void;
  canManageAttachments: boolean;
  historyRevisionId: string | null;
  onHistoryRevisionChange: (revisionId: string | null) => void;
  onAction: (row: CanonicalWorkbenchRowDto, action: CanonicalWorkbenchAction) => void;
  onManageAttachments: (row: CanonicalWorkbenchRowDto) => void;
  onPartPreviewCommitted: (row: CanonicalWorkbenchRowDto, result: PartPreviewMutationResult) => void;
  onBeforeCreate: () => boolean;
  onMatrixSaved: () => void;
  onMatrixDirtyChange: (dirty: boolean) => void;
  onOpenMatrixDrawing: (detailHref: string) => void;
  onOpenMatrixPart: (detailHref: string) => void;
}) {
  const [matrixEditing, setMatrixEditing] = useState(false);
  const presentation = detail?.data.presentation;
  const relationMatrix = presentation?.relationMatrix;
  const relationEditable = Boolean(relationMatrix?.rootId)
    && (relationMatrix?.drawings.length ?? 0) > 0
    && (relationMatrix?.parts.length ?? 0) > 0
    && detail?.data.row.entityType === "drawing"
    && Boolean(detail?.data.row.actions.some((action) => action.key === "edit_relation_matrix"));
  useEffect(() => { setMatrixEditing(false); }, [detail?.data.row.rowKey]);
  const relationAction = relationEditable && !matrixEditing
    ? <button type="button" className="secondary-button canonical-preview-relation-action" data-canonical-relation-edit="true" onClick={() => setMatrixEditing(true)}>編輯關聯</button>
    : null;
  const footerActions = detail?.data.row.actions.filter((action) => action.key !== "edit_relation_matrix") ?? [];
  const partPrimaryActions = footerActions.filter((action) => action.key === "edit" || action.key === "create_change" || action.key === "review");
  const partLifecycleActions = footerActions.filter((action) => !partPrimaryActions.includes(action));
  const renderAction = (action: CanonicalWorkbenchAction) => <button key={action.key} type="button" className={action.key === "cancel_work" ? "danger-button" : action.key === "void_rd" ? "secondary-button" : "primary-button"} onClick={() => onAction(detail!.data.row, action)}>{action.label}</button>;
  const footer = footerActions.length ? <div className="canonical-drawer-actions">{detail?.data.row.entityType === "part" ? <>{partPrimaryActions.map(renderAction)}{partLifecycleActions.length ? <details className="canonical-drawer-more-actions"><summary className="secondary-button">更多操作</summary><div>{partLifecycleActions.map(renderAction)}</div></details> : null}</> : footerActions.map(renderAction)}</div> : undefined;
  return <PdmEntityDetailDrawer
    open
    width={width}
    ariaLabel="工作台明細"
    title={detail?.data.row.code ?? "明細"}
    subtitle={detail?.data.row.name || undefined}
    status={detail ? <span className="canonical-status-pair"><span className={`canonical-layer is-${detail.data.row.layer}`}>{detail.data.row.layerLabel}</span><span className={`canonical-handling is-${detail.data.row.handling}`}>{detail.data.row.handlingLabel}</span></span> : undefined}
    footer={footer}
    entityType={detail?.data.row.entityType}
    entityCode={detail?.data.row.code}
    sourceContext="canonical-workbench"
    detailFamily="canonical"
    resizeLabel="調整明細欄寬度"
    resizeTitle="拖拉調整明細欄寬度"
    keepOpenSelector="[data-canonical-workbench-row='true'], [data-canonical-preview-card='true'], .canonical-modal"
    onStartResize={onStartResize}
    onClose={onClose}
  >
    {loading ? <p className="canonical-drawer-message" role="status">正在載入明細…</p> : error ? <p className="canonical-error" role="alert">{error}</p> : detail && presentation ? <div className="pdm-entity-drawer-body canonical-drawer-body">
       <section><h3>目前資料</h3><DetailFields fields={presentation.fields} /></section>
       <DetailRecognitionSections detail={detail} />
       {presentation.kind === "drawing" ? <DrawingCanonicalPreview previews={presentation.previews} /> : null}
      {presentation.kind === "part" && presentation.preview ? <CanonicalPartPreviewSection
        partNumber={detail.data.row.code}
        preview={presentation.preview}
        control={presentation.previewSourceControl}
        mode="readonly"
        onCommitted={(result) => onPartPreviewCommitted(detail.data.row, result)}
      /> : null}
      {presentation.kind === "part" ? <section data-section="part-attachments"><div className="canonical-drawer-section-heading"><h3>附件</h3><AttachmentManagementAction allowed={canManageAttachments} onClick={() => onManageAttachments(detail.data.row)} /></div>{presentation.files.length ? <ul className="canonical-record-list">{presentation.files.map((file) => <li className="canonical-record canonical-file-record" key={file.id}><span className="canonical-file-name">{file.name}</span><a className="canonical-file-download" href={file.downloadHref} download={file.name} aria-label={`下載 ${file.name}`} title={`下載 ${file.name}`}><Download size={15} aria-hidden="true" /><span>下載</span></a></li>)}</ul> : <p className="canonical-empty">尚無附件</p>}</section> : presentation.files.length ? <section><h3>圖面檔案</h3><ul className="canonical-record-list">{presentation.files.map((file) => <li className="canonical-record canonical-file-record" key={file.id}><span className="canonical-file-name">{file.name}</span><a className="canonical-file-download" href={file.downloadHref} download={file.name} aria-label={`下載 ${file.name}`} title={`下載 ${file.name}`}><Download size={15} aria-hidden="true" /><span>下載</span></a></li>)}</ul></section> : null}
      {presentation.kind === "drawing" || presentation.kind === "part" ? <>
        <CanonicalRelationMatrixSection
        matrix={presentation.relationMatrix}
        contractToken={detail.meta.contractToken}
        mode={presentation.kind === "drawing" ? "manage" : "readonly"}
        editing={matrixEditing}
        onEditingChange={setMatrixEditing}
        editAction={relationAction}
        createAction={presentation.relationMatrix.rootId ? <CanonicalNumberingCreateAction
          surface={presentation.kind}
          rootCode={presentation.relationMatrix.rootCode}
          returnTo={typeof window === "undefined" ? undefined : `${window.location.pathname}${window.location.search}`}
          className="secondary-button"
          onBeforeNavigate={onBeforeCreate}
        /> : null}
        onSaved={onMatrixSaved}
        onDirtyChange={onMatrixDirtyChange}
        onOpenDrawing={onOpenMatrixDrawing}
        onOpenPart={onOpenMatrixPart}
      /></> : null}
      {detail.data.row.handling === "blocked" ? <section className="canonical-blocker"><h3>受阻資訊</h3><p>{detail.data.row.blockerReason || "請系統管理員處理"}</p></section> : null}
      {presentation.kind === "drawing" ? historyRevisionId ? <DrawingHistoryRevision drawingId={presentation.history.find((history) => history.id === historyRevisionId)?.drawingId ?? detail.data.row.entityId} revisionId={historyRevisionId} onBack={() => onHistoryRevisionChange(null)} /> : <section><h3>歷史版次清單</h3>{presentation.history.length ? <ul className="canonical-record-list">{presentation.history.map((history) => <li className="canonical-record" key={history.id}><button type="button" className="canonical-history-open" onClick={() => onHistoryRevisionChange(history.id)}><strong>{history.layerLabel} {history.revision}</strong><span>開啟指定版次</span></button></li>)}</ul> : <p className="canonical-empty">目前沒有歷史版次</p>}</section> : null}
    </div> : null}
  </PdmEntityDetailDrawer>;
}
