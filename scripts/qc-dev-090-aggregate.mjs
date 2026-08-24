import { spawnSync } from "node:child_process";

const commands = [
  ["contract", "scripts/qc-dev-090-contract.mjs"],
  ["repository", "scripts/qc-dev-090-repository.mjs"],
  ["migration", "scripts/qc-dev-090-migration.mjs"],
  ["mutation", "--experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-090-mutation.ts"],
  ["retirement", "scripts/qc-dev-090-retirement.mjs"],
  ["browser", "scripts/qc-dev-090-browser.mjs"]
];
for (const [label, script] of commands) {
  const args = script.startsWith("--") ? script.split(" ") : [script];
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`FAIL DEV-090 aggregate at ${label}`);
    process.exit(result.status ?? 1);
  }
}
console.log("PASS DEV-090 focused aggregate");
