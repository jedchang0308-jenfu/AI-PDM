import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), authMode: vi.fn(), platformMode: vi.fn(), entitlementMode: vi.fn(),
  policy: vi.fn(), verifiedRead: vi.fn(), authorize: vi.fn(), queryOne: vi.fn(),
  storageKey: vi.fn(), readPackage: vi.fn(), storage: vi.fn(), downloadUrl: vi.fn(),
  audit: vi.fn(), legacyAuth: vi.fn()
}));
vi.mock("@/lib/auth-config", () => ({ getAuthMode: mocks.authMode,
  getJenfuPlatformAuthMode: mocks.platformMode }));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: mocks.entitlementMode }));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.token,
  principalRequestInput: () => ({ token: "principal-session" }),
  principalRequestFailure: (error: { code?: string }) => Response.json({
    code: error.code === "auth_session_invalid" ? "auth_session_invalid" : "principal_dependency_unavailable"
  }, { status: error.code === "auth_session_invalid" ? 401 : 503 })
}));
vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: mocks.verifiedRead
}));
vi.mock("@/lib/jenfu-route-permission-map", () => ({ resolveJenfuRoutePolicy: mocks.policy }));
vi.mock("@/lib/principal-submission-access", () => ({ authorizePrincipalSubmissionReadInSnapshot: mocks.authorize }));
vi.mock("@/lib/release-package-file", () => ({
  contentDispositionFilename: (name: string) => name,
  createReleasePackageStorageServiceForRecord: mocks.storage,
  getReleasePackageStorageKey: mocks.storageKey,
  readReleasePackage: mocks.readPackage
}));
vi.mock("@/lib/storage-access-audit", () => ({
  auditStorageAccess: mocks.audit,
  resolveStorageAccessAuditProvenance: () => ({ source: "runtime", qcRunId: null })
}));
vi.mock("@/lib/auth-async", () => ({ requireAuthAsync: mocks.legacyAuth, forbidden: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ canReadSubmissionAsync: vi.fn() }));
vi.mock("@/lib/submissions-async", () => ({ getSubmissionAsync: vi.fn() }));

import { GET } from "@/app/api/submissions/[id]/release-package/route";

const routePath = "src/app/api/submissions/[id]/release-package/route.ts";
const verified = { profile: { pdmUserId: "profile-1", companyId: "company-1" },
  session: { principalId: "principal-1" } };
const bytes = Buffer.from("historical release package");
const releasePackage = () => ({ id: "package-1", submission_id: "submission-1",
  package_filename: "release.zip", file_size: bytes.byteLength,
  sha256: createHash("sha256").update(bytes).digest("hex") });
const snapshot = { queryOne: mocks.queryOne };
const request = () => new Request("https://ai-pdm.test/api/submissions/submission-1/release-package");
const context = { params: Promise.resolve({ id: "submission-1" }) };

describe("Principal historical release package read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.authMode.mockReturnValue("firebase_bff");
    mocks.platformMode.mockReturnValue("on");
    mocks.entitlementMode.mockReturnValue("enforce");
    mocks.policy.mockReturnValue({ path: routePath, authorizationMode: "permission",
      scopeResolver: "submission company" });
    mocks.verifiedRead.mockImplementation(async (_input, read) => read(snapshot, verified));
    mocks.authorize.mockResolvedValue({ company_id: "company-1", submitted_by: "profile-1" });
    mocks.queryOne.mockImplementation(async (sql: string) => sql.includes("release_packages")
      ? releasePackage() : { status: "Released" });
    mocks.storageKey.mockReturnValue("package-key");
    mocks.readPackage.mockResolvedValue(bytes);
    mocks.storage.mockReturnValue({ createDownloadUrl: mocks.downloadUrl });
    mocks.downloadUrl.mockResolvedValue({ provider: "local_repository", mode: "server_stream",
      bucket: null, expiresAt: null, expiresInSeconds: 0, auditRequired: true });
  });

  it("checks the published Principal decision and package binding before audited ZIP delivery", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.policy).toHaveBeenCalledWith(routePath, "GET",
      { expectedPermissionCode: "submission.view" });
    expect(mocks.authorize).toHaveBeenCalledWith(snapshot, verified, "submission-1");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      principalId: "principal-1", historicalProfileId: "profile-1",
      companyId: "company-1", accessKind: "release_package", fileId: "package-1" }));
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("does not query package metadata or storage after authorization denial", async () => {
    mocks.authorize.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.queryOne).not.toHaveBeenCalled();
    expect(mocks.readPackage).not.toHaveBeenCalled();
  });

  it("rejects non-released submissions and mismatched package ownership before storage read", async () => {
    mocks.queryOne.mockResolvedValueOnce({ status: "Pending" });
    expect((await GET(request(), context)).status).toBe(409);
    mocks.queryOne.mockImplementation(async (sql: string) => sql.includes("release_packages")
      ? { ...releasePackage(), submission_id: "submission-2" } : { status: "Released" });
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.readPackage).not.toHaveBeenCalled();
  });

  it("rejects a changed ZIP without creating access or audit evidence", async () => {
    mocks.readPackage.mockResolvedValue(Buffer.from("tampered"));
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.downloadUrl).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("fails closed when writing the Principal audit fails", async () => {
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    expect((await GET(request(), context)).status).toBe(503);
  });

  it("rejects missing session and route-policy drift without old-auth fallback", async () => {
    mocks.token.mockReturnValueOnce(null);
    expect((await GET(request(), context)).status).toBe(401);
    mocks.policy.mockReturnValue(null);
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });
});
