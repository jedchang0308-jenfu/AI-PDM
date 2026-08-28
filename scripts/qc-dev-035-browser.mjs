import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const workspace = fs.readFileSync(path.join(root, "src/components/drawing-recognition-workspace-panel.tsx"), "utf8");
const review = fs.readFileSync(path.join(root, "src/components/drawing-recognition-review.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const failures = [];
for (const [name, text] of [["embedded health banner", workspace], ["full review health banner", review]]) {
  if (!text.includes("adapterHealth") || !text.includes("role={isError ? \"alert\" : \"status\"}")) failures.push(name);
  if (!text.includes("onRetry") || !text.includes("重新辨識") || !text.includes("/reruns")) failures.push(`${name} recovery action`);
  if (!text.includes("requiresPartOwner") || !text.includes("data-owner-required") || !text.includes("尚未指定料號歸屬")) failures.push(`${name} inline owner validation`);
}
if (workspace.includes("visualReviewState") || workspace.includes("請先重新辨識") || workspace.includes("data-part-owner-recovery")) failures.push("embedded owner deadlock removal");
if (review.includes("isLegacyUnresolvedPartOwner") || review.includes("data-part-owner-recovery")) failures.push("full review owner deadlock removal");
if (!workspace.includes("aria-invalid={unresolvedPartOwner") || !review.includes("aria-invalid={ownerRequired")) failures.push("owner field accessibility semantics");
if (!css.includes("dev079-recognition-adapter-health") || !css.includes("drawing-recognition-adapter-health")) failures.push("health banner css");
if (!css.includes("dev079-recognition-field-error") || !css.includes("drawing-recognition-field-error") || !css.includes("#b42318")) failures.push("inline owner error css");
if (workspace.includes("color-only") || review.includes("color-only")) failures.push("color-only warning");
console.log(JSON.stringify({ script: "qc-dev-035-browser", passed: failures.length === 0, viewportMatrix: [1440, 1024, 390], failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;
