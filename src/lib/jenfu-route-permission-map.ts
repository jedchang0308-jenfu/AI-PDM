import routeMap from "../../config/access-control/jenfu-route-permission-map.v1.json" with { type: "json" };

export type JenfuRouteAuthorizationMode = "permission" | "authenticated_domain" | "existing_command" | "existing_path" | "retired";
export type JenfuRouteDiscriminator =
  | "approval_apply:retired_candidate"
  | "approval_apply:registered"
  | "approval_decision:transfer_package"
  | "approval_decision:retired_candidate"
  | "approval_decision:drawing_lifecycle"
  | "approval_decision:registered"
  | "file_read:approval_evidence"
  | "file_read:drawing_revision_work"
  | "file_read:review_request"
  | "file_read:part_attachment"
  | "file_read:drawing_read"
  | "view:principal-candidate";
export type JenfuRoutePermissionEntry = {
  path: string;
  method: string;
  discriminator: JenfuRouteDiscriminator | null;
  authorizationMode: JenfuRouteAuthorizationMode;
  permissionCode: string | null;
  authorizationTarget: string;
  scopeResolver: string;
  preservedGuards: string;
};

export const JENFU_ROUTE_PERMISSION_MAP = routeMap as {
  contractVersion: string;
  applicationId: string;
  source: string;
  sourceSha256: string;
  denominator: { uniqueFiles: number; uniqueMethods: number; policyEntries: number };
  entries: JenfuRoutePermissionEntry[];
};

const allowedDiscriminators = new Set<JenfuRouteDiscriminator>([
  "approval_apply:retired_candidate", "approval_apply:registered",
  "approval_decision:transfer_package", "approval_decision:retired_candidate",
  "approval_decision:drawing_lifecycle", "approval_decision:registered",
  "file_read:approval_evidence", "file_read:drawing_revision_work",
  "file_read:review_request", "file_read:part_attachment", "file_read:drawing_read",
  "view:principal-candidate"
]);

export function validateJenfuRoutePermissionMap(value = JENFU_ROUTE_PERMISSION_MAP) {
  if (value.contractVersion !== "jenfu.platform-entitlement.v1" || value.applicationId !== "ai-pdm") throw new Error("ROUTE_PERMISSION_MAP_CONTRACT_INVALID");
  const uniqueFiles = new Set(value.entries.map((entry) => entry.path)).size;
  const uniqueMethods = new Set(value.entries.map((entry) => `${entry.path}\0${entry.method}`)).size;
  if (value.entries.length !== value.denominator.policyEntries || uniqueFiles !== value.denominator.uniqueFiles || uniqueMethods !== value.denominator.uniqueMethods) throw new Error("ROUTE_PERMISSION_MAP_DENOMINATOR_DRIFT");
  const seen = new Set<string>();
  for (const entry of value.entries) {
    if (!entry.path.startsWith("src/app/api/") || !entry.method || !entry.scopeResolver || !entry.preservedGuards) throw new Error("ROUTE_PERMISSION_MAP_ENTRY_INVALID");
    if (entry.discriminator !== null && !allowedDiscriminators.has(entry.discriminator)) throw new Error("ROUTE_PERMISSION_MAP_DISCRIMINATOR_INVALID");
    if (entry.authorizationMode === "permission" && !entry.permissionCode) throw new Error("ROUTE_PERMISSION_MAP_PERMISSION_MISSING");
    if (entry.authorizationMode !== "permission" && entry.permissionCode !== null) throw new Error("ROUTE_PERMISSION_MAP_PERMISSION_UNEXPECTED");
    const key = `${entry.path}\0${entry.method}\0${entry.discriminator ?? ""}`;
    if (seen.has(key)) throw new Error("ROUTE_PERMISSION_MAP_DUPLICATE_POLICY");
    seen.add(key);
  }
  const byMethod = new Map<string, JenfuRoutePermissionEntry[]>();
  for (const entry of value.entries) {
    const key = `${entry.path}\0${entry.method}`;
    byMethod.set(key, [...(byMethod.get(key) ?? []), entry]);
  }
  for (const [key, entries] of byMethod) {
    if (entries.some((entry) => entry.discriminator === null) &&
      entries.some((entry) => entry.discriminator !== null) &&
      key !== "src/app/api/admin/accounts/route.ts\0GET") {
      throw new Error("ROUTE_PERMISSION_MAP_MIXED_POLICY_UNREVIEWED");
    }
  }
  return { uniqueFiles, uniqueMethods, policyEntries: value.entries.length };
}

export function resolveJenfuRouteAuthorization(path: string, method: string, discriminator?: JenfuRouteDiscriminator | null) {
  const routeEntries = JENFU_ROUTE_PERMISSION_MAP.entries.filter((entry) => routePathMatches(entry.path, path) && entry.method === method);
  const contextualEntries = routeEntries.filter((entry) => entry.discriminator !== null);
  // The existing account list already has a null policy. Its one new view has
  // a stricter, explicit discriminator; all other contextual routes still
  // require theirs and remain closed when none is supplied.
  const accountList = path === "src/app/api/admin/accounts/route.ts" && method === "GET";
  if (contextualEntries.length > 0 && !discriminator && !accountList) return null;
  const matches = discriminator
    ? contextualEntries.filter((entry) => entry.discriminator === discriminator)
    : routeEntries.filter((entry) => entry.discriminator === null);
  if (matches.length !== 1) return null;
  return matches[0];
}

export function resolveJenfuRoutePolicy(
  path: string,
  method: string,
  input: { discriminator?: JenfuRouteDiscriminator | null; expectedPermissionCode?: string }
) {
  const entry = resolveJenfuRouteAuthorization(path, method, input.discriminator);
  if (input.expectedPermissionCode !== undefined && entry?.permissionCode !== input.expectedPermissionCode) return null;
  return entry;
}

function routePathMatches(template: string, actual: string) {
  const templateParts = template.split("/");
  const actualParts = actual.split("/");
  if (templateParts.length !== actualParts.length) return false;
  return templateParts.every((part, index) => {
    if (/^\[[^\]]+\]$/u.test(part)) return actualParts[index].length > 0;
    return part === actualParts[index];
  });
}
