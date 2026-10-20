import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import {
  authorizeDynamicResourceCapabilityInSnapshot,
  canonicalCapabilityGroups,
  isDynamicRolePolicyInSnapshot,
  type PrincipalCapabilityGroup
} from "@/lib/principal-resource-capability";

export type NumberingExportJobResultAccessPlan = {
  groups: PrincipalCapabilityGroup[];
  requiresAdminMatrix: boolean;
};

const EXPORT_RESULT_KEYS = new Set([
  "exportMode", "companyId", "generatedAt", "roots", "parts", "drawings", "auditSummary"
]);

const PROTECTED_AUDIT_ACTIONS = new Set([
  "numbering.role.upsert",
  "numbering.role_permission.upsert",
  "numbering.role_scope.upsert",
  "numbering.user_role_assignment.upsert",
  "numbering.user_role_assignment.revoke",
  "numbering.role_priority.save",
  "numbering.approval_delegation.upsert",
  "numbering.approval_delegation.revoke",
  "numbering.approval_rule.upsert",
  "numbering.approval_rule_template.apply",
  "numbering.approval_batch.create",
  "numbering.approval_batch.decision",
  "numbering.approval_batch.resubmit_rejected",
  "numbering.approval.request",
  "numbering.approval.decision",
  "numbering.export_job.create",
  "numbering.monthly_audit_report.generate"
]);

const GOVERNANCE_AUDIT_ACTIONS = new Set([
  "numbering.role.upsert",
  "numbering.role_permission.upsert",
  "numbering.role_scope.upsert",
  "numbering.user_role_assignment.upsert",
  "numbering.user_role_assignment.revoke",
  "numbering.role_priority.save",
  "numbering.approval_delegation.upsert",
  "numbering.approval_delegation.revoke",
  "numbering.approval_rule.upsert",
  "numbering.approval_rule_template.apply"
]);

const TARGET_FIELD_GROUPS: Record<string, PrincipalCapabilityGroup> = {
  rootcode: "part",
  root_code: "part",
  partnumber: "part",
  part_number: "part",
  linkedpartnumber: "part",
  linked_part_number: "part",
  partrootid: "part",
  part_root_id: "part",
  partnumbers: "part",
  part_numbers: "part",
  deletedpartnumbers: "part",
  deleted_part_numbers: "part",
  drawingnumber: "drawing",
  drawing_number: "drawing",
  linkeddrawingnumber: "drawing",
  linked_drawing_number: "drawing",
  drawingnumberid: "drawing",
  drawing_number_id: "drawing",
  drawingnumbers: "drawing",
  drawing_numbers: "drawing",
  deleteddrawingnumbers: "drawing",
  deleted_drawing_numbers: "drawing"
};

const TARGET_COLLECTION_GROUPS: Record<string, PrincipalCapabilityGroup> = {
  roots: "part",
  parts: "part",
  drawings: "drawing",
  models: "model",
  shared_models: "model",
  transfer_packages: "transfer"
};

const AUDIT_ROW_KEYS = new Set(["action", "actor_id", "detail_json", "created_at"]);

