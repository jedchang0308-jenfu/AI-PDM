import type { ReactNode } from "react";

export type DrawingDetailFact = {
  label: string;
  value: ReactNode;
};

export type DrawingDetailContentModel = {
  overview: ReactNode;
  body: ReactNode;
  pending?: ReactNode;
  more: ReactNode;
  bodyTitle?: ReactNode;
  bodyMeta?: ReactNode;
  bodyLabel?: string;
  pendingTitle?: ReactNode;
  pendingMeta?: ReactNode;
  pendingLabel?: string;
  moreTitle?: ReactNode;
  moreMeta?: ReactNode;
};

type DrawingDetailSummaryProps = {
  heading?: ReactNode;
  subtitle?: ReactNode;
  facts?: DrawingDetailFact[];
  className?: string;
  dataMode?: string;
};

/**
 * The one summary surface shared by candidate, controlled and review drawers.
 * Adapters supply facts; this component owns the visual hierarchy and density.
 */
export function DrawingDetailSummary({
  heading,
  subtitle,
  facts = [],
  className = "",
  dataMode
}: DrawingDetailSummaryProps) {
  const classes = ["drawing-detail-summary", className].filter(Boolean).join(" ");
  return (
    <div className={classes} data-component="drawing-detail-summary" data-drawing-detail-summary-mode={dataMode}>
      {heading || subtitle ? (
        <div className="drawing-detail-summary-heading">
          {heading ? <strong>{heading}</strong> : null}
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
      ) : null}
      {facts.length > 0 ? (
        <dl className="drawing-detail-summary-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/**
 * The only first-level detail content renderer. Lifecycle adapters provide
 * content and permissions; this component owns the order and section frames.
 * Keeping this contract at the body level prevents candidate, formal and
 * approval pages from slowly growing different layouts again.
 */
export function DrawingDetailContent({
  model,
  overviewLabel,
  moreLabel,
  className = "",
  bodyClassName = "pdm-entity-drawer-body",
  dataComponent = "drawing-detail-content"
}: {
  model: DrawingDetailContentModel;
  overviewLabel: string;
  moreLabel: string;
  className?: string;
  bodyClassName?: string;
  dataComponent?: string;
}) {
  return (
    <div className={[bodyClassName, className].filter(Boolean).join(" ")} data-component={dataComponent} data-drawing-detail-content="true">
      <section className="drawing-detail-section drawing-detail-overview" data-drawing-detail-section="drawing-overview" aria-label={overviewLabel}>
        {model.overview}
      </section>
      <DrawingDetailSection
        title={model.bodyTitle === undefined ? "圖面與附件" : model.bodyTitle}
        meta={model.bodyMeta}
        dataSection="drawing-revision-files"
        ariaLabel={model.bodyLabel ?? "圖面與附件"}
      >
        {model.body}
      </DrawingDetailSection>
      {model.pending ? (
        <DrawingDetailSection
          title={model.pendingTitle === undefined ? "下一步" : model.pendingTitle}
          meta={model.pendingMeta}
          dataSection="drawing-pending"
          ariaLabel={model.pendingLabel ?? "下一步"}
        >
          {model.pending}
        </DrawingDetailSection>
      ) : null}
      <DrawingDetailSection
        title={model.moreTitle === undefined ? moreLabel : model.moreTitle}
        meta={model.moreMeta}
        dataSection="drawing-more"
        ariaLabel={moreLabel}
      >
        {model.more}
      </DrawingDetailSection>
    </div>
  );
}

type DrawingDetailSectionProps = {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  ariaLabel?: string;
  dataSection?: string;
  dataCandidateEditor?: boolean;
};

/** A shared section frame so every drawer reads like the A0005 workbench. */
export function DrawingDetailSection({
  title,
  meta,
  children,
  className = "",
  id,
  ariaLabel,
  dataSection,
  dataCandidateEditor = false
}: DrawingDetailSectionProps) {
  const classes = ["drawing-detail-content-section", className].filter(Boolean).join(" ");
  return (
    <section
      id={id}
      className={classes}
      aria-label={ariaLabel}
      data-drawing-detail-section={dataSection}
      data-candidate-editor={dataCandidateEditor ? "true" : undefined}
    >
      {title !== null || meta ? (
        <div className="drawing-detail-content-section-heading">
          {title !== null ? <h3>{title}</h3> : null}
          {meta ? <span>{meta}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
