#!/usr/bin/env node

import assert from "node:assert/strict";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();

const read = (relativePath) => readProjectFile(root, relativePath);

const profileSource = read("src/lib/metadata-adapter-profile.ts");
const routeSource = read("src/app/api/file-metadata/detect/route.ts");
const metadataAdapterSource = read("src/lib/pdm-metadata-adapter.ts");
const cadExtractionSource = read("src/lib/cad-extraction.ts");
const pdmMetadataSource = read("src/lib/pdm-metadata.ts");

assert.match(profileSource, /resolveExtractorProfile\("PDM_METADATA_EXTRACTOR",\s*company\.companyCode\)/);
assert.match(profileSource, /resolveExtractorProfile\("PDM_CAD_REFERENCE_EXTRACTOR",\s*company\.companyCode\)/);
assert.match(profileSource, /command:\s*`\$\{prefix\}_\$\{companyCode\}_CMD`/);
assert.match(profileSource, /args:\s*`\$\{prefix\}_\$\{companyCode\}_ARGS`/);
assert.match(profileSource, /legacyKeys/);
assert.match(profileSource, /\$\{prefix\}_CMD/);
assert.match(profileSource, /\$\{prefix\}_ARGS/);

assert.match(profileSource, /Omit<ExtractorRuntimeProfile,\s*"command"\s*\|\s*"args">/);
assert.match(profileSource, /stripRuntimeSecretFields/);
assert.match(profileSource, /configured:\s*profile\.configured/);
assert.doesNotMatch(profileSource, /command:\s*profile\.command/);
assert.doesNotMatch(profileSource, /args:\s*profile\.args/);

assert.match(routeSource, /resolveMetadataAdapterProfile\(companyResult\.company\)/);
assert.match(routeSource, /serializeMetadataAdapterProfile\(adapterProfile\)/);
assert.match(routeSource, /metadataAdapterProfile/);
assert.match(routeSource, /metadataExtractor:\s*adapterProfile\.metadataExtractor/);
assert.match(routeSource, /referenceExtractor:\s*adapterProfile\.cadReferenceExtractor/);
assert.match(routeSource, /\.\.\.adapterProfile\.warnings/);
assert.match(routeSource, /files_required/);
assert.match(routeSource, /metadata_detection_failed/);

assert.match(metadataAdapterSource, /ExtractorRuntimeProfile/);
assert.match(metadataAdapterSource, /extractor\?\.command/);
assert.match(metadataAdapterSource, /extractor\?\.args/);
assert.match(metadataAdapterSource, /PDM_METADATA_EXTRACTOR_CMD/);
assert.match(metadataAdapterSource, /PDM_METADATA_EXTRACTOR_ARGS/);

assert.match(cadExtractionSource, /ExtractorRuntimeProfile/);
assert.match(cadExtractionSource, /extractor\?\.command/);
assert.match(cadExtractionSource, /extractor\?\.args/);
assert.match(cadExtractionSource, /PDM_CAD_REFERENCE_EXTRACTOR_CMD/);
assert.match(cadExtractionSource, /PDM_CAD_REFERENCE_EXTRACTOR_ARGS/);

assert.match(pdmMetadataSource, /metadataExtractor\?:\s*ExtractorRuntimeProfile/);
assert.match(pdmMetadataSource, /extractNativeCadMetadata\(files,\s*\{\s*extractor:\s*options\.metadataExtractor\s*\}\)/);

console.log(
  JSON.stringify(
    {
      passed: 8,
      failed: 0,
      checks: [
        "company-specific metadata extractor env keys",
        "company-specific CAD reference extractor env keys",
        "legacy global extractor fallback preserved",
        "public profile strips runtime command and args",
        "file metadata route resolves company adapter profile",
        "file metadata route returns redacted profile",
        "metadata extraction consumes selected profile",
        "CAD reference extraction consumes selected profile"
      ]
    },
    null,
    2
  )
);
