import { assert, read, report } from "./qc-dev-086-fixtures.mjs";

const drawing = read("src/lib/repositories/drawing-workbench-async-repository.ts");
const part = read("src/lib/repositories/part-workbench-async-repository.ts");
const relation = read("src/lib/repositories/relation-workbench-async-repository.ts");
assert(drawing.includes("projectedByBaseKey"), "drawing repository preserves both lane rows");
assert(part.includes("source_part_number_id"), "part repository resolves source-part workspaces");
assert(relation.includes("projectedByKey"), "relation repository preserves both lane rows");
assert(!drawing.includes("client.execute") && !part.includes("client.execute") && !relation.includes("client.execute"), "workbench list repositories remain read-only");
report("repository", 4);
