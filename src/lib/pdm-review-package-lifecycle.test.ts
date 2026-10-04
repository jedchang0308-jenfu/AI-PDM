import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { parseReviewPackageSnapshot, type ReviewPackageEnvelope, type ReviewPackageLifecycleBasis } from "@/lib/pdm-review-package-contract";
import { assertReviewPackagePrimaryRoot, reviewDecisionBasisHash, reviewPackageHash, reviewPackageWorkspaceEvidenceHash, verifyReviewPackageIntegrity } from "@/lib/pdm-review-package";

const lifecycle: ReviewPackageLifecycleBasis = { intent: "first_release", masterId: "part-one",
  masterStatus: "Draft", masterHash: "a".repeat(64), formalRowVersion: 1 };
function fixture(current?: ReviewPackageLifecycleBasis, workRowVersion?: number): ReviewPackageEnvelope {
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
      ...(current ? { lifecycle: current } : {}),
      ...(workRowVersion === undefined ? {} : { workRowVersion }),
      hash: reviewDecisionBasisHash({ payload, lifecycle: current, workRowVersion }) },
    targets: [{ targetKey: "part:part-one" as const, axisId: "part-one", scope: "submitted" as const,
      markers: { submitted: true, change: null, risk: null }, workspace,
      evidenceHash: reviewPackageWorkspaceEvidenceHash(workspace) }] };
  return { ...body, packageHash: reviewPackageHash(body) };
}
describe("immutable canonical lifecycle decision basis", () => {
  it.each(["part","drawing"] as const)("%s approval root guard locks only the primary entity and retains old basis compatibility",async entityType=>{
    const queryOne=vi.fn().mockResolvedValue({part_root_id:"root-one"}),client={kind:"postgres",queryOne} as unknown as AsyncDatabaseClient;
    await assertReviewPackagePrimaryRoot(client,fixture(),{companyId:"company-one",entityType,entityId:"entity-one"});
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("root.company_id=entity.company_id"),{companyId:"company-one",entityId:"entity-one"});
    expect(queryOne.mock.calls[0][0]).toMatch(/FOR UPDATE OF entity$/u);
    expect(queryOne.mock.calls[0][0]).not.toContain("FOR UPDATE OF root");
  });
  it.each(["part","drawing"] as const)("%s approval root guard rejects missing or changed roots as typed409",async entityType=>{
    for(const value of [null,{part_root_id:"other-root"}]){
      const queryOne=vi.fn().mockResolvedValue(value),client={kind:"postgres",queryOne} as unknown as AsyncDatabaseClient;
      await expect(assertReviewPackagePrimaryRoot(client,fixture(lifecycle,3),{companyId:"company-one",entityType,entityId:"entity-one"}))
        .rejects.toMatchObject({code:"WORKBENCH_SNAPSHOT_DRIFT",status:409});
    }
  });
  it("allows a release-only Part request whose attributes equal the formal baseline", () => {
    const value = fixture(lifecycle, 3);
    expect(parseReviewPackageSnapshot(value).kind).toBe("v2");
    expect(verifyReviewPackageIntegrity(value, value.packageHash).decisionBasis.lifecycle).toEqual(lifecycle);
  });
  it("keeps existing v1 basis edit-only without deriving a lifecycle intent", () => {
    const value = fixture();
    expect(verifyReviewPackageIntegrity(value, value.packageHash).decisionBasis.lifecycle).toBeUndefined();
  });
  it.each([undefined, lifecycle])("keeps old exact basis bytes/hash when the counter is absent", current => {
    const old = fixture(current), absent = fixture(current, undefined);
    expect(JSON.stringify(absent)).toBe(JSON.stringify(old));
    expect(verifyReviewPackageIntegrity(old, old.packageHash).decisionBasis.workRowVersion).toBeUndefined();
  });
  it.each([undefined, lifecycle])("parses only the exact old or positive counter-extended basis shape", current => {
    expect(parseReviewPackageSnapshot(fixture(current, 3)).kind).toBe("v2");
    for (const value of [0, -1, 1.5, null, "3", undefined]) {
      const invalid = fixture(current, 3);
      (invalid.decisionBasis as unknown as Record<string, unknown>).workRowVersion = value;
      expect(parseReviewPackageSnapshot(invalid).kind).toBe("invalid");
    }
    const extra = fixture(current, 3);
    (extra.decisionBasis as unknown as Record<string, unknown>).extraCounter = 3;
    expect(parseReviewPackageSnapshot(extra).kind).toBe("invalid");
  });
  it("binds the exact work counter even when the outer package hash is recomputed", () => {
    const value = fixture(lifecycle, 3);
    const oldDecisionHash = fixture(lifecycle).decisionBasis.hash;
    expect(value.decisionBasis.hash).not.toBe(oldDecisionHash);
    value.decisionBasis.workRowVersion = 4;
    const { packageHash: _old, ...body } = value; value.packageHash = reviewPackageHash(body);
    expect(() => verifyReviewPackageIntegrity(value, value.packageHash)).toThrow("審核包證據雜湊驗證失敗");
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
