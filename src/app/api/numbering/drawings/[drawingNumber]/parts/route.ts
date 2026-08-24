import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { addPartNumberToRootAsync, searchNumberingRecordsAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import type { NumberingItemKind } from "@/lib/repositories/numbering-repository";
import { parseCanonicalNumberingItemKind } from "@/lib/numbering-item-kind";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ drawingNumber: string }> }) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireNumberingActionAsync(request, "numbering.create");
  if (auth.response) return auth.response;
  const linkAuth = await requireNumberingActionAsync(request, "numbering.link_variant");
  if (linkAuth.response) return linkAuth.response;

  const { drawingNumber } = await params;
  const decodedDrawingNumber = decodeURIComponent(drawingNumber);
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;
  const matches = await searchNumberingRecordsAsync({
    companyId: companyResult.company.companyId,
    query: decodedDrawingNumber,
    entityType: "drawing_number",
    limit: 10
  });
  const match = matches.find((item) => item.drawingNumber === decodedDrawingNumber || item.displayCode === decodedDrawingNumber);
  if (!match) return NextResponse.json({ error: `DRAWING_NUMBER_NOT_FOUND: ${decodedDrawingNumber}` }, { status: 404 });

  const rawItemKind = body.itemKind ?? body.item_kind;
  const itemKind = parseCanonicalNumberingItemKind(rawItemKind) as NumberingItemKind | undefined;
  const seriesCode = String(body.seriesCode ?? body.series_code ?? "").trim();
  const isUniversal = Boolean(body.isUniversal ?? body.is_universal);
  if ((body.itemKind !== undefined || body.item_kind !== undefined) && !itemKind) return NextResponse.json({ error: "itemKind must be manufactured or purchased" }, { status: 400 });
  if (seriesCode.length > 80) return NextResponse.json({ error: "seriesCode must be 80 characters or fewer" }, { status: 400 });

  try {
    const result = await addPartNumberToRootAsync({
      companyId: companyResult.company.companyId,
      rootCode: match.rootCode,
      itemKind,
      isUniversal,
      customSpecification: String(body.customSpecification ?? body.custom_specification ?? "").trim(),
      seriesCode,
      reason: String(body.reason ?? "").trim(),
      sourceEntrypoint: String(body.sourceEntrypoint ?? body.source_entrypoint ?? "drawing_drawer").trim(),
      idempotencyKey: String(body.idempotencyKey ?? body.idempotency_key ?? "").trim() || undefined,
      linkDrawingNumber: decodedDrawingNumber,
      linkRelationType: String(body.linkRelationType ?? body.link_relation_type ?? "auto").trim() === "reference" ? "reference" : "auto",
      createdBy: auth.user.id
    });
    return NextResponse.json({ ...result, pdmCompany: companyResult.company }, { status: result.reusedFromIdempotency ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add linked part number";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("MISMATCH") || message.includes("LOCKED") ? 409 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}
