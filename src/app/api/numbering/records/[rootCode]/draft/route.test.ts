import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  requestInput: vi.fn(),
  withVerified: vi.fn(),
  evaluate: vi.fn(),
  readBasis: vi.fn(),
  canManageRolePolicy: vi.fn(),
  deleteBundle: vi.fn(),
  transactionClient: { kind: "postgres", transactionScope: "postgres" },
  lastOptions: undefined as unknown,
}));

vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.token,
  principalRequestInput: mocks.requestInput,
  principalRequestFailure: (error: unknown) => Response.json({ code: error instanceof Error ? error.message : "failure" }, { status: 500 }),
}));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({
  withVerifiedJenfuPrincipalRequest: mocks.withVerified,
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate,
}));
vi.mock("@/lib/repositories/numbering-async-repository", () => ({
  AsyncNumberingRepository: class {
    readDraftNumberingDeleteBasis = mocks.readBasis;
    constructor(_client: unknown) {}
  },
}));
vi.mock("@/lib/role-policy-service", () => ({
  canManageRolePolicy: mocks.canManageRolePolicy,
}));
vi.mock("@/lib/numbering-async", () => ({
  deleteVerifiedDraftNumberingBundleInClient: mocks.deleteBundle,
}));

import { DELETE, GET } from "@/app/api/numbering/records/[rootCode]/draft/route";
import { draftNumberingDeleteFingerprint, type DraftNumberingDeleteBasis } from "@/lib/draft-numbering-delete-policy";

const verified = {
  profile: { pdmUserId: "rd-1", companyId: "company-jenfu" },
  session: { principalId: "principal-1" },
};
const route = { params: Promise.resolve({ rootCode: "A0062" }) };

function basis(overrides: Partial<DraftNumberingDeleteBasis> = {}): DraftNumberingDeleteBasis {
  return {
    companyId: "company-jenfu",
    root: { id: "root-1", code: "A0062", status: "Draft", responsibleUserIds: ["rd-1"] },
    drawings: [{ id: "drawing-1", code: "A0062-M01", status: "Draft", responsibleUserIds: ["rd-1"] }],
    parts: [{ id: "part-1", code: "A0062-P01", status: "Draft", responsibleUserIds: ["rd-1"] }],
    transfers: [],
    fileIds: ["file-1"],
    controlledReferences: 0,
    ...overrides,
  };
}

function mutation(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/numbering/records/A0062/draft", {
    method: "DELETE",
    headers: { "content-type": "application/json", origin: "https://example.test", ...headers },
    body: JSON.stringify(body),
  });
}

function decision(allowed: boolean, roleCode: string | null = allowed ? "rd" : null) {
  return { allowed, permissionCode: "numbering.draft.update", decisionCode: allowed ? "allowed" : "not_granted",
    roleCode, assignmentId: allowed ? "assignment-1" : null, principalId: "principal-1", publishedAssignmentVersion: 4 };
}

describe("draft numbering bundle deletion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("session-token");
    mocks.requestInput.mockResolvedValue({ token: "session-token" });
    mocks.withVerified.mockImplementation(async (_input, evaluate, options) => {
      mocks.lastOptions = options;
      return evaluate(mocks.transactionClient, verified);
    });
    mocks.evaluate.mockResolvedValue([decision(true), decision(false)]);
    mocks.readBasis.mockResolvedValue(basis());
    mocks.canManageRolePolicy.mockResolvedValue(false);
    mocks.deleteBundle.mockResolvedValue({ rootId: "root-1", rootCode: "A0062", drawingNumbers: ["A0062-M01"],
      partNumbers: ["A0062-P01"], removedTransferReferences: 0 });
  });

  it("rejects cross-origin mutation and missing explicit confirmation before entering the Principal transaction", async () => {
    const crossOrigin = await DELETE(mutation({ confirmDelete: true, fingerprint: "a".repeat(64) }, {
      origin: "https://attacker.example",
    }), route);
    expect(crossOrigin.status).toBe(403);
    expect(mocks.withVerified).not.toHaveBeenCalled();

    const missingConfirmation = await DELETE(mutation({ fingerprint: "a".repeat(64) }), route);
    expect(missingConfirmation.status).toBe(400);
    expect(mocks.withVerified).not.toHaveBeenCalled();
  });

  it("allows an RD owner to preview the exact bundle and returns a stable confirmation fingerprint", async () => {
    const current = basis();
    mocks.readBasis.mockResolvedValue(current);
    const response = await GET(new Request("https://example.test/api/numbering/records/A0062/draft"), route);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ rootCode: "A0062", drawingNumbers: ["A0062-M01"],
      partNumbers: ["A0062-P01"], affectedFileAssets: 1, transferReferences: [] });
    expect(body.fingerprint).toBe(draftNumberingDeleteFingerprint(current, { userId: "rd-1", systemAdmin: false }));
    expect(mocks.canManageRolePolicy).not.toHaveBeenCalled();
  });

  it("denies an RD whose identity is not responsible for every bundle member", async () => {
    mocks.readBasis.mockResolvedValue(basis({
      parts: [{ id: "part-1", code: "A0062-P01", status: "Draft", responsibleUserIds: ["rd-2"] }],
    }));
    const response = await GET(new Request("https://example.test/api/numbering/records/A0062/draft"), route);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "NUMBERING_DRAFT_DELETE_NOT_RESPONSIBLE" });
    expect(mocks.canManageRolePolicy).toHaveBeenCalledWith(mocks.transactionClient, verified);
  });

  it("allows the separately authorized administrator to preview a bundle owned by another RD", async () => {
    mocks.evaluate.mockResolvedValue([decision(false, null), decision(false, null)]);
    mocks.readBasis.mockResolvedValue(basis({
      root: { id: "root-1", code: "A0062", status: "Draft", responsibleUserIds: ["rd-2"] },
    }));
    mocks.canManageRolePolicy.mockResolvedValue(true);

    const response = await GET(new Request("https://example.test/api/numbering/records/A0062/draft"), route);
    expect(response.status).toBe(200);
    expect(mocks.canManageRolePolicy).toHaveBeenCalledWith(mocks.transactionClient, verified);
  });

  it("rechecks the exact fingerprint and binds authorization and deletion to one serializable transaction", async () => {
    const current = basis();
    const fingerprint = draftNumberingDeleteFingerprint(current, { userId: "rd-1", systemAdmin: false });
    const response = await DELETE(mutation({ confirmDelete: true, fingerprint }), route);

    expect(response.status).toBe(200);
    expect(mocks.lastOptions).toEqual({ readOnly: false, isolationLevel: "serializable" });
    expect(mocks.evaluate).toHaveBeenCalledWith(mocks.transactionClient, verified, expect.any(Array));
    expect(mocks.readBasis).toHaveBeenCalledWith("company-jenfu", "A0062");
    expect(mocks.deleteBundle).toHaveBeenCalledWith(mocks.transactionClient, expect.objectContaining({
      companyId: "company-jenfu", rootCode: "A0062", fingerprint, actor: { userId: "rd-1", systemAdmin: false },
    }));

    mocks.deleteBundle.mockRejectedValueOnce(new Error("NUMBERING_DRAFT_DELETE_STALE"));
    const staleResponse = await DELETE(mutation({ confirmDelete: true, fingerprint }), route);
    expect(staleResponse.status).toBe(409);
    expect(await staleResponse.json()).toMatchObject({ code: "NUMBERING_DRAFT_DELETE_STALE" });
  });
});
