import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAudit: vi.fn() }));
vi.mock("@/lib/audit-async", () => ({ createAuditLogAsync: mocks.createAudit }));

import { auditStorageAccess } from "@/lib/storage-access-audit";

const base = {
  submissionId: "submission-1", accessKind: "submission_file" as const,
  fileId: "file-1", filename: "drawing.pdf", bytes: 42,
  disposition: "attachment" as const, provider: "local_repository" as const,
  storageKey: "file-key", bucket: null,
  access: { provider: "local_repository" as const, mode: "server_stream" as const,
    key: "file-key",
    expiresAt: null, expiresInSeconds: 0, authorizationHeaderRequired: false,
    auditRequired: true as const, url: "must-not-enter-audit" },
  route: "/api/submissions/[id]/files/[...filePath]"
};

describe("storage access audit security subject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records the verified Principal as actor with tenant scope and preserves profile only as history", async () => {
    await auditStorageAccess({ ...base, principalId: "principal-1",
      historicalProfileId: "profile-1", companyId: "company-1" });
    expect(mocks.createAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "principal-1", companyId: "company-1", scopeKind: "tenant",
      detail: expect.objectContaining({ securityPrincipalId: "principal-1",
        historicalProfileId: "profile-1" }) }));
    expect(JSON.stringify(mocks.createAudit.mock.calls[0][0])).not.toContain("must-not-enter-audit");
  });

  it("records a public-share download without inventing a human security subject", async () => {
    await auditStorageAccess({ ...base, accessKind: "public_share_package",
      principalId: null, externalAccess: true });
    const audit = mocks.createAudit.mock.calls[0][0];
    expect(audit.actorId).toBeNull();
    expect(audit.scopeKind).toBe("legacy_unscoped");
    expect(audit.detail).not.toHaveProperty("securityPrincipalId");
    expect(audit.detail.externalAccess).toBe(true);
  });
});
