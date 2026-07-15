import { NextResponse } from "next/server";
import { addPartNumberToRootAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import type { NumberingItemKind } from "@/lib/repositories/numbering-repository";

export const runtime = "nodejs";

const itemKinds = new Set(["purchased", "manufactured", "outsourced", "shared", "custom"]);
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

  const itemKind = normalizeEnum(body.itemKind ?? body.item_kind, itemKinds) as NumberingItemKind | undefined;
  const customSpecification = String(body.customSpecification ?? body.custom_specification ?? "").trim();
  const seriesCode = String(body.seriesCode ?? body.series_code ?? "").trim();
  const isUniversal = itemKind === "shared" || Boolean(body.isUniversal ?? body.is_universal);
  const universalReason = String(body.universalReason ?? body.universal_reason ?? "").trim();
  const errors: string[] = [];
  if (itemKind === "custom" && !customSpecification) errors.push("customSpecification is required for custom items");
  if (seriesCode.length > 80) errors.push("seriesCode must be 80 characters or fewer");
  if (isUniversal && !universalReason) errors.push("universalReason is required for shared/universal items");
  if (errors.length > 0) return NextResponse.json({ error: "Invalid contextual part request", details: errors }, { status: 400 });

  try {
    const result = await addPartNumberToRootAsync({
      companyId: access.company.companyId,
      rootCode: decodeURIComponent(rootCode),
      itemKind,
      customSpecification,
      seriesCode,
      isUniversal,
      universalReason,
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
