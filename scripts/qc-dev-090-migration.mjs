import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/migrate-dev-090-inline-relation-matrix.mjs", "--provider=sqlite"], { encoding: "utf8" });
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.status !== 0 || !/PASS/i.test(`${result.stdout}\n${result.stderr}`)) {
  console.error("FAIL DEV-090 sqlite migration dry-run");
  process.exit(1);
}
console.log("PASS DEV-090 migration dry-run");
