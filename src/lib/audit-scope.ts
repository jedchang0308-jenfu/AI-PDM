export const CURRENT_TENANT_AUDIT_ACTIONS = [
  "numbering.create",
  "numbering.drawing_number.create",
  "numbering.part_number.create",
  "numbering.drawing_part.create"
] as const;

export const CURRENT_GLOBAL_AUDIT_ACTIONS = [
  "numbering.approval_rule.upsert",
  "numbering.approval_rule_template.apply",
  "numbering.role.upsert",
  "numbering.role_permission.upsert",
  "numbering.role_scope.upsert",
  "numbering.role_priority.save"
] as const;

export type AuditScopeKind = "tenant" | "global" | "legacy_unscoped";

const tenantActions = new Set<string>(CURRENT_TENANT_AUDIT_ACTIONS);
const globalActions = new Set<string>(CURRENT_GLOBAL_AUDIT_ACTIONS);

export function resolveAuditWriteScope(input: {
  action: string;
  companyId?: string | null;
  allowLegacy?: boolean;
}): { companyId: string | null; scopeKind: AuditScopeKind } {
  const action = input.action.trim();
  const companyId = input.companyId?.trim() || null;
  if (tenantActions.has(action)) {
    if (!companyId) throw new Error("TENANT_AUDIT_COMPANY_REQUIRED");
    return { companyId, scopeKind: "tenant" };
  }
  if (globalActions.has(action)) {
    if (companyId) throw new Error("GLOBAL_AUDIT_COMPANY_FORBIDDEN");
    return { companyId: null, scopeKind: "global" };
  }
  if (!input.allowLegacy) throw new Error("AUDIT_ACTION_SCOPE_UNCLASSIFIED");
  if (companyId) throw new Error("LEGACY_AUDIT_COMPANY_FORBIDDEN");
  return { companyId: null, scopeKind: "legacy_unscoped" };
}

export function tenantAuditReadPredicate(alias = "audit_logs") {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(alias)) throw new Error("AUDIT_ALIAS_INVALID");
  return `${alias}.scope_kind = 'tenant' AND ${alias}.company_id = :companyId`;
}
