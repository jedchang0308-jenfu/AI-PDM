import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canCreateBomDraftAsync, resolveBomOwnerAccessContextAsync } from "@/lib/bom-create-context";
import { getSubmissionAsync } from "@/lib/submissions-async";
import {
  BomCreateIdempotencyConflictError,
  BomRevisionConflictError,
  BomXlsImportError,
  createBomWorkbenchDraftFromSolidWorksXlsAsync,
  createCanonicalBomDraftFromSolidWorksXlsAsync
} from "@/lib/bom-workbench-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { canReadBomDraftAsync } from "@/lib/permissions";
import { validateRevisionCode } from "@/lib/revision-policy";
import { getStorageUploadPolicy, validateStorageUploadFile } from "@/lib/storage-upload-policy";

export const runtime = "nodejs";

type ImportJsonBody = {
  ownerPartNumberId?: unknown;
  bomRevision?: unknown;
  idempotencyKey?: unknown;
  submissionId?: unknown;
  draftName?: unknown;
  setActive?: unknown;
  originalFilename?: unknown;
  content?: unknown;
  contentBase64?: unknown;
};

type ImportPayload = {
  ownerPartNumberId?: string;
  bomRevision?: string;
  idempotencyKey?: string;
  submissionId: string;
  draftName?: string;
  setActive?: boolean;
  originalFilename: string;
  fileBuffer: Buffer;
  contentType?: string | null;
};

class BomImportPayloadError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly detail: Record<string, unknown> = {}
  ) {
    super(code);
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  let payload: ImportPayload;
  try {
    payload = await readImportPayload(request);
  } catch (error) {
    if (error instanceof BomImportPayloadError) {
      return NextResponse.json({ error: error.code, ...error.detail }, { status: error.status });
    }
    return NextResponse.json({ error: "BOM_XLS_PAYLOAD_INVALID" }, { status: 400 });
  }

  if (payload.ownerPartNumberId || payload.bomRevision) {
    const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
    if (companyResult.response) return companyResult.response;
    const ownerPartNumberId = payload.ownerPartNumberId ?? "";
    const bomRevision = payload.bomRevision ?? "";
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || payload.idempotencyKey || "";
    if (!ownerPartNumberId || !bomRevision || !idempotencyKey) {
      return NextResponse.json({ error: "BOM_CREATE_FIELDS_REQUIRED" }, { status: 422 });
    }
    const revisionError = validateRevisionCode(bomRevision, { lifecycleStage: "release_area" });
    if (revisionError) return NextResponse.json({ error: revisionError }, { status: 422 });
    const accessInput = { user: auth.user, companyId: companyResult.company.companyId, ownerPartNumberId };
    if (!(await canCreateBomDraftAsync(accessInput))) return forbidden();
    const owner = await resolveBomOwnerAccessContextAsync(accessInput);
    if (!owner) return NextResponse.json({ error: "BOM_OWNER_NOT_FOUND" }, { status: 404 });
    const requestFingerprint = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          ownerPartNumberId,
          bomRevision,
          source: "solidworks_xls",
          draftName: payload.draftName ?? "",
          filename: payload.originalFilename,
          sha256: crypto.createHash("sha256").update(payload.fileBuffer).digest("hex")
        })
      )
      .digest("hex");
    try {
      const result = await createCanonicalBomDraftFromSolidWorksXlsAsync({
        companyId: owner.companyId,
        ownerPartNumberId: owner.ownerPartNumberId,
        ownerPartNumber: owner.partNumber,
        legacyItemId: owner.legacyItemId,
        bomRevision,
        actorId: auth.user.id,
        idempotencyKey,
        requestFingerprint,
        draftName: payload.draftName,
        originalFilename: payload.originalFilename,
        fileBuffer: payload.fileBuffer,
        contentType: payload.contentType
      });
      return NextResponse.json(
        {
          ...result,
          draftId: result.draft.id,
          ownerPartNumberId: result.draft.owner_part_number_id,
          bomRevision: result.draft.bom_revision,
          source: result.draft.source,
          receipt: { idempotencyKey, replayed: result.replayed },
          workbenchUrl: `/bom/workbench?draftId=${encodeURIComponent(result.draft.id)}`
        },
        { status: result.replayed ? 200 : 201 }
      );
    } catch (error) {
      if (error instanceof BomCreateIdempotencyConflictError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error instanceof BomRevisionConflictError) {
        return NextResponse.json({ error: error.code }, { status: 409 });
      }
      if (error instanceof BomXlsImportError) {
        return NextResponse.json(
          { error: error.code, message: error.message },
          { status: error.code === "BOM_XLS_FILE_TOO_LARGE" ? 413 : 400 }
        );
      }
      return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_XLS_IMPORT_FAILED" }, { status: 400 });
    }
  }

  if (!payload.submissionId) {
    return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  }

  const submission = await getSubmissionAsync(payload.submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!(await canReadBomDraftAsync(auth.user, submission))) return forbidden();

  try {
    const result = await createBomWorkbenchDraftFromSolidWorksXlsAsync({
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
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "BOM_XLS_FILE_TOO_LARGE" ? 413 : 400 }
      );
    }
    console.error("BOM XLS import failed", { submissionId: payload.submissionId, error });
    return NextResponse.json({ error: "BOM_XLS_IMPORT_FAILED", message: "BOM XLS import failed." }, { status: 500 });
  }
}

