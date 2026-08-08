"use client";

import type { ReactNode } from "react";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";

type DrawingWorkspaceDrawerProps = {
  open: boolean;
  width: number;
  ariaLabel: string;
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  footer?: ReactNode;
  entityType: "candidate_bundle" | "drawing_number";
  entityCode: string;
  sourceContext: string;
  className?: string;
  bodyClassName?: string;
  resizeLabel?: string;
  resizeTitle?: string;
  closeLabel?: string;
  keepOpenSelector?: string;
  overviewLabel: string;
  moreLabel: string;
  overview: ReactNode;
  body: ReactNode;
  pending: ReactNode;
  more: ReactNode;
  onClose: () => void;
  onStartResize: (clientX: number) => void;
};

/**
 * One drawing-detail frame for both candidate and formal lifecycles.
 * Domain adapters provide content and actions; this component owns only the
 * shared hierarchy and never changes candidate/formal mutation authority.
 */
export function DrawingWorkspaceDrawer({
  open,
  width,
  ariaLabel,
  eyebrow,
  title,
  subtitle,
  status,
  primaryAction,
  secondaryActions,
  footer,
  entityType,
  entityCode,
  sourceContext,
  className,
  bodyClassName = "pdm-entity-drawer-body",
  resizeLabel,
  resizeTitle,
  closeLabel,
  keepOpenSelector,
  overviewLabel,
  moreLabel,
  overview,
  body,
  pending,
  more,
  onClose,
  onStartResize
}: DrawingWorkspaceDrawerProps) {
  return (
    <PdmEntityDetailDrawer
      open={open}
      width={width}
      ariaLabel={ariaLabel}
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      status={status}
      actions={<>{primaryAction ? <div data-drawing-primary-action-slot="true">{primaryAction}</div> : null}{secondaryActions}</>}
      footer={footer}
      entityType={entityType}
      entityCode={entityCode}
      sourceContext={sourceContext}
      detailFamily="drawing_number"
      drawingDetailSkeleton
      className={className}
      resizeLabel={resizeLabel}
      resizeTitle={resizeTitle}
      closeLabel={closeLabel}
      keepOpenSelector={keepOpenSelector}
      onClose={onClose}
      onStartResize={onStartResize}
    >
      <div className={bodyClassName} data-component="drawing-workspace-drawer" data-drawing-detail-content="true">
        <section className="drawing-detail-section drawing-detail-overview" data-drawing-detail-section="drawing-overview" aria-label={overviewLabel}>{overview}</section>
        <div className="drawing-detail-body-slot" data-drawing-detail-body-slot="true">{body}</div>
        <div className="drawing-detail-section drawing-detail-pending" data-drawing-detail-section="drawing-pending" hidden={!pending}>{pending}</div>
        <section className="drawing-detail-section drawing-detail-more" data-drawing-detail-section="drawing-more" aria-label={moreLabel}>{more}</section>
      </div>
    </PdmEntityDetailDrawer>
  );
}
