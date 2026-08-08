export type PartCostTierInput = {
  minQty?: number;
  maxQty?: number | null;
  unitCost: number;
  setupCost?: number;
  leadTimeDays?: number | null;
  note?: string | null;
};

export function normalizePositiveInteger(value: number | null | undefined, fallback: number, errorCode: string) {
  const normalized = Math.floor(value ?? fallback);
  if (!Number.isFinite(normalized) || normalized < 1) throw new Error(errorCode);
  return normalized;
}

export function normalizePartCostTiers(input: PartCostTierInput[]) {
  if (input.length === 0) throw new Error("PART_COST_PROFILE_REQUIRES_TIER");
  const tiers = input
    .map((tier, index) => {
      const minQty = normalizePositiveInteger(tier.minQty, index === 0 ? 1 : index + 1, "INVALID_PART_COST_TIER_MIN_QTY");
      const maxQty = tier.maxQty === null || tier.maxQty === undefined ? null : normalizePositiveInteger(tier.maxQty, minQty, "INVALID_PART_COST_TIER_MAX_QTY");
      if (maxQty !== null && maxQty < minQty) throw new Error("INVALID_PART_COST_TIER_RANGE");
      if (!Number.isFinite(tier.unitCost) || tier.unitCost < 0) throw new Error("INVALID_PART_COST_TIER_UNIT_COST");
      const setupCost = tier.setupCost ?? 0;
      if (!Number.isFinite(setupCost) || setupCost < 0) throw new Error("INVALID_PART_COST_TIER_SETUP_COST");
      const leadTimeDays = tier.leadTimeDays === null || tier.leadTimeDays === undefined ? null : Math.floor(tier.leadTimeDays);
      if (leadTimeDays !== null && (!Number.isFinite(leadTimeDays) || leadTimeDays < 0)) throw new Error("INVALID_PART_COST_TIER_LEAD_TIME");
      return {
        minQty,
        maxQty,
        unitCost: tier.unitCost,
        setupCost,
        leadTimeDays,
        note: tier.note
      };
    })
    .sort((a, b) => a.minQty - b.minQty);

  let previousMax: number | null | "open" = null;
  for (const tier of tiers) {
    if (previousMax === "open") throw new Error("PART_COST_TIER_RANGE_OVERLAP");
    if (previousMax !== null && tier.minQty <= previousMax) throw new Error("PART_COST_TIER_RANGE_OVERLAP");
    if (tier.maxQty === null) previousMax = "open";
    else previousMax = tier.maxQty;
  }
  return tiers;
}
