import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { BomXlsImportError, createBomWorkbenchDraftFromSolidWorksXls, getSubmission } from "@/lib/db";
import { canReadBomDraft } from "@/lib/permissions";

export const runtime = "nodejs";

type ImportJsonBody = {
  submissionId?: unknown;
  draftName?: unknown;
  setActive?: unknown;
  originalFilename?: unknown;
  content?: unknown;
  contentBase64?: unknown;
};

type ImportPayload = {
  submissionId: string;
  draftName?: string;
  setActive?: boolean;
  originalFilename: string;
  fileBuffer: Buffer;
  contentType?: string | null;
};

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  let payload: ImportPayload;
  try {
    payload = await readImportPayload(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_XLS_PAYLOAD_INVALID" }, { status: 400 });
  }

  if (!payload.submissionId) {
    return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  }

  const submission = getSubmission(payload.submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!canReadBomDraft(auth.user, submission)) return forbidden();

  try {
    const result = createBomWorkbenchDraftFromSolidWorksXls({
      submissionId: payload.submissionId,
      actorId: auth.user.id,
      draftName: payload.draftName,
      setActive: payload.setActive,
      originalFilename: payload.originalFilename,
      fileBuffer: payload.fileBuffer,
      contentType: payload.contentType
    });
    if (!result) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof BomXlsImportError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_XLS_IMPORT_FAILED" }, { status: 400 });
  }
}

async function readImportPayload(request: Request): Promise<ImportPayload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file") ?? form.get("xls") ?? form.get("bom");
    if (!(file instanceof File)) throw new Error("file is required");
    return {
      submissionId: String(form.get("submissionId") ?? form.get("submission_id") ?? "").trim(),
      draftName: normalizeOptionalString(form.get("draftName") ?? form.get("draft_name")),
      setActive: parseOptionalBoolean(form.get("setActive") ?? form.get("set_active")),
      originalFilename: file.name || "solidworks-bom.xls",
      fileBuffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || null
    };
  }

  const body = (await request.json().catch(() => ({}))) as ImportJsonBody;
  const contentBase64 = typeof body.contentBase64 === "string" ? body.contentBase64.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  const fileBuffer = contentBase64 ? Buffer.from(contentBase64, "base64") : Buffer.from(content, "utf8");
  return {
    submissionId: typeof body.submissionId === "string" ? body.submissionId.trim() : "",
    draftName: typeof body.draftName === "string" ? body.draftName : undefined,
    setActive: typeof body.setActive === "boolean" ? body.setActive : undefined,
    originalFilename: typeof body.originalFilename === "string" && body.originalFilename.trim() ? body.originalFilename.trim() : "solidworks-bom.xls",
    fileBuffer,
    contentType: "application/json"
  };
}

function normalizeOptionalString(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function parseOptionalBoolean(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return undefined;
}
