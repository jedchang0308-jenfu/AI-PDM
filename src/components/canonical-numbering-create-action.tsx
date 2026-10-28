"use client";

import { usePdmPermissions } from "@/components/pdm-permission-provider";
import Link from "next/link";
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
  const { state, allowsAction, retry } = usePdmPermissions();
  if (state.kind === "loading") return <span className={className} aria-busy="true" aria-label="正在確認建立編號權限" data-canonical-numbering-create-loading="true"><Plus size={16} aria-hidden="true" />建立編號</span>;
  if (state.kind === "unavailable") return <button type="button" className={className} onClick={retry}>重試權限</button>;
  if (state.kind === "unauthenticated") return null;
  if (!allowsAction("numbering.create")) return <span className="canonical-numbering-create-denied" role="status" data-canonical-numbering-create-denied="true">目前角色沒有建立編號權限</span>;
  const href = buildHref(surface, rootCode ?? undefined, returnTo);
  return <Link
    className={className}
    href={href}
    onClick={(event) => {
      if (onBeforeNavigate && !onBeforeNavigate()) event.preventDefault();
    }}
    data-canonical-numbering-create="true"
  >
    <Plus size={16} aria-hidden="true" />
    建立編號
  </Link>;
}
