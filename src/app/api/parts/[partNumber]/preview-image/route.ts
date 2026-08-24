import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { isPartWorkbenchPreviewGalleryV1Enabled } from "@/lib/number-state-flow-feature";
import { PART_PREVIEW_IMAGE_MAX_BYTES } from "@/lib/part-preview-image";
import { PartPreviewService, type PartPreviewUploadFile } from "@/lib/pdm-part-preview";
import { canonicalErrorEnvelope, CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";

export const runtime = "nodejs";

const noStoreHeaders = { "cache-control": "private, no-store" };
const multipartAllowance = 1024 * 1024;

function routeError(error: unknown) {
  const resolved = canonicalErrorEnvelope(error);
  return NextResponse.json(resolved.body, { status: resolved.status, headers: noStoreHeaders });
}

export async function POST(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const correlationId = request.headers.get("x-correlation-id")?.trim() || crypto.randomUUID();
  if (!isPartWorkbenchPreviewGalleryV1Enabled()) {
    return routeError(new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號預覽圖功能尚未啟用", 404, correlationId));
  }
  const auth = await requireNumberingActionAsync(request, "numbering.attachments.manage");
  if (auth.response) return auth.response;
  const company = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (company.response) return company.response;

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > PART_PREVIEW_IMAGE_MAX_BYTES + multipartAllowance) {
    return routeError(new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "預覽圖不可超過 10 MiB", 413, correlationId));
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const expectedRaw = String(form.get("expectedRowVersion") ?? "").trim();
    if (!file || typeof file !== "object" || !("arrayBuffer" in file) || !/^(0|[1-9][0-9]*)$/u.test(expectedRaw)) {
      throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "缺少預覽圖或有效版本", 400, correlationId);
    }
    const { partNumber } = await params;
    const result = await new PartPreviewService().setCustom({
      companyId: company.company.companyId,
      partNumber: decodeURIComponent(partNumber),
      actorId: auth.user.id,
      expectedRowVersion: Number(expectedRaw),
      idempotencyKey: request.headers.get("idempotency-key")?.trim() ?? "",
      correlationId,
      file: file as PartPreviewUploadFile
    });
    return NextResponse.json({ data: result, meta: { correlationId } }, { headers: noStoreHeaders });
  } catch (error) {
    return routeError(error);
  }
}
