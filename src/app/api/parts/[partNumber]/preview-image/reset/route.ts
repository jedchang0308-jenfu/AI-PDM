import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { isPartWorkbenchPreviewGalleryV1Enabled } from "@/lib/number-state-flow-feature";
import { PartPreviewService } from "@/lib/pdm-part-preview";
import { canonicalErrorEnvelope, CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";

export const runtime = "nodejs";

const noStoreHeaders = { "cache-control": "private, no-store" };

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

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const expectedRaw = String(body.expectedRowVersion ?? "").trim();
    if (!/^(0|[1-9][0-9]*)$/u.test(expectedRaw)) {
      throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "缺少有效的預覽圖版本", 400, correlationId);
    }
    const { partNumber } = await params;
    const result = await new PartPreviewService().resetAuto({
      companyId: company.company.companyId,
      partNumber: decodeURIComponent(partNumber),
      actorId: auth.user.id,
      expectedRowVersion: Number(expectedRaw),
      idempotencyKey: request.headers.get("idempotency-key")?.trim() ?? "",
      correlationId
    });
    return NextResponse.json({ data: result, meta: { correlationId } }, { headers: noStoreHeaders });
  } catch (error) {
    return routeError(error);
  }
}
