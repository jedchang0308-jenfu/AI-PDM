#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const DEV046_DEPLOYED_IMAGE =
  "asia-east1-docker.pkg.dev/jenfu-ai-pdm-stg-361825/ai-pdm/ai-pdm@sha256:cf36fa4f6bc68a59db7f632dd9c7df3e81b84ac28cf7c5a5a11034408d7920c3";

export const DEV046_ACCEPTED_ROUTES = [
  ["/api/auth/employee-login-intents", "src/app/api/auth/employee-login-intents/route.ts"],
  ["/api/auth/firebase/session", "src/app/api/auth/firebase/session/route.ts"],
  ["/api/account/sessions", "src/app/api/account/sessions/route.ts"],
  ["/api/admin/accounts/[userId]/login-aliases", "src/app/api/admin/accounts/[userId]/login-aliases/route.ts"],
  ["/api/admin/accounts/[userId]/login-aliases/[aliasId]", "src/app/api/admin/accounts/[userId]/login-aliases/[aliasId]/route.ts"]
];

const root = process.cwd();
const defaultOutput = path.join(root, "output", "dev-046-artifact-provenance", "report.json");

function run(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function git(args) {
  return run("git", args);
}

function splitNull(value) {
  return value.split("\0").filter(Boolean);
}

function includedInDockerContext(file) {
  const normalized = file.replaceAll("\\", "/");
  const excludedPrefixes = [
    ".git/",
    ".github/",
    ".next/",
    ".tmp/",
    "tmp/",
    "node_modules/",
    "data/",
    "output/",
    "artifacts/",
    "cloud-functions/",
    "sw-addin/",
    ".playwright-cli/",
    ".next-codex-logs/",
    "secrets/"
  ];
  if (excludedPrefixes.some((prefix) => normalized.startsWith(prefix))) return false;
  if (normalized.includes("/.terraform/")) return false;
  if (normalized.startsWith(".ai-doc/") && normalized !== ".ai-doc/reference/pdm-management-policy-draft.md") return false;
  if (/^(?:\.env(?:\..*)?|.*\.log|.*\.sqlite)$/u.test(normalized) && normalized !== ".env.example") return false;
  return true;
}

function sourceStateHash() {
  const files = new Set([
    ...splitNull(git(["diff", "--name-only", "-z"])),
    ...splitNull(git(["diff", "--cached", "--name-only", "-z"])),
    ...splitNull(git(["ls-files", "--others", "--exclude-standard", "-z"]))
  ]);
  const dockerContextFiles = [...files].filter(includedInDockerContext).sort();
  const hash = crypto.createHash("sha256");
  for (const file of dockerContextFiles) {
    hash.update(file).update("\0");
    const absolute = path.join(root, file);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) hash.update(fs.readFileSync(absolute));
    else hash.update("<missing>");
    hash.update("\0");
  }
  return {
    worktreeChangedFileCount: files.size,
    dockerContextChangedFileCount: dockerContextFiles.length,
    excludedChangedFileCount: files.size - dockerContextFiles.length,
    sha256: hash.digest("hex")
  };
}

function normalizeRoute(route) {
  return route.endsWith("/route") ? route.slice(0, -6) : route;
}

function inspectImage(imageRef) {
  if (!imageRef) return null;
  try {
    const inspect = JSON.parse(run("docker", ["image", "inspect", imageRef]))[0];
    const routeScript =
      "const fs=require('fs');const p='.next/server/app-paths-manifest.json';" +
      "const j=JSON.parse(fs.readFileSync(p,'utf8'));console.log(JSON.stringify(Object.keys(j)));";
    const routes = JSON.parse(run("docker", ["run", "--rm", "--entrypoint", "node", imageRef, "-e", routeScript]))
      .map(normalizeRoute)
      .sort();
    return {
      imageRef,
      imageId: inspect.Id ?? "",
      created: inspect.Created ?? "",
      labels: inspect.Config?.Labels ?? {},
      routeCount: routes.length,
      routes
    };
  } catch (error) {
    return { imageRef, inspectionError: error instanceof Error ? error.message : String(error), labels: {}, routes: [] };
  }
}

function routeCoverage(routes) {
  const available = new Set(routes);
  return DEV046_ACCEPTED_ROUTES.map(([route]) => ({ route, present: available.has(route) }));
}

function parseArgs(argv) {
  const result = { candidateImage: process.env.AI_PDM_DEV046_CANDIDATE_IMAGE?.trim() ?? "", writeReport: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--candidate-image") result.candidateImage = argv[index + 1] ?? "";
    if (argv[index] === "--write-report") result.writeReport = true;
  }
  return result;
}

