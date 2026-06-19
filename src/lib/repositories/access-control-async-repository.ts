import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type AccessControlRole = {
  id: string;
  roleCode: string;
  title: string;
  systemDefined: boolean;
  enabled: boolean;
};

export type AccessControlUser = {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
};

export type AccessControlRolePermission = {
  id: string;
  roleId: string;
  roleCode: string;
  permissionKind: "page" | "action";
  permissionCode: string;
  allowed: boolean;
};

export type AccessControlPermissionCheckInput = {
  user: {
    id: string;
    role: string;
  };
  permissionKind: AccessControlRolePermission["permissionKind"];
  permissionCode: string;
  projectCode?: string | null;
  actionCode?: string | null;
};

export type AccessControlPermissionCheckResult = {
  allowed: boolean;
  permissionKind: AccessControlRolePermission["permissionKind"];
  permissionCode: string;
  roleCode: string | null;
  evaluatedRoles: string[];
  reason: "explicit" | "system_admin_default" | "no_candidate_role" | "missing_permission";
};

type AccessControlRoleRow = {
  id: string;
  role_code: string;
  title: string;
  system_defined: number | boolean;
  enabled: number | boolean;
};

type AccessControlUserRow = {
  id: string;
  display_name: string;
  email: string | null;
  role: string;
};

type AccessControlRolePermissionRow = {
  id: string;
  role_id: string;
  role_code: string;
  permission_kind: "page" | "action";
  permission_code: string;
  allowed: number | boolean;
};

type AccessControlAssignedRoleRow = {
  role_code: string;
};

type AccessControlRolePriorityRow = {
  priority_json: string;
};

type AccessControlDelegationRow = {
  delegated_from: string;
  project_code: string | null;
  action_code: string | null;
  delegated_from_role: string;
};

export const SELECT_ACCESS_CONTROL_ROLES_SQL = `
  SELECT id, role_code, title, system_defined, enabled
  FROM roles
  ORDER BY system_defined DESC, title ASC
`;

export const SELECT_ACCESS_CONTROL_USERS_SQL = `
  SELECT id, display_name, email, role
  FROM users
  ORDER BY role DESC, display_name ASC
`;

export const SELECT_ACCESS_CONTROL_ROLE_BY_CODE_SQL = `
  SELECT id, role_code, title, system_defined, enabled
  FROM roles
  WHERE role_code = :roleCode
`;

export const SELECT_ACCESS_CONTROL_ROLE_PERMISSION_SQL = `
  SELECT
    p.id, p.role_id, r.role_code,
    p.permission_kind, p.permission_code, p.allowed
  FROM role_permissions p
  JOIN roles r ON r.id = p.role_id
  WHERE r.role_code = :roleCode
    AND p.permission_kind = :permissionKind
    AND p.permission_code = :permissionCode
`;

export const SELECT_ACCESS_CONTROL_ROLE_PERMISSIONS_SQL = `
  SELECT
    p.id, p.role_id, r.role_code,
    p.permission_kind, p.permission_code, p.allowed
  FROM role_permissions p
  JOIN roles r ON r.id = p.role_id
  WHERE r.role_code = :roleCode
  ORDER BY p.permission_kind ASC, p.permission_code ASC
`;

export const SELECT_ACCESS_CONTROL_ASSIGNED_ROLE_CODES_SQL = `
  SELECT r.role_code
  FROM user_role_assignments a
  JOIN roles r ON r.id = a.role_id
  WHERE a.user_id = :userId
    AND a.revoked_at IS NULL
    AND r.enabled = 1
  ORDER BY a.assigned_at DESC, r.role_code ASC
`;

export const SELECT_ACCESS_CONTROL_ACTIVE_ROLE_PRIORITY_SQL = `
  SELECT priority_json
  FROM role_priority_versions
  WHERE status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
`;

export const SELECT_ACCESS_CONTROL_ACTIVE_DELEGATIONS_SQL = `
  SELECT d.delegated_from, d.project_code, d.action_code, u.role AS delegated_from_role
  FROM approval_delegations d
  JOIN users u ON u.id = d.delegated_from
  WHERE d.delegated_to = :userId
    AND d.revoked_at IS NULL
    AND (d.starts_at IS NULL OR d.starts_at <= :now)
    AND (d.ends_at IS NULL OR d.ends_at >= :now)
  ORDER BY d.created_at DESC
`;

export const SELECT_ACCESS_CONTROL_ENABLED_ROLES_SQL = `
  SELECT id, role_code, title, system_defined, enabled
  FROM roles
  WHERE enabled = 1
`;

