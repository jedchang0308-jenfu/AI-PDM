import type { AsyncDatabaseProviderKind } from "@/lib/db-async-provider";

export type JenfuEntitlementMode = "legacy" | "enforce";

export function getJenfuEntitlementMode(): JenfuEntitlementMode {
  const value = process.env.PDM_JENFU_ENTITLEMENT_MODE?.trim().toLowerCase() || "legacy";
  if (value !== "legacy" && value !== "enforce") throw new Error("ENTITLEMENT_MODE_INVALID");
  return value;
}

export function assertJenfuEnforcePrerequisites(input: {
  platformAuthMode: string;
  databaseKind: AsyncDatabaseProviderKind;
  contractLockMatches: boolean;
}) {
  if (input.platformAuthMode !== "on") throw new Error("ENTITLEMENT_PLATFORM_AUTH_REQUIRED");
  if (input.databaseKind !== "postgres") throw new Error("ENTITLEMENT_POSTGRES_REQUIRED");
  if (!input.contractLockMatches) throw new Error("ENTITLEMENT_CONTRACT_LOCK_MISMATCH");
}
