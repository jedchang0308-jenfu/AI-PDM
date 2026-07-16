#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = path.join(root, ".tmp", `qc-numbering-series-code-${crypto.randomUUID()}`);
const results = [];

function record(id, passed, detail = "") {
  results.push({ id, passed: Boolean(passed), detail });
}

process.env.PDM_DATA_DIR = fixtureRoot;
process.env.PDM_REPOSITORY_DIR = path.join(fixtureRoot, "repository");
process.env.PDM_DB_PROVIDER = "sqlite";

let db;
try {
  const [{ getDb }, numbering, platform, numberStateFlow] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/repositories/numbering-repository"),
    import("@/lib/platform-command"),
    import("@/lib/number-state-flow")
  ]);
  db = getDb();

  const partColumns = db.prepare("PRAGMA table_info(part_numbers)").all().map((column) => column.name);
  const draftPartColumns = db.prepare("PRAGMA table_info(numbering_draft_parts)").all().map((column) => column.name);
  record("SERIES-001 schema exposes both persistence columns", partColumns.includes("series_code") && draftPartColumns.includes("series_code"), JSON.stringify({ partColumns, draftPartColumns }));

  const manufactured = numbering.createNumberingRecord({
    coreName: "Series Code Manufactured",
    itemKind: "manufactured",
    isUniversal: false,
    seriesCode: "  JF-200  "
  });
  const manufacturedRow = db.prepare("SELECT series_code FROM part_numbers WHERE id = ?").get(manufactured.partNumber.id);
  record("SERIES-002 manufactured non-universal part persists normalized series code", manufactured.partNumber.seriesCode === "JF-200" && manufacturedRow?.series_code === "JF-200", JSON.stringify({ record: manufactured.partNumber.seriesCode, row: manufacturedRow?.series_code }));

  const universal = numbering.createNumberingRecord({
    coreName: "Series Code Universal",
    itemKind: "manufactured",
    isUniversal: true,
    universalReason: "QC universal part",
    seriesCode: "MUST-NOT-PERSIST"
  });
  record("SERIES-003 universal manufactured part rejects hidden stale value", universal.partNumber.seriesCode === null, JSON.stringify({ seriesCode: universal.partNumber.seriesCode }));

  const purchased = numbering.createNumberingRecord({
    coreName: "Series Code Purchased",
    itemKind: "purchased",
    seriesCode: "MUST-NOT-PERSIST"
  });
  record("SERIES-004 non-manufactured part rejects hidden stale value", purchased.partNumber.seriesCode === null, JSON.stringify({ seriesCode: purchased.partNumber.seriesCode }));

  let tooLongError = "";
  try {
    numbering.createNumberingRecord({
      coreName: "Series Code Too Long",
      itemKind: "manufactured",
      seriesCode: "X".repeat(81)
    });
  } catch (error) {
    tooLongError = error instanceof Error ? error.message : String(error);
  }
  record("SERIES-005 backend enforces 80-character limit", tooLongError.includes("SERIES_CODE_TOO_LONG"), tooLongError);

  db.prepare(`
    INSERT INTO users (
      id, display_name, email, password_hash, role, company_id, account_status,
      system_role_enabled, created_at, updated_at
    ) VALUES (
      'series-code-qc-user', 'Series Code QC', 'series-code-qc@example.invalid', NULL,
      'Engineer', 'company-jenfu', 'active', 1, datetime('now'), datetime('now')
    )
  `).run();
  db.prepare(`
    INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
    VALUES ('series-code-qc-user', 'company-jenfu', 1, datetime('now'))
  `).run();

  const actor = platform.createPlatformActorContext({
    pdmUserId: "series-code-qc-user",
    organizationId: "company-jenfu",
    roles: ["Engineer", "rd"],
    scopes: ["numbering.workspace.create", "numbering.workspace.update"]
  });
  const created = await numberStateFlow.createNumberingDraftWorkspace({
    metadata: { actor, idempotencyKey: "series-code:create" },
    body: {
      draftMode: "new_bundle",
      root: { coreName: "Series Draft Root", itemKind: "manufactured" },
      parts: [{ clientKey: "part-1", partName: "Series Draft Part", itemKind: "manufactured", seriesCode: " S1 " }],
      drawings: [],
      relations: []
    }
  });
  const draftPart = created.workspace.parts[0];
  const draftRow = db.prepare("SELECT series_code FROM numbering_draft_parts WHERE id = ?").get(draftPart.id);
  record("SERIES-006 draft workspace persists and returns series code", draftPart.seriesCode === "S1" && draftRow?.series_code === "S1", JSON.stringify({ record: draftPart.seriesCode, row: draftRow?.series_code }));

  const updated = await numberStateFlow.updateNumberingDraftWorkspace({
    actor,
    workspaceId: created.workspace.id,
    expectedRowVersion: created.workspace.rowVersion,
    body: {
      parts: [{
        id: draftPart.id,
        partName: draftPart.partName,
        itemKind: draftPart.itemKind,
        isUniversal: draftPart.isUniversal,
        customSpecification: draftPart.customSpecification,
        seriesCode: " S2 "
      }]
    }
  });
  record("SERIES-007 draft update persists normalized series code", updated.parts[0]?.seriesCode === "S2", JSON.stringify({ seriesCode: updated.parts[0]?.seriesCode }));

  let draftTooLongError = "";
  try {
    await numberStateFlow.createNumberingDraftWorkspace({
      metadata: { actor, idempotencyKey: "series-code:create-too-long" },
      body: {
        draftMode: "new_bundle",
        root: { coreName: "Series Draft Too Long", itemKind: "manufactured" },
        parts: [{ clientKey: "part-1", partName: "Series Draft Too Long", itemKind: "manufactured", seriesCode: "X".repeat(81) }],
        drawings: [],
        relations: []
      }
    });
  } catch (error) {
    draftTooLongError = error instanceof Error ? error.message : String(error);
  }
  record("SERIES-008 draft API rejects overlong series code without truncation", draftTooLongError.includes("80 characters or fewer"), draftTooLongError);

  const repositorySource = fs.readFileSync(path.join(root, "src/lib/repositories/number-state-flow-async-repository.ts"), "utf8");
  const requestUiSource = fs.readFileSync(path.join(root, "src/app/numbering/request/page.tsx"), "utf8");
  record("SERIES-009 publication copies series code to official part", repositorySource.includes("custom_specification, series_code, development_phase") && repositorySource.includes("seriesCode: part.seriesCode"), "publication SQL and parameter mapping");
  record("SERIES-010 request UI limits field to eligible part", requestUiSource.includes('itemKind === "manufactured" && !isUniversal') && requestUiSource.includes("系列／機型") && requestUiSource.includes("maxLength={80}"), "request UI eligibility and limit");
} catch (error) {
  record("SERIES-fixture", false, error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  try {
    db?.close();
  } catch {}
  const resolvedFixture = path.resolve(fixtureRoot);
  const resolvedTmp = path.resolve(root, ".tmp");
  if (resolvedFixture.startsWith(`${resolvedTmp}${path.sep}`)) fs.rmSync(resolvedFixture, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
