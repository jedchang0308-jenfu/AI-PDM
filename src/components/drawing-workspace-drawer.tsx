"use client";

import type { ReactNode } from "react";
import { DrawingDetailContent, type DrawingDetailContentModel } from "@/components/drawing-detail-content";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";

export const DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY = "pdm-drawing-detail-drawer-width";
export const DRAWING_DETAIL_DRAWER_DEFAULT_WIDTH = 660;
export const DRAWING_DETAIL_DRAWER_MIN_WIDTH = 420;

type DrawingWorkspaceDrawerProps = {
  open: boolean;
  width: number;
  ariaLabel: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  footer?: ReactNode;
  entityType: "candidate_bundle" | "drawing_number" | "approval_request";
  entityCode: string;
  sourceContext: string;
  detailFamily?: string;
  className?: string;
  bodyClassName?: string;
  resizeLabel?: string;
  resizeTitle?: string;
  closeLabel?: string;
  keepOpenSelector?: string;
  overviewLabel: string;
  moreLabel: string;
  content?: DrawingDetailContentModel;
  overview?: ReactNode;
  body?: ReactNode;
  pending?: ReactNode;
  more?: ReactNode;
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
  detailFamily = "drawing_number",
  className,
  bodyClassName = "pdm-entity-drawer-body",
  resizeLabel,
  resizeTitle,
  closeLabel,
  keepOpenSelector,
  overviewLabel,
  moreLabel,
  content,
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
      detailFamily={detailFamily}
      drawingDetailSkeleton
      className={className}
      resizeLabel={resizeLabel}
      resizeTitle={resizeTitle}
      closeLabel={closeLabel}
      keepOpenSelector={keepOpenSelector}
      onClose={onClose}
      onStartResize={onStartResize}
    >
      {content ? (
        <DrawingDetailContent model={content} overviewLabel={overviewLabel} moreLabel={moreLabel} bodyClassName={bodyClassName} dataComponent="drawing-workspace-drawer" />
      ) : (
        <DrawingDetailContent
          model={{ overview: overview ?? null, body: body ?? null, pending: pending ?? null, more: more ?? null }}
          overviewLabel={overviewLabel}
          moreLabel={moreLabel}
          bodyClassName={bodyClassName}
          dataComponent="drawing-workspace-drawer"
        />
      )}
    </PdmEntityDetailDrawer>
  );
}
