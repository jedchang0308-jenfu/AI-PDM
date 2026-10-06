import { describe, expect, it } from "vitest";
import { parseReviewPackageSnapshot, type ReviewPackageEnvelope, type ReviewPackageLifecycleBasis } from "@/lib/pdm-review-package-contract";
import { reviewDecisionBasisHash, reviewPackageHash, reviewPackageWorkspaceEvidenceHash, verifyReviewPackageIntegrity } from "@/lib/pdm-review-package";

const lifecycle: ReviewPackageLifecycleBasis = { intent: "first_release", masterId: "part-one",
  masterStatus: "Draft", masterHash: "a".repeat(64), formalRowVersion: 1 };
function fixture(current?: ReviewPackageLifecycleBasis): ReviewPackageEnvelope {
  const payload = { partName: "Unchanged draft", itemKind: "purchased", isUniversal: false };
  const workspace = { kind: "part" as const, entityId: "part-one", revisionId: null,
    identity: { code: "QC-P01", name: "Unchanged draft", revision: null, purposeCode: null, purposeDescription: null },
    payload, baselinePayload: payload, files: [], attachments: [], recognition: null };
  const matrixBody = { rootId: "root-one", rootCode: "QC", drawings: [],
    parts: [{ axisId: "part-one", targetKey: "part:part-one" as const, code: "QC-P01", revision: null }], cells: [] };
  const body = { schemaVersion: "pdm-review-package-v2" as const, submittedAt: "2026-10-03T00:00:00.000Z",
    requestKind: "part_change" as const, primaryTargetKey: "part:part-one" as const,
    root: { id: "root-one", code: "QC" }, matrix: { ...matrixBody, evidenceHash: reviewPackageHash(matrixBody) },
    decisionBasis: { version: current ? 2 as const : 1 as const, kind: "part_change_work" as const,
      payload, revisionId: null, claimId: null,
      ...(current ? { lifecycle: current } : {}), hash: reviewDecisionBasisHash({ payload, lifecycle: current }) },
    targets: [{ targetKey: "part:part-one" as const, axisId: "part-one", scope: "submitted" as const,
      markers: { submitted: true, change: null, risk: null }, workspace,
      evidenceHash: reviewPackageWorkspaceEvidenceHash(workspace) }] };
  return { ...body, packageHash: reviewPackageHash(body) };
}
describe("immutable canonical lifecycle decision basis", () => {
  it("allows a release-only Part request whose attributes equal the formal baseline", () => {
    const value = fixture(lifecycle);
    expect(parseReviewPackageSnapshot(value).kind).toBe("v2");
    expect(verifyReviewPackageIntegrity(value, value.packageHash).decisionBasis.lifecycle).toEqual(lifecycle);
  });
  it("keeps existing v1 basis edit-only without deriving a lifecycle intent", () => {
    const value = fixture();
    expect(verifyReviewPackageIntegrity(value, value.packageHash).decisionBasis.lifecycle).toBeUndefined();
  });
  it.each([
    { ...lifecycle, masterId: "another-part" }, { ...lifecycle, intent: "production_release" as const },
    { ...lifecycle, formalRowVersion: null }, { ...lifecycle, masterStatus: "Obsolete" }
  ])("rejects an invalid Part lifecycle basis %j", invalid => {
    expect(parseReviewPackageSnapshot(fixture(invalid)).kind).toBe("invalid");
  });
  it("binds intent and source version even when an altered outer package hash is recomputed", () => {
    const value = fixture(lifecycle);
    value.decisionBasis.lifecycle!.intent = "edit";
    const { packageHash: _old, ...body } = value;
    value.packageHash = reviewPackageHash(body);
    expect(() => verifyReviewPackageIntegrity(value, value.packageHash)).toThrow("審核包證據雜湊驗證失敗");
  });
});
