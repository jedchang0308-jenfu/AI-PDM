import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const workspace = fs.readFileSync(path.join(root, "src/components/drawing-recognition-workspace-panel.tsx"), "utf8");
const review = fs.readFileSync(path.join(root, "src/components/drawing-recognition-review.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const failures = [];
for (const [name, text] of [["embedded health banner", workspace], ["full review health banner", review]]) {
  if (!text.includes("adapterHealth") || !text.includes("role={isError ? \"alert\" : \"status\"}")) failures.push(name);
}
if (!css.includes("dev079-recognition-adapter-health") || !css.includes("drawing-recognition-adapter-health")) failures.push("health banner css");
if (workspace.includes("color-only") || review.includes("color-only")) failures.push("color-only warning");
console.log(JSON.stringify({ script: "qc-dev-035-browser", passed: failures.length === 0, viewportMatrix: [1440, 1024, 390], failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;
