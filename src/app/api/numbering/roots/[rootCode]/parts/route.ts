import { NextResponse } from "next/server";
import { addPartNumberToRootAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import type { NumberingItemKind } from "@/lib/repositories/numbering-repository";
import { parseCanonicalNumberingItemKind } from "@/lib/numbering-item-kind";
import { parseNumberingStructureType } from "@/lib/numbering-structure-type";

export const runtime = "nodejs";

const linkTypes = new Set(["auto", "primary_manufacturing", "reference", "none"]);

export async function POST(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const body = await request.json().catch(() => ({}));
  const linkDrawingNumber = String(body.linkDrawingNumber ?? body.link_drawing_number ?? body.drawingNumber ?? body.drawing_number ?? "").trim();
  const linkRelationType = normalizeEnum(body.linkRelationType ?? body.link_relation_type ?? "auto", linkTypes) as "auto" | "primary_manufacturing" | "reference" | "none" | undefined;

  const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.create", body });
  if (access.response) return access.response;
  if (linkDrawingNumber && linkRelationType !== "none") {
    const linkAuth = await requireNumberingActionAsync(request, "numbering.link_variant");
    if (linkAuth.response) return linkAuth.response;
  }

  const { rootCode } = await params;

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
  const errors: string[] = [];
  if ((body.itemKind !== undefined || body.item_kind !== undefined) && !itemKind) errors.push("itemKind must be manufactured or purchased");
  if (rawStructureType !== undefined && !structureType) errors.push("structureType must be single_part or assembly");
  if (itemKind === "purchased" && structureType === "assembly") errors.push("purchased assembly is not supported");
  if ((seriesCode?.length ?? 0) > 80) errors.push("seriesCode must be 80 characters or fewer");
  if (errors.length > 0) return NextResponse.json({ error: "Invalid contextual part request", details: errors }, { status: 422 });

  try {
    const result = await addPartNumberToRootAsync({
      companyId: access.company.companyId,
      rootCode: decodeURIComponent(rootCode),
      itemKind,
      structureType,
      customSpecification,
      seriesCode,
      isUniversal,
      reason: String(body.reason ?? "").trim(),
      sourceEntrypoint: String(body.sourceEntrypoint ?? body.source_entrypoint ?? "root_drawer").trim(),
      idempotencyKey: access.metadata.idempotencyKey,
      linkDrawingNumber: linkDrawingNumber || undefined,
      linkRelationType,
      createdBy: access.actor.pdmUserId
    }, access.metadata);
    return NextResponse.json({ ...result, pdmCompany: access.company }, { status: result.reusedFromIdempotency ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add part number";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}

function normalizeEnum(value: unknown, allowed: Set<string>) {
  const text = String(value ?? "").trim();
  return allowed.has(text) ? text : undefined;
}

function errorStatus(message: string) {
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("MISMATCH") || message.includes("LOCKED") || message.includes("REQUIRED_FOR_FORMAL")) return 409;
  if (message.includes("INVALID") || message.includes("REQUIRED")) return 400;
  return 422;
}
