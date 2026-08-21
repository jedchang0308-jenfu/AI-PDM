"use client";

import type { ReactNode } from "react";
import { RelationProjection } from "@/components/relation-projection";
import type { PdmEntityDetailResponse } from "@/lib/pdm-entity-detail-contract";

type RelationWorkspaceContentProps =
  | { projection: NonNullable<PdmEntityDetailResponse["projections"]["relation"]>; presentation: "drawer-readonly"; maintenance?: never; children?: ReactNode }
  | { projection: NonNullable<PdmEntityDetailResponse["projections"]["relation"]>; presentation: "workspace-editor"; maintenance?: ReactNode; children?: ReactNode };

export function RelationWorkspaceContent({ projection, maintenance, children }: RelationWorkspaceContentProps) {
  return <div className="relation-workspace-content"><RelationProjection projection={projection} />{maintenance ? <section className="pdm-edit-page-card" id="relation-maintenance">{maintenance}</section> : null}{children}</div>;
}
