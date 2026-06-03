import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { getBomWorkbenchDraftById, getSubmission, saveBomWorkbenchDraftTree } from "@/lib/db";
import { canReadBomDraft } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = getBomWorkbenchDraftById(draftId);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }

  const submission = getSubmission(draft.parent_submission_id);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!canReadBomDraft(auth.user, submission)) return forbidden();

  return NextResponse.json({ draft });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = getBomWorkbenchDraftById(draftId);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }

  const submission = getSubmission(draft.parent_submission_id);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!canReadBomDraft(auth.user, submission)) return forbidden();

  const body = (await request.json().catch(() => ({}))) as {
    lines?: unknown;
    reason?: unknown;
  };
  if (!Array.isArray(body.lines)) {
    return NextResponse.json({ error: "lines array is required" }, { status: 400 });
  }

  try {
    const updated = saveBomWorkbenchDraftTree({
      draftId,
      actorId: auth.user.id,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      lines: body.lines.map((line) => normalizeLineInput(line))
    });
    return NextResponse.json({ draft: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_DRAFT_SAVE_FAILED" }, { status: 400 });
  }
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
