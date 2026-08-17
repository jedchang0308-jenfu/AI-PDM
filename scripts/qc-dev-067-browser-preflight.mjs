import fs from "node:fs";

const required = [
  "src/components/unified-pdm-entity-detail-drawer.tsx",
  "src/components/drawing-projection.tsx",
  "src/components/part-projection.tsx",
  "src/components/relation-projection.tsx",
  "src/components/review-context-projection.tsx"
];
const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length) {
  console.error(`Missing browser surface files: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("PASS DEV-067 browser surface preflight; run authenticated browser cases UDD-001..050 for runtime evidence.");
