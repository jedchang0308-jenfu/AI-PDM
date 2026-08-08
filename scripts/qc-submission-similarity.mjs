#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const helperPath = path.join(root, "src", "lib", "submission-similarity.ts");
const repositoryPaths = [
  path.join(root, "src", "lib", "repositories", "submission-repository.ts"),
  path.join(root, "src", "lib", "repositories", "submission-list-async-repository.ts")
];
const helperSource = fs.readFileSync(helperPath, "utf8");
const repositorySources = repositoryPaths.map((filePath) => fs.readFileSync(filePath, "utf8"));
const { scoreDesignReuseCandidate } = await import("@/lib/submission-similarity");

assert.equal(typeof scoreDesignReuseCandidate, "function");
assert.match(helperSource, /export function scoreDesignReuseCandidate/);
assert.doesNotMatch(helperSource, /getDb\(|query\(|prepare\(|fetch\(/);
for (const source of repositorySources) {
  assert.match(source, /scoreDesignReuseCandidate as scoreDesignReuseCandidateShared/);
  assert.doesNotMatch(source, /function scoreDesignReuseCandidate\(/);
}

const dependencies = {
  splitGroupConcat: (value) => (value ? value.split(",").map((item) => item.trim()).filter(Boolean) : []),
  partFamily: (partNumber) => {
    const parts = String(partNumber ?? "").trim().toLowerCase().split(/[-_\s]+/u).filter(Boolean);
    return parts.length >= 3 ? parts.slice(0, 3).join("-") : parts.slice(0, 2).join("-");
  },
  tokens: (value) =>
    new Set(
      String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\.[^.]+$/u, "")
        .split(/[^a-z0-9\u4e00-\u9fff]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    ),
  tokenOverlap: (left, right) => {
    let count = 0;
    for (const token of left) if (right.has(token)) count += 1;
    return count;
  },
  sameText: (left, right) => String(left ?? "").trim().toLowerCase() !== "" && String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase(),
  filenameOverlap: (sourceFiles, candidateFiles) => {
    let score = 0;
    const matchedFiles = [];
    for (const sourceFile of sourceFiles) {
      const sourceTokens = dependencies.tokens(sourceFile);
      for (const candidateFile of candidateFiles) {
        const overlap = dependencies.tokenOverlap(sourceTokens, dependencies.tokens(candidateFile));
        if (overlap > 0) {
          score += Math.min(12, overlap * 6);
          matchedFiles.push(candidateFile);
        }
      }
    }
    return { score: Math.min(score, 18), matchedFiles: Array.from(new Set(matchedFiles)).slice(0, 4) };
  }
};

function legacyScoreDesignReuseCandidate(source, sourceFiles, row, deps) {
  let score = 0;
  const reasons = [];
  const candidateFiles = deps.splitGroupConcat(row.file_names);
  const matchedFiles = [];

  if (deps.partFamily(source.part_number) && deps.partFamily(source.part_number) === deps.partFamily(row.part_number)) {
    score += 28;
    reasons.push(`Same part family ${deps.partFamily(row.part_number)}`);
  } else {
    const partOverlap = deps.tokenOverlap(deps.tokens(source.part_number), deps.tokens(row.part_number));
    if (partOverlap > 0) {
      score += Math.min(18, partOverlap * 9);
      reasons.push("Part number token match");
    }
  }

  const nameOverlap = deps.tokenOverlap(deps.tokens(source.part_name), deps.tokens(row.part_name));
  if (nameOverlap > 0) {
    score += Math.min(24, nameOverlap * 8);
    reasons.push("Part name keyword match");
  }
  if (deps.sameText(source.material, row.material)) {
    score += 18;
    reasons.push(`Same material ${row.material}`);
  }
  if (deps.sameText(source.surface_finish, row.surface_finish)) {
    score += 14;
    reasons.push(`Same surface finish ${row.surface_finish}`);
  }
  if (deps.sameText(source.document_type, row.document_type)) {
    score += 6;
    reasons.push(`Same document type ${row.document_type}`);
  }

  const fileOverlap = deps.filenameOverlap(sourceFiles, candidateFiles);
  if (fileOverlap.score > 0) {
    score += fileOverlap.score;
    reasons.push("Filename similarity");
    matchedFiles.push(...fileOverlap.matchedFiles);
  }
  if (row.status === "Released") {
    score += 4;
    reasons.push("Released design");
  }
  if (score < 24 || reasons.length === 0) return null;
  const { file_names: _fileNames, ...summary } = row;
  void _fileNames;
  return { ...summary, score, match_reasons: reasons, matched_files: matchedFiles };
}

const source = {
  part_number: "P-100-ALPHA-01",
  part_name: "Valve Housing",
  material: "SS304",
  surface_finish: "Brushed",
  document_type: "Drawing"
};
const matchingRow = {
  id: "candidate-1",
  part_number: "P-100-ALPHA-02",
  part_name: "Valve Body",
  material: "SS304",
  surface_finish: "Brushed",
  document_type: "Drawing",
  status: "Released",
  file_names: "assembly.sldasm,other.pdf",
  created_at: "2026-01-01T00:00:00.000Z"
};
const noMatchRow = {
  id: "candidate-2",
  part_number: "X",
  part_name: "Y",
  material: "A",
  surface_finish: "B",
  document_type: "C",
  status: "Pending",
  file_names: null,
  created_at: "2026-01-01T00:00:00.000Z"
};

for (const row of [matchingRow, noMatchRow]) {
  const beforeInput = structuredClone(row);
  const expected = legacyScoreDesignReuseCandidate(source, ["assembly.sldasm", "drawing.pdf"], row, dependencies);
  const actual = scoreDesignReuseCandidate(source, ["assembly.sldasm", "drawing.pdf"], row, dependencies);
  assert.deepEqual(actual, expected);
  assert.deepEqual(row, beforeInput);
}

console.log("QC submission similarity: PASS (shared helper + legacy parity + immutability)");
