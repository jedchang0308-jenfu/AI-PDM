export const NUMBERING_RULE_V1_ID = "numbering-rule-v1";
export const NUMBERING_RULE_V2_ID = "numbering-rule-v2";
export const NUMBERING_RULE_V3_ID = "numbering-rule-v3-alpha-root";

export type DrawingPurposeCode = "MA" | "OT" | "M" | "R";
export type V2DrawingPurposeCode = "M" | "R";
export const ACTIVE_DRAWING_PURPOSE_CODES = ["M", "R"] as const satisfies readonly V2DrawingPurposeCode[];
export type ActiveDrawingPurposeCode = typeof ACTIVE_DRAWING_PURPOSE_CODES[number];
export type NumberingIdentityKind = "root" | "part" | "drawing" | "unknown";

const V3_ROOT_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MANUFACTURING_PURPOSE_CODES = new Set<DrawingPurposeCode>(["MA", "M"]);
const REFERENCE_PURPOSE_CODES = new Set<DrawingPurposeCode>(["OT", "R"]);

export function isCompactNumberingRule(ruleVersionId: string): boolean {
  return ruleVersionId === NUMBERING_RULE_V2_ID || ruleVersionId === NUMBERING_RULE_V3_ID;
}

export function normalizeDrawingPurposeCode(value: string): DrawingPurposeCode | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === "MA" || normalized === "OT" || normalized === "M" || normalized === "R") return normalized;
  return null;
}

export function isManufacturingDrawingPurpose(code: string | null | undefined): boolean {
  const normalized = code ? normalizeDrawingPurposeCode(code) : null;
  return normalized ? MANUFACTURING_PURPOSE_CODES.has(normalized) : false;
}

export function isReferenceDrawingPurpose(code: string | null | undefined): boolean {
  const normalized = code ? normalizeDrawingPurposeCode(code) : null;
  return normalized ? REFERENCE_PURPOSE_CODES.has(normalized) : false;
}

export function isV2DrawingPurposeCode(code: string | null | undefined): code is V2DrawingPurposeCode {
  return code === "M" || code === "R";
}

export function displayDrawingPurposeLabel(code: string | null | undefined): string {
  if (isManufacturingDrawingPurpose(code)) return "製造圖";
  if (isReferenceDrawingPurpose(code)) return "參考圖";
  return "未分類圖";
}

export function formatV1RootCode(value: number): string {
  if (value < 1 || value > 9999) throw new Error(`ROOT_SEQUENCE_OUT_OF_RANGE: ${value}`);
  return value.toString().padStart(4, "0");
}

export function formatV2RootCode(value: number): string {
  if (value < 1 || value > 99999) throw new Error(`ROOT_SEQUENCE_OUT_OF_RANGE: ${value}`);
  return value.toString().padStart(5, "0");
}

export function formatV3RootCode(value: number): string {
  return rootOrdinalToV3(value);
}

export function rootOrdinalToV3(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > V3_ROOT_LETTERS.length * 9999) {
    throw new Error(`ROOT_SEQUENCE_OUT_OF_RANGE: ${value}`);
  }
  const letterIndex = Math.floor((value - 1) / 9999);
  const sequence = ((value - 1) % 9999) + 1;
  return `${V3_ROOT_LETTERS[letterIndex]}${sequence.toString().padStart(4, "0")}`;
}

export function v3RootToOrdinal(rootCode: string): number {
  const normalized = rootCode.trim().toUpperCase();
  if (!isV3RootCode(normalized)) throw new Error(`INVALID_V3_ROOT_CODE: ${rootCode}`);
  const letterIndex = V3_ROOT_LETTERS.indexOf(normalized[0]);
  const sequence = Number.parseInt(normalized.slice(1), 10);
  return letterIndex * 9999 + sequence;
}

export function rootCodeToV3Ordinal(rootCode: string): number | null {
  const normalized = rootCode.trim().toUpperCase();
  if (isV3RootCode(normalized)) return v3RootToOrdinal(normalized);
  if (/^[0-9]{4,5}$/.test(normalized)) {
    const sequence = Number.parseInt(normalized, 10);
    return sequence >= 1 && sequence <= V3_ROOT_LETTERS.length * 9999 ? sequence : null;
  }
  return null;
}

