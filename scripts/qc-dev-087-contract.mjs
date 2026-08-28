import { assert, createFixtureDatabase, expectSqlFailure, pass, read } from "./qc-dev-087-fixtures.mjs";
import { assertCanonicalDtoHasNoRetiredFields, canonicalLayerLabel, CANONICAL_DATA_STATE_LABELS, normalizeCanonicalWorkbenchQuery } from "../src/lib/pdm-canonical-workbench-contract.ts";
import { dev087FaultHandling, dev087FaultReason } from "../src/lib/pdm-work-review.ts";
import { buildNumberingPartRootLifecyclePolicy } from "../src/lib/pdm-lifecycle-policy.ts";

const db = createFixtureDatabase();
const expectedTables = ["pdm_workbench_state_authority_control", "pdm_workbench_aggregates", "drawing_rd_branches", "drawing_revision_claims", "drawing_revision_works", "drawing_revision_work_files", "part_change_works", "relation_change_works", "canonical_workbench_states", "pdm_work_review_requests", "pdm_review_traces", "part_approved_change_snapshots", "relation_approved_change_snapshots", "pdm_workbench_migration_quarantine"];
const actual = new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((row) => row.name));
expectedTables.forEach((table) => assert(actual.has(table), `missing ${table}`));
assert.equal(canonicalLayerLabel({ dataLayer: "drawing_production", revision: "1" }), "量產版 1");
assert.equal(canonicalLayerLabel({ dataLayer: "drawing_rd", revision: "1.1" }), "研發版 1.1");
assert.equal(canonicalLayerLabel({ dataLayer: "part_formal", revision: null }), "正式資料");
assert.equal(canonicalLayerLabel({ dataLayer: "relation_work", revision: null }), "");
assert.equal(normalizeCanonicalWorkbenchQuery(new URL("http://local/?layer=rd&handling=owner"), "drawing").layers[0], "rd");
assert.deepEqual(normalizeCanonicalWorkbenchQuery(new URL("http://local/?stage=editing,available"), "drawing").dataStates, ["editing", "available"]);
const purposeQuery = normalizeCanonicalWorkbenchQuery(new URL("http://local/?purpose=M&purpose=R&series=S1&direction=before"), "drawing");
assert.deepEqual(purposeQuery.purposes, ["M", "R"]);
assert.deepEqual(purposeQuery.series, ["S1"]);
assert.throws(() => normalizeCanonicalWorkbenchQuery(new URL("http://local/?purpose=machining"), "drawing"), (error) => error.code === "WORKBENCH_BAD_REQUEST" && error.status === 400);
assert.throws(() => normalizeCanonicalWorkbenchQuery(new URL("http://local/?purpose=M"), "part"), (error) => error.code === "WORKBENCH_BAD_REQUEST" && error.status === 400);
assert.equal(normalizeCanonicalWorkbenchQuery(new URL("http://local/?itemKind=raw&material=SS304"), "part").cursorDirection, "after");
assert.deepEqual(normalizeCanonicalWorkbenchQuery(new URL("http://local/?color=BK&color=%E9%BB%91"), "part").colors, ["BK", "黑"]);
assert.equal(normalizeCanonicalWorkbenchQuery(new URL("http://local/?direction=before"), "drawing").cursorDirection, "before");
assert.equal(normalizeCanonicalWorkbenchQuery(new URL("http://local/?sortBy=name&sort=desc"), "drawing").sortBy, "name");
assert.throws(() => normalizeCanonicalWorkbenchQuery(new URL("http://local/?sortBy=unknown"), "drawing"), (error) => error.code === "WORKBENCH_BAD_REQUEST" && error.status === 400);
assert.equal(CANONICAL_DATA_STATE_LABELS.publishing, "發布中");
assert.throws(() => normalizeCanonicalWorkbenchQuery(new URL("http://local/?stage=unknown"), "drawing"), (error) => error.code === "WORKBENCH_BAD_REQUEST" && error.status === 400);
assert.throws(() => normalizeCanonicalWorkbenchQuery(new URL("http://local/?view=all"), "drawing"), (error) => error.code === "WORKBENCH_FILTER_CONTRACT_RETIRED" && error.status === 410);
assert.throws(() => assertCanonicalDtoHasNoRetiredFields({ data: { humanStatus: "x" } }), /DEV087_RETIRED_DTO_FIELD/);
expectSqlFailure(() => db.prepare(`INSERT INTO drawing_revision_claims (id, company_id, drawing_id, branch_id, target_major, target_minor, target_label) VALUES ('bad-claim', 'company-dev087-a', 'drawing-dev087-a0002', 'branch-dev087-a0002-1', 1, 2, '01.2')`).run(), /DEV087_REVISION_TUPLE_NOT_CANONICAL/);
db.prepare(`INSERT INTO pdm_review_traces (review_cycle_id, company_id, entity_type, canonical_entity_id, decision_at) VALUES ('cycle-dev087-1', 'company-dev087-a', 'drawing', 'drawing-dev087-a0002', CURRENT_TIMESTAMP)`).run();
expectSqlFailure(() => db.prepare(`UPDATE pdm_review_traces SET decision_at = CURRENT_TIMESTAMP WHERE review_cycle_id = 'cycle-dev087-1'`).run(), /DEV087_REVIEW_TRACE_IMMUTABLE/);
assert(!read("src/components/canonical-pdm-workbench.tsx").match(/待你|待我|由你|由我|ownerName|reviewerName/u));
assert(read("db/postgres/042_status_data_rebuild.sql").includes("trg_dev087_canonical_state_company_guard"));
assert.equal(dev087FaultHandling({}), null);
assert.equal(dev087FaultHandling({ PDM_DEV087_FAULT_PROFILE: "system_admin" }), "system_admin");
assert.equal(dev087FaultReason("blocked"), "自動化正式化缺少安全修復路徑。");
const activeRootPolicy = buildNumberingPartRootLifecyclePolicy({ rootStatus: "Released", childStatuses: ["Released"], controlledReferenceCount: 0, activeCanonicalActivityCount: 1 });
assert.equal(activeRootPolicy.action, "none");
assert.equal(activeRootPolicy.reasonCode, "LIFE_ACTIVE_CANONICAL_WORK");
assert.equal(activeRootPolicy.availability, "inert");
const reviewRequestRoute = read("src/app/api/pdm/review-requests/[requestId]/route.ts");
assert(reviewRequestRoute.includes('item.requestKind === "drawing_rd_void"') && reviewRequestRoute.includes('canApprove: true') && reviewRequestRoute.includes('canReturn: true'), "RD void review must expose both terminal reviewer decisions explicitly");
const fileReadRoute = read("src/app/api/pdm/file-assets/[fileAssetId]/route.ts");
assert(
  fileReadRoute.includes('review.request_kind === "drawing_revision"')
    && fileReadRoute.includes('review.request_kind !== "drawing_rd_void"')
    && fileReadRoute.includes("packageValue.decisionBasis.revisionId !== input.contextId")
    && fileReadRoute.includes("legacy.revisionId === input.contextId"),
  "candidate revision review reads must keep work-scoped revision reviews separate from snapshot-scoped RD void reviews"
);
const uiOnlyRunner = read("scripts/qc-dev-087-ui-only.mjs");
assert(
  uiOnlyRunner.includes("&& failures.length === 0") && uiOnlyRunner.includes("&& consoleErrors.length === 0"),
  "raw UI evidence must fail closed when page or console errors are present"
);
const capabilityBrowserRunner = read("scripts/qc-dev-087-capability-browser.mjs");
assert(
  capabilityBrowserRunner.includes('failures[0]?.caseId === failedCaseId')
    && capabilityBrowserRunner.includes('failures[0]?.kind === "journey"')
    && capabilityBrowserRunner.includes('exactRoster(failedChecks.map((item) => item.name), expectedFailedChecks)')
    && capabilityBrowserRunner.includes('consoleErrors.every((item) => item.caseId === failedCaseId')
    && capabilityBrowserRunner.includes('/ERR_(?:NO_BUFFER_SPACE|NETWORK_CHANGED)/u.test(String(item.message ?? ""))')
    && capabilityBrowserRunner.includes("cleanup.status === \"task-owned runtime removed\"")
    && capabilityBrowserRunner.includes("cleanup.tempRootRemoved === true")
    && capabilityBrowserRunner.includes("cleanup.runtimeProjectRemoved === true")
    && capabilityBrowserRunner.includes("primary.unchanged === true")
    && capabilityBrowserRunner.includes("safeJson(sourceInfo(root)) === safeJson(sourceAtStart)")
    && capabilityBrowserRunner.includes("for (let attempt = 1; attempt <= 2; attempt += 1)")
    && capabilityBrowserRunner.includes("if (!retryEligible || attempt === 2)"),
  "UI infrastructure retry must be single-use, exact-error-only, and require completed cleanup"
);
assert(
  capabilityBrowserRunner.includes("browserInfrastructureOnlyFailure")
    && capabilityBrowserRunner.includes('const exactSocketError = /^net::ERR_(?:NO_BUFFER_SPACE|NETWORK_CHANGED)$/u')
    && capabilityBrowserRunner.includes('const exactExecutionError = /^(?:page\\.(?:goto|reload)|locator\\.|browserType\\.|request\\.).*net::ERR_(?:NO_BUFFER_SPACE|NETWORK_CHANGED)/su')
    && capabilityBrowserRunner.includes('Number.isInteger(total)')
    && capabilityBrowserRunner.includes('total > 0')
    && capabilityBrowserRunner.includes('manifest.passed === total - 1')
    && capabilityBrowserRunner.includes('manifest.failed === 1')
    && capabilityBrowserRunner.includes('failedChecks[0]?.name === "browser execution"')
    && capabilityBrowserRunner.includes('failures[0]?.kind === "requestfailed"')
    && capabilityBrowserRunner.includes('(manifest.consoleErrors?.length ?? 0) === 0')
    && capabilityBrowserRunner.includes('item.name === "temporary runtime port released" && item.pass === true')
    && capabilityBrowserRunner.includes('item.name === "temporary runtime dist removed" && item.pass === true')
    && capabilityBrowserRunner.includes('item.name === "next-env restored after task runtime" && item.pass === true')
    && capabilityBrowserRunner.includes("manifest.primaryInvariant?.unchanged === true")
    && capabilityBrowserRunner.includes("for (let attempt = 1; attempt <= 2; attempt += 1)")
    && capabilityBrowserRunner.includes("if (!retryEligible || attempt === 2)"),
  "browser child infrastructure retry must be single-use, exact socket-error-only, and require completed cleanup"
);
const aggregateRunner = read("scripts/qc-dev-087-aggregate.mjs");
assert(
  aggregateRunner.includes('script === "qc:dev-094:browser" ? runDev094BrowserWithStrictRetry() : runNpm(script)')
    && aggregateRunner.includes('const exactConsoleError = /^Failed to load resource: net::ERR_(?:NO_BUFFER_SPACE|NETWORK_CHANGED)$/u')
    && aggregateRunner.includes('manifest.total === 27')
    && aggregateRunner.includes('manifest.passed === 26')
    && aggregateRunner.includes('manifest.failed === 1')
    && aggregateRunner.includes('failedChecks[0]?.name === "browser console errors absent"')
    && aggregateRunner.includes('manifest.cleanupStatus === "removed"')
    && aggregateRunner.includes('manifest.productionConnected === false')
    && aggregateRunner.includes('manifest.productionMutation === false')
    && aggregateRunner.includes('for (let attempt = 1; attempt <= 2; attempt += 1)')
    && aggregateRunner.includes('if (!retryEligible || attempt === 2)')
    && aggregateRunner.includes('primaryUnchanged')
    && aggregateRunner.includes('sourceUnchanged')
    && aggregateRunner.includes('Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000)'),
  "DEV-094 regression retry must be single-use, exact socket-error-only, and require clean immutable boundaries"
);
const dev092BrowserRunner = read("scripts/qc-dev-092-browser.mjs");
assert(
  dev092BrowserRunner.includes("browser fixture canonical three-file work exists")
    && dev092BrowserRunner.includes("ORDER BY drawing.drawing_number, work.created_at DESC, work.id")
    && !dev092BrowserRunner.includes('const targetCode = "A0002-M01"'),
  "DEV-092 exact-context browser evidence must select a deterministic legal three-file work instead of depending on one mutable primary identity"
);
db.close();
pass("contract", expectedTables.length + 29);
