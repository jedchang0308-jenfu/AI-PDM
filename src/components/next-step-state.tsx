"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
};

export function NextStepState({ eyebrow = "下一步", title, body, actions = [], compact = false }: NextStepStateProps) {
  return (
    <div className={compact ? "next-step-state compact" : "next-step-state"}>
      <span className="section-label">{eyebrow}</span>
      <h3>{title}</h3>
      <p>{body}</p>
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
