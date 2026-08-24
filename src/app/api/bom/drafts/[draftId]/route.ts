import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canEditBomDraftRecordAsync, canReadBomDraftRecordAsync } from "@/lib/bom-create-context";
import { BomDraftEditorVersionConflictError, getBomWorkbenchDraftByIdAsync, saveBomWorkbenchDraftTreeAsync } from "@/lib/bom-workbench-async";
import { bomXmindEditorV2ClientStatus, isBomXmindEditorV2Enabled } from "@/lib/bom-editor-feature";
import { isBomReleasedOnlyRole } from "@/lib/permissions";
import { isAssemblySharedBomV1Enabled } from "@/lib/assembly-bom-feature";
import { SharedBomError } from "@/lib/bom-shared-structure";
import { authorizeSharedBomHttpAsync } from "@/lib/bom-shared-http";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const contextParentPartNumberId = new URL(request.url).searchParams.get("parentPartNumberId")?.trim() || null;
  const draft = await getBomWorkbenchDraftByIdAsync(draftId, contextParentPartNumberId);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }

  if (draft.definition_id) {
    const access = await authorizeSharedBomHttpAsync({
      user: auth.user,
      draftId,
      capability: draft.status === "Released" || draft.status === "Obsolete" ? "released_projection_read" : "draft_evidence_read",
      exactParentPartNumberId: contextParentPartNumberId
    });
    if (access.response) return access.response;
  } else if (!(await canReadBomDraftRecordAsync(auth.user, draft))) return forbidden();

  return NextResponse.json({
    draft,
    editorCapability: bomXmindEditorV2ClientStatus(),
    accessCapability: { releasedReadOnly: isBomReleasedOnlyRole(auth.user) }
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = await getBomWorkbenchDraftByIdAsync(draftId);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }

  if (draft.definition_id) {
    const access = await authorizeSharedBomHttpAsync({ user: auth.user, draftId, capability: "edit" });
    if (access.response) return access.response;
  } else if (!(await canEditBomDraftRecordAsync(auth.user, draft))) return forbidden();

  const body = (await request.json().catch(() => ({}))) as {
    lines?: unknown;
    floatingTopics?: unknown;
    components?: unknown;
    expectedEditorVersion?: unknown;
    reason?: unknown;
  };
  if (!Array.isArray(body.lines)) {
    return NextResponse.json({ error: "lines array is required" }, { status: 400 });
  }
  const xmindEditorEnabled = isBomXmindEditorV2Enabled();
  const sharedDraft = Boolean(draft.definition_id);
  if (sharedDraft && !isAssemblySharedBomV1Enabled()) {
    return sharedError("BOM_SHARED_STRUCTURE_READ_ONLY", 409);
  }
  if (!xmindEditorEnabled && draft.floating_topics.length > 0) {
    return NextResponse.json(
      {
        error: "BOM_EDITOR_V2_REQUIRED",
        message: "此 BOM 草稿包含未納入 BOM 的 Floating Topic，舊版編輯器不可保存，以避免靜默遺失資料。"
      },
      { status: 409 }
    );
  }
  if (xmindEditorEnabled && !Array.isArray(body.floatingTopics)) {
    return NextResponse.json({ error: "floatingTopics array is required" }, { status: 400 });
  }
  if (sharedDraft && !Array.isArray(body.components)) return sharedError("BOM_COMPONENTS_REQUIRED", 422);
  if (xmindEditorEnabled && (!Number.isInteger(body.expectedEditorVersion) || Number(body.expectedEditorVersion) < 0)) {
    return NextResponse.json({ error: "expectedEditorVersion is required" }, { status: 400 });
  }

  try {
    const updated = await saveBomWorkbenchDraftTreeAsync({
      draftId,
      actorId: auth.user.id,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      expectedEditorVersion: xmindEditorEnabled ? Number(body.expectedEditorVersion) : draft.editor_version,
      lines: body.lines.map((line) => ({
        ...normalizeLineInput(line),
        revision: draft.identity_authority === "canonical_part_number" ? null : normalizeLineInput(line).revision
      })),
      floatingTopics: xmindEditorEnabled
        ? (body.floatingTopics as unknown[]).map(normalizeFloatingTopicInput)
        : draft.floating_topics.map((topic) => ({
            id: topic.id,
            logicalLineId: topic.logical_line_id ?? undefined,
            parentFloatingTopicId: topic.parent_floating_topic_id,
            nodeType: topic.node_type,
            partNumber: topic.part_number,
            revision: topic.revision,
            groupName: topic.group_name,
            quantity: topic.quantity,
            sequenceNo: topic.sequence_no,
            rootPositionX: topic.root_position_x,
            rootPositionY: topic.root_position_y
          })),
      components: sharedDraft ? (body.components as unknown[]).map(normalizeComponentInput) : undefined
    });
    return NextResponse.json({ draft: updated });
  } catch (error) {
    if (error instanceof BomDraftEditorVersionConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          message: "這份 BOM 已在其他分頁更新，請重新載入後再套用變更。",
          expectedEditorVersion: error.expectedVersion,
          actualEditorVersion: error.actualVersion
        },
        { status: 409 }
      );
    }
    if (error instanceof SharedBomError) return sharedError(error.code, error.status, error.details);
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_DRAFT_SAVE_FAILED" }, { status: 400 });
  }
}

