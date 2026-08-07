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
  const [{ getDb }, numbering, numberingAsync, platform, numberStateFlow] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/repositories/numbering-repository"),
    import("@/lib/numbering-async"),
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
  numbering.addDrawingNumberToRoot({ rootCode: manufactured.root.rootCode, purposeCode: "M" });

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
  const numberStateActor = {
    userId: actor.pdmUserId,
    companyId: actor.organizationId,
    role: actor.roles[0] ?? "Engineer",
    roles: actor.roles
  };
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

  const seriesCodeOptions = await numberingAsync.listSeriesCodeOptionsAsync("company-jenfu");
  record(
    "SERIES-008 shared options are generated from official and reserved data",
    seriesCodeOptions.includes("JF-200") && seriesCodeOptions.includes("S2") && !seriesCodeOptions.includes("MUST-NOT-PERSIST"),
    JSON.stringify(seriesCodeOptions)
  );

  const [filteredParts, filteredDrawings, filteredSearch, filteredDrafts] = await Promise.all([
    numberingAsync.listPartModuleRecordsAsync({ companyId: "company-jenfu", seriesCode: "JF-200", limit: 100 }),
    numberingAsync.listDrawingModuleRecordsAsync({ companyId: "company-jenfu", seriesCode: "JF-200", limit: 100 }),
    numberingAsync.searchNumberingRecordsAsync({ companyId: "company-jenfu", seriesCode: "JF-200", limit: 100 }),
    numberStateFlow.listNumberingDraftWorkspaces({ actor: numberStateActor, owner: "mine", seriesCode: "S2", limit: 100 })
  ]);
  record(
    "SERIES-009 module filters use actual series-code ownership",
    filteredParts.length === 1 &&
      filteredParts[0]?.partNumber === manufactured.partNumber.partNumber &&
      filteredDrawings.length === 1 &&
      filteredDrawings[0]?.rootCode === manufactured.root.rootCode &&
      filteredSearch.length === 3 &&
      filteredSearch.every((item) => item.rootCode === manufactured.root.rootCode),
    JSON.stringify({
      parts: filteredParts.map((item) => item.partNumber),
      drawings: filteredDrawings.map((item) => item.drawingNumber),
      search: filteredSearch.map((item) => `${item.entityType}:${item.displayCode}`)
    })
  );
  record(
    "SERIES-010 reserved workspace filter matches draft part series code",
    filteredDrafts.length === 1 && filteredDrafts[0]?.id === created.workspace.id,
    JSON.stringify(filteredDrafts.map((item) => item.id))
  );

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
  record("SERIES-011 draft API rejects overlong series code without truncation", draftTooLongError.includes("80 characters or fewer"), draftTooLongError);

  const repositorySource = fs.readFileSync(path.join(root, "src/lib/repositories/number-state-flow-async-repository.ts"), "utf8");
  const requestUiSource = fs.readFileSync(path.join(root, "src/components/number-state-workspace.tsx"), "utf8");
  const asyncRepositorySource = fs.readFileSync(path.join(root, "src/lib/repositories/numbering-async-repository.ts"), "utf8");
  const modulePageSources = [
    "src/app/numbering/drawings/page.tsx",
    "src/app/parts/page.tsx",
    "src/app/numbering/search/page.tsx"
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8"));
  const apiSources = [
    "src/app/api/numbering/drawings/route.ts",
    "src/app/api/parts/route.ts",
    "src/app/api/numbering/relations/route.ts",
    "src/app/api/numbering/draft-workspaces/route.ts"
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8"));
  record("SERIES-012 publication copies series code to official part", repositorySource.includes("custom_specification, series_code, record_status") && repositorySource.includes("seriesCode: part.seriesCode"), "publication SQL and parameter mapping");
  record(
    "SERIES-013 all module pages expose the shared series-code filter",
    modulePageSources.every((source) => source.includes('seriesCodeOptions') && source.includes('params.set("seriesCode", seriesCode)') && source.includes('系列代號')) &&
      requestUiSource.includes('<span>系列代號</span>') &&
      requestUiSource.includes('params.set("seriesCode", seriesCode)'),
    "drawings, parts, search, and reserved workspace"
  );
  record(
    "SERIES-014 module pages remove the deprecated product-series filter",
    modulePageSources.every((source) => !source.includes("productSeries") && !source.includes("產品系列") && !source.includes('allLabel="全部系列"') && !source.includes('option value="">全部系列</option>')),
    "drawings, parts, and search no longer render product-series controls"
  );
  record(
    "SERIES-015 create and edit fields reuse generated options without blocking new codes",
    requestUiSource.includes("function SeriesCodeField") &&
      requestUiSource.includes("<datalist") &&
      requestUiSource.includes("可選既有系列代號或輸入新代號") &&
      requestUiSource.includes('form.partItemKind === "manufactured"') &&
      requestUiSource.includes("maxLength={80}"),
    "owner workspace eligibility, shared datalist, and limit"
  );
  record(
    "SERIES-016 APIs and async repository expose one generated option source",
    apiSources.every((source) => source.includes("listSeriesCodeOptionsAsync") && source.includes("seriesCodeOptions")) &&
      asyncRepositorySource.includes("async listSeriesCodeOptions") &&
      asyncRepositorySource.includes("SELECT series_code FROM numbering_draft_parts"),
    "official and reserved APIs share the same options"
  );
  record(
    "SERIES-017 module pages remove redundant top summary metrics",
    modulePageSources.every((source) => !source.includes("CompactSummary") && !source.includes("relationSummary") && !source.includes("summarizeRelationRoots")),
    "drawings, parts, and search keep titles and filters without summary chips"
  );
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
