/** Canonical BOM units for the current unified BOM domain. */
export const BOM_UOM_CODES = ["EA", "SET", "M", "MM", "L", "ML", "KG", "G"] as const;
export type BomUomCode = (typeof BOM_UOM_CODES)[number];

export const BOM_UOM_LABELS: Record<BomUomCode, string> = {
  EA: "個",
  SET: "組",
  M: "公尺",
  MM: "毫米",
  L: "公升",
  ML: "毫升",
  KG: "公斤",
  G: "公克"
};

export class BomUomError extends Error {
  constructor(public readonly code: "PART_BASE_UOM_INVALID" | "BOM_QUANTITY_INVALID" | "BOM_QUANTITY_PRECISION_INVALID" | "BOM_QUANTITY_RANGE_INVALID") {
    super(code);
    this.name = "BomUomError";
  }
}

export function normalizeBomUomCode(value: unknown): BomUomCode {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!(BOM_UOM_CODES as readonly string[]).includes(normalized)) throw new BomUomError("PART_BASE_UOM_INVALID");
  return normalized as BomUomCode;
}

export function isBomUomCode(value: unknown): value is BomUomCode {
  return typeof value === "string" && (BOM_UOM_CODES as readonly string[]).includes(value.trim().toUpperCase());
}

export type BomQuantity = { canonical: string; scaled6: bigint; scale: number };

/** Parse a plain decimal without passing through binary floating point. */
export function parseBomQuantity(value: unknown): BomQuantity {
  if (typeof value !== "string") throw new BomUomError("BOM_QUANTITY_INVALID");
  const input = value.trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(input)) throw new BomUomError("BOM_QUANTITY_INVALID");
  const [whole, fraction = ""] = input.split(".");
  const trimmedFraction = fraction.replace(/0+$/u, "");
  const scale = trimmedFraction.length;
  if (scale > 6) throw new BomUomError("BOM_QUANTITY_PRECISION_INVALID");
  const digits = `${whole}${trimmedFraction}`;
  const scaled6 = BigInt(digits || "0") * (10n ** BigInt(6 - scale));
  if (scaled6 <= 0n) throw new BomUomError("BOM_QUANTITY_INVALID");
  if (scaled6 > 999999999999999n) throw new BomUomError("BOM_QUANTITY_RANGE_INVALID");
  const canonical = scale === 0
    ? whole
    : `${whole}.${trimmedFraction}`;
  return { canonical, scaled6, scale };
}

export function quantityFromScaled6(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  let scaled: bigint;
  try { scaled = typeof value === "bigint" ? value : BigInt(String(value)); } catch { return null; }
  if (scaled <= 0n || scaled > 999999999999999n) return null;
  const whole = scaled / 1000000n;
  const fraction = (scaled % 1000000n).toString().padStart(6, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function scaled6ToSafeNumber(value: bigint): number {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue)) throw new BomUomError("BOM_QUANTITY_RANGE_INVALID");
  return numberValue;
}
