#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const revisionPattern = /^ai-pdm-prod-[a-z0-9-]{3,48}$/u;

export function selectProductionServingRevision(service) {
  const traffic = service?.status?.traffic;
  if (!Array.isArray(traffic)) {
    throw new Error("PRODUCTION_SERVING_TRAFFIC_MISSING");
  }

  const revisions = [...new Set(
    traffic
      .filter((target) => Number(target?.percent ?? 0) === 100)
      .map((target) => target?.revisionName)
      .filter(Boolean)
  )];

  if (revisions.length !== 1) {
    throw new Error(`PRODUCTION_SERVING_REVISION_COUNT_INVALID:${revisions.length}`);
  }
  if (!revisionPattern.test(revisions[0])) {
    throw new Error("PRODUCTION_SERVING_REVISION_INVALID");
  }
  return revisions[0];
}

async function run(argv = process.argv.slice(2)) {
  if (argv.length !== 1) throw new Error("USAGE: select-production-serving-revision.mjs <service-json>");
  const service = JSON.parse(await readFile(argv[0], "utf8"));
  console.log(selectProductionServingRevision(service));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
