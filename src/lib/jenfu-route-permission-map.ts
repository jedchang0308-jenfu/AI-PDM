import routeMap from "../../config/access-control/jenfu-route-permission-map.v1.json";

export type JenfuRouteAuthorizationMode = "permission" | "authenticated_domain" | "existing_command" | "existing_path" | "retired";
export type JenfuRoutePermissionEntry = {
  path: string;
  method: string;
  discriminator: string | null;
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

export function validateJenfuRoutePermissionMap(value = JENFU_ROUTE_PERMISSION_MAP) {
  if (value.contractVersion !== "jenfu.platform-entitlement.v1" || value.applicationId !== "ai-pdm") throw new Error("ROUTE_PERMISSION_MAP_CONTRACT_INVALID");
  const uniqueFiles = new Set(value.entries.map((entry) => entry.path)).size;
  const uniqueMethods = new Set(value.entries.map((entry) => `${entry.path}\0${entry.method}`)).size;
  if (value.entries.length !== 79 || uniqueFiles !== 57 || uniqueMethods !== 71) throw new Error("ROUTE_PERMISSION_MAP_DENOMINATOR_DRIFT");
  for (const entry of value.entries) {
    if (!entry.path.startsWith("src/app/api/") || !entry.method || !entry.scopeResolver || !entry.preservedGuards) throw new Error("ROUTE_PERMISSION_MAP_ENTRY_INVALID");
    if (entry.authorizationMode === "permission" && !entry.permissionCode) throw new Error("ROUTE_PERMISSION_MAP_PERMISSION_MISSING");
    if (entry.authorizationMode !== "permission" && entry.permissionCode !== null) throw new Error("ROUTE_PERMISSION_MAP_PERMISSION_UNEXPECTED");
  }
  return { uniqueFiles, uniqueMethods, policyEntries: value.entries.length };
}

export function resolveJenfuRouteAuthorization(path: string, method: string, discriminator?: string | null) {
  const matches = JENFU_ROUTE_PERMISSION_MAP.entries.filter((entry) => routePathMatches(entry.path, path) && entry.method === method && (entry.discriminator === null || entry.discriminator === discriminator));
  if (matches.length !== 1) return null;
  return matches[0];
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
