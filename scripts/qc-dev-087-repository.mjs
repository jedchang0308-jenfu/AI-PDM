import { assert, createFixtureDatabase, ids, pass } from "./qc-dev-087-fixtures.mjs";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { PdmCanonicalWorkbenchService } from "../src/lib/pdm-canonical-workbench.ts";
import { PartChangeWorkService } from "../src/lib/part-change-work.ts";

const db = createFixtureDatabase();
const base = createAsyncDatabaseClient({ kind: "sqlite", database: db });
let statements = 0;
const client = {
  kind: base.kind,
  query: (...args) => { statements += 1; return base.query(...args); },
  queryOne: (...args) => { statements += 1; return base.queryOne(...args); },
  execute: (...args) => { statements += 1; return base.execute(...args); },
  transaction: (fn, options) => base.transaction(() => fn(client), options),
  close: () => base.close()
};
const actor = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { createWork: true, updateWork: true, submitWork: true, cancelWork: true, decideReview: false, obsoleteDrawing: true } };
const service = new PdmCanonicalWorkbenchService(client);
statements = 0;
const drawing = await service.list(new URL("http://local/api?query=A0002-M01"), "drawing", actor);
assert.equal(drawing.data.groups.length, 1);
assert.deepEqual(drawing.data.groups[0].rows.map((row) => row.layerLabel), ["量產版 1", "研發版 1.1"]);
assert.deepEqual(drawing.data.groups[0].rows.map((row) => row.dataStateLabel), ["可使用", "可使用"]);
assert.deepEqual(drawing.data.groups[0].rows.map((row) => row.handlingLabel), ["無須處理", "無須處理"]);
assert.equal(drawing.data.groups[0].rows[0].actions[0].label, "進版");
assert(statements <= 12, `drawing list query budget exceeded: ${statements}`);
const rdOnly = await service.list(new URL("http://local/api?layer=rd"), "drawing", actor);
assert.deepEqual(rdOnly.data.groups[0].rows.map((row) => row.layer), ["rd"]);
const availableOnly = await service.list(new URL("http://local/api?stage=available"), "drawing", actor);
assert.equal(availableOnly.data.totalRows, 2);
const otherCompany = await service.list(new URL("http://local/api"), "drawing", { ...actor, companyId: ids.otherCompany });
assert.equal(otherCompany.data.totalRows, 0);
const detail = await service.detail(drawing.data.groups[0].rows[0].rowKey, "drawing", actor);
assert.equal(detail.data.row.code, "A0002-M01");
assert.equal(detail.data.presentation.kind, "drawing");
assert(Array.isArray(detail.data.presentation.history));
assert(detail.data.presentation.history.some((item) => item.revision === "1"));
assert(detail.data.presentation.history.some((item) => item.revision === "1.1"));
assert.equal(detail.data.presentation.relationMatrix.drawings[0]?.detailHref, `/numbering/drawings?detail=${encodeURIComponent(`cw_${ids.stateProduction}`)}`);
assert.equal(detail.data.presentation.relationMatrix.parts[0]?.detailHref, `/parts?detail=${encodeURIComponent(`cw_${ids.statePart}`)}`);

// Relation workbench rows were retired by DEV-090; its direct formal matrix
// contract is verified by the DEV-090 focused suite rather than this Drawing/
// Part canonical workbench regression.

const partList = await service.list(new URL("http://local/api"), "part", actor);
const partRow = partList.data.groups[0].rows[0];
assert.equal(partRow.revision, null);
assert.equal(partRow.layerLabel, "正式資料");
const partDetail = await service.detail(partRow.rowKey, "part", actor);
assert.equal(partDetail.data.presentation.kind, "part");
assert.equal(partDetail.data.presentation.relationMatrix.drawings[0]?.detailHref, `/numbering/drawings?detail=${encodeURIComponent(`cw_${ids.stateProduction}`)}`);
const partService = new PartChangeWorkService(client);
const commandActor = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { create: true, update: true, submit: true, cancel: true, decide: false } };
const context = { idempotencyKey: "dev087-part-create-1", contractToken: partList.meta.contractToken, expectedRowVersion: partRow.rowVersion };
const created = await partService.create(ids.part, commandActor, context);
const replay = await partService.create(ids.part, commandActor, context);
assert.deepEqual(replay, created);
assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM part_change_works`).get().n, 1);
assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM canonical_workbench_states WHERE data_layer = 'part_work'`).get().n, 1);
const editingOnly = await service.list(new URL("http://local/api?stage=editing"), "part", actor);
assert.equal(editingOnly.data.totalRows, 1);
assert.equal(editingOnly.data.groups[0].rows[0].dataStateLabel, "編輯中");
await assert.rejects(() => partService.create(ids.part, commandActor, { ...context, idempotencyKey: "dev087-part-create-2" }), (error) => error.code === "WORKBENCH_ACTIVE_WORK_EXISTS" || error.code === "WORKBENCH_ROW_VERSION_CONFLICT");
assert.equal(db.pragma("foreign_key_check").length, 0);
db.close();
pass("repository", 38);
