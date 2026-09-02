export type BomCreateNavigation = {
  partNumberId: string | null;
  query: string;
  returnTo: string;
};

function firstScalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function validateBomReturnTo(value: unknown, fallback = "/bom/workbench") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) return fallback;
  if (!/^\/(?:bom\/workbench|parts)(?:[/?#]|$)/u.test(trimmed)) return fallback;
  return trimmed;
}

export function parseBomCreateNavigation(searchParams: Record<string, string | string[] | undefined>): BomCreateNavigation {
  const partNumberId = firstScalar(searchParams.partNumberId)?.trim() || null;
  const query = firstScalar(searchParams.query)?.trim() || "";
  return { partNumberId, query, returnTo: validateBomReturnTo(firstScalar(searchParams.returnTo)) };
}

export function buildBomCreateHref(input: { partNumberId?: string | null; returnTo?: string | null }) {
  const params = new URLSearchParams();
  if (input.partNumberId) params.set("partNumberId", input.partNumberId);
  const returnTo = validateBomReturnTo(input.returnTo);
  if (returnTo !== "/bom/workbench") params.set("returnTo", returnTo);
  const query = params.toString();
  return query ? `/bom/create?${query}` : "/bom/create";
}
