"use client";

import { Plus } from "lucide-react";

type CreateSurface = "drawing" | "part" | "search";

function buildHref(surface: CreateSurface, rootCode?: string, returnTo?: string) {
  const params = new URLSearchParams({ from: surface });
  if (rootCode?.trim()) params.set("root", rootCode.trim());
  if (returnTo?.startsWith("/")) params.set("returnTo", returnTo);
  return `/numbering/create?${params.toString()}`;
}

export function CanonicalNumberingCreateAction({
  surface,
  rootCode,
  returnTo,
  onBeforeNavigate,
  className = "primary-button",
}: {
  surface: CreateSurface;
  rootCode?: string | null;
  returnTo?: string;
  onBeforeNavigate?: () => boolean;
  className?: string;
}) {
  const href = buildHref(surface, rootCode ?? undefined, returnTo);
  return <a
    className={className}
    href={href}
    onClick={(event) => {
      if (onBeforeNavigate && !onBeforeNavigate()) event.preventDefault();
    }}
    data-canonical-numbering-create="true"
  >
    <Plus size={16} aria-hidden="true" />
    建立編號
  </a>;
}
