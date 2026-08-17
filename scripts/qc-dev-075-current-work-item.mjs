#!/usr/bin/env node

import assert from "node:assert/strict";
import { closeAsyncDatabaseClient, getAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { AsyncApprovalPlatformRepository } from "../src/lib/repositories/approval-platform-async-repository.ts";

process.env.PDM_DB_PROVIDER = "sqlite";

const client = getAsyncDatabaseClient();
try {
  const companyId = "company-jenfu";
  const repository = new AsyncApprovalPlatformRepository(client);
  const all = await repository.listInbox({
    companyId,
    status: "all",
    query: "A0005-M01",
    limit: 100
  });
  const revisionRows = all.items.filter((item) => item.title.includes("A0005-M01 rev 0.10"));
  assert.ok(revisionRows.length >= 2, "A0005-M01 rev 0.10 has the historical and latest review records");
  assert.equal(
    revisionRows.filter((item) => item.historyOnly !== true).length,
    1,
    "one latest assessment remains the current source of truth for the same drawing revision"
  );
  const historicalNeedsInfo = revisionRows.find(
    (item) => item.status === "needs_info" && item.historyOnly === true
  );
  assert.ok(historicalNeedsInfo, "the old needs_info assessment remains available for audit history");
  assert.ok(historicalNeedsInfo.supersededByRequestId, "historical assessment points to its superseding record");

  const historicalDetail = await repository.getRequestDetail(historicalNeedsInfo.id, companyId);
  assert.ok(historicalDetail, "historical approval detail remains addressable by exact requestId");
  assert.equal(historicalDetail.historyOnly, true, "historical detail keeps its historyOnly projection");
  assert.equal(historicalDetail.status, "needs_info", "historical detail keeps its recorded decision state");

  const active = await repository.listInbox({ companyId, status: "active", limit: 500 });
  const activeLegacyNeedsInfo = active.items.filter(
    (item) => item.source === "legacy_drawing_revision_review" && item.status === "needs_info"
  );
  assert.deepEqual(activeLegacyNeedsInfo, [], "needs_info is not presented as a reviewer active task");
  assert.ok(
    active.items.every((item) => item.historyOnly !== true),
    "the active queue contains no superseded historical assessment"
  );

  console.log(
    `QC DEV-075 current work item: PASS (${revisionRows.length} A0005-M01 rev0.10 records, `
      + `${active.items.length} active inbox rows, history target ${historicalNeedsInfo.supersededByRequestId})`
  );
} finally {
  await closeAsyncDatabaseClient();
}
