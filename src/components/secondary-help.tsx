"use client";

import Link from "next/link";
import { ArrowRight, HelpCircle, X } from "lucide-react";
import { useRef, useState } from "react";
import { PdmDetailDrawer, useRememberedDrawerWidth } from "@/components/pdm-detail-drawer";

export type SecondaryHelpAction = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
};

export type SecondaryHelpSection = {
  title: string;
  body?: string;
  items?: string[];
};

export type SecondaryHelpContent = {
  title: string;
  summary?: string;
  sections?: SecondaryHelpSection[];
  actions?: SecondaryHelpAction[];
};

type PageHelpDrawerButtonProps = {
  content: SecondaryHelpContent;
  buttonLabel?: string;
  className?: string;
  storageKey?: string;
};

function hasHelpContent(content: SecondaryHelpContent) {
  return Boolean(
    content.summary?.trim() ||
      content.sections?.some((section) => section.body?.trim() || section.items?.some((item) => item.trim())) ||
      content.actions?.length
  );
}

export function PageHelpDrawerButton({
  content,
  buttonLabel = "說明",
  className = "",
  storageKey = "pdm-secondary-help-drawer-width"
}: PageHelpDrawerButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { drawerWidth, startDrawerResize } = useRememberedDrawerWidth({ storageKey, defaultWidth: 460, minWidth: 360 });

  if (!hasHelpContent(content)) return null;

  function closeDrawer() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        ref={triggerRef}
        className={`secondary-help-trigger ${className}`.trim()}
        type="button"
        aria-expanded={open}
        aria-label={`${buttonLabel}: ${content.title}`}
        onClick={() => setOpen(true)}
      >
        <HelpCircle size={15} aria-hidden="true" />
        <span>{buttonLabel}</span>
      </button>
      <PdmDetailDrawer
        open={open}
        width={drawerWidth}
        ariaLabel={content.title}
        resizeLabel="調整說明面板寬度"
        resizeTitle="拖曳調整說明面板寬度"
        onClose={closeDrawer}
        onStartResize={startDrawerResize}
        className="secondary-help-drawer"
      >
        <button className="icon-button pdm-detail-drawer-floating-close" type="button" aria-label="關閉說明" onClick={closeDrawer}>
          <X size={16} aria-hidden="true" />
        </button>
        <div className="secondary-help-panel">
          <header className="secondary-help-header">
            <span className="section-label">Context help</span>
            <h2>{content.title}</h2>
            {content.summary ? <p>{content.summary}</p> : null}
          </header>
          {content.sections?.length ? (
            <div className="secondary-help-sections">
              {content.sections.map((section) => (
                <section className="secondary-help-section" key={section.title}>
                  <h3>{section.title}</h3>
                  {section.body ? <p>{section.body}</p> : null}
                  {section.items?.length ? (
                    <ul>
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>
          ) : null}
          {content.actions?.length ? (
            <div className="secondary-help-actions">
              {content.actions.map((action) => (
                <Link className={action.variant === "primary" ? "primary-button" : "secondary-button"} href={action.href} key={`${action.href}-${action.label}`}>
                  {action.label}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </PdmDetailDrawer>
    </>
  );
}
