"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
};

export function WorkflowStrip({ eyebrow = "流程定位", title, description, steps, currentStep, actions }: WorkflowStripProps) {
  return (
    <section className="workflow-strip" aria-label={title}>
      <div className="workflow-strip-copy">
        <span className="section-label">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <ol className="workflow-step-list" aria-label="平台流程">
        {steps.map((step) => (
          <li className={step === currentStep ? "active" : undefined} key={step}>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="workflow-next-actions">
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
