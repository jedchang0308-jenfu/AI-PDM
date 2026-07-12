import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { addDrawingAndPartToRootAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import type { DrawingPurposeCode, NumberingItemKind } from "@/lib/repositories/numbering-repository";

export const runtime = "nodejs";

const itemKinds = new Set(["purchased", "manufactured", "outsourced", "shared", "custom"]);
const purposeCodes = new Set(["M", "R"]);
const linkTypes = new Set(["auto", "primary_manufacturing", "reference"]);

export async function POST(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.create");
  if (auth.response) return auth.response;
  const linkAuth = await requireNumberingActionAsync(request, "numbering.link_variant");
  if (linkAuth.response) return linkAuth.response;

  const body = await request.json().catch(() => ({}));
  const { rootCode } = await params;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const purposeCode = normalizeEnum(body.purposeCode ?? body.purpose_code ?? body.drawingPurposeCode ?? body.drawing_purpose_code, purposeCodes) as
    | DrawingPurposeCode
    | undefined;
  const purposeDescription = String(body.purposeDescription ?? body.purpose_description ?? body.drawingPurposeDescription ?? body.drawing_purpose_description ?? "").trim();
  const itemKind = normalizeEnum(body.itemKind ?? body.item_kind, itemKinds) as NumberingItemKind | undefined;
  const customSpecification = String(body.customSpecification ?? body.custom_specification ?? "").trim();
  const isUniversal = itemKind === "shared" || Boolean(body.isUniversal ?? body.is_universal);
  const universalReason = String(body.universalReason ?? body.universal_reason ?? "").trim();
  const linkRelationType = normalizeEnum(body.linkRelationType ?? body.link_relation_type ?? "auto", linkTypes) as "auto" | "primary_manufacturing" | "reference" | undefined;

  const errors: string[] = [];
  if (!purposeCode) errors.push("purposeCode must be M or R");
  if (purposeCode === "R" && !purposeDescription) errors.push("purposeDescription is required for reference drawings");
  if (itemKind === "custom" && !customSpecification) errors.push("customSpecification is required for custom items");
  if (isUniversal && !universalReason) errors.push("universalReason is required for shared/universal items");
  if (!linkRelationType) errors.push("linkRelationType is invalid");
  if (errors.length > 0 || !purposeCode || !linkRelationType) {
    return NextResponse.json({ error: "Invalid contextual drawing and part request", details: errors }, { status: 400 });
  }

  try {
    const result = await addDrawingAndPartToRootAsync({
      companyId: companyResult.company.companyId,
      rootCode: decodeURIComponent(rootCode),
      purposeCode,
      purposeDescription,
      itemKind,
      customSpecification,
      isUniversal,
      universalReason,
      reason: String(body.reason ?? "").trim(),
      sourceEntrypoint: String(body.sourceEntrypoint ?? body.source_entrypoint ?? "numbering_request_append").trim(),
      idempotencyKey: String(body.idempotencyKey ?? body.idempotency_key ?? "").trim() || undefined,
      linkRelationType,
      createdBy: auth.user.id
    });
    return NextResponse.json({ ...result, pdmCompany: companyResult.company }, { status: result.reusedFromIdempotency ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add drawing and part number";
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
