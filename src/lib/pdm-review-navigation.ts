const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

function isSafeListReturnTo(value: string | null | undefined, pathname: string): value is string {
  if (!value || CONTROL_CHARACTER_PATTERN.test(value) || value.includes("\\") || !value.startsWith("/") || value.startsWith("//")) return false;
  try {
    const parsed = new URL(value, "https://pdm.local");
    return parsed.origin === "https://pdm.local" && parsed.pathname === pathname;
  } catch {
    return false;
  }
}

export function isSafePdmApprovalReturnTo(value: string | null | undefined): value is string {
  return isSafeListReturnTo(value, "/approvals");
}

export function normalizePdmApprovalReturnTo(value: string | null | undefined, fallback = "/approvals") {
  return isSafePdmApprovalReturnTo(value) ? value : fallback;
}

export function isSafePdmDrawingReturnTo(value: string | null | undefined): value is string {
  return isSafeListReturnTo(value, "/numbering/drawings");
}

export function normalizePdmDrawingReturnTo(value: string | null | undefined, fallback = "/numbering/drawings") {
  return isSafePdmDrawingReturnTo(value) ? value : fallback;
}

export function isSafePdmCandidateReturnTo(value: string | null | undefined): value is string {
  return isSafeListReturnTo(value, "/parts") || isSafeListReturnTo(value, "/numbering/search");
}

export function normalizePdmCandidateReturnTo(value: string | null | undefined, fallback = "/parts") {
  return isSafePdmCandidateReturnTo(value) ? value : fallback;
}

export function isSafePdmPartReturnTo(value: string | null | undefined): value is string {
  return isSafeListReturnTo(value, "/parts");
}

export function normalizePdmPartReturnTo(value: string | null | undefined, fallback = "/parts") {
  return isSafePdmPartReturnTo(value) ? value : fallback;
}

export function isSafePdmRelationReturnTo(value: string | null | undefined): value is string {
  return isSafeListReturnTo(value, "/numbering/search");
}

export function normalizePdmRelationReturnTo(value: string | null | undefined, fallback = "/numbering/search") {
  return isSafePdmRelationReturnTo(value) ? value : fallback;
}

export function normalizePdmSurfaceReturnTo(
  surface: "drawing" | "approval" | "candidate" | "part" | "relation",
  value: string | null | undefined
) {
  if (surface === "drawing") return normalizePdmDrawingReturnTo(value);
  if (surface === "candidate") return normalizePdmCandidateReturnTo(value);
  if (surface === "part") return normalizePdmPartReturnTo(value);
  if (surface === "relation") return normalizePdmRelationReturnTo(value);
  return normalizePdmApprovalReturnTo(value);
}
