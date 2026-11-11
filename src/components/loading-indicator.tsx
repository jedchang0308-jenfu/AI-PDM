"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingIndicator({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <span className={`loading-indicator ${className}`.trim()} role="status">
      <LoaderCircle className="loading-indicator__icon" size={16} aria-hidden="true" />
      {children ? <span>{children}</span> : null}
    </span>
  );
}
