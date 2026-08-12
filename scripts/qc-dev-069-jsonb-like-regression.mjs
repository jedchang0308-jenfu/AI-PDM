#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function record(id, passed, detail = "") {
  results.push({ id, passed: Boolean(passed), detail });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sourceFiles(directory) {
  const absoluteDirectory = path.join(root, directory);
  const files = [];
  const visit = (currentDirectory) => {
    for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (/\.(?:ts|tsx)$/u.test(entry.name)) {
        files.push(absolutePath);
      }
    }
  };
  visit(absoluteDirectory);
  return files;
}

const jsonColumnDirectLike = /\b(?:detail_json|payload_json|query_json|result_json|snapshot_json|policy_snapshot_json|manifest_json|response_json)\s+(?:LIKE|ILIKE|~~)\b/giu;
const appSource = sourceFiles("src")
  .map((file) => ({ file: path.relative(root, file), source: fs.readFileSync(file, "utf8") }))
  .map((entry) => ({ ...entry, directLike: entry.source.match(jsonColumnDirectLike) ?? [] }));
const directLikeHits = appSource.flatMap((entry) => entry.directLike.map((match) => `${entry.file}: ${match}`));

const asyncNumberingRepository = read("src/lib/repositories/numbering-async-repository.ts");
const draftWorkspaceRoute = read("src/app/api/numbering/draft-workspaces/route.ts");
const numberStateFlow = read("src/lib/number-state-flow.ts");

record(
  "DEV069-JSONB-001 PostgreSQL JSON audit searches cast JSONB to TEXT",
  asyncNumberingRepository.includes("CAST(detail_json AS TEXT) LIKE '%rootCode%'") &&
    asyncNumberingRepository.includes("CAST(detail_json AS TEXT) LIKE :needle"),
  "src/lib/repositories/numbering-async-repository.ts"
);
record(
  "DEV069-JSONB-002 application source has no direct JSON/JSONB LIKE operator",
  directLikeHits.length === 0,
  directLikeHits.join("; ")
);
record(
  "DEV069-JSONB-003 combined create-and-acquire route remains explicit",
  draftWorkspaceRoute.includes("body.autoAcquireCandidates === true") &&
    draftWorkspaceRoute.includes("acquireNumberingDraftCandidates") &&
    numberStateFlow.includes("new AsyncNumberStateFlowRepository(client).createWorkspace(data)") &&
    numberStateFlow.includes("new AsyncNumberStateFlowRepository(client).acquireCandidates({"),
  "draft-workspaces route and number-state-flow command path"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results
}, null, 2));
if (failed.length > 0) process.exit(1);
