export type NumberStateLegacyRedirect = {
  pathname: string;
  searchParams: URLSearchParams;
};

export function resolveNumberStateLegacyRedirect(
  pathname: string,
  searchParams: URLSearchParams,
  unifiedPartRelationWorkbenchEnabled = false
): NumberStateLegacyRedirect | null {
  const nextSearchParams = new URLSearchParams(searchParams);
  const returnTo = nextSearchParams.get("returnTo");
  if (returnTo && !isSafeSameOriginPath(returnTo)) nextSearchParams.delete("returnTo");
  let destinationPathname = "";

  if (pathname === "/numbering/part-drafts") {
    destinationPathname = "/parts";
    if (unifiedPartRelationWorkbenchEnabled) {
      nextSearchParams.delete("tab");
      nextSearchParams.set("view", "work");
      const detail = nextSearchParams.get("detail")?.trim();
      if (detail && !detail.includes(":")) nextSearchParams.set("detail", `candidate:${detail}`);
    } else {
      nextSearchParams.set("tab", "drafts");
    }
  } else if (pathname === "/numbering/request") {
    destinationPathname = "/numbering/search";
    if (unifiedPartRelationWorkbenchEnabled) {
      nextSearchParams.delete("tab");
      nextSearchParams.set("view", "work");
    } else {
      nextSearchParams.set("tab", "reserved");
    }
    nextSearchParams.set("create", "new_bundle");
  } else if (pathname === "/upload") {
    const drawingNumber = nextSearchParams.get("drawingNumber") ?? nextSearchParams.get("drawing_number");
    if (!drawingNumber) return null;
    destinationPathname = `/drawings/${encodeURIComponent(drawingNumber)}/submission-workbench`;
  } else if (pathname === "/handoff") {
    destinationPathname = "/technical-transfer";
    nextSearchParams.set("tab", "published");
  } else {
    return null;
  }

  nextSearchParams.set("legacyFrom", pathname);
  return { pathname: destinationPathname, searchParams: nextSearchParams };
}

function isSafeSameOriginPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !/[\u0000-\u001f\u007f]/u.test(value);
}