export const SELECT_ACCESS_CONTROL_PERMISSIONS_BY_CODE_SQL = `
  SELECT
    p.id, p.role_id, r.role_code,
    p.permission_kind, p.permission_code, p.allowed
  FROM role_permissions p
  JOIN roles r ON r.id = p.role_id
  WHERE p.permission_kind = :permissionKind
    AND p.permission_code = :permissionCode
`;

export const UPSERT_ACCESS_CONTROL_ROLE_PERMISSION_SQL = `
  INSERT INTO role_permissions (id, role_id, permission_kind, permission_code, allowed, created_at, updated_at)
  VALUES (:id, :roleId, :permissionKind, :permissionCode, :allowed, :now, :now)
  ON CONFLICT(role_id, permission_kind, permission_code) DO UPDATE SET
    allowed = excluded.allowed,
    updated_at = excluded.updated_at
`;

const DEFAULT_ACCESS_CONTROL_ROLE_PRIORITY = ["system_admin", "pdm_admin", "rd_manager", "document_admin", "qa", "rd"];

function toBoolean(value: number | boolean) {
  return value === true || value === 1;
}

function boolToInt(value: boolean) {
  return value ? 1 : 0;
}

function mapRole(row: AccessControlRoleRow): AccessControlRole {
  return {
    id: row.id,
    roleCode: row.role_code,
    title: row.title,
    systemDefined: toBoolean(row.system_defined),
    enabled: toBoolean(row.enabled)
  };
}

function mapUser(row: AccessControlUserRow): AccessControlUser {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    role: row.role
  };
}

function mapRolePermission(row: AccessControlRolePermissionRow): AccessControlRolePermission {
  return {
    id: row.id,
    roleId: row.role_id,
    roleCode: row.role_code,
    permissionKind: row.permission_kind,
    permissionCode: row.permission_code,
    allowed: toBoolean(row.allowed)
  };
}

function baseRoleCodesForUserRole(role: string) {
  if (role === "Admin") return ["system_admin", "pdm_admin"];
  if (role === "R&D Manager") return ["rd_manager"];
  if (role === "Engineer") return ["rd"];
  return [role.toLowerCase().replaceAll(" ", "_")];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseRolePriorityJson(value: string | null | undefined) {
  if (!value) return DEFAULT_ACCESS_CONTROL_ROLE_PRIORITY;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : DEFAULT_ACCESS_CONTROL_ROLE_PRIORITY;
  } catch {
    return DEFAULT_ACCESS_CONTROL_ROLE_PRIORITY;
  }
}

function sortRoleCodesByPriority(roleCodes: string[], priority: string[]) {
  const priorityRank = new Map(priority.map((roleCode, index) => [roleCode, index]));
  return uniqueStrings(roleCodes).sort((left, right) => {
    const leftRank = priorityRank.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = priorityRank.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });
}

function delegationMatchesPermissionScope(
  delegation: Pick<AccessControlDelegationRow, "project_code" | "action_code">,
  input: Pick<AccessControlPermissionCheckInput, "projectCode" | "actionCode" | "permissionCode">
) {
  if (delegation.project_code && delegation.project_code !== input.projectCode) return false;
  if (delegation.action_code && delegation.action_code !== input.actionCode && delegation.action_code !== input.permissionCode) return false;
  return true;
}

