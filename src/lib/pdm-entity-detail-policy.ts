import type { PdmDetailSurface, PdmProjectionLevel } from "@/lib/pdm-entity-detail-contract";

export type PdmDetailProjectionPolicy = {
  drawing: PdmProjectionLevel | null;
  part: PdmProjectionLevel | null;
  relation: PdmProjectionLevel | null;
  review: boolean;
};

export function derivePdmDetailProjectionPolicy(surface: PdmDetailSurface, reviewRequestId?: string | null): PdmDetailProjectionPolicy {
  if (reviewRequestId) return { drawing: "full", part: "full", relation: "full", review: true };
  if (surface === "drawing") return { drawing: "full", part: "summary", relation: "summary", review: false };
  if (surface === "part") return { drawing: "summary", part: "full", relation: "summary", review: false };
  return { drawing: "full", part: "full", relation: "full", review: false };
}

export function projectionPolicyAllowsReview(policy: PdmDetailProjectionPolicy) {
  return policy.review;
}

export function isPdmDetailSurface(value: string | null): value is PdmDetailSurface {
  return value === "drawing" || value === "part" || value === "relation";
}
