export type NumberStateLegacyRedirect = {
  pathname: string;
  searchParams: URLSearchParams;
};

export function resolveNumberStateLegacyRedirect(
  pathname: string,
  searchParams: URLSearchParams
): NumberStateLegacyRedirect | null {
  const nextSearchParams = new URLSearchParams(searchParams);
  let destinationPathname = "";

  if (pathname === "/numbering/part-drafts") {
    destinationPathname = "/parts";
    nextSearchParams.set("tab", "drafts");
  } else if (pathname === "/numbering/request") {
    destinationPathname = "/numbering/search";
    nextSearchParams.set("create", "numbering");
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
