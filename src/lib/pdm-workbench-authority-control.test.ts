import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { assertCanonicalWorkbenchAuthority, issueCanonicalWorkbenchContract,
  verifyCanonicalWorkbenchCommandContract } from "@/lib/pdm-workbench-authority-control";

const authorityCommit = "91de3a65df58dc60ddde88aab5263e9470a84565";
const imageCommit = "dcfa6074316e836eaaddce24d926c62ef5407ed9";
const row = { id:1, mode:"canonical_only", expected_commit:authorityCommit,
  schema_hash:"dev090-v1",row_version:9,switched_at:"2026-09-16T05:33:00Z" };
function database(overrides: Record<string,unknown> = {}) {
  return { kind:"postgres",queryOne:vi.fn(async () => ({ ...row,...overrides })) } as unknown as AsyncDatabaseClient;
}
function runtime(binding: string | undefined = authorityCommit) {
  vi.stubEnv("NODE_ENV","production");
  vi.stubEnv("PDM_WORKBENCH_AUTHORITY_COMMIT",binding);
  vi.stubEnv("PDM_BUILD_COMMIT",imageCommit);
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA",imageCommit);
  vi.stubEnv("PDM_WORKBENCH_CONTRACT_SECRET","task-owned-unit-contract-secret");
}
afterEach(() => vi.unstubAllEnvs());
describe("owner-bound workbench authority independent of application source", () => {
  it("accepts the exact published authority contract on a newer application image",async () => {
    runtime();
    await expect(assertCanonicalWorkbenchAuthority(database())).resolves.toMatchObject({ expectedCommit:authorityCommit,rowVersion:9 });
  });
  it("rejects a missing authority binding even when the old build variable matches",async () => {
    runtime(undefined);
    vi.stubEnv("PDM_WORKBENCH_AUTHORITY_COMMIT",undefined);
    vi.stubEnv("PDM_BUILD_COMMIT",authorityCommit);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA",authorityCommit);
    await expect(assertCanonicalWorkbenchAuthority(database())).rejects.toMatchObject({ code:"WORKBENCH_AUTHORITY_MISMATCH",status:503 });
  });
  it.each(["local-dev","latest",imageCommit])("rejects an invalid or different authority binding %s",async value => {
    runtime(value);
    await expect(assertCanonicalWorkbenchAuthority(database())).rejects.toMatchObject({ code:"WORKBENCH_AUTHORITY_MISMATCH",status:503 });
  });
  it.each([{ mode:"legacy_only" },{ schema_hash:"unknown-schema" },{ expected_commit:imageCommit }])("keeps canonical mode, schema and persisted binding checks %j",async override => {
    runtime();
    await expect(assertCanonicalWorkbenchAuthority(database(override))).rejects.toMatchObject({ code:"WORKBENCH_AUTHORITY_MISMATCH",status:503 });
  });
  it("retains signed company/profile tokens and rejects a changed database authority",async () => {
    runtime();
    const token=await issueCanonicalWorkbenchContract(database(),{ companyId:"company-jenfu",actorId:"historical-profile" });
    await expect(verifyCanonicalWorkbenchCommandContract(database(),{ companyId:"company-jenfu",actorId:"historical-profile",token })).resolves.toMatchObject({ expectedCommit:authorityCommit });
    for (const input of [{ companyId:"other-company",actorId:"historical-profile",token },
      { companyId:"company-jenfu",actorId:"other-profile",token },
      { companyId:"company-jenfu",actorId:"historical-profile",token:token+"invalid" }]) {
      await expect(verifyCanonicalWorkbenchCommandContract(database(),input)).rejects.toMatchObject({ code:"WORKBENCH_CONTRACT_EXPIRED",status:409 });
    }
    await expect(verifyCanonicalWorkbenchCommandContract(database({ expected_commit:imageCommit }),{ companyId:"company-jenfu",actorId:"historical-profile",token })).rejects.toMatchObject({ code:"WORKBENCH_AUTHORITY_MISMATCH",status:503 });
  });
});
