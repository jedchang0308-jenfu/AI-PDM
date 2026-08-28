import type { DrawingRevisionBasisState, DrawingRevisionTuple } from "@/lib/drawing-revision-lifecycle-policy";

export type DrawingRevisionSelectionMode = "recommended" | "manual_minor";

export type DrawingRevisionCreateSelection =
  | { sourceRowKey: string; selectionMode: "recommended"; candidateToken: string; requestedMinor?: never }
  | { sourceRowKey: string; selectionMode: "manual_minor"; requestedMinor: number; candidateToken?: never };

export class DrawingRevisionTargetContractError extends Error {
  constructor(
    readonly code: "WORKBENCH_BAD_REQUEST" | "DRAWING_MANUAL_MINOR_INVALID",
    message: string
  ) {
    super(message);
    this.name = "DrawingRevisionTargetContractError";
  }
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function parseDrawingRevisionCreateSelection(value: unknown): DrawingRevisionCreateSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DrawingRevisionTargetContractError("WORKBENCH_BAD_REQUEST", "進版資料格式無效");
  }
  const input = value as Record<string, unknown>;
  if (typeof input.sourceRowKey !== "string" || input.sourceRowKey.trim().length === 0
    || (input.selectionMode !== "recommended" && input.selectionMode !== "manual_minor")) {
    throw new DrawingRevisionTargetContractError("WORKBENCH_BAD_REQUEST", "進版資料格式無效");
  }
  if (input.selectionMode === "recommended") {
    if (!exactKeys(input, ["sourceRowKey", "selectionMode", "candidateToken"])
      || typeof input.candidateToken !== "string" || input.candidateToken.length === 0) {
      throw new DrawingRevisionTargetContractError("WORKBENCH_BAD_REQUEST", "推薦版次資料格式無效");
    }
    return { sourceRowKey: input.sourceRowKey, selectionMode: "recommended", candidateToken: input.candidateToken };
  }
  if (!exactKeys(input, ["sourceRowKey", "selectionMode", "requestedMinor"])
    || typeof input.requestedMinor !== "number" || !Number.isSafeInteger(input.requestedMinor)
    || input.requestedMinor < 1 || input.requestedMinor > 2_147_483_647) {
    throw new DrawingRevisionTargetContractError("DRAWING_MANUAL_MINOR_INVALID", "自訂小版次格式無效");
  }
  return { sourceRowKey: input.sourceRowKey, selectionMode: "manual_minor", requestedMinor: input.requestedMinor };
}

export type DrawingRevisionTargetDto = {
  kind: "production" | "rd";
  label: string;
  target: DrawingRevisionTuple;
  enabled: boolean;
  reason: string | null;
  candidateToken: string | null;
};

export type DrawingRevisionTargetsDto = {
  source: { rowKey: string; rowVersion: number; revision: DrawingRevisionTuple; basisState: DrawingRevisionBasisState };
  basisState: DrawingRevisionBasisState;
  manualRule: { enabled: boolean; major: number | null; minExclusive: number | null; maxInclusive: number; reason: string | null };
  candidates: DrawingRevisionTargetDto[];
  recovery: { label: string; targetsHref: string } | null;
};
