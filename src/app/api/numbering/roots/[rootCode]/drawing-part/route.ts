import { NextResponse } from "next/server";
import { addDrawingAndPartToRootAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import type { DrawingPurposeCode, NumberingItemKind } from "@/lib/repositories/numbering-repository";
import { parseCanonicalNumberingItemKind } from "@/lib/numbering-item-kind";
import { parseNumberingStructureType } from "@/lib/numbering-structure-type";
import { canonicalNumberingCreateApiError } from "@/lib/canonical-numbering-create-error";

export const runtime = "nodejs";

const purposeCodes = new Set(["M", "R"]);
const linkTypes = new Set(["auto", "primary_manufacturing", "reference"]);

export async function POST(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const body = await request.json().catch(() => ({}));
  const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.create", body });
  if (access.response) return access.response;
  const linkAuth = await requireNumberingActionAsync(request, "numbering.link_variant");
  if (linkAuth.response) return linkAuth.response;

  const { rootCode } = await params;

  const purposeCode = normalizeEnum(body.purposeCode ?? body.purpose_code ?? body.drawingPurposeCode ?? body.drawing_purpose_code, purposeCodes) as
    | DrawingPurposeCode
    | undefined;
  const purposeDescription = String(body.purposeDescription ?? body.purpose_description ?? body.drawingPurposeDescription ?? body.drawing_purpose_description ?? "").trim();
  const rawItemKind = body.itemKind ?? body.item_kind;
  const itemKind = parseCanonicalNumberingItemKind(rawItemKind) as NumberingItemKind | undefined;
  const rawStructureType = body.structureType ?? body.structure_type;
  const structureType = parseNumberingStructureType(rawStructureType);
  const customSpecification = body.customSpecification !== undefined || body.custom_specification !== undefined
    ? String(body.customSpecification ?? body.custom_specification ?? "").trim()
    : undefined;
  const seriesCode = body.seriesCode !== undefined || body.series_code !== undefined
    ? String(body.seriesCode ?? body.series_code ?? "").trim()
    : undefined;
  const isUniversal = body.isUniversal !== undefined || body.is_universal !== undefined
    ? Boolean(body.isUniversal ?? body.is_universal)
    : undefined;
  const linkRelationType = normalizeEnum(body.linkRelationType ?? body.link_relation_type ?? "auto", linkTypes) as "auto" | "primary_manufacturing" | "reference" | undefined;

  const errors: string[] = [];
  if (!purposeCode) errors.push("purposeCode must be M or R");
  if (purposeCode === "R" && !purposeDescription) errors.push("purposeDescription is required for reference drawings");
  if ((body.itemKind !== undefined || body.item_kind !== undefined) && !itemKind) errors.push("itemKind must be manufactured or purchased");
  if (rawStructureType !== undefined && !structureType) errors.push("structureType must be single_part or assembly");
  if ((seriesCode?.length ?? 0) > 80) errors.push("seriesCode must be 80 characters or fewer");
  if (!linkRelationType) errors.push("linkRelationType is invalid");
  if (errors.length > 0 || !purposeCode || !linkRelationType) {
    return NextResponse.json({ error: "Invalid contextual drawing and part request", details: errors }, { status: 422 });
  }

  try {
    const result = await addDrawingAndPartToRootAsync({
      companyId: access.company.companyId,
      rootCode: decodeURIComponent(rootCode),
      purposeCode,
      purposeDescription,
      itemKind,
      structureType,
      customSpecification,
      seriesCode,
      isUniversal,
      reason: String(body.reason ?? "").trim(),
      sourceEntrypoint: String(body.sourceEntrypoint ?? body.source_entrypoint ?? "numbering_request_append").trim(),
      idempotencyKey: access.metadata.idempotencyKey,
      linkRelationType,
      createdBy: access.actor.pdmUserId
    }, access.metadata);
    return NextResponse.json({ ...result, pdmCompany: access.company }, { status: result.reusedFromIdempotency ? 200 : 201 });
  } catch (error) {
    const failure = canonicalNumberingCreateApiError(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}

function normalizeEnum(value: unknown, allowed: Set<string>) {
  const text = String(value ?? "").trim();
  return allowed.has(text) ? text : undefined;
}
