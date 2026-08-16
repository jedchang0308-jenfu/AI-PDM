#!/usr/bin/env node

import { DEV032_RELEASE_SOURCE_OUTPUT, writeDev032ReleaseSourceManifest } from "./dev-032-release-source-manifest-utils.mjs";

const { manifest, outputPath } = writeDev032ReleaseSourceManifest(process.cwd(), DEV032_RELEASE_SOURCE_OUTPUT);

console.log(JSON.stringify({
  outputPath,
  status: manifest.status,
  sourceSnapshotSha256: manifest.releaseDecision.sourceSnapshotSha256,
  classificationSha256: manifest.releaseDecision.classificationSha256,
  totalDirtyEntries: manifest.summary.totalDirtyEntries,
  includedProductionSourceEntries: manifest.summary.includedProductionSourceEntries,
  unknownRiskEntries: manifest.summary.unknownRiskEntries,
  safeToBuildForProduction: manifest.releaseDecision.safeToBuildForProduction
}, null, 2));
