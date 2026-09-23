import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient, AsyncDatabaseTransactionOptions } from "@/lib/db-async-provider";
import type { CheckNumberingPermissionInput } from "@/lib/db";

const mocks = vi.hoisted(() => ({ getAsyncDatabaseClient: vi.fn() }));

vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: mocks.getAsyncDatabaseClient }));
vi.mock("@/lib/auth-config", () => ({ getJenfuPlatformAuthMode: () => "on" }));

import { checkNumberingPermissionAsync, checkNumberingPermissionsAsync } from "@/lib/numbering-permission-async";

const actor = {
  identityIssuer: "https://securetoken.google.com/jenfu-test",
  identitySubject: "uid-001",
  principalId: "principal-001",
  employeeId: "employee-001",
  localPrincipalId: "local-user-001",
  companyId: "company-jenfu"
};

const assignmentRow = {
  contract_version: "jenfu.platform-entitlement.v1",
  assignment_version_id: "assignment-version-1",
  assignment_version: 1,
  assignment_id: "assignment-1",
  grant_kind: "direct",
  delegation_id: null,
  application_id: "ai-pdm",
  identity_issuer: actor.identityIssuer,
  identity_subject: actor.identitySubject,
  principal_id: actor.principalId,
  employee_id: actor.employeeId,
  subject_kind: "employee",
  target_principal_id: null,
  stable_role_id: "role-rd",
  role_code: "rd",
  catalog_version: "ai-pdm.role-catalog.2026-09-03.v3",
  scope_kind: "workspace",
  scope_key: "current",
  valid_from: "2026-01-01T00:00:00.000Z",
  valid_until: null,
  published_at: "2026-01-01T00:00:00.000Z",
  authority_version: 2
};

function makeClient(input: { authoritySource?: "legacy_authority" | "orgmaster_authority"; principalId?: string; activePriority?: boolean } = {}) {
  const queries: string[] = [];
  let transactionOptions: AsyncDatabaseTransactionOptions | undefined;
  const client = {
    kind: "postgres" as const,
    query: vi.fn(async <T>(sql: string): Promise<T[]> => {
      queries.push(sql);
      if (sql.includes("v_active_principal_mappings_v1")) return [{
        contract_version: "organization.active-principal.v1",
        principal_issuer: actor.identityIssuer,
        principal_subject: actor.identitySubject,
        principal_id: input.principalId ?? actor.principalId,
        employee_id: actor.employeeId,
        employee_status: "active",
        mapping_version: 4,
        published_at: "2026-01-01T00:00:00.000Z"
      }] as T[];
      if (sql.includes("transaction_timestamp()")) return [{ decision_at: "2026-09-23T00:00:00.000Z" }] as T[];
      if (sql.includes("FROM role_priority_versions")) return (input.activePriority === false ? [] : [{
        priority_json: JSON.stringify(["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"])
      }]) as T[];
      if (sql.includes("v_ai_pdm_entitlement_authority_v1")) return [{
        contract_version: "jenfu.platform-entitlement.v1",
        application_id: "ai-pdm",
        authority_source: input.authoritySource ?? "orgmaster_authority",
        authority_version: 2,
        employee_id: null,
        updated_at: "2026-09-23T00:00:00.000Z",
        operation_id: null
      }] as T[];
      if (sql.includes("v_ai_pdm_effective_role_assignments_v1")) return [assignmentRow] as T[];
      if (sql.includes("FROM user_role_assignments")) return [{ role_code: "rd" }] as T[];
      if (sql.includes("FROM approval_delegations")) return [] as T[];
      if (sql.includes("FROM roles") && sql.includes("WHERE enabled = 1")) return [{
        id: "role-rd", role_code: "rd", title: "研發", system_defined: false, enabled: true
      }] as T[];
      if (sql.includes("FROM role_permissions p")) return [{
        id: "permission-rd-numbering-request", role_id: "role-rd", role_code: "rd",
        permission_kind: "page", permission_code: "numbering.request", allowed: true
      }] as T[];
      return [] as T[];
    }),
    queryOne: vi.fn(async <T>(): Promise<T | null> => null),
    execute: vi.fn(async () => undefined),
    transaction: vi.fn(async <T>(fn: (snapshot: AsyncDatabaseClient) => T | Promise<T>, options?: AsyncDatabaseTransactionOptions) => {
      transactionOptions = options;
      return fn(client as unknown as AsyncDatabaseClient);
    }),
    close: vi.fn(async () => undefined),
    get queries() { return queries; },
    get transactionOptions() { return transactionOptions; }
  };
  return client;
}

