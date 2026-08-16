/**
 * User-facing vocabulary for numbering workspaces.
 *
 * Internal reservation states and identifiers remain unchanged.  This module
 * only owns the human-readable projection so API, history, and UI surfaces do
 * not invent a second set of labels.
 */
export const NUMBERING_VOCABULARY = {
  generic: "編號",
  drawing: "圖號",
  part: "料號",
  drawingPart: "圖號與料號",
  root: "圖料根號",
  sameRootPart: "同根料號",
  application: "編號申請",
  preparation: "首版準備"
} as const;

const NUMBERING_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/同主根號料號/g, "同根料號"],
  [/同主根料號/g, "同根料號"],
  [/主根號/g, "圖料根號"],
  [/主根/g, "圖料根號"],
  [/候選圖料與首版/g, "圖料與首版"],
  [/候選圖料號/g, "圖料號"],
  [/候選圖號/g, "圖號"],
  [/候選料號/g, "料號"],
  [/候選首版/g, "首版準備"],
  [/候選版次/g, "版次"],
  [/候選關係/g, "關係"],
  [/候選工作/g, "工作"],
  [/候選欄位/g, "待確認欄位"],
  [/候選值/g, "待確認值"],
  [/候選號碼/g, "編號"],
  [/候選號/g, "編號"],
  [/候選/g, "待確認"],
  [/保留新圖料號/g, "建立新圖號與料號"],
  [/保留新圖號/g, "建立新圖號"],
  [/保留新料號/g, "建立新料號"],
  [/建立保留號/g, "建立編號"],
  [/保留號建立/g, "建立編號"],
  [/保留號碼/g, "編號"],
  [/保留號/g, "編號"],
  [/號碼效力/g, "申請狀態"],
  [/已保留/g, "申請中"],
  [/正式圖料號/g, "圖料號"],
  [/正式圖號/g, "圖號"],
  [/正式料號/g, "料號"],
  [/正式主檔/g, "主檔"],
  [/正式發布/g, "發布"],
  [/正式使用/g, "使用"],
  [/正式資料/g, "已發布資料"],
  [/正式號碼/g, "編號"],
  [/正式領號/g, "編號建立"]
];

export function rewriteNumberingHumanText(value: string): string {
  return NUMBERING_TEXT_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

export function rewriteNumberingHumanTextDeep(value: unknown): unknown {
  if (typeof value === "string") return rewriteNumberingHumanText(value);
  if (Array.isArray(value)) return value.map(rewriteNumberingHumanTextDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewriteNumberingHumanTextDeep(child)]));
  }
  return value;
}

export function rewriteNumberingJsonText(value: string): string {
  try {
    return JSON.stringify(rewriteNumberingHumanTextDeep(JSON.parse(value)));
  } catch {
    return rewriteNumberingHumanText(value);
  }
}
