export const DRAWING_REVISION_POLICY_VERSION = "dev098-bounded-manual-minor-v1" as const;
export const DRAWING_REVISION_POLICY_ID = "PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001" as const;

export type DrawingRevisionTuple = { major: number; minor: number; label: string };
export type DrawingRevisionBasisState = "current" | "stale" | "preproduction";

export type DrawingRevisionBasisInput = {
  dataLayer: "drawing_production" | "drawing_rd";
  baseProductionRevisionId: string | null;
  currentProductionRevisionId: string | null;
};

export type DrawingRevisionTargetPolicyV1 = {
  policyId: typeof DRAWING_REVISION_POLICY_ID;
  policyVersion: 1;
  selectionMode: "recommended" | "manual_minor";
  sourceRowId: string;
  sourceRowVersion: number;
  sourceRevisionId: string;
  sourceBaseProductionRevisionId: string | null;
  currentProductionRevisionId: string | null;
  predecessorRevisionId: string;
  resolvedMajor: number;
  requestedMinor: number | null;
  resolvedMinor: number;
  resolvedLabel: string;
};

export type DrawingRevisionPolicySnapshotV1 = {
  schemaVersion: 1;
  revisionTargetPolicy: DrawingRevisionTargetPolicyV1;
  changeImpact?: unknown;
  [compatibleKey: string]: unknown;
};

export function formatDrawingRevision(major: number, minor: number) {
  if (!Number.isSafeInteger(major) || major < 0 || !Number.isSafeInteger(minor) || minor < 0) {
    throw new Error("DRAWING_REVISION_TUPLE_INVALID");
  }
  return minor === 0 ? String(major) : `${major}.${minor}`;
}

export function deriveDrawingRevisionBasis(input: DrawingRevisionBasisInput): DrawingRevisionBasisState {
  if (input.dataLayer === "drawing_production") return "current";
  if (!input.currentProductionRevisionId && !input.baseProductionRevisionId) return "preproduction";
  return input.baseProductionRevisionId === input.currentProductionRevisionId ? "current" : "stale";
}

export function validateManualMinor(input: {
  basisState: DrawingRevisionBasisState;
  major: number;
  predecessor: DrawingRevisionTuple;
  requestedMinor: unknown;
  occupied: ReadonlySet<string>;
}) {
  if (input.basisState === "stale") throw new Error("DRAWING_PRODUCTION_BASE_STALE");
  if (!Number.isSafeInteger(input.requestedMinor) || (input.requestedMinor as number) < 1 || (input.requestedMinor as number) > 2_147_483_647) {
    throw new Error("DRAWING_MANUAL_MINOR_INVALID");
  }
  const minor = input.requestedMinor as number;
  if (input.major !== input.predecessor.major && input.basisState !== "preproduction") throw new Error("DRAWING_MANUAL_MINOR_CROSS_MAJOR");
  if (minor <= input.predecessor.minor) throw new Error("DRAWING_MANUAL_MINOR_NOT_FORWARD");
  const key = `${input.major}.${minor}`;
  if (input.occupied.has(key)) throw new Error("DRAWING_TARGET_REVISION_CLAIMED");
  return { major: input.major, minor, label: formatDrawingRevision(input.major, minor) } satisfies DrawingRevisionTuple;
}

export function buildDrawingRevisionPolicySnapshot(input: Omit<DrawingRevisionTargetPolicyV1, "policyId" | "policyVersion">): DrawingRevisionPolicySnapshotV1 {
  return {
    schemaVersion: 1,
    revisionTargetPolicy: {
      policyId: DRAWING_REVISION_POLICY_ID,
      policyVersion: 1,
      ...input
    }
  };
}

export function mergeDrawingRevisionPolicySnapshot(existing: unknown, patch: Record<string, unknown>) {
  const current = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  return { ...(current as Record<string, unknown>), ...patch };
}

export function drawingRevisionBasisReason(basisState: DrawingRevisionBasisState) {
  if (basisState === "stale") return "量產基準已更新，請從目前量產版另開工作或先處理此分支。";
  if (basisState === "preproduction") return "目前尚無量產版；可繼續 0.x 研發，或由系統建立第一個量產版。";
  return null;
}