async function readImportPayload(request: Request): Promise<ImportPayload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file") ?? form.get("xls") ?? form.get("bom");
    if (!(file instanceof File)) throw new BomImportPayloadError("BOM_XLS_FILE_REQUIRED", 400);
    const originalFilename = file.name || "solidworks-bom.xls";
    assertImportFileAllowed(originalFilename, file.size);
    return {
      ownerPartNumberId: normalizeOptionalString(form.get("ownerPartNumberId") ?? form.get("owner_part_number_id")),
      bomRevision: normalizeOptionalString(form.get("bomRevision") ?? form.get("bom_revision")),
      idempotencyKey: normalizeOptionalString(form.get("idempotencyKey") ?? form.get("idempotency_key")),
      submissionId: String(form.get("submissionId") ?? form.get("submission_id") ?? "").trim(),
      draftName: normalizeOptionalString(form.get("draftName") ?? form.get("draft_name")),
      setActive: parseOptionalBoolean(form.get("setActive") ?? form.get("set_active")),
      originalFilename,
      fileBuffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || null
    };
  }

  const body = (await request.json().catch(() => {
    throw new BomImportPayloadError("BOM_XLS_PAYLOAD_INVALID", 400);
  })) as ImportJsonBody;
  const contentBase64 = typeof body.contentBase64 === "string" ? body.contentBase64.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  const originalFilename =
    typeof body.originalFilename === "string" && body.originalFilename.trim() ? body.originalFilename.trim() : "solidworks-bom.xls";
  const fileBuffer = contentBase64
    ? await decodeImportBase64(contentBase64, originalFilename)
    : encodeImportText(content, originalFilename);
  return {
    ownerPartNumberId: typeof body.ownerPartNumberId === "string" ? body.ownerPartNumberId.trim() : undefined,
    bomRevision: typeof body.bomRevision === "string" ? body.bomRevision.trim() : undefined,
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : undefined,
    submissionId: typeof body.submissionId === "string" ? body.submissionId.trim() : "",
    draftName: typeof body.draftName === "string" ? body.draftName : undefined,
    setActive: typeof body.setActive === "boolean" ? body.setActive : undefined,
    originalFilename,
    fileBuffer,
    contentType: "application/json"
  };
}

function assertImportFileAllowed(filename: string, fileSize: number) {
  const validation = validateStorageUploadFile({ name: filename, size: fileSize }, getStorageUploadPolicy());
  if (validation.ok) return;
  throw new BomImportPayloadError(validation.code, 413, {
    filename: validation.filename,
    fileSize: validation.fileSize,
    maxUploadFileBytes: validation.maxUploadFileBytes,
    policySource: validation.policySource
  });
}

function encodeImportText(content: string, filename: string) {
  const fileSize = Buffer.byteLength(content, "utf8");
  assertImportFileAllowed(filename, fileSize);
  return Buffer.from(content, "utf8");
}

async function decodeImportBase64(contentBase64: string, filename: string) {
  let symbolCount = 0;
  let padding = 0;
  let sawPadding = false;
  for (let index = 0; index < contentBase64.length; index += 1) {
    const char = contentBase64[index];
    if (isBase64Whitespace(char)) continue;
    if (char === "=") {
      sawPadding = true;
      padding += 1;
      if (padding > 2) throw new BomImportPayloadError("BOM_XLS_BASE64_INVALID", 400);
    } else {
      const code = char.charCodeAt(0);
      const validSymbol =
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122) ||
        (code >= 48 && code <= 57) ||
        char === "+" ||
        char === "/";
      if (!validSymbol || sawPadding) throw new BomImportPayloadError("BOM_XLS_BASE64_INVALID", 400);
      symbolCount += 1;
    }
    if (index > 0 && index % (64 * 1024) === 0) await new Promise<void>((resolve) => setImmediate(resolve));
  }
  const encodedSymbolCount = symbolCount + padding;
  if (encodedSymbolCount % 4 === 1 || (padding > 0 && encodedSymbolCount % 4 !== 0)) {
    throw new BomImportPayloadError("BOM_XLS_BASE64_INVALID", 400);
  }
  const decodedSize = Math.floor((encodedSymbolCount * 3) / 4) - padding;
  assertImportFileAllowed(filename, decodedSize);
  const fileBuffer = Buffer.from(contentBase64, "base64");
  if (fileBuffer.byteLength !== decodedSize) throw new BomImportPayloadError("BOM_XLS_BASE64_INVALID", 400);
  return fileBuffer;
}

function isBase64Whitespace(char: string) {
  return char === " " || char === "\t" || char === "\r" || char === "\n" || char === "\f";
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
