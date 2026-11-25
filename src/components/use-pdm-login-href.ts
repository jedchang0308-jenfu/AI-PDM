"use client";
import { useEffect, useState } from "react";

export function pdmLoginHref(pathname: string, search = "", hash = "") {
  const returnTo = pathname + search + hash;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.startsWith("/login")
    || returnTo.startsWith("/api/auth/") || returnTo.includes("\\") || /[\u0000-\u001f\u007f]/u.test(returnTo)
    || returnTo.length > 1024) return "/login";
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function usePdmLoginHref(pathname: string) {
  const [href, setHref] = useState(() => pdmLoginHref(pathname));
  useEffect(() => {
    const current = window.location.pathname === pathname
      ? pdmLoginHref(pathname, window.location.search, window.location.hash) : pdmLoginHref(pathname);
    if (href !== current) setHref(current);
  }, [pathname, href]);
  return href;
}
