import { spawnSync } from "node:child_process";
import { assert, read, report } from "./qc-dev-086-fixtures.mjs";

assert(read("src/lib/pdm-workbench-filter-selection.ts").includes("selectionHashValue"), "DEV-085 selection helper remains shared");
for (const args of [
  ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-085-selection.mjs"],
  ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-085-query.mjs"],
  ["scripts/qc-dev-085-contract.mjs"]
]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
report("regression", 4);
