import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withPermission: vi.fn(),
  withIdentityOnly: vi.fn(),
  getAuthorizedShare: vi.fn(),
  serialize: vi.fn(),
  deliver: vi.fn()
}));

vi.mock("@/lib/principal-readonly-share", () => ({
  withPrincipalSharePermission: mocks.withPermission,
  withPrincipalIdentityOnlyShareRoute: mocks.withIdentityOnly,
  getAuthorizedPublicShareInSnapshot: mocks.getAuthorizedShare
}));
vi.mock("@/lib/readonly-share-async", () => ({ serializePublicShareAsync: mocks.serialize }));
vi.mock("@/lib/principal-release-package-delivery", () => ({ deliverPrincipalReleasePackage: mocks.deliver }));

import { GET as getShare } from "./route";
import { GET as getPackage } from "./package/route";
import { POST as postResponse } from "./responses/route";

const snapshot = {} as never;
const verified = { profile: { pdmUserId: "profile-one", companyId: "company-one" },
  session: { principalId: "principal-one" } } as never;
const share = { id: "share-one", submission_id: "submission-one", status: "active" as const };
const submission = { id: "submission-one", company_id: "company-one", status: "Released",
  release_package: { id: "package-one", package_filename: "release.zip" } };
const request = () => new Request("https://ai-pdm.test/api/public/shares/opaque-token");

describe("Principal-only public share routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withPermission.mockImplementation(async (_request, _path, _permission, evaluate) =>
      evaluate({ snapshot, verified }));
    mocks.withIdentityOnly.mockImplementation(async (_request, _path, evaluate) =>
      evaluate({ snapshot, verified }));
    mocks.getAuthorizedShare.mockResolvedValue({ share, submission });
    mocks.serialize.mockResolvedValue({ submission: { id: submission.id } });
    mocks.deliver.mockResolvedValue(new Response("release bytes", { status: 200 }));
  });

  it("requires submission.view before returning metadata selected by an opaque token", async () => {
    const response = await getShare(request(), { params: Promise.resolve({ token: "opaque-token" }) });
    expect(response.status).toBe(200);
    expect(mocks.withPermission).toHaveBeenCalledWith(expect.any(Request),
      "src/app/api/public/shares/[token]/route.ts", "submission.view", expect.any(Function), { readOnly: false });
    expect(mocks.getAuthorizedShare).toHaveBeenCalledWith(snapshot, verified, "opaque-token");
    expect(mocks.serialize).toHaveBeenCalledWith(submission, "opaque-token", share.id, snapshot);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("uses Principal checksum-audited delivery for a share package", async () => {
    const response = await getPackage(request(), { params: Promise.resolve({ token: "opaque-token" }) });
    expect(response.status).toBe(200);
    expect(mocks.withPermission).toHaveBeenCalledWith(expect.any(Request),
      "src/app/api/public/shares/[token]/package/route.ts", "submission.view", expect.any(Function), { readOnly: false });
    expect(mocks.deliver).toHaveBeenCalledWith(expect.any(Request), "submission-one",
      "/api/public/shares/[token]/package", expect.objectContaining({
        principalId: "principal-one", profileId: "profile-one", companyId: "company-one",
        shareId: "share-one", accessKind: "public_share_package", externalAccess: true
      }));
  });

  it("SHARE-PRINCIPAL-001 propagates unauthenticated denial before any public share selector lookup", async () => {
    mocks.withPermission.mockResolvedValue(new Response(JSON.stringify({ code: "auth_session_invalid" }), { status: 401 }));

    const response = await getShare(request(), { params: Promise.resolve({ token: "opaque-token" }) });

    expect(response.status).toBe(401);
    expect(mocks.getAuthorizedShare).not.toHaveBeenCalled();
    expect(mocks.serialize).not.toHaveBeenCalled();
  });

  it("keeps supplier replies unavailable without parsing or mutating token-only input", async () => {
    const response = await postResponse(new Request(
      "https://ai-pdm.test/api/public/shares/opaque-token/responses", { method: "POST", body: "not-json" }),
    { params: Promise.resolve({ token: "opaque-token" }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "supplier_reply_policy_unavailable", availability: "DEFERRED_DEV122_POLICY_NOT_RETIRED"
    });
    expect(mocks.withIdentityOnly).toHaveBeenCalledWith(expect.any(Request),
      "src/app/api/public/shares/[token]/responses/route.ts", expect.any(Function));
    expect(mocks.getAuthorizedShare).not.toHaveBeenCalled();
  });

  it("SUPPLIER-PRINCIPAL-001 propagates missing Principal denial before supplier reply handling", async () => {
    mocks.withIdentityOnly.mockResolvedValue(new Response(JSON.stringify({ code: "auth_session_invalid" }), { status: 401 }));

    const response = await postResponse(new Request(
      "https://ai-pdm.test/api/public/shares/opaque-token/responses", { method: "POST", body: "not-json" }),
    { params: Promise.resolve({ token: "opaque-token" }) });

    expect(response.status).toBe(401);
    expect(mocks.getAuthorizedShare).not.toHaveBeenCalled();
    expect(mocks.withIdentityOnly).toHaveBeenCalledTimes(1);
  });
});
