import crypto from "node:crypto";
import { EXPLICIT_ONLY_PERMISSION_CODES } from "@/lib/access-control-policy";
import type { PrincipalAclMigrationInput } from "@/lib/jenfu-principal-acl-migration-plan";
import { hashPrincipalSource } from "@/lib/jenfu-principal-source-canonical";

type Plan = {
  principalAssignments: Array<Record<string, unknown>>;
  principalDelegations: Array<Record<string, unknown>>;
};
type Policy = {
  role_id: string; permission_kind: string; permission_code: string;
  allowed: number | boolean;
};
type ScopeRule = { role_id: string };
type Account = {
  pdmUserId: string; accountStatus: string; systemRoleEnabled: boolean;
};

const BASE_ROLES: Record<string, readonly string[]> = {
  Admin: ["system_admin", "pdm_admin"],
  "R&D Manager": ["rd_manager"],
  Engineer: ["rd"],
  Manufacturing: ["manufacturing"],
  Procurement: ["procurement"]
};
const SENTINEL = "__dev121_unlisted_workspace_permission__";

function invalid(): never { throw new Error("PRINCIPAL_WORKSPACE_SHADOW_INVALID"); }
function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) invalid();
  return parsed;
}
function active(start: string | null, end: string | null, revoked: string | null, at: string) {
  const decision = timestamp(at);
  return revoked === null && (start === null || timestamp(start) <= decision) &&
    (end === null || timestamp(end) > decision);
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value) invalid();
  return value;
}

/**
 * Compares the old and proposed workspace decisions without writing ACL rows.
 * Resource scopes and delegation deliberately remain visible gaps, not PASS.
 */
