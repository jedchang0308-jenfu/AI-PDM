import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canEditBomDraftRecordAsync, canReadBomDraftRecordAsync } from "@/lib/bom-create-context";
import { BomDraftEditorVersionConflictError, getBomWorkbenchDraftByIdAsync, saveBomWorkbenchDraftTreeAsync } from "@/lib/bom-workbench-async";
import { bomXmindEditorV2ClientStatus, isBomXmindEditorV2Enabled } from "@/lib/bom-editor-feature";
import { isBomReleasedOnlyRole } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = await getBomWorkbenchDraftByIdAsync(draftId);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }

  if (!(await canReadBomDraftRecordAsync(auth.user, draft))) return forbidden();

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

  if (!(await canEditBomDraftRecordAsync(auth.user, draft))) return forbidden();

  const body = (await request.json().catch(() => ({}))) as {
    lines?: unknown;
    floatingTopics?: unknown;
    expectedEditorVersion?: unknown;
    reason?: unknown;
  };
  if (!Array.isArray(body.lines)) {
    return NextResponse.json({ error: "lines array is required" }, { status: 400 });
  }
  const xmindEditorEnabled = isBomXmindEditorV2Enabled();
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
            parentFloatingTopicId: topic.parent_floating_topic_id,
            nodeType: topic.node_type,
            partNumber: topic.part_number,
            revision: topic.revision,
            groupName: topic.group_name,
            quantity: topic.quantity,
            sequenceNo: topic.sequence_no,
            rootPositionX: topic.root_position_x,
            rootPositionY: topic.root_position_y
          }))
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_DRAFT_SAVE_FAILED" }, { status: 400 });
  }
}

function normalizeFloatingTopicInput(topic: unknown): {
  id?: string;
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
    parentLineId: typeof value.parentLineId === "string" || value.parentLineId === null ? value.parentLineId : undefined,
    nodeType: value.nodeType === "group" ? "group" : "item",
    partNumber: typeof value.partNumber === "string" || value.partNumber === null ? value.partNumber : undefined,
    revision: typeof value.revision === "string" || value.revision === null ? value.revision : undefined,
    groupName: typeof value.groupName === "string" || value.groupName === null ? value.groupName : undefined,
    quantity: typeof value.quantity === "number" || value.quantity === null ? value.quantity : undefined,
    sequenceNo: typeof value.sequenceNo === "number" || value.sequenceNo === null ? value.sequenceNo : undefined
  };
}
