import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { addDrawingNumberToRootAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import type { DrawingPurposeCode } from "@/lib/repositories/numbering-repository";

export const runtime = "nodejs";

const purposeCodes = new Set(["M", "R"]);
const linkTypes = new Set(["auto", "primary_manufacturing", "reference", "none"]);

export async function POST(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const body = await request.json().catch(() => ({}));
  const linkPartNumber = String(body.linkPartNumber ?? body.link_part_number ?? body.partNumber ?? body.part_number ?? "").trim();
  const linkRelationType = normalizeEnum(body.linkRelationType ?? body.link_relation_type ?? "auto", linkTypes) as
    | "auto"
    | "primary_manufacturing"
    | "reference"
    | "none"
    | undefined;

  const auth = await requireNumberingActionAsync(request, "numbering.create");
  if (auth.response) return auth.response;
  if (linkPartNumber && linkRelationType !== "none") {
    const linkAuth = await requireNumberingActionAsync(request, "numbering.link_variant");
    if (linkAuth.response) return linkAuth.response;
  }

  const { rootCode } = await params;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const purposeCode = normalizeEnum(body.purposeCode ?? body.purpose_code ?? body.drawingPurposeCode ?? body.drawing_purpose_code, purposeCodes) as
    | DrawingPurposeCode
    | undefined;
  const purposeDescription = String(body.purposeDescription ?? body.purpose_description ?? body.drawingPurposeDescription ?? body.drawing_purpose_description ?? "").trim();
  const errors: string[] = [];
  if (!purposeCode) errors.push("purposeCode must be M or R");
  if (purposeCode === "R" && !purposeDescription) errors.push("purposeDescription is required for reference drawings");
  if (errors.length > 0 || !purposeCode) return NextResponse.json({ error: "Invalid contextual drawing request", details: errors }, { status: 400 });

  try {
    const result = await addDrawingNumberToRootAsync({
      companyId: companyResult.company.companyId,
      rootCode: decodeURIComponent(rootCode),
      purposeCode,
      purposeDescription,
      reason: String(body.reason ?? "").trim(),
      sourceEntrypoint: String(body.sourceEntrypoint ?? body.source_entrypoint ?? "root_drawer").trim(),
      idempotencyKey: String(body.idempotencyKey ?? body.idempotency_key ?? "").trim() || undefined,
      linkPartNumber: linkPartNumber || undefined,
      linkRelationType,
      createdBy: auth.user.id
    });
    return NextResponse.json({ ...result, pdmCompany: companyResult.company }, { status: result.reusedFromIdempotency ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add drawing number";
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
