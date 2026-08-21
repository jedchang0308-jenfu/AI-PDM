import { assert, read, report } from "./qc-dev-086-fixtures.mjs";

for (const file of ["src/lib/drawing-workbench.ts", "src/lib/part-workbench.ts", "src/lib/relation-workbench.ts"]) {
  const source = read(file);
  assert(!/\.execute\s*\(/u.test(source), `${file} read path has no execute`);
  assert(source.includes("paginationUnit: \"group\""), `${file} emits group pagination metadata`);
}
report("query-budget", 6);
