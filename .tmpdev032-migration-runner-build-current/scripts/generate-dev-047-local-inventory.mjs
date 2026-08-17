#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { buildDev047LocalInventory } from "./dev-047-local-inventory-utils.mjs";

const root = process.cwd();
const outputPath = path.join(root, "output", "dev-047-bounded-schema-inventory", "local-baseline.json");
const inventory = buildDev047LocalInventory(root);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");

console.log(`DEV-047 Phase A0 local inventory: ${inventory.authority.classification}`);
console.log(`PostgreSQL artifact tables: ${inventory.summary.postgresArtifactObjects.tables}`);
console.log(`Code dependency candidates: ${inventory.summary.codeDependencyCount}`);
console.log(`Dynamic SQL candidates: ${inventory.summary.dynamicSqlCandidateCount}`);
console.log(`Output: ${path.relative(root, outputPath).split(path.sep).join("/")}`);
console.log("No credentials, database connection, cloud resource, schema move, staging or production action was used.");

