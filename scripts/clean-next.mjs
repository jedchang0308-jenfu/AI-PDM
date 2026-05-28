import fs from "node:fs/promises";
import path from "node:path";

const nextDir = path.join(process.cwd(), ".next");

await fs.rm(nextDir, { recursive: true, force: true });
console.log(`Removed ${nextDir}`);
