import { assert, read, report } from "./qc-dev-086-fixtures.mjs";

const contract = read("src/lib/pdm-workbench-contract.ts");
const token = read("src/lib/pdm-workbench-projection-token.ts");
const feature = read("src/lib/number-state-flow-feature.ts");
assert(contract.includes('"production" | "rd"'), "lane union is present");
assert(contract.includes("paginationUnit?: \"row\" | \"group\""), "group pagination metadata is present");
assert(token.includes("pdm-workbench-lane-reference-v1"), "projection-token namespace is present");
assert(token.includes("createHmac(\"sha256\""), "projection-token HMAC is present");
assert(feature.includes("PDM_WORKBENCH_PRODUCTION_RD_LANES_V1"), "DEV-086 feature flag is present");
report("contract", 5);
