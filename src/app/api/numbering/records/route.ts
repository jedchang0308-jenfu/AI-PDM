import { NextResponse } from "next/server";
import { createNumberingRecordAsync } from "@/lib/numbering-async";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import type { DrawingPurposeCode, NumberingItemKind } from "@/lib/repositories/numbering-repository";
import { parseCanonicalNumberingItemKind } from "@/lib/numbering-item-kind";
import { parseNumberingStructureType } from "@/lib/numbering-structure-type";

export const runtime = "nodejs";

const purposeCodes = new Set(["M", "R"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const drawingRequested = Boolean(body.drawingRequested ?? body.drawing_requested);
  const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.create", body });
  if (access.response) return access.response;
  if (drawingRequested) {
    const linkAuth = await requireNumberingActionAsync(request, "numbering.link_variant");
    if (linkAuth.response) return linkAuth.response;
  }

  const coreName = String(body.coreName ?? body.core_name ?? "").trim();
  const itemKind = parseCanonicalNumberingItemKind(body.itemKind ?? body.item_kind) as NumberingItemKind | undefined;
  const structureType = parseNumberingStructureType(body.structureType ?? body.structure_type);
  const drawingPurposeCode = normalizeEnum(body.drawingPurposeCode ?? body.drawing_purpose_code, purposeCodes) as DrawingPurposeCode | undefined;
  const customSpecification = String(body.customSpecification ?? body.custom_specification ?? "").trim();
  const seriesCode = String(body.seriesCode ?? body.series_code ?? "").trim();
  const isUniversal = Boolean(body.isUniversal ?? body.is_universal);

  const errors: string[] = [];
  if (!coreName) errors.push("coreName is required");
  if (!itemKind) errors.push("itemKind is required");
  if (!structureType) errors.push("structureType is required");
  if (seriesCode.length > 80) errors.push("seriesCode must be 80 characters or fewer");
  if (drawingRequested && !drawingPurposeCode) errors.push("drawingPurposeCode is required when drawingRequested is true");
  if (itemKind === "manufactured" && !drawingRequested) errors.push("manufactured new roots require a manufacturing drawing");
  if (itemKind === "manufactured" && drawingRequested && drawingPurposeCode !== "M") errors.push("manufactured new roots require drawingPurposeCode M");
  if (itemKind === "purchased" && drawingRequested && drawingPurposeCode !== "R") errors.push("purchased new roots may only add drawingPurposeCode R");
  if (itemKind === "purchased" && structureType === "assembly") errors.push("purchased assembly is not supported");
  if (drawingRequested && drawingPurposeCode === "R" && !String(body.drawingPurposeDescription ?? body.drawing_purpose_description ?? "").trim()) {
    errors.push("drawingPurposeDescription is required for reference drawings");
  }

  if (errors.length > 0 || !itemKind || !structureType) {
    return NextResponse.json({ error: "Invalid numbering record request", details: errors }, { status: 422 });
  }

  try {
    const result = await createNumberingRecordAsync({
      companyId: access.company.companyId,
      coreName,
      itemKind,
      structureType,
      isUniversal,
      customSpecification,
      seriesCode,
      drawingPurposeCode: drawingRequested ? drawingPurposeCode : undefined,
      drawingPurposeDescription: String(body.drawingPurposeDescription ?? body.drawing_purpose_description ?? "").trim(),
      createdBy: access.actor.pdmUserId,
      idempotencyKey: access.metadata.idempotencyKey
    }, access.metadata);
    return NextResponse.json({ ...result, pdmCompany: access.company }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create numbering record";
    const status = message.includes("REQUIRED") ? 400 : message.includes("UNIQUE") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

function normalizeEnum(value: unknown, allowed: Set<string>) {
  const text = String(value ?? "").trim();
  return allowed.has(text) ? text : undefined;
}
