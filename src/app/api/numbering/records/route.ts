import { NextResponse } from "next/server";
import { createNumberingRecordAsync } from "@/lib/numbering-async";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import type { DrawingPurposeCode, NumberingItemKind } from "@/lib/repositories/numbering-repository";

export const runtime = "nodejs";

const itemKinds = new Set(["purchased", "manufactured", "outsourced", "shared", "custom"]);
const purposeCodes = new Set(["M", "R"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.create", body });
  if (access.response) return access.response;

  const coreName = String(body.coreName ?? body.core_name ?? "").trim();
  const itemKind = normalizeEnum(body.itemKind ?? body.item_kind, itemKinds) as NumberingItemKind | undefined;
  const drawingRequested = Boolean(body.drawingRequested ?? body.drawing_requested);
  const drawingPurposeCode = normalizeEnum(body.drawingPurposeCode ?? body.drawing_purpose_code, purposeCodes) as DrawingPurposeCode | undefined;
  const customSpecification = String(body.customSpecification ?? body.custom_specification ?? "").trim();
  const seriesCode = String(body.seriesCode ?? body.series_code ?? "").trim();
  const isUniversal = itemKind === "shared" || Boolean(body.isUniversal ?? body.is_universal);
  const universalReason = String(body.universalReason ?? body.universal_reason ?? "").trim();

  const errors: string[] = [];
  if (!coreName) errors.push("coreName is required");
  if (!itemKind) errors.push("itemKind is required");
  if (itemKind === "custom" && !customSpecification) errors.push("customSpecification is required for custom items");
  if (seriesCode.length > 80) errors.push("seriesCode must be 80 characters or fewer");
  if (isUniversal && !universalReason) errors.push("universalReason is required for shared/universal items");
  if (drawingRequested && !drawingPurposeCode) errors.push("drawingPurposeCode is required when drawingRequested is true");
  if (drawingRequested && drawingPurposeCode === "R" && !String(body.drawingPurposeDescription ?? body.drawing_purpose_description ?? "").trim()) {
    errors.push("drawingPurposeDescription is required for reference drawings");
  }

  if (errors.length > 0 || !itemKind) {
    return NextResponse.json({ error: "Invalid numbering record request", details: errors }, { status: 400 });
  }

  try {
    const result = await createNumberingRecordAsync({
      companyId: access.company.companyId,
      coreName,
      itemKind,
      isUniversal,
      universalReason,
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
