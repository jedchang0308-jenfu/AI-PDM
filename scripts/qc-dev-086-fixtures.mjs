import fs from "node:fs";
import path from "node:path";

export const root = process.cwd();
export const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
export function assert(condition, message) {
  if (!condition) throw new Error(`DEV-086 QC failed: ${message}`);
}
export function report(name, checks) {
  console.log(`DEV-086 ${name}: ${checks} checks passed`);
}
