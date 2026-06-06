import { NextResponse } from "next/server";
import { createPartCostProfile, type PartCostType } from "@/lib/db";
import { requireNumberingAction } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

const costTypes = new Set(["outsourced", "in_house", "purchase", "trial", "other"]);

export async function POST(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = requireNumberingAction(request, "numbering.approval.request");
  if (auth.response) return auth.response;

  const { partNumber } = await params;
  const body = await request.json().catch(() => ({}));
  const costType = String(body.costType ?? body.cost_type ?? "").trim();
  if (!costTypes.has(costType)) {
    return NextResponse.json({ error: "costType must be outsourced, in_house, purchase, trial, or other" }, { status: 400 });
  }
  if (!Array.isArray(body.tiers) || body.tiers.length === 0) {
    return NextResponse.json({ error: "tiers array is required" }, { status: 400 });
  }

  try {
    const part = createPartCostProfile({
      partNumber: decodeURIComponent(partNumber),
      costType: costType as PartCostType,
      profileName: String(body.profileName ?? body.profile_name ?? "").trim(),
      currency: String(body.currency ?? "TWD"),
      uom: String(body.uom ?? "pcs"),
      supplierName: stringOrNull(body.supplierName ?? body.supplier_name),
      processName: stringOrNull(body.processName ?? body.process_name),
      costBasis: stringOrNull(body.costBasis ?? body.cost_basis),
      effectiveFrom: stringOrNull(body.effectiveFrom ?? body.effective_from),
      effectiveTo: stringOrNull(body.effectiveTo ?? body.effective_to),
      createdBy: auth.user.id,
      tiers: body.tiers.map((tier: Record<string, unknown>) => ({
        minQty: numberOrUndefined(tier.minQty ?? tier.min_qty),
        maxQty: numberOrNull(tier.maxQty ?? tier.max_qty),
        unitCost: Number(tier.unitCost ?? tier.unit_cost),
        setupCost: numberOrUndefined(tier.setupCost ?? tier.setup_cost),
        leadTimeDays: numberOrNull(tier.leadTimeDays ?? tier.lead_time_days),
        note: stringOrNull(tier.note)
      }))
    });
    return NextResponse.json({ part }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PART_COST_PROFILE_CREATE_FAILED" }, { status: 400 });
  }
}

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function numberOrUndefined(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  return Number(value);
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
}
