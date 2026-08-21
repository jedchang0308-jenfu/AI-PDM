import { assert, read, report } from "./qc-dev-086-fixtures.mjs";

const repository = read("src/lib/repositories/shared-3d-baseline-async-repository.ts");
const domain = read("src/lib/shared-3d-baseline.ts");
assert(repository.includes("releaseManufacturingBaselineWithAudit"), "baseline release uses atomic repository method");
assert(repository.includes("new AsyncAuditRepository(tx)"), "audit insert is inside the same transaction");
assert(domain.includes("ManufacturingBaselineReleased"), "baseline release audit action is retained");
report("transition", 3);
