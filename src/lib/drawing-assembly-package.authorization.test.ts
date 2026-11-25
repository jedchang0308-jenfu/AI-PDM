import { beforeEach, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "./db-async-provider";
import type { VerifiedPrincipalRequest } from "./jenfu-principal-request-guard";

const fixture = vi.hoisted(() => ({
  evaluate: vi.fn(), readWork: vi.fn(), queryOne: vi.fn(), assertBasis: vi.fn(), bytes: vi.fn(),
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
}));
vi.mock("./principal-resource-capability", () => ({ authorizeDynamicResourceCapabilityInSnapshot: fixture.bytes }));
vi.mock("./repositories/drawing-revision-work-async-repository", () => ({
  DrawingRevisionWorkAsyncRepository: class { readWork = fixture.readWork; assertWorkMutationBasis = fixture.assertBasis; },
}));
import { DrawingAssemblyPackageService } from "./drawing-assembly-package";

let grants: Record<string, { allowed: boolean; roleCode: string | null }>;
const request = new Request("https://example.test/api/pdm/drawing-revision-works/work/assembly-packages");
const read = () => new DrawingAssemblyPackageService(client).get("fixture", request, "work");
beforeEach(() => {
  vi.clearAllMocks();
  grants = {
    "numbering.workspace.view": { allowed: true, roleCode: "viewer" },
    "numbering.workspace.update": { allowed: true, roleCode: "rd" },
  };
  fixture.evaluate.mockImplementation(async (_tx, _actor, permissions: { permissionCode: string }[]) =>
    permissions.map(p => ({ ...p, ...(grants[p.permissionCode] ?? { allowed: false, roleCode: null }) })));
  fixture.readWork.mockResolvedValue({ id: "work", company_id: "company", revision_id: "revision", owner_user_id: "another-user", handling: "owner" });
  fixture.queryOne.mockResolvedValue(null);
  fixture.bytes.mockResolvedValue(null);
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
it("does not use a denied RD grant to read somebody else's work", async () => {
  grants["numbering.workspace.update"].allowed = false;
  await expect(read()).rejects.toMatchObject({ status: 403 });
  expect(fixture.queryOne).not.toHaveBeenCalled();
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
