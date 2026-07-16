"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHelpDrawerButton, type SecondaryHelpContent } from "@/components/secondary-help";

type NextStepAction = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
};

type NextStepStateProps = {
  eyebrow?: string;
  title: string;
  body: string;
  actions?: NextStepAction[];
  compact?: boolean;
  bodyPlacement?: "help" | "inline";
  helpContent?: SecondaryHelpContent;
};

export function NextStepState({
  eyebrow = "下一步",
  title,
  body,
  actions = [],
  compact = false,
  bodyPlacement = "inline",
  helpContent
}: NextStepStateProps) {
  const resolvedHelpContent: SecondaryHelpContent = helpContent ?? {
    title,
    summary: body,
    actions
  };

  return (
    <div className={compact ? "next-step-state compact" : "next-step-state"}>
      <span className="section-label">{eyebrow}</span>
      <h3>{title}</h3>
      {bodyPlacement === "help" ? (
        <PageHelpDrawerButton content={resolvedHelpContent} buttonLabel="為什麼" className="next-step-help-trigger" />
      ) : (
        <>
          <p>{body}</p>
          {helpContent ? <PageHelpDrawerButton content={resolvedHelpContent} buttonLabel="更多說明" className="next-step-help-trigger" /> : null}
        </>
      )}
      {actions.length > 0 ? (
        <div className="next-step-actions">
          {actions.map((action) => (
            <Link className={action.variant === "primary" ? "primary-button" : "secondary-button"} href={action.href} key={`${action.href}-${action.label}`}>
              <ArrowRight size={14} aria-hidden="true" />
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
