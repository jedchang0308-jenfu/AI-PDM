/**
 * Canonical base classification for the numbering flow.
 *
 * The stored values are compatibility codes, not human-facing labels:
 * - `manufactured` means the item is made or processed according to a drawing,
 *   regardless of whether the actual work is in-house or outsourced.
 * - `purchased` means a standard item purchased by catalogue/specification.
 *
 * Shared-ness is an independent `isUniversal` attribute.
 */
export type CanonicalNumberingItemKind = "manufactured" | "purchased";

export const CANONICAL_NUMBERING_ITEM_KINDS = ["manufactured", "purchased"] as const;

export const CANONICAL_NUMBERING_ITEM_KIND_OPTIONS: ReadonlyArray<{
  value: CanonicalNumberingItemKind;
  label: string;
}> = [
  { value: "manufactured", label: "依圖製作件" },
  { value: "purchased", label: "外購標準件" },
];

export function parseCanonicalNumberingItemKind(value: unknown): CanonicalNumberingItemKind | undefined {
  const normalized = String(value ?? "").trim();
  return normalized === "manufactured" || normalized === "purchased" ? normalized : undefined;
}

/**
 * Projects only unambiguous legacy values. The old `shared` value described an
 * independent attribute and therefore must not be guessed into either base
 * category during a zero-loss migration.
 */
export function projectCanonicalNumberingItemKind(value: unknown): CanonicalNumberingItemKind | undefined {
  const normalized = String(value ?? "").trim();
  if (normalized === "manufactured" || normalized === "outsourced" || normalized === "custom") return "manufactured";
  if (normalized === "purchased") return "purchased";
  return undefined;
}

export function canonicalNumberingItemKindLabel(value: unknown): string {
  const kind = projectCanonicalNumberingItemKind(value);
  return CANONICAL_NUMBERING_ITEM_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? "待分類";
}
