import { assert, read, report } from "./qc-dev-086-fixtures.mjs";

const drawing = read("src/app/api/numbering/drawings/workbench/[rowKey]/route.ts");
const part = read("src/app/api/parts/workbench/[rowKey]/route.ts");
const relation = read("src/app/api/numbering/relations/[rowKey]/route.ts");
const status = read("src/app/api/numbering/state-flow/status/route.ts");
assert(drawing.includes("projectionToken"), "drawing detail passes projection token");
assert(part.includes("projectionToken"), "part detail passes projection token");
assert(relation.includes("projectionToken"), "relation detail passes projection token");
assert(status.includes("productionRdLanes"), "status route exposes DEV-086 flag");
report("api", 4);