export class AsyncAccessControlRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => `role-permission-${crypto.randomUUID().slice(0, 12)}`
  ) {}

  async listRoles(): Promise<AccessControlRole[]> {
    const rows = await this.client.query<AccessControlRoleRow>(SELECT_ACCESS_CONTROL_ROLES_SQL);
    return rows.map(mapRole);
  }

  async listUsers(): Promise<AccessControlUser[]> {
    const rows = await this.client.query<AccessControlUserRow>(SELECT_ACCESS_CONTROL_USERS_SQL);
    return rows.map(mapUser);
  }

  async getRoleByCode(roleCode: string): Promise<AccessControlRole | null> {
    const row = await this.client.queryOne<AccessControlRoleRow>(SELECT_ACCESS_CONTROL_ROLE_BY_CODE_SQL, { roleCode });
    return row ? mapRole(row) : null;
  }

  async listRolePermissions(roleCode: string): Promise<AccessControlRolePermission[]> {
    const rows = await this.client.query<AccessControlRolePermissionRow>(SELECT_ACCESS_CONTROL_ROLE_PERMISSIONS_SQL, { roleCode });
    return rows.map(mapRolePermission);
  }

  async listAssignedRoleCodes(userId: string): Promise<string[]> {
    const rows = await this.client.query<AccessControlAssignedRoleRow>(SELECT_ACCESS_CONTROL_ASSIGNED_ROLE_CODES_SQL, { userId });
    return rows.map((row) => row.role_code);
  }

  async listUserRoleCodes(user: AccessControlPermissionCheckInput["user"]): Promise<string[]> {
    return uniqueStrings([...baseRoleCodesForUserRole(user.role), ...(await this.listAssignedRoleCodes(user.id))]);
  }

  async getActiveRolePriority(): Promise<string[]> {
    const row = await this.client.queryOne<AccessControlRolePriorityRow>(SELECT_ACCESS_CONTROL_ACTIVE_ROLE_PRIORITY_SQL);
    return parseRolePriorityJson(row?.priority_json);
  }

  async checkPermission(input: AccessControlPermissionCheckInput): Promise<AccessControlPermissionCheckResult> {
    const permissionCode = input.permissionCode.trim();
    const baseRoles = await this.listUserRoleCodes(input.user);
    const now = this.clock();
    const delegationRows = await this.client.query<AccessControlDelegationRow>(SELECT_ACCESS_CONTROL_ACTIVE_DELEGATIONS_SQL, {
      userId: input.user.id,
      now
    });
    const delegatedRoles = (
      await Promise.all(
        delegationRows
          .filter((delegation) => delegationMatchesPermissionScope(delegation, { ...input, permissionCode }))
          .map((delegation) => this.listUserRoleCodes({ id: delegation.delegated_from, role: delegation.delegated_from_role }))
      )
    ).flat();
    const candidateRoles = sortRoleCodesByPriority([...baseRoles, ...delegatedRoles], await this.getActiveRolePriority());

    if (!permissionCode || candidateRoles.length === 0) {
      return {
        allowed: false,
        permissionKind: input.permissionKind,
        permissionCode,
        roleCode: null,
        evaluatedRoles: candidateRoles,
        reason: "no_candidate_role"
      };
    }

    const enabledRoles = await this.client.query<AccessControlRoleRow>(SELECT_ACCESS_CONTROL_ENABLED_ROLES_SQL);
    const enabledRoleByCode = new Map(enabledRoles.filter((role) => candidateRoles.includes(role.role_code)).map((role) => [role.role_code, role]));
    const permissionRows = await this.client.query<AccessControlRolePermissionRow>(SELECT_ACCESS_CONTROL_PERMISSIONS_BY_CODE_SQL, {
      permissionKind: input.permissionKind,
      permissionCode
    });
    const permissionByRoleId = new Map(permissionRows.map((row) => [row.role_id, toBoolean(row.allowed)]));

    for (const roleCode of candidateRoles) {
      const role = enabledRoleByCode.get(roleCode);
      if (!role) continue;
      if (permissionByRoleId.has(role.id)) {
        return {
          allowed: permissionByRoleId.get(role.id) === true,
          permissionKind: input.permissionKind,
          permissionCode,
          roleCode,
          evaluatedRoles: candidateRoles,
          reason: "explicit"
        };
      }
      if (roleCode === "system_admin") {
        return {
          allowed: true,
          permissionKind: input.permissionKind,
          permissionCode,
          roleCode,
          evaluatedRoles: candidateRoles,
          reason: "system_admin_default"
        };
      }
    }

    return {
      allowed: false,
      permissionKind: input.permissionKind,
      permissionCode,
      roleCode: candidateRoles[0] ?? null,
      evaluatedRoles: candidateRoles,
      reason: "missing_permission"
    };
  }

  async setRolePermission(input: {
    roleCode: string;
    permissionKind: AccessControlRolePermission["permissionKind"];
    permissionCode: string;
    allowed: boolean;
  }): Promise<AccessControlRolePermission> {
    const role = await this.getRoleByCode(input.roleCode);
    if (!role) {
      throw new Error("ACCESS_CONTROL_ROLE_NOT_FOUND");
    }

    const existing = await this.client.queryOne<AccessControlRolePermissionRow>(SELECT_ACCESS_CONTROL_ROLE_PERMISSION_SQL, {
      roleCode: input.roleCode,
      permissionKind: input.permissionKind,
      permissionCode: input.permissionCode
    });

    await this.client.execute(UPSERT_ACCESS_CONTROL_ROLE_PERMISSION_SQL, {
      id: existing?.id ?? this.idFactory(),
      roleId: role.id,
      permissionKind: input.permissionKind,
      permissionCode: input.permissionCode,
      allowed: boolToInt(input.allowed),
      now: this.clock()
    });

    const row = await this.client.queryOne<AccessControlRolePermissionRow>(SELECT_ACCESS_CONTROL_ROLE_PERMISSION_SQL, {
      roleCode: input.roleCode,
      permissionKind: input.permissionKind,
      permissionCode: input.permissionCode
    });

    if (!row) {
      throw new Error("ACCESS_CONTROL_ROLE_PERMISSION_UPSERT_FAILED");
    }

    return mapRolePermission(row);
  }
}