const EXPORT_ROW_KEYS = {
  roots: new Set(["root_code", "core_name", "item_kind", "record_status", "updated_at"]),
  parts: new Set(["root_code", "part_number", "part_name", "item_kind", "record_status", "updated_at"]),
  drawings: new Set(["root_code", "drawing_number", "purpose_code", "purpose_description", "record_status", "updated_at"])
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasTargetValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0
    : typeof value === "number" && Number.isFinite(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function groupsInCanonicalDetail(value: unknown, groups: Set<PrincipalCapabilityGroup>, seen = new Set<object>()): boolean {
  if (Array.isArray(value)) {
    if (seen.has(value)) return true;
    seen.add(value);
    for (const item of value) {
      if (!groupsInCanonicalDetail(item, groups, seen)) return false;
    }
    return true;
  }
  if (!isRecord(value)) return true;
  if (seen.has(value)) return true;
  seen.add(value);

  const entityType = typeof value.entityType === "string" ? value.entityType
    : typeof value.entity_type === "string" ? value.entity_type : null;
  if (entityType) {
    const entityGroups = entityType === "part_root" || entityType === "part_roots" ? ["part"] as const
      : entityType === "drawing_part" ? ["part", "drawing"] as const
        : canonicalCapabilityGroups(entityType, typeof value.category === "string" ? value.category : null);
    if (entityGroups.length === 0) return false;
    for (const group of entityGroups) groups.add(group);
  }

  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase();
    const fieldGroup = TARGET_FIELD_GROUPS[normalizedKey];
    if (fieldGroup && hasTargetValue(nested)) groups.add(fieldGroup);
    const collectionGroup = TARGET_COLLECTION_GROUPS[normalizedKey];
    if (collectionGroup && Array.isArray(nested) && nested.length > 0) groups.add(collectionGroup);
    if (!groupsInCanonicalDetail(nested, groups, seen)) return false;
  }
  return true;
}

function parseAuditDetail(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/**
 * Resolve groups from the repository-owned result schema and canonical targets
 * in its bounded numbering audit rows. `null` means the payload is not safe to
 * deliver under dynamic resource permissions.
 */
export function numberingExportJobResultAccessPlan(result: unknown): NumberingExportJobResultAccessPlan | null {
  if (!isRecord(result) || Object.keys(result).some((key) => !EXPORT_RESULT_KEYS.has(key))) return null;
  if (result.exportMode !== "no_audit" && result.exportMode !== "last_change_summary" &&
      result.exportMode !== "full_change_summary") return null;
  if (typeof result.companyId !== "string" || !result.companyId.trim() || typeof result.generatedAt !== "string") return null;
  if (!Array.isArray(result.roots) || !Array.isArray(result.parts) || !Array.isArray(result.drawings)) return null;
  if (result.exportMode === "no_audit" ? Object.hasOwn(result, "auditSummary") : !Array.isArray(result.auditSummary)) return null;

  const groups = new Set<PrincipalCapabilityGroup>();
  for (const row of result.roots) {
    if (!isRecord(row) || !hasOnlyKeys(row, EXPORT_ROW_KEYS.roots) || !hasTargetValue(row.root_code)) return null;
    groups.add("part");
  }
  for (const row of result.parts) {
    if (!isRecord(row) || !hasOnlyKeys(row, EXPORT_ROW_KEYS.parts) ||
        !hasTargetValue(row.part_number) || !hasTargetValue(row.root_code)) return null;
    groups.add("part");
  }
  for (const row of result.drawings) {
    if (!isRecord(row) || !hasOnlyKeys(row, EXPORT_ROW_KEYS.drawings) ||
        !hasTargetValue(row.drawing_number) || !hasTargetValue(row.root_code)) return null;
    groups.add("part");
    groups.add("drawing");
  }

  let requiresAdminMatrix = false;
  if (Array.isArray(result.auditSummary)) {
    for (const auditRow of result.auditSummary) {
      if (!isRecord(auditRow) || !hasOnlyKeys(auditRow, AUDIT_ROW_KEYS) ||
          typeof auditRow.action !== "string" || !auditRow.action.trim()) return null;
      const action = auditRow.action.trim();
      const auditGroups = new Set<PrincipalCapabilityGroup>();
      if (!groupsInCanonicalDetail(parseAuditDetail(auditRow.detail_json), auditGroups)) return null;
      if (auditGroups.size === 0) {
        if (!PROTECTED_AUDIT_ACTIONS.has(action)) return null;
        requiresAdminMatrix = true;
      } else {
        for (const group of auditGroups) groups.add(group);
        if (GOVERNANCE_AUDIT_ACTIONS.has(action)) requiresAdminMatrix = true;
      }
    }
  }

  return { groups: [...groups], requiresAdminMatrix };
}

function unavailableResponse() {
  return Response.json({ code: "principal_export_result_scope_unavailable" },
    { status: 503, headers: { "cache-control": "private, no-store" } });
}

/** Same verified snapshot as the export read; legacy publications keep their prior guards. */
export async function authorizeNumberingExportJobResultInSnapshot(
  snapshot: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest,
  result: unknown
): Promise<Response | null> {
  if (!await isDynamicRolePolicyInSnapshot(snapshot)) return null;
  const plan = numberingExportJobResultAccessPlan(result);
  if (!plan || !isRecord(result) || result.companyId !== verified.profile.companyId) return unavailableResponse();

  if (plan.groups.length > 0) {
    const viewDenial = await authorizeDynamicResourceCapabilityInSnapshot(snapshot, verified, plan.groups, "view");
    if (viewDenial) return viewDenial;
    const downloadDenial = await authorizeDynamicResourceCapabilityInSnapshot(snapshot, verified, plan.groups, "download");
    if (downloadDenial) return downloadDenial;
  }

  if (plan.requiresAdminMatrix) {
    const permissionCode = "settings.admin_matrix";
    const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
      [{ permissionKind: "action", permissionCode }]);
    if (decisions.length !== 1 || decisions[0]?.principalId !== verified.session.principalId ||
        decisions[0]?.permissionCode !== permissionCode) return unavailableResponse();
    if (!decisions[0].allowed) return jenfuEntitlementFailureResponse(decisions[0].decisionCode);
    if (decisions[0].decisionCode !== "allowed") return unavailableResponse();
  }
  return null;
}
