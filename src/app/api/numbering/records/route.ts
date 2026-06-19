import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { createNumberingRecordAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import type { DrawingPurposeCode, NumberingItemKind, NumberingPhase } from "@/lib/repositories/numbering-repository";

export const runtime = "nodejs";

const itemKinds = new Set(["purchased", "manufactured", "outsourced", "shared", "custom"]);
const phases = new Set(["EVT", "DVT", "PVT", "Release", "ECR"]);
const purposeCodes = new Set(["MA", "OT"]);

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.create");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const coreName = String(body.coreName ?? body.core_name ?? "").trim();
  const partName = String(body.partName ?? body.part_name ?? "").trim();
  const itemKind = normalizeEnum(body.itemKind ?? body.item_kind, itemKinds) as NumberingItemKind | undefined;
  const developmentPhase = (normalizeEnum(body.developmentPhase ?? body.development_phase, phases) ?? "EVT") as NumberingPhase;
  const drawingRequested = Boolean(body.drawingRequested ?? body.drawing_requested);
  const drawingPurposeCode = normalizeEnum(body.drawingPurposeCode ?? body.drawing_purpose_code, purposeCodes) as DrawingPurposeCode | undefined;
  const customSpecification = String(body.customSpecification ?? body.custom_specification ?? "").trim();
  const isUniversal = itemKind === "shared" || Boolean(body.isUniversal ?? body.is_universal);
  const universalReason = String(body.universalReason ?? body.universal_reason ?? "").trim();

  const errors: string[] = [];
  if (!coreName) errors.push("coreName is required");
  if (!partName) errors.push("partName is required");
  if (!itemKind) errors.push("itemKind is required");
  if (itemKind === "custom" && !customSpecification) errors.push("customSpecification is required for custom items");
  if (isUniversal && !universalReason) errors.push("universalReason is required for shared/universal items");
  if (drawingRequested && !drawingPurposeCode) errors.push("drawingPurposeCode is required when drawingRequested is true");
  if (drawingRequested && drawingPurposeCode === "OT" && !String(body.drawingPurposeDescription ?? body.drawing_purpose_description ?? "").trim()) {
    errors.push("drawingPurposeDescription is required for OT drawings");
  }

  if (errors.length > 0 || !itemKind) {
    return NextResponse.json({ error: "Invalid numbering record request", details: errors }, { status: 400 });
  }

  try {
    const result = await createNumberingRecordAsync({
      companyId: companyResult.company.companyId,
      coreName,
      partName,
      itemKind,
      developmentPhase,
      isUniversal,
      universalReason,
      customSpecification,
      drawingPurposeCode: drawingRequested ? drawingPurposeCode : undefined,
      drawingPurposeDescription: String(body.drawingPurposeDescription ?? body.drawing_purpose_description ?? "").trim(),
      createdBy: auth.user.id
    });
    return NextResponse.json({ ...result, pdmCompany: companyResult.company }, { status: 201 });
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