export function buildDev046ArtifactProvenance({ candidateImage = "", deployedImage = DEV046_DEPLOYED_IMAGE } = {}) {
  const head = git(["rev-parse", "HEAD"]);
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  const clean = status.length === 0;
  const state = sourceStateHash();
  const sourceCoverage = DEV046_ACCEPTED_ROUTES.map(([route, file]) => ({ route, file, present: fs.existsSync(path.join(root, file)) }));
  const candidate = inspectImage(candidateImage);
  const deployed = inspectImage(deployedImage);
  const candidateCoverage = routeCoverage(candidate?.routes ?? []);
  const deployedCoverage = routeCoverage(deployed?.routes ?? []);
  const candidateRevision = candidate?.labels?.["org.opencontainers.image.revision"] ?? "";
  const deployedRevision = deployed?.labels?.["org.opencontainers.image.revision"] ?? "";

  const blockers = [];
  if (!clean) blockers.push("STAGING_APPLICATION_SOURCE_WORKTREE_NOT_CLEAN");
  if (!sourceCoverage.every((item) => item.present)) blockers.push("STAGING_ACCEPTED_SOURCE_ROUTE_MISSING");
  if (!candidate) blockers.push("STAGING_APPLICATION_CANDIDATE_IMAGE_NOT_BUILT");
  else {
    if (candidate.inspectionError) blockers.push("STAGING_APPLICATION_CANDIDATE_IMAGE_INSPECTION_FAILED");
    if (!candidateCoverage.every((item) => item.present)) blockers.push("STAGING_APPLICATION_CANDIDATE_ROUTE_MANIFEST_INCOMPLETE");
    if (!clean || candidateRevision !== head) blockers.push("STAGING_APPLICATION_CANDIDATE_REVISION_NOT_EXACT_CLEAN_HEAD");
  }
  if (!deployed || deployed.inspectionError) blockers.push("STAGING_DEPLOYED_IMAGE_INSPECTION_FAILED");
  else {
    if (!deployedCoverage.every((item) => item.present)) blockers.push("STAGING_DEPLOYED_ROUTE_MANIFEST_INCOMPLETE");
    if (!deployedRevision) blockers.push("STAGING_DEPLOYED_IMAGE_SOURCE_REVISION_LABEL_MISSING");
  }

  return {
    schemaVersion: 1,
    dev: "DEV-046",
    generatedAt: new Date().toISOString(),
    status: blockers.length === 0 ? "artifact_provenance_ready" : "blocked_expected",
    git: {
      head,
      clean,
      worktreeChangedFileCount: state.worktreeChangedFileCount,
      dockerContextChangedFileCount: state.dockerContextChangedFileCount,
      excludedChangedFileCount: state.excludedChangedFileCount,
      sourceStateSha256: state.sha256
    },
    acceptedRoutes: sourceCoverage,
    candidate: candidate
      ? {
          ...candidate,
          routes: undefined,
          revisionLabel: candidateRevision,
          exactCleanHeadRevision: clean && candidateRevision === head,
          coverage: candidateCoverage
        }
      : null,
    deployed: deployed
      ? {
          ...deployed,
          routes: undefined,
          revisionLabel: deployedRevision,
          exactCleanHeadRevision: clean && deployedRevision === head,
          coverage: deployedCoverage
        }
      : null,
    safeToPushOrDeploy: blockers.length === 0,
    blockers,
    executionBoundary: {
      localGitReadOnly: true,
      localDockerInspectionOnly: true,
      cloudMutationPerformed: false,
      imagePushPerformed: false,
      deploymentPerformed: false
    }
  };
}

export async function writeDev046ArtifactProvenance(report, outputPath = defaultOutput) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const report = buildDev046ArtifactProvenance({ candidateImage: args.candidateImage });
  if (args.writeReport) await writeDev046ArtifactProvenance(report);
  console.log(`DEV-046 artifact provenance: ${report.status}`);
  console.log(`Git clean: ${report.git.clean}`);
  console.log(`Changed/untracked files: ${report.git.worktreeChangedFileCount}`);
  console.log(`Docker-context changes: ${report.git.dockerContextChangedFileCount}`);
  console.log(`Candidate image: ${report.candidate?.imageRef ?? "not-built"}`);
  console.log(`Safe to push/deploy: ${report.safeToPushOrDeploy}`);
  for (const blocker of report.blockers) console.log(`BLOCKED ${blocker}`);
}