export function assessPrincipalCutoverWorkspaceShadow(input: {
  source: PrincipalAclMigrationInput;
  plan: Plan;
  accounts: Account[];
  rolePermissions: Policy[];
  roleScopeRules: ScopeRule[];
}) {
  const { source, plan } = input;
  if (!source || !plan || !Array.isArray(source.profiles) ||
    !Array.isArray(plan.principalAssignments) ||
    !Array.isArray(plan.principalDelegations) ||
    !Array.isArray(input.accounts) || !Array.isArray(input.rolePermissions) ||
    !Array.isArray(input.roleScopeRules) ||
    !Number.isFinite(Date.parse(source.cutoverAt))) invalid();
  const at = new Date(source.cutoverAt).toISOString();
  const priority = new Map(source.rolePriority.map((code, index) => [code, index]));
  if (priority.size !== source.rolePriority.length) invalid();
  const roles = new Map(source.roles.map((role) => [role.id, role]));
  const roleByCode = new Map(source.roles.map((role) => [role.roleCode, role]));
  if (roles.size !== source.roles.length || roleByCode.size !== source.roles.length) invalid();
  const accountByUser = new Map(input.accounts.map((row) => [row.pdmUserId, row]));
  if (accountByUser.size !== input.accounts.length) invalid();
  const policy = new Map<string, boolean>();
  const permissionKeys = new Set<string>([`action\0${SENTINEL}`, `page\0${SENTINEL}`]);
  for (const code of EXPLICIT_ONLY_PERMISSION_CODES) permissionKeys.add(`action\0${code}`);
  for (const row of input.rolePermissions) {
    if (!roles.has(row.role_id) || !["page", "action"].includes(row.permission_kind) ||
      !row.permission_code || ![true, false, 1, 0].includes(row.allowed)) invalid();
    const key = `${row.role_id}\0${row.permission_kind}\0${row.permission_code}`;
    if (policy.has(key)) invalid();
    policy.set(key, row.allowed === true || row.allowed === 1);
    permissionKeys.add(`${row.permission_kind}\0${row.permission_code}`);
  }
  const scopeRuleRoles = new Set(input.roleScopeRules.map((row) => row.role_id));
  if ([...scopeRuleRoles].some((id) => !roles.has(id))) invalid();
  const gaps: Array<{ pdmUserId: string; reason: string; sourceId: string }> = [];
  const mismatches: Array<{ pdmUserId: string; permission: string;
    legacy: string; principal: string }> = [];
  const matrix = crypto.createHash("sha256");
  let decisionCount = 0;
  let mismatchCount = 0;
  const decide = (codes: readonly string[], kind: string, code: string) => {
    const sorted = [...new Set(codes)].sort((left, right) =>
      (priority.get(left) ?? Infinity) - (priority.get(right) ?? Infinity) ||
      left.localeCompare(right));
    for (const roleCode of sorted) {
      const role = roleByCode.get(roleCode);
      if (!role || !role.enabled || !priority.has(roleCode)) continue;
      const key = `${role.id}\0${kind}\0${code}`;
      if (policy.has(key)) return `${roleCode}:${policy.get(key) ? "allow" : "deny"}`;
      if (roleCode === "system_admin" && !EXPLICIT_ONLY_PERMISSION_CODES.has(code)) {
        return `${roleCode}:allow`;
      }
    }
    return "none:deny";
  };
  for (const profile of [...source.profiles].sort((a, b) =>
    a.pdmUserId.localeCompare(b.pdmUserId))) {
    const account = accountByUser.get(profile.pdmUserId);
    const baseCodes = BASE_ROLES[profile.legacyRole];
    if (!account || !baseCodes || account.systemRoleEnabled !== profile.systemRoleEnabled) invalid();
    matrix.update(JSON.stringify({ pdmUserId: profile.pdmUserId,
      accountStatus: account.accountStatus, systemRoleEnabled: account.systemRoleEnabled }));
    if (account.accountStatus !== "active" || !account.systemRoleEnabled) continue;
    const legacyCodes = [...baseCodes];
    for (const assignment of source.assignments.filter((row) =>
      row.userId === profile.pdmUserId &&
      active(row.startsAt, row.hardEndsAt, row.revokedAt, at))) {
      const role = roles.get(assignment.roleId);
      if (!role) invalid();
      legacyCodes.push(role.roleCode);
      if (assignment.scopeTemplate !== "workspace_all" || assignment.namedScope !== "") {
        gaps.push({ pdmUserId: profile.pdmUserId,
          reason: "resource_scoped_assignment", sourceId: assignment.id });
      }
      if (timestamp(assignment.assignedAt) > timestamp(at)) {
        gaps.push({ pdmUserId: profile.pdmUserId,
          reason: "future_assigned_at", sourceId: assignment.id });
      }
    }
    for (const roleCode of new Set(legacyCodes)) {
      const role = roleByCode.get(roleCode);
      if (!role || !priority.has(roleCode)) invalid();
      if (scopeRuleRoles.has(role.id)) gaps.push({ pdmUserId: profile.pdmUserId,
        reason: "role_scope_rule", sourceId: role.id });
    }
    const principalCodes = plan.principalAssignments.filter((row) =>
      row.principalId === profile.principalId && row.revokedAt === null &&
      row.scopeTemplate === "workspace_all" && row.namedScope === "" &&
      timestamp(text(row.assignedAt)) <= timestamp(at) &&
      (row.startsAt === null || timestamp(text(row.startsAt)) <= timestamp(at)) &&
      (row.hardEndsAt === null || timestamp(text(row.hardEndsAt)) > timestamp(at)) &&
      !scopeRuleRoles.has(text(row.roleId)))
      .map((row) => {
        const role = roles.get(text(row.roleId));
        if (!role) invalid();
        return role.roleCode;
      });
    for (const permission of [...permissionKeys].sort()) {
      const [kind, code] = permission.split("\0");
      const legacy = decide(legacyCodes, kind, code);
      const principal = decide(principalCodes, kind, code);
      decisionCount += 1;
      matrix.update(JSON.stringify({ pdmUserId: profile.pdmUserId,
        permission, legacy, principal }));
      // The role that produced a decision is provenance, not the decision.
      // Preserve both role traces in the hash, but compare effective access.
      if (legacy.endsWith(":allow") !== principal.endsWith(":allow")) {
        mismatchCount += 1;
        if (mismatches.length < 128) mismatches.push({ pdmUserId: profile.pdmUserId,
          permission, legacy, principal });
      }
    }
  }
  const cohort = new Set(source.profiles.map((row) => row.pdmUserId));
  for (const delegation of source.delegations) {
    if ((cohort.has(delegation.delegatedFrom) || cohort.has(delegation.delegatedTo)) &&
      delegation.revokedAt === null &&
      (delegation.startsAt === null || timestamp(delegation.startsAt) <= timestamp(at)) &&
      (delegation.endsAt === null || timestamp(delegation.endsAt) >= timestamp(at))) {
      gaps.push({ pdmUserId: delegation.delegatedTo,
        reason: "active_delegation", sourceId: delegation.id });
    }
  }
  gaps.sort((a, b) => a.pdmUserId.localeCompare(b.pdmUserId) ||
    a.reason.localeCompare(b.reason) || a.sourceId.localeCompare(b.sourceId));
  mismatches.sort((a, b) => a.pdmUserId.localeCompare(b.pdmUserId) ||
    a.permission.localeCompare(b.permission));
  const gapCount = gaps.length;
  const status = gapCount ? "requires_resource_adapter" :
    mismatchCount ? "mismatch" : "pass";
  return { status, decisionCount, gapCount, mismatchCount,
    gaps: gaps.slice(0, 128), mismatches,
    shadowHash: hashPrincipalSource({ contractVersion: "ai-pdm.principal-workspace-shadow.v1",
      status, decisionCount, gapCount, mismatchCount,
      matrixHash: matrix.digest("hex"), gaps }) };
}
