import { beforeEach, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "./db-async-provider";
import type { VerifiedPrincipalRequest } from "./jenfu-principal-request-guard";

const fixture = vi.hoisted(() => ({
  evaluate: vi.fn(), readWork: vi.fn(), queryOne: vi.fn(), assertBasis: vi.fn(), bytes: vi.fn(),
  evaluateJob: vi.fn(), admitJob: vi.fn(),
}));
const client = { kind: "postgres", transactionScope: "postgres", queryOne: fixture.queryOne } as unknown as AsyncDatabaseClient;
const verified = { session: { contractVersion: "jenfu.ai-pdm-session.v2", principalId: "principal" },
  profile: { pdmUserId: "reader", companyId: "company" } } as VerifiedPrincipalRequest;
vi.mock("./db-async-provider", () => ({ getAsyncDatabaseClient: () => client }));
vi.mock("./jenfu-principal-http", () => ({ principalRequestInput: async () => ({}) }));
vi.mock("./jenfu-principal-request-guard", () => ({
  withVerifiedJenfuPrincipalRequest: async (_input: unknown, execute: (tx: AsyncDatabaseClient, actor: VerifiedPrincipalRequest) => unknown) => execute(client, verified),
}));
vi.mock("./jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: fixture.evaluate,
  evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot: fixture.evaluateJob,
}));
vi.mock("./principal-job-authority", async original => ({
  ...await original<typeof import("./principal-job-authority")>(),
  parsePrincipalJobInitiator: () => ({ principalId: "principal", pdmUserId: "reader", companyId: "company" }),
  requireCurrentPrincipalJobAuthority: fixture.admitJob,
}));
vi.mock("./principal-resource-capability", () => ({ authorizeDynamicResourceCapabilityInSnapshot: fixture.bytes }));
vi.mock("./repositories/drawing-revision-work-async-repository", () => ({
  DrawingRevisionWorkAsyncRepository: class { readWork = fixture.readWork; assertWorkMutationBasis = fixture.assertBasis; },
}));
import { DrawingAssemblyPackageService, requireAssemblyPackageJobAuthority, type AssemblyPackageRow } from "./drawing-assembly-package";

let grants: Record<string, { allowed: boolean; roleCode: string | null }>;
const request = new Request("https://example.test/api/pdm/drawing-revision-works/work/assembly-packages");
const read = () => new DrawingAssemblyPackageService(client).get("fixture", request, "work");
beforeEach(() => {
  vi.clearAllMocks();
  grants = {
    "numbering.workspace.view": { allowed: true, roleCode: "viewer" },
    "numbering.workspace.update": { allowed: true, roleCode: "new-custom-cad-role" },
  };
  fixture.evaluate.mockImplementation(async (_tx, _actor, permissions: { permissionCode: string }[]) =>
    permissions.map(p => ({ ...p, ...(grants[p.permissionCode] ?? { allowed: false, roleCode: null }) })));
  fixture.readWork.mockResolvedValue({ id: "work", company_id: "company", revision_id: "revision", owner_user_id: "another-user", handling: "owner" });
  fixture.queryOne.mockResolvedValue(null);
  fixture.bytes.mockResolvedValue(null);
  fixture.evaluateJob.mockResolvedValue([{ allowed: true, roleCode: "new-job-editor" }]);
  fixture.admitJob.mockResolvedValue(undefined);
});

it("reads a non-owned package with the same mixed view/update roles as the drawing editor", async () => {
  await expect(read()).resolves.toMatchObject({ data: null });
  expect(fixture.queryOne).toHaveBeenCalled();
  expect(fixture.bytes).not.toHaveBeenCalled();
});
it("keeps workspace view mandatory even when an RD update grant exists", async () => {
  grants["numbering.workspace.view"].allowed = false;
  await expect(read()).rejects.toMatchObject({ status: 403 });
  expect(fixture.readWork).not.toHaveBeenCalled();
});
it("uses the view capability to read somebody else's work even without edit permission", async () => {
  grants["numbering.workspace.update"].allowed = false;
  await expect(read()).resolves.toMatchObject({ data: null });
});
it("allows an owner with view-only permission to read their own package", async () => {
  grants["numbering.workspace.update"].allowed = false;
  fixture.readWork.mockResolvedValue({ id: "work", company_id: "company", revision_id: "revision", owner_user_id: "reader" });
  await expect(read()).resolves.toMatchObject({ data: null });
});
it("keeps a company-scoped missing work inaccessible", async () => {
  fixture.readWork.mockResolvedValue(null);
  await expect(read()).rejects.toMatchObject({ status: 404 });
  expect(fixture.readWork).toHaveBeenCalledWith(client, "company", "work", false);
  expect(fixture.queryOne).not.toHaveBeenCalled();
});
it("does not turn read scope into write permission", async () => {
  grants["numbering.workspace.view"].roleCode = "rd";
  grants["numbering.workspace.update"].allowed = false;
  await expect(new DrawingAssemblyPackageService(client).start("fixture", request, "work",
    { fileName: "assembly.zip", byteSize: 22 }, "command"))
    .rejects.toMatchObject({ status: 403 });
  expect(fixture.assertBasis).not.toHaveBeenCalled();
  expect(fixture.queryOne).not.toHaveBeenCalled();
});
it.each(["view", "download"])("still requires the separate %s byte capability before reading package storage", async denied => {
  fixture.bytes.mockImplementation(async (_tx, _actor, _groups, action) => action === denied ? new Response(null, { status: 403 }) : null);
  await expect(new DrawingAssemblyPackageService(client).download("fixture", request, "work", "package"))
    .rejects.toMatchObject({ status: 403 });
  expect(fixture.bytes).toHaveBeenCalledWith(client, verified, ["drawing", "model"], denied);
  expect(fixture.queryOne).not.toHaveBeenCalled();
});
const pkg = { company_id: "company", initiator_principal_id: "principal", created_by: "reader", work_id: "work",
  revision_id: "revision", active_at: "2026-11-25", superseded_at: null, status: "accepted" } as AssemblyPackageRow;
it("continues a custom-role initiator's admitted job on another owner's drawing", async () => {
  await expect(requireAssemblyPackageJobAuthority(client, pkg)).resolves.toMatchObject({ principalId: "principal" });
  expect(fixture.admitJob).toHaveBeenCalled();
  expect(fixture.assertBasis).toHaveBeenCalled();
});
it("rejects background processing when the initiator's edit capability is denied", async () => {
  fixture.evaluateJob.mockResolvedValue([{ allowed: false, roleCode: "new-job-editor" }]);
  await expect(requireAssemblyPackageJobAuthority(client, pkg)).rejects.toMatchObject({ status: 403 });
  expect(fixture.assertBasis).not.toHaveBeenCalled();
});
it("keeps the live initiator authority fence before background work", async () => {
  fixture.admitJob.mockRejectedValue(new Error("initiator revoked"));
  await expect(requireAssemblyPackageJobAuthority(client, pkg)).rejects.toThrow("initiator revoked");
  expect(fixture.evaluateJob).not.toHaveBeenCalled();
  expect(fixture.assertBasis).not.toHaveBeenCalled();
});