export function compareRootCodesByPolicy(a: string, b: string): number {
  const aOrdinal = rootCodeToV3Ordinal(a);
  const bOrdinal = rootCodeToV3Ordinal(b);
  if (aOrdinal !== null && bOrdinal !== null) return aOrdinal - bOrdinal;
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

export function formatRootCodeForRule(value: number, ruleVersionId: string): string {
  if (ruleVersionId === NUMBERING_RULE_V3_ID) return formatV3RootCode(value);
  return ruleVersionId === NUMBERING_RULE_V2_ID ? formatV2RootCode(value) : formatV1RootCode(value);
}

export function formatV1PartSequence(value: number): string {
  if (value < 0 || value > 999) throw new Error(`PART_SEQUENCE_OUT_OF_RANGE: ${value}`);
  return value.toString().padStart(3, "0");
}

export function formatV2Sequence(value: number, label = "SEQUENCE"): string {
  if (value < 1 || value > 99) throw new Error(`${label}_OUT_OF_RANGE: ${value}`);
  return value.toString().padStart(2, "0");
}

export function formatPartSequenceForRule(value: number, ruleVersionId: string): string {
  return isCompactNumberingRule(ruleVersionId) ? formatV2Sequence(value, "PART_SEQUENCE") : formatV1PartSequence(value);
}

export function formatDrawingSequenceForRule(value: number, ruleVersionId: string): string {
  return isCompactNumberingRule(ruleVersionId) ? formatV2Sequence(value, "DRAWING_SEQUENCE") : formatV1DrawingSequence(value);
}

export function formatV1DrawingSequence(value: number): string {
  if (value < 1 || value > 9) throw new Error(`DRAWING_SEQUENCE_OUT_OF_RANGE: ${value}`);
  return value.toString();
}

export function formatPartNumberForRule(rootCode: string, sequenceCode: string, ruleVersionId: string): string {
  return isCompactNumberingRule(ruleVersionId) ? `${rootCode}-P${sequenceCode}` : `P-${rootCode}-${sequenceCode}`;
}

export function formatDrawingNumberForRule(rootCode: string, purposeCode: DrawingPurposeCode, sequenceCode: string, ruleVersionId: string): string {
  return isCompactNumberingRule(ruleVersionId) ? `${rootCode}-${purposeCode}${sequenceCode}` : `D-${rootCode}-${purposeCode}${sequenceCode}`;
}

export function assertNormalCreatePurposeCode(code: DrawingPurposeCode | undefined): asserts code is V2DrawingPurposeCode | undefined {
  if (code === undefined) return;
  if (!isV2DrawingPurposeCode(code)) throw new Error("INVALID_DRAWING_PURPOSE_CODE");
}

export function isPurposeAllowedForRule(code: DrawingPurposeCode, ruleVersionId: string): boolean {
  return isCompactNumberingRule(ruleVersionId) ? isV2DrawingPurposeCode(code) : code === "MA" || code === "OT";
}

export function assertPurposeAllowedForRule(code: DrawingPurposeCode, ruleVersionId: string): void {
  if (!isPurposeAllowedForRule(code, ruleVersionId)) throw new Error("INVALID_DRAWING_PURPOSE_CODE");
}

export function isV2RootCode(value: string): boolean {
  return /^[0-9]{5}$/.test(value);
}

export function isV3RootCode(value: string): boolean {
  return /^[A-Z][0-9]{4}$/.test(value) && !value.endsWith("0000");
}

export function isV2PartNumber(value: string): boolean {
  return /^[0-9]{5}-P[0-9]{2}$/.test(value) && !value.endsWith("P00");
}

export function isV2DrawingNumber(value: string): boolean {
  return /^[0-9]{5}-[MR][0-9]{2}$/.test(value) && !/[MR]00$/.test(value);
}

export function isV3PartNumber(value: string): boolean {
  return /^[A-Z][0-9]{4}-P[0-9]{2}$/.test(value) && !/[A-Z]0000-P[0-9]{2}$/.test(value) && !value.endsWith("P00");
}

export function isV3DrawingNumber(value: string): boolean {
  return /^[A-Z][0-9]{4}-[MR][0-9]{2}$/.test(value) && !/[A-Z]0000-[MR][0-9]{2}$/.test(value) && !/[MR]00$/.test(value);
}

export function parseNumberingIdentity(value: string): { kind: NumberingIdentityKind; rootCode: string | null; purposeCode?: DrawingPurposeCode; sequenceCode?: string } {
  const text = value.trim().toUpperCase();
  if (isV3RootCode(text)) return { kind: "root", rootCode: text };
  const v3Part = /^([A-Z][0-9]{4})-P([0-9]{2})$/.exec(text);
  if (v3Part && isV3PartNumber(text)) return { kind: "part", rootCode: v3Part[1], sequenceCode: v3Part[2] };
  const v3Drawing = /^([A-Z][0-9]{4})-([MR])([0-9]{2})$/.exec(text);
  if (v3Drawing && isV3DrawingNumber(text)) return { kind: "drawing", rootCode: v3Drawing[1], purposeCode: v3Drawing[2] as DrawingPurposeCode, sequenceCode: v3Drawing[3] };
  if (isV2RootCode(text)) return { kind: "root", rootCode: text };
  const v2Part = /^([0-9]{5})-P([0-9]{2})$/.exec(text);
  if (v2Part) return { kind: "part", rootCode: v2Part[1], sequenceCode: v2Part[2] };
  const v2Drawing = /^([0-9]{5})-([MR])([0-9]{2})$/.exec(text);
  if (v2Drawing) return { kind: "drawing", rootCode: v2Drawing[1], purposeCode: v2Drawing[2] as DrawingPurposeCode, sequenceCode: v2Drawing[3] };
  const v1Part = /^P-([0-9]{4})-([0-9]{3})$/.exec(text);
  if (v1Part) return { kind: "part", rootCode: v1Part[1], sequenceCode: v1Part[2] };
  const v1Drawing = /^D-([0-9]{4})-(MA|OT)([0-9])$/.exec(text);
  if (v1Drawing) return { kind: "drawing", rootCode: v1Drawing[1], purposeCode: v1Drawing[2] as DrawingPurposeCode, sequenceCode: v1Drawing[3] };
  return { kind: "unknown", rootCode: null };
}
