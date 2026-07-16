"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHelpDrawerButton, type SecondaryHelpContent } from "@/components/secondary-help";

type WorkflowAction = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
};

type WorkflowStripProps = {
  eyebrow?: string;
  title: string;
  description: string;
  steps: string[];
  currentStep: string;
  actions: WorkflowAction[];
  helpContent?: SecondaryHelpContent;
};

export function WorkflowStrip({ eyebrow = "流程定位", title, description, steps, currentStep, actions, helpContent }: WorkflowStripProps) {
  const currentIndex = steps.findIndex((step) => step === currentStep);
  const nextStep = currentIndex >= 0 ? steps[currentIndex + 1] : undefined;
  const visibleSteps = [currentStep, nextStep].filter(Boolean) as string[];
  const resolvedHelpContent: SecondaryHelpContent = helpContent ?? {
    title,
    summary: description,
    sections: [
      {
        title: "完整流程",
        items: steps
      }
    ],
    actions
  };

  return (
    <section className="workflow-strip" aria-label={title}>
      <div className="workflow-strip-copy">
        <span className="section-label">{eyebrow}</span>
        <h2>{title}</h2>
        <div className="workflow-strip-meta">
          <span className="metadata-badge">Current: {currentStep}</span>
          {nextStep ? <span className="metadata-badge">Next: {nextStep}</span> : null}
        </div>
      </div>
      <ol className="workflow-step-list" aria-label="流程摘要">
        {visibleSteps.map((step) => (
          <li className={step === currentStep ? "active" : "next"} key={step}>
            <span>{step}</span>
          </li>
        ))}
        {steps.length > visibleSteps.length ? <li className="workflow-progress-count">{steps.length} steps</li> : null}
      </ol>
      <div className="workflow-next-actions">
        <PageHelpDrawerButton content={resolvedHelpContent} className="workflow-help-trigger" />
        {actions.map((action) => (
          <Link className={action.variant === "primary" ? "primary-button" : "secondary-button"} href={action.href} key={`${action.href}-${action.label}`}>
            <ArrowRight size={14} aria-hidden="true" />
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
