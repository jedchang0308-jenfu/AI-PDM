import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidencePath = path.join(root, "output", "qa", "dev-090-browser", "evidence.json");
const required = [
  evidencePath,
  path.join(root, "output", "qa", "dev-090-browser", "drawing-drawer.png"),
  path.join(root, "output", "qa", "dev-090-browser", "part-drawer.png")
];
const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length) {
  console.error(`FAIL DEV-090 browser evidence missing: ${missing.map((file) => path.relative(root, file)).join(", ")}`);
  process.exit(1);
}
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
if (evidence.task !== "DEV-090" || evidence.status !== "PASS_FOCUSED_SURFACE") {
  console.error("FAIL DEV-090 browser evidence status");
  process.exit(1);
}
for (const key of ["drawing_drawer", "part_drawer", "minimal_search"]) {
  if (typeof evidence.cases?.[key] !== "string") {
    console.error(`FAIL DEV-090 browser case: ${key}`);
    process.exit(1);
  }
}
console.log("PASS DEV-090 browser evidence (drawing drawer, part drawer, minimal search)");
