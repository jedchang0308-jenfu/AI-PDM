import { assert, read, report } from "./qc-dev-086-fixtures.mjs";

const spec = read(".ai-doc/specs/SPEC-PDM-WORKBENCH-PRODUCTION-RD-LANES-001-dual-latest-projection.md");
const adr = read(".ai-doc/decisions/ADR-PDM-WORKBENCH-PRODUCTION-RD-LANES-001-dual-lane-authority.md");
assert(/migration[\s\S]{0,120}none/iu.test(spec) || spec.includes("Migration classification: none"), "migration classification is none");
assert(adr.includes("classification固定為`none`") && adr.includes("不得修改schema或新增backfill"), "ADR keeps no-migration boundary");
report("classifier", 2);
