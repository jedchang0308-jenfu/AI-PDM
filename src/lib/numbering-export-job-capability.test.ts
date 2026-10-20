import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dynamicPolicy: vi.fn(),
  authorizeResource: vi.fn(),
  workspacePermissions: vi.fn()
}));

vi.mock("@/lib/principal-resource-capability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/principal-resource-capability")>();
  return {
    ...actual,
    isDynamicRolePolicyInSnapshot: mocks.dynamicPolicy,
    authorizeDynamicResourceCapabilityInSnapshot: mocks.authorizeResource
  };
});
vi.mock("@/lib/jenfu-principal-permission-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jenfu-principal-permission-service")>();
  return { ...actual, evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.workspacePermissions };
});

import {
  authorizeNumberingExportJobResultInSnapshot,
  numberingExportJobResultAccessPlan
} from "@/lib/numbering-export-job-capability";

const snapshot = {} as never;
const verified = { session: { principalId: "principal-a" }, profile: { companyId: 'company-a' } } as never;

function result(overrides: Record<string, unknown> = {}) {
  return {
    exportMode: "no_audit",
    companyId: "company-a",
    generatedAt: "2026-10-21T00:00:00.000Z",
    roots: [],
    parts: [],
    drawings: [],
    ...overrides
  };
}

describe("numbering export result capability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dynamicPolicy.mockResolvedValue(true);
    mocks.authorizeResource.mockResolvedValue(null);
    mocks.workspacePermissions.mockResolvedValue([{
      allowed: true,
      permissionCode: "settings.admin_matrix",
      decisionCode: "allowed",
      principalId: "principal-a"
    }]);
  });

  it('rejects a stored export payload for another company before checking or returning its data', async () => {
    const response = await authorizeNumberingExportJobResultInSnapshot(snapshot, verified, result({ companyId: 'other-company' }));
    expect(response?.status).toBe(503);
    expect(mocks.authorizeResource).not.toHaveBeenCalled();
  });

  it("derives part and drawing access from actual rows, including drawing parent roots", () => {
    expect(numberingExportJobResultAccessPlan(result({
      roots: [{ root_code: "R-1" }],
      parts: [{ root_code: "R-1", part_number: "P-1" }],
      drawings: [{ root_code: "R-1", drawing_number: "D-1" }]
    }))).toEqual({ groups: ["part", "drawing"], requiresAdminMatrix: false });
  });

  it("derives canonical groups from audit target details and requires the protected grant for governance rows", () => {
    expect(numberingExportJobResultAccessPlan(result({
      exportMode: "full_change_summary",
      auditSummary: [
        { action: "numbering.drawing_number.create", detail_json: JSON.stringify({ rootCode: "R-1", drawingNumber: "D-1" }) },
        { action: "numbering.role_permission.upsert", detail_json: JSON.stringify({ roleCode: "custom", permissionCode: "pdm.part.download" }) }
      ]
    }))).toEqual({ groups: ["part", "drawing"], requiresAdminMatrix: true });
  });

  it("uses the current snapshot for view and download checks on every result group", async () => {
    const denial = await authorizeNumberingExportJobResultInSnapshot(snapshot, verified, result({
      roots: [{ root_code: "R-1" }],
      drawings: [{ root_code: "R-1", drawing_number: "D-1" }]
    }));

    expect(denial).toBeNull();
    expect(mocks.dynamicPolicy).toHaveBeenCalledWith(snapshot);
    expect(mocks.authorizeResource.mock.calls).toEqual([
      [snapshot, verified, ["part", "drawing"], "view"],
      [snapshot, verified, ["part", "drawing"], "download"]
    ]);
    expect(mocks.workspacePermissions).not.toHaveBeenCalled();
  });

  it("freshly checks the existing admin_matrix action for governance audit rows", async () => {
    mocks.workspacePermissions.mockResolvedValue([{
      allowed: false,
      permissionCode: "settings.admin_matrix",
      decisionCode: "permission_not_granted",
      principalId: "principal-a"
    }]);
    const response = await authorizeNumberingExportJobResultInSnapshot(snapshot, verified, result({
      exportMode: "last_change_summary",
      auditSummary: [{ action: "numbering.role.upsert", detail_json: JSON.stringify({ roleCode: "custom" }) }]
    }));

    expect(response?.status).toBe(403);
    expect(mocks.workspacePermissions).toHaveBeenCalledWith(snapshot, verified, [
      { permissionKind: "action", permissionCode: "settings.admin_matrix" }
    ]);
    expect(mocks.authorizeResource).not.toHaveBeenCalled();
  });

  it("allows a governance audit row only when the existing admin_matrix grant is present", async () => {
    const response = await authorizeNumberingExportJobResultInSnapshot(snapshot, verified, result({
      exportMode: "full_change_summary",
      auditSummary: [{ action: "numbering.role.upsert", detail_json: JSON.stringify({ roleCode: "custom" }) }]
    }));

    expect(response).toBeNull();
    expect(mocks.workspacePermissions).toHaveBeenCalledWith(snapshot, verified, [
      { permissionKind: "action", permissionCode: "settings.admin_matrix" }
    ]);
  });

  it("does not require the admin grant for no-audit exports", async () => {
    const response = await authorizeNumberingExportJobResultInSnapshot(snapshot, verified, result({
      roots: [{ root_code: "R-1" }]
    }));

    expect(response).toBeNull();
    expect(mocks.workspacePermissions).not.toHaveBeenCalled();
    expect(mocks.authorizeResource).toHaveBeenCalledTimes(2);
  });

  it("fails closed for unknown payload keys and unclassifiable audit rows", async () => {
    expect(numberingExportJobResultAccessPlan(result({ models: [{ id: "M-1" }] }))).toBeNull();
    expect(numberingExportJobResultAccessPlan(result({
      exportMode: "last_change_summary",
      auditSummary: [{ action: "numbering.future_event", detail_json: JSON.stringify({ note: "no canonical target" }) }]
    }))).toBeNull();

    const response = await authorizeNumberingExportJobResultInSnapshot(snapshot, verified, result({
      exportMode: "last_change_summary",
      auditSummary: [{ action: "numbering.future_event", detail_json: "{}" }]
    }));
    expect(response?.status).toBe(503);
    expect(mocks.authorizeResource).not.toHaveBeenCalled();
    expect(mocks.workspacePermissions).not.toHaveBeenCalled();
  });

  it("keeps legacy publication behavior unchanged", async () => {
    mocks.dynamicPolicy.mockResolvedValue(false);
    const response = await authorizeNumberingExportJobResultInSnapshot(snapshot, verified, { futurePayload: true });

    expect(response).toBeNull();
    expect(mocks.authorizeResource).not.toHaveBeenCalled();
    expect(mocks.workspacePermissions).not.toHaveBeenCalled();
  });
});