function requestInput(): CheckNumberingPermissionInput {
  return {
    user: {
      id: actor.localPrincipalId,
      role: "Engineer",
      company_id: actor.companyId,
      authorizationActor: actor
    },
    permissionKind: "page",
    permissionCode: "numbering.request",
    workspaceCode: "company-jenfu"
  };
}

describe("DEV-121 authorization snapshot", () => {
  beforeEach(() => {
    vi.stubEnv("PDM_JENFU_ENTITLEMENT_MODE", "enforce");
    vi.stubEnv("PDM_JENFU_PLATFORM_AUTH_MODE", "on");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("rechecks active identity and evaluates entitlement in one read-only repeatable-read transaction", async () => {
    const client = makeClient();
    mocks.getAsyncDatabaseClient.mockReturnValue(client);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = await checkNumberingPermissionAsync(requestInput());

    expect(result).toMatchObject({ allowed: true, decisionCode: "allowed", roleCode: "rd" });
    expect(client.transaction).toHaveBeenCalledTimes(1);
    expect(client.transactionOptions).toEqual({ isolationLevel: "repeatable_read", readOnly: true });
    expect(client.queries.some((sql) => sql.includes("v_active_principal_mappings_v1"))).toBe(true);
    expect(client.queries.some((sql) => sql.includes("v_ai_pdm_entitlement_authority_v1"))).toBe(true);
    expect(client.queries.some((sql) => sql.includes("v_ai_pdm_effective_role_assignments_v1"))).toBe(true);
    expect(client.execute).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("evaluates a capability batch in one snapshot without sharing one permission result", async () => {
    const client = makeClient();
    mocks.getAsyncDatabaseClient.mockReturnValue(client);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const [allowed, denied] = await checkNumberingPermissionsAsync([
      requestInput(),
      { ...requestInput(), permissionCode: "unmapped.permission" }
    ]);

    expect(allowed).toMatchObject({ allowed: true, decisionCode: "allowed" });
    expect(denied).toMatchObject({ allowed: false, decisionCode: "permission_not_granted" });
    expect(client.transaction).toHaveBeenCalledTimes(1);
    expect(client.queries.filter((sql) => sql.includes("v_ai_pdm_entitlement_authority_v1"))).toHaveLength(1);
    expect(client.queries.filter((sql) => sql.includes("v_ai_pdm_effective_role_assignments_v1"))).toHaveLength(1);
    log.mockRestore();
  });

  it("denies if the active directory principal no longer matches the verified session", async () => {
    const client = makeClient({ principalId: "principal-changed" });
    mocks.getAsyncDatabaseClient.mockReturnValue(client);

    const result = await checkNumberingPermissionAsync(requestInput());

    expect(result).toMatchObject({ allowed: false, decisionCode: "entitlement_session_invalid" });
    expect(client.queries.some((sql) => sql.includes("v_ai_pdm_entitlement_authority_v1"))).toBe(false);
    expect(client.queries.some((sql) => sql.includes("v_ai_pdm_effective_role_assignments_v1"))).toBe(false);
  });

  it("evaluates legacy ACL from the same snapshot when legacy authority is selected", async () => {
    const client = makeClient({ authoritySource: "legacy_authority" });
    mocks.getAsyncDatabaseClient.mockReturnValue(client);

    const result = await checkNumberingPermissionAsync(requestInput());

    expect(result).toMatchObject({ allowed: true, decisionCode: "allowed", roleCode: "rd" });
    expect(client.transaction).toHaveBeenCalledTimes(1);
    expect(client.transactionOptions).toEqual({ isolationLevel: "repeatable_read", readOnly: true });
    expect(client.queries.some((sql) => sql.includes("FROM user_role_assignments"))).toBe(true);
    expect(client.queries.some((sql) => sql.includes("FROM role_permissions p"))).toBe(true);
    expect(client.queries.some((sql) => sql.includes("v_ai_pdm_effective_role_assignments_v1"))).toBe(false);
  });

  it("does not fall back when the active priority contract is missing", async () => {
    const client = makeClient({ activePriority: false });
    mocks.getAsyncDatabaseClient.mockReturnValue(client);

    const result = await checkNumberingPermissionAsync(requestInput());

    expect(result).toMatchObject({ allowed: false, decisionCode: "entitlement_authority_unavailable" });
    expect(client.queries.some((sql) => sql.includes("v_ai_pdm_effective_role_assignments_v1"))).toBe(false);
  });
});