function normalizeFloatingTopicInput(topic: unknown): {
  id?: string;
  logicalLineId?: string;
  parentFloatingTopicId?: string | null;
  nodeType: "item" | "group";
  partNumber?: string | null;
  revision?: string | null;
  groupName?: string | null;
  quantity?: number | null;
  sequenceNo?: number | null;
  rootPositionX?: number | null;
  rootPositionY?: number | null;
} {
  const value = typeof topic === "object" && topic !== null ? (topic as Record<string, unknown>) : {};
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    logicalLineId: typeof value.logicalLineId === "string" ? value.logicalLineId : undefined,
    parentFloatingTopicId:
      typeof value.parentFloatingTopicId === "string" || value.parentFloatingTopicId === null
        ? value.parentFloatingTopicId
        : undefined,
    nodeType: value.nodeType === "group" ? "group" : "item",
    partNumber: typeof value.partNumber === "string" || value.partNumber === null ? value.partNumber : undefined,
    revision: typeof value.revision === "string" || value.revision === null ? value.revision : undefined,
    groupName: typeof value.groupName === "string" || value.groupName === null ? value.groupName : undefined,
    quantity: typeof value.quantity === "number" || value.quantity === null ? value.quantity : undefined,
    sequenceNo: typeof value.sequenceNo === "number" || value.sequenceNo === null ? value.sequenceNo : undefined,
    rootPositionX: typeof value.rootPositionX === "number" || value.rootPositionX === null ? value.rootPositionX : undefined,
    rootPositionY: typeof value.rootPositionY === "number" || value.rootPositionY === null ? value.rootPositionY : undefined
  };
}

function normalizeLineInput(line: unknown): {
  id?: string;
  logicalLineId?: string;
  parentLineId?: string | null;
  nodeType: "item" | "group";
  partNumber?: string | null;
  revision?: string | null;
  groupName?: string | null;
  quantity?: number | null;
  sequenceNo?: number | null;
} {
  const value = typeof line === "object" && line !== null ? (line as Record<string, unknown>) : {};
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    logicalLineId: typeof value.logicalLineId === "string" ? value.logicalLineId : undefined,
    parentLineId: typeof value.parentLineId === "string" || value.parentLineId === null ? value.parentLineId : undefined,
    nodeType: value.nodeType === "group" ? "group" : "item",
    partNumber: typeof value.partNumber === "string" || value.partNumber === null ? value.partNumber : undefined,
    revision: typeof value.revision === "string" || value.revision === null ? value.revision : undefined,
    groupName: typeof value.groupName === "string" || value.groupName === null ? value.groupName : undefined,
    quantity: typeof value.quantity === "number" || value.quantity === null ? value.quantity : undefined,
    sequenceNo: typeof value.sequenceNo === "number" || value.sequenceNo === null ? value.sequenceNo : undefined
  };
}

function normalizeComponentInput(component: unknown) {
  const value = typeof component === "object" && component !== null ? component as Record<string, unknown> : {};
  return {
    nodeId: typeof value.nodeId === "string" ? value.nodeId : "",
    logicalLineId: typeof value.logicalLineId === "string" ? value.logicalLineId : "",
    nodeLocation: value.nodeLocation === "floating" ? "floating" as const : "tree" as const,
    componentMode: value.componentMode === "by_parent" ? "by_parent" as const : "fixed" as const,
    childPartNumberIds: Array.isArray(value.childPartNumberIds)
      ? value.childPartNumberIds.filter((entry): entry is string => typeof entry === "string")
      : [],
    parentSelections: Array.isArray(value.parentSelections)
      ? value.parentSelections.map((entry) => {
          const selection = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
          return {
            parentPartNumberId: typeof selection.parentPartNumberId === "string" ? selection.parentPartNumberId : "",
            childPartNumberId: typeof selection.childPartNumberId === "string" ? selection.childPartNumberId : ""
          };
        })
      : []
  };
}

function sharedError(code: string, status: number, details: Record<string, unknown> = {}) {
  return NextResponse.json({
    error: code,
    message: code === "BOM_SHARED_STRUCTURE_READ_ONLY" ? "共用 BOM 目前只能檢視" : "BOM 結構資料不完整",
    details,
    correlationId: crypto.randomUUID()
  }, { status });
}
