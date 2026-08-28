import { normalizeRecognitionValue } from "./drawing-recognition-contract.ts";

export const INVALID_RECOGNITION_PART_STATUSES = new Set(["Obsolete", "Merged", "MainDrawingInvalid"]);

export type RecognitionPartOwnerTarget = {
  id: string;
  partNumber: string;
  recordStatus: string;
  source: "formal" | "draft" | "context";
};

export type RecognitionPartOwnerResolution =
  | {
      kind: "resolved";
      ownerId: string;
      logicalPartNumber: string;
      evidence: { source: RecognitionPartOwnerTarget["source"]; candidateOwnerIds: string[] };
    }
  | {
      kind: "unresolved";
      reason: "no_valid_part_relation" | "supplied_owner_not_related" | "anchor_not_related";
      candidateOwnerIds: string[];
    }
  | {
      kind: "ambiguous";
      candidateOwnerIds: string[];
      logicalPartNumbers: string[];
    };

function logicalPartNumber(value: unknown) {
  return normalizeRecognitionValue(value).toLocaleUpperCase("en-US");
}

function orderedTargets(targets: RecognitionPartOwnerTarget[]) {
  const sourceRank = { formal: 0, draft: 1, context: 2 } as const;
  return [...targets]
    .filter((target) => target.id.trim() && logicalPartNumber(target.partNumber))
    .filter((target) => !INVALID_RECOGNITION_PART_STATUSES.has(target.recordStatus))
    .sort((left, right) => sourceRank[left.source] - sourceRank[right.source]
      || logicalPartNumber(left.partNumber).localeCompare(logicalPartNumber(right.partNumber))
      || left.id.localeCompare(right.id));
}

function resolved(group: RecognitionPartOwnerTarget[]): RecognitionPartOwnerResolution {
  const canonical = orderedTargets(group)[0];
  return {
    kind: "resolved",
    ownerId: canonical.id,
    logicalPartNumber: logicalPartNumber(canonical.partNumber),
    evidence: { source: canonical.source, candidateOwnerIds: group.map((target) => target.id).sort() }
  };
}

/** One pure resolver shared by mapping and persistence boundaries. */
export function resolveRecognitionPartOwner(input: {
  targets: RecognitionPartOwnerTarget[];
  suppliedOwnerId?: string | null;
  anchorPartNumber?: string | null;
  configurationName?: string | null;
  allowUnanchored?: boolean;
}): RecognitionPartOwnerResolution {
  const targets = orderedTargets(input.targets);
  const candidateOwnerIds = targets.map((target) => target.id).sort();
  if (targets.length === 0) return { kind: "unresolved", reason: "no_valid_part_relation", candidateOwnerIds };

  const groups = new Map<string, RecognitionPartOwnerTarget[]>();
  for (const target of targets) {
    const key = logicalPartNumber(target.partNumber);
    groups.set(key, [...(groups.get(key) ?? []), target]);
  }

  const suppliedOwnerId = input.suppliedOwnerId?.trim();
  if (suppliedOwnerId) {
    const supplied = targets.find((target) => target.id === suppliedOwnerId);
    if (!supplied) return { kind: "unresolved", reason: "supplied_owner_not_related", candidateOwnerIds };
    return resolved(groups.get(logicalPartNumber(supplied.partNumber)) ?? [supplied]);
  }

  const anchors = [input.anchorPartNumber, input.configurationName].map(logicalPartNumber).filter(Boolean);
  for (const anchor of anchors) {
    const exact = groups.get(anchor);
    if (exact) return resolved(exact);
    const suffixMatches = [...groups.entries()].filter(([partNumber]) => partNumber.endsWith(anchor));
    if (suffixMatches.length === 1) return resolved(suffixMatches[0][1]);
  }
  if (anchors.length > 0 && !input.allowUnanchored) {
    return { kind: "unresolved", reason: "anchor_not_related", candidateOwnerIds };
  }
  if (groups.size === 1 && input.allowUnanchored !== false) return resolved([...groups.values()][0]);
  return {
    kind: "ambiguous",
    candidateOwnerIds,
    logicalPartNumbers: [...groups.keys()].sort()
  };
}

export function proposedOwnerResolution(resolution: RecognitionPartOwnerResolution) {
  return resolution.kind === "resolved" ? "resolved" as const
    : resolution.kind === "ambiguous" ? "ambiguous" as const
      : "missing" as const;
}
