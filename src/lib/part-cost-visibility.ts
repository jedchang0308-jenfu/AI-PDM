import type { NumberingPermissionCheckResult, NumberingUserScope, PartModuleDetailRecord, PartModuleListRecord } from "@/lib/db";

const COST_AMOUNT_LEGACY_ROLES = new Set(["Admin", "R&D Manager", "Procurement"]);
const COST_AMOUNT_ACL_ROLES = new Set(["system_admin", "pdm_admin", "rd_manager", "procurement"]);

export function canViewPartCostAmounts(input: {
  user: NumberingUserScope;
  permission?: NumberingPermissionCheckResult | null;
}) {
  if (COST_AMOUNT_LEGACY_ROLES.has(input.user.role)) return true;

  const evaluatedRoles = input.permission?.evaluatedRoles ?? [];
  return evaluatedRoles.some((roleCode) => COST_AMOUNT_ACL_ROLES.has(roleCode));
}

function redactStandardCost<T extends PartModuleListRecord>(part: T): T {
  if (!part.standardCost) return part;
  return {
    ...part,
    standardCost: {
      ...part.standardCost,
      unitCost: null
    }
  };
}

export function redactPartListCosts<T extends PartModuleListRecord>(parts: T[], canViewCostAmounts: boolean): T[] {
  if (canViewCostAmounts) return parts;
  return parts.map(redactStandardCost);
}

export function redactPartDetailCosts(part: PartModuleDetailRecord, canViewCostAmounts: boolean): PartModuleDetailRecord {
  if (canViewCostAmounts) return part;
  return {
    ...redactStandardCost(part),
    costProfiles: []
  };
}
