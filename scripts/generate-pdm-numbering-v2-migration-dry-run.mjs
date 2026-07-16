#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const qcMode = process.argv.includes("--qc");
const outDir = path.join(process.cwd(), "output", "qc-pdm-numbering-v2-migration-dry-run");
const jsonPath = path.join(outDir, "report.json");
const markdownPath = path.join(outDir, "report.md");

function createFixtureDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE part_roots (
      id TEXT PRIMARY KEY,
      root_code TEXT NOT NULL UNIQUE,
      core_name TEXT NOT NULL,
      rule_version_id TEXT NOT NULL
    );

    CREATE TABLE part_numbers (
      id TEXT PRIMARY KEY,
      part_root_id TEXT NOT NULL,
      part_number TEXT NOT NULL UNIQUE,
      sequence_no INTEGER NOT NULL,
      rule_version_id TEXT NOT NULL
    );

    CREATE TABLE drawing_numbers (
      id TEXT PRIMARY KEY,
      part_root_id TEXT NOT NULL,
      drawing_number TEXT NOT NULL UNIQUE,
      purpose_code TEXT NOT NULL,
      sequence_no INTEGER NOT NULL,
      rule_version_id TEXT NOT NULL
    );
  `);

  const roots = [
    ["root-v1-collision", "0001", "Legacy root collides with existing v2 root", "numbering-rule-v1"],
    ["root-v2-existing", "00001", "Existing compact root", "numbering-rule-v2"],
    ["root-v1-ok", "0002", "Legacy root with clean compact mapping", "numbering-rule-v1"],
    ["root-v1-capacity", "0099", "Legacy root with sequence over compact capacity", "numbering-rule-v1"]
  ];
  const parts = [
    ["part-v1-collision", "root-v1-collision", "P-0001-001", 1, "numbering-rule-v1"],
    ["part-v2-existing", "root-v2-existing", "00001-P01", 1, "numbering-rule-v2"],
    ["part-v1-ok", "root-v1-ok", "P-0002-001", 1, "numbering-rule-v1"],
    ["part-v1-capacity", "root-v1-capacity", "P-0099-100", 100, "numbering-rule-v1"]
  ];
  const drawings = [
    ["drawing-v1-collision", "root-v1-collision", "D-0001-MA1", "MA", 1, "numbering-rule-v1"],
    ["drawing-v2-existing", "root-v2-existing", "00001-M01", "M", 1, "numbering-rule-v2"],
    ["drawing-v1-ok-ma", "root-v1-ok", "D-0002-MA1", "MA", 1, "numbering-rule-v1"],
    ["drawing-v1-ok-ot", "root-v1-ok", "D-0002-OT1", "OT", 1, "numbering-rule-v1"]
  ];

  const insertRoot = db.prepare("INSERT INTO part_roots (id, root_code, core_name, rule_version_id) VALUES (?, ?, ?, ?)");
  const insertPart = db.prepare("INSERT INTO part_numbers (id, part_root_id, part_number, sequence_no, rule_version_id) VALUES (?, ?, ?, ?, ?)");
  const insertDrawing = db.prepare("INSERT INTO drawing_numbers (id, part_root_id, drawing_number, purpose_code, sequence_no, rule_version_id) VALUES (?, ?, ?, ?, ?, ?)");
  for (const row of roots) insertRoot.run(...row);
  for (const row of parts) insertPart.run(...row);
  for (const row of drawings) insertDrawing.run(...row);
  return db;
}

function snapshot(db) {
  return {
    part_roots: db.prepare("SELECT * FROM part_roots ORDER BY id").all(),
    part_numbers: db.prepare("SELECT * FROM part_numbers ORDER BY id").all(),
    drawing_numbers: db.prepare("SELECT * FROM drawing_numbers ORDER BY id").all()
  };
}

function hashSnapshot(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compactRootCode(rootCode) {
  if (/^\d{5}$/.test(rootCode)) return rootCode;
  if (/^\d{4}$/.test(rootCode)) return rootCode.padStart(5, "0");
  return null;
}

function compactSequence(sequenceNo) {
  if (sequenceNo < 1 || sequenceNo > 99) return null;
  return String(sequenceNo).padStart(2, "0");
}

function compactPurpose(purposeCode) {
  if (purposeCode === "MA") return "M";
  if (purposeCode === "OT") return "R";
  if (purposeCode === "M" || purposeCode === "R") return purposeCode;
  return null;
}

function buildDryRunReport(db) {
  const before = snapshot(db);
  const beforeHash = hashSnapshot(before);
  const roots = before.part_roots;
  const parts = before.part_numbers;
  const drawings = before.drawing_numbers;
  const rootById = new Map(roots.map((root) => [root.id, root]));
  const existingRootCodes = new Map(roots.map((root) => [root.root_code, root.id]));
  const existingPartNumbers = new Set(parts.map((part) => part.part_number));
  const existingDrawingNumbers = new Set(drawings.map((drawing) => drawing.drawing_number));

  const proposedRoots = [];
  for (const root of roots.filter((item) => item.rule_version_id === "numbering-rule-v1")) {
    const compact = compactRootCode(root.root_code);
    const collisionId = compact ? existingRootCodes.get(compact) : null;
    proposedRoots.push({
      id: root.id,
      from: root.root_code,
      to: compact,
      status: !compact ? "blocked_invalid_root" : collisionId && collisionId !== root.id ? "blocked_root_collision" : "proposed",
      collisionId: collisionId && collisionId !== root.id ? collisionId : null
    });
  }

  const proposedParts = [];
  for (const part of parts.filter((item) => item.rule_version_id === "numbering-rule-v1")) {
    const root = rootById.get(part.part_root_id);
    const rootMapping = proposedRoots.find((item) => item.id === root?.id);
    const sequence = compactSequence(part.sequence_no);
    const nextNumber = rootMapping?.to && sequence ? `${rootMapping.to}-P${sequence}` : null;
    const rootBlocked = rootMapping?.status !== "proposed";
    proposedParts.push({
      id: part.id,
      from: part.part_number,
      to: nextNumber,
      status: rootBlocked
        ? "blocked_root_mapping"
        : !sequence
          ? "blocked_sequence_capacity"
          : nextNumber && existingPartNumbers.has(nextNumber)
            ? "blocked_part_collision"
            : "proposed",
      rootCode: root?.root_code ?? null,
      sequenceNo: part.sequence_no
    });
  }

  const proposedDrawings = [];
  for (const drawing of drawings.filter((item) => item.rule_version_id === "numbering-rule-v1")) {
    const root = rootById.get(drawing.part_root_id);
    const rootMapping = proposedRoots.find((item) => item.id === root?.id);
    const purpose = compactPurpose(drawing.purpose_code);
    const sequence = compactSequence(drawing.sequence_no);
    const nextNumber = rootMapping?.to && purpose && sequence ? `${rootMapping.to}-${purpose}${sequence}` : null;
    const rootBlocked = rootMapping?.status !== "proposed";
    proposedDrawings.push({
      id: drawing.id,
      from: drawing.drawing_number,
      to: nextNumber,
      status: rootBlocked
        ? "blocked_root_mapping"
        : !purpose
          ? "blocked_unknown_purpose"
          : !sequence
            ? "blocked_sequence_capacity"
            : nextNumber && existingDrawingNumbers.has(nextNumber)
              ? "blocked_drawing_collision"
              : "proposed",
      rootCode: root?.root_code ?? null,
      purposeCode: drawing.purpose_code,
      sequenceNo: drawing.sequence_no
    });
  }

  const after = snapshot(db);
  const afterHash = hashSnapshot(after);
  const allMappings = [...proposedRoots, ...proposedParts, ...proposedDrawings];
  return {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    mutation: {
      beforeHash,
      afterHash,
      unchanged: beforeHash === afterHash
    },
    summary: {
      roots: proposedRoots.length,
      parts: proposedParts.length,
      drawings: proposedDrawings.length,
      proposed: allMappings.filter((item) => item.status === "proposed").length,
      blocked: allMappings.filter((item) => item.status !== "proposed").length
    },
    proposedRoots,
    proposedParts,
    proposedDrawings
  };
}

function writeReport(report) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const lines = [
    "# PDM Numbering V2 Migration Dry Run",
    "",
    `Generated at: ${report.generatedAt}`,
    `Mutation check: ${report.mutation.unchanged ? "PASS" : "FAIL"}`,
    `Before hash: ${report.mutation.beforeHash}`,
    `After hash: ${report.mutation.afterHash}`,
    "",
    "## Summary",
    "",
    `- Roots scanned: ${report.summary.roots}`,
    `- Parts scanned: ${report.summary.parts}`,
    `- Drawings scanned: ${report.summary.drawings}`,
    `- Proposed mappings: ${report.summary.proposed}`,
    `- Blocked mappings: ${report.summary.blocked}`,
    "",
    "## Blockers",
    "",
    ...[...report.proposedRoots, ...report.proposedParts, ...report.proposedDrawings]
      .filter((item) => item.status !== "proposed")
      .map((item) => `- ${item.from} -> ${item.to ?? "(none)"}: ${item.status}`),
    ""
  ];
  fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`, "utf8");
}

const db = createFixtureDb();
const report = buildDryRunReport(db);
writeReport(report);
db.close();

if (qcMode) {
  const checks = [
    ["dry run does not mutate source snapshot", report.mutation.unchanged],
    ["dry run proposes at least one valid mapping", report.summary.proposed > 0],
    ["dry run detects at least one blocker", report.summary.blocked > 0],
    ["dry run writes JSON report", fs.existsSync(jsonPath)],
    ["dry run writes markdown report", fs.existsSync(markdownPath)]
  ];
  const failed = checks.filter(([, passed]) => !passed);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), reportPath: jsonPath, checks: checks.map(([name, passed]) => ({ name, passed })) }, null, 2));
  if (failed.length > 0) process.exit(1);
} else {
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);
}
