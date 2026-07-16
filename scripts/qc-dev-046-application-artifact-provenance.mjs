#!/usr/bin/env node

import fs from "node:fs";
import {
  DEV046_ACCEPTED_ROUTES,
  DEV046_DEPLOYED_IMAGE,
  buildDev046ArtifactProvenance
} from "./dev-046-application-artifact-provenance.mjs";

const candidateImage = process.env.AI_PDM_DEV046_CANDIDATE_IMAGE?.trim() ?? "";
const report = buildDev046ArtifactProvenance({ candidateImage });
const source = fs.readFileSync("Dockerfile", "utf8");
const results = [];

function record(name, passed) {
  results.push({ name, passed: Boolean(passed) });
}

record("DEV046-ART-001 accepted route contract is explicit", DEV046_ACCEPTED_ROUTES.length === 7);
record("DEV046-ART-002 all accepted routes exist in current source", report.acceptedRoutes.every((item) => item.present));
record("DEV046-ART-003 current mixed worktree fails closed", report.git.clean === false && report.safeToPushOrDeploy === false);
record("DEV046-ART-004 source snapshot hash is deterministic shape", /^[a-f0-9]{64}$/u.test(report.git.sourceStateSha256));
record(
  "DEV046-ART-004A source snapshot excludes non-build evidence",
  report.git.worktreeChangedFileCount > report.git.dockerContextChangedFileCount && report.git.excludedChangedFileCount > 0
);
record("DEV046-ART-005 deployed immutable digest is inspected", report.deployed?.imageRef === DEV046_DEPLOYED_IMAGE && report.deployed?.routeCount > 0);
record(
  "DEV046-ART-006 deployed image exposes the known accepted-route drift",
  report.deployed?.coverage.some((item) => item.route === "/api/auth/employee-login-intents" && item.present === false) &&
    report.blockers.includes("STAGING_DEPLOYED_ROUTE_MANIFEST_INCOMPLETE")
);
record(
  "DEV046-ART-007 deployed image lacks source revision provenance",
  report.deployed?.revisionLabel === "" && report.blockers.includes("STAGING_DEPLOYED_IMAGE_SOURCE_REVISION_LABEL_MISSING")
);
record(
  "DEV046-ART-008 Dockerfile emits OCI revision and source-state labels",
  source.includes("org.opencontainers.image.revision") &&
    source.includes("org.opencontainers.image.source") &&
    source.includes("com.jenfu.ai-pdm.source-state")
);
record(
  "DEV046-ART-009 preflight is non-mutating",
  report.executionBoundary.cloudMutationPerformed === false &&
    report.executionBoundary.imagePushPerformed === false &&
    report.executionBoundary.deploymentPerformed === false
);

if (candidateImage) {
  record("DEV046-ART-010 candidate image is locally inspectable", Boolean(report.candidate) && !report.candidate?.inspectionError);
  record("DEV046-ART-011 candidate contains every accepted route", report.candidate?.coverage.every((item) => item.present));
  record(
    "DEV046-ART-012 dirty candidate remains prohibited despite route completeness",
    report.candidate?.coverage.every((item) => item.present) &&
      report.candidate?.exactCleanHeadRevision === false &&
      report.safeToPushOrDeploy === false
  );
}

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
const failed = results.filter((result) => !result.passed);
console.log(`\nDEV-046 artifact provenance QC: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
