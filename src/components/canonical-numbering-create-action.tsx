"use client";

import { useEffect, useState } from "react";
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
  const [permission, setPermission] = useState<"loading" | "allowed" | "denied">("loading");
  useEffect(() => {
    let active = true;
    void fetch("/api/numbering/permissions", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return false;
        const body = await response.json() as { actions?: Record<string, boolean> };
        return body.actions?.["numbering.create"] === true;
      })
      .then((allowed) => { if (active) setPermission(allowed ? "allowed" : "denied"); })
      .catch(() => { if (active) setPermission("denied"); });
    return () => { active = false; };
  }, []);

  if (permission === "loading") {
    return <span className={className} role="status" aria-label="正在確認建立編號權限" data-canonical-numbering-create-loading="true">確認權限中…</span>;
  }
  if (permission === "denied") {
    return <span className="canonical-numbering-create-denied" role="status" data-canonical-numbering-create-denied="true">目前角色沒有建立編號權限</span>;
  }
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
