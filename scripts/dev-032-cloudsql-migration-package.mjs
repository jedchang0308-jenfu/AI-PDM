#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildDev046CloudSqlMigrationPackage,
  writeDev046CloudSqlMigrationPackage
} from "./dev-046-cloudsql-migration-package.mjs";

export async function buildDev032CloudSqlMigrationPackage(outputDir = "output/dev-032-cloudsql-migration-package") {
  const report = buildDev046CloudSqlMigrationPackage({ target: "production" });
  const outputs = await writeDev046CloudSqlMigrationPackage(report, outputDir);
  return { report, outputs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  buildDev032CloudSqlMigrationPackage()
    .then(({ report }) => {
      console.log(`DEV-032 production Cloud SQL migration package: ${report.readiness.status}`);
      console.log(`Target: ${report.target.projectId}/${report.target.cloudSqlInstance}`);
      console.log(`Candidate schema files: ${report.candidatePackage.orderedSchemaMigrationCount}`);
      console.log("No credentials, Cloud SQL connections or production mutations were executed.");
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
