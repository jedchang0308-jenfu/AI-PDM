import type {
  PdmWorkbenchLane,
  PdmWorkbenchLaneFields,
  PdmWorkbenchRowBase,
  PdmWorkbenchReferenceKind
} from "@/lib/pdm-workbench-contract";
import { createPdmWorkbenchProjectionToken, pdmWorkbenchReferenceFingerprint } from "@/lib/pdm-workbench-projection-token";

export type PdmWorkbenchLaneContext = { companyId: string; actorId: string };

export function laneSelectionIncludes(selection: { mode: "all" | "none" | "some"; values?: readonly string[] }, lane: PdmWorkbenchLane) {
  return selection.mode === "all" || (selection.mode === "some" && selection.values?.includes(lane)) || false;
}

export function makePdmWorkbenchLaneFields(input: PdmWorkbenchLaneContext & {
  rowKey: string;
  groupKey: string;
  entityKey: string;
  lane: PdmWorkbenchLane;
  referenceKind: PdmWorkbenchReferenceKind;
  referenceId: string;
  displayRevision?: string | null;
  purposeLabel: string;
  sourceCount?: number;
  conflict?: boolean;
  contentHashOrSnapshotHash?: string | null;
}): PdmWorkbenchLaneFields {
  const fingerprint = pdmWorkbenchReferenceFingerprint({
    referenceKind: input.referenceKind,
    referenceId: input.referenceId,
    revisionOrBaseline: input.displayRevision ?? null,
    contentHashOrSnapshotHash: input.contentHashOrSnapshotHash ?? null
  });
  return {
    groupKey: input.groupKey,
    entityKey: input.entityKey,
    lane: input.lane,
    laneLabel: input.lane === "production" ? "量產最新版" : "研發最新版",
    reference: {
      kind: input.referenceKind,
      displayRevision: input.displayRevision ?? null,
      purposeLabel: input.purposeLabel,
      sourceCount: input.sourceCount ?? 1,
      conflict: input.conflict ?? false,
      projectionToken: createPdmWorkbenchProjectionToken({
        companyId: input.companyId,
        actorId: input.actorId,
        rowKey: input.rowKey,
        lane: input.lane,
        fingerprint
      })
    }
  };
}

export function withPdmWorkbenchLane<Row extends PdmWorkbenchRowBase<string>>(row: Row, fields: PdmWorkbenchLaneFields): Row {
  return { ...row, lane: fields };
}

export function groupPdmWorkbenchRows<Row extends { rowKey: string; lane?: { groupKey: string; lane: PdmWorkbenchLane } }>(rows: Row[], limit: number) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const groupKey = row.lane?.groupKey ?? `legacy:${row.rowKey}`;
    const group = groups.get(groupKey) ?? [];
    group.push(row);
    groups.set(groupKey, group);
  }
  return [...groups.values()].slice(0, limit).flatMap((group) => group.sort((left, right) => (left.lane?.lane === "production" ? -1 : 1) - (right.lane?.lane === "production" ? -1 : 1)));
}
