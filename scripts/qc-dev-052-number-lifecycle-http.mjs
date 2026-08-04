#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = path.join(root, ".tmp", `qc-dev-052-http-${crypto.randomUUID()}`);
const results = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const has = (source, fragments) => fragments.every((fragment) => source.includes(fragment));
function record(id, passed, detail = "") { results.push({ id, passed: Boolean(passed), detail }); }

const routeFiles = [
  "src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/route.ts",
  "src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/route.ts",
  "src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/route.ts",
  "src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/[fileId]/remove/route.ts",
  "src/app/api/numbering/draft-workspaces/[id]/submit-bundle-review/route.ts",
  "src/app/api/numbering/draft-workspaces/[id]/withdraw-bundle-review/route.ts"
];
record("DEV052-HTTP-001 exact V2 routes exist", routeFiles.every((file) => fs.existsSync(path.join(root, file))), routeFiles.join(", "));
const routeSources = routeFiles.map(read).join("\n");
record(
  "DEV052-HTTP-002 mutations require idempotency and server-derived action scope",
  has(routeSources, ["requireIdempotency: true", "requireNumberStateCommandAccessAsync", "numbering.draft.update", "numbering.candidate.review.submit", "numbering.candidate.review.withdraw"]),
  "Idempotency-Key + permission guard"
);
record(
  "DEV052-HTTP-003 upload is multipart and removal is soft-association command",
  has(read(routeFiles[2]), ["validateNumberStateMultipartMutationRequest", "request.formData()", "addNumberingCandidateRevisionFile"]) &&
    has(read(routeFiles[3]), ["removeNumberingCandidateRevisionFile", "expectedRowVersion"]),
  "multipart upload / JSON soft-remove"
);
const service = read("src/lib/number-lifecycle-simplification.ts");
record(
  "DEV052-HTTP-004 every command checks the default-off server flag and returns additive response",
  service.match(/assertLifecycleV2Enabled\(\)/gu)?.length >= 8 && has(service, ["candidateRevisions: workspace.candidateRevisions", "lifecycleV2: workspace.lifecycleV2", "receipt: lifecycleReceipt"]),
  "server flag + workspace/candidateRevisions/lifecycleV2/receipt"
);
const commandService = read("src/lib/platform-command-service.ts");
const outboxRepository = read("src/lib/repositories/platform-outbox-async-repository.ts");
record(
  "DEV052-HTTP-004B payload-aware idempotency is opt-in and upload side effects occur after replay detection",
  (service.match(/idempotencyPayload: command\.payload/gu)?.length ?? 0) >= 8 &&
    service.indexOf("execute: async (client) => {") < service.indexOf("storageService.putObject") &&
    has(commandService, ["idempotencyPayload?: unknown", "findCompletedCommand<TResult>(command, input.idempotencyPayload)"]) &&
    has(outboxRepository, ["PLATFORM_COMMAND_IDEMPOTENCY_PAYLOAD_MISMATCH", "idempotencyPayload !== undefined"]),
  "DEV-052 rejects changed payloads without changing legacy command semantics or creating replay upload objects"
);
const productionSlice = read("src/lib/production-slice.ts");
record(
  "DEV052-HTTP-005 production mutation allowlist remains closed",
  !productionSlice.includes("candidate-revisions") && !productionSlice.includes("submit-bundle-review") && !productionSlice.includes("withdraw-bundle-review"),
  "no DEV-052 production slice path"
);
const decisionRoute = read("src/app/api/approvals/requests/[requestId]/decisions/route.ts");
const applyRoute = read("src/app/api/approvals/requests/[requestId]/apply/route.ts");
record(
  "DEV052-HTTP-006 approval routes special-case bundle decision and recovery retry",
  has(decisionRoute, ["numbering.candidate_bundle_review", "decideNumberingCandidateBundleReview", "numbering.candidate.review.decide"]) &&
    has(applyRoute, ["numbering.candidate_bundle_review", "retryNumberingCandidateBundleApply"]),
  "generic two-step apply is bypassed for the new action"
);

process.env.PDM_DATA_DIR = fixtureRoot;
process.env.PDM_REPOSITORY_DIR = path.join(fixtureRoot, "repository");
process.env.PDM_DB_PROVIDER = "sqlite";
process.env.PDM_NUMBER_LIFECYCLE_V2 = "true";
process.env.NODE_ENV = "test";
let database;
try {
  const [{ getDb }, { createPlatformActorContext }, lifecycle] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/platform-command"),
    import("@/lib/number-lifecycle-simplification")
  ]);
  database = getDb();
  database.prepare(`
    INSERT INTO users (
      id, display_name, email, password_hash, role, company_id, account_status,
      system_role_enabled, created_at, updated_at
    ) VALUES ('dev052-http-user', 'DEV-052 HTTP', 'dev052-http@example.invalid', NULL, 'Engineer',
      'company-jenfu', 'active', 1, datetime('now'), datetime('now'))
  `).run();
  database.prepare(`INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
                    VALUES ('dev052-http-user', 'company-jenfu', 1, datetime('now'))`).run();
  database.prepare(`INSERT INTO numbering_draft_workspaces (
      id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
    ) VALUES ('dev052-http', 'company-jenfu', 'new_bundle', 'active', 'dev052-http-user', 'dev052-http-user', 1, datetime('now'), datetime('now'))`).run();
  database.prepare(`INSERT INTO numbering_draft_roots (
      id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
    ) VALUES ('dev052-http-root', 'company-jenfu', 'dev052-http', 'DEV-052 HTTP', 'manufactured',
      'numbering-rule-v3-alpha-root', datetime('now'), datetime('now'))`).run();
  database.prepare(`INSERT INTO numbering_draft_drawings (
      id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description, is_primary_manufacturing, created_at, updated_at
    ) VALUES ('dev052-http-drawing', 'company-jenfu', 'dev052-http', 'dev052-http-root', 'M', '', 1, datetime('now'), datetime('now'))`).run();
  database.prepare(`INSERT INTO number_candidate_reservations (
      id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code,
      sequence_scope_key, sequence_no, reservation_state, row_version, created_by, created_at, updated_at
    ) VALUES ('dev052-http-reservation', 'company-jenfu', 'dev052-http', 'drawing', 'dev052-http-drawing', 'A053-M01',
      'drawing:dev052-http', 1, 'active', 1, 'dev052-http-user', datetime('now'), datetime('now'))`).run();
  database.prepare(`UPDATE numbering_draft_drawings SET candidate_reservation_id = 'dev052-http-reservation' WHERE id = 'dev052-http-drawing'`).run();
  const actor = createPlatformActorContext({
    pdmUserId: "dev052-http-user",
    organizationId: "company-jenfu",
    roles: ["Engineer"],
    scopes: ["numbering.draft.update"],
    requestId: "dev052-http-request",
    correlationId: "dev052-http-correlation"
  });
  const metadata = { actor, idempotencyKey: "dev052-http-create" };
  const first = await lifecycle.createNumberingCandidateRevision({
    metadata,
    workspaceId: "dev052-http",
    drawingDraftId: "dev052-http-drawing",
    expectedWorkspaceRowVersion: 1
  });
  const second = await lifecycle.createNumberingCandidateRevision({
    metadata,
    workspaceId: "dev052-http",
    drawingDraftId: "dev052-http-drawing",
    expectedWorkspaceRowVersion: 1
  });
  record(
    "DEV052-HTTP-007 equivalent duplicate command replays one receipt and one outbox result",
    first.receipt.idempotentReplay === false && second.receipt.idempotentReplay === true &&
      database.prepare(`SELECT count(*) AS count FROM numbering_candidate_revision_drafts`).get().count === 1 &&
      database.prepare(`SELECT count(*) AS count FROM platform_command_receipts WHERE command_name = 'pdm.numbering.create_candidate_revision'`).get().count === 1 &&
      database.prepare(`SELECT count(*) AS count FROM platform_outbox_events WHERE event_type = 'pdm.numbering.candidate_revision.created.v1'`).get().count === 1,
    JSON.stringify({ first: first.receipt, second: second.receipt })
  );
  let mismatchCode = "";
  try {
    await lifecycle.createNumberingCandidateRevision({
      metadata,
      workspaceId: "dev052-http",
      drawingDraftId: "different-drawing",
      expectedWorkspaceRowVersion: 1
    });
  } catch (error) {
    mismatchCode = error && typeof error === "object" && "code" in error ? String(error.code) : String(error);
  }
  record(
    "DEV052-HTTP-008 same idempotency key with different payload fails closed",
    mismatchCode === "idempotency_payload_mismatch" && database.prepare(`SELECT count(*) AS count FROM numbering_candidate_revision_drafts`).get().count === 1,
    mismatchCode
  );
  process.env.PDM_NUMBER_LIFECYCLE_V2 = "false";
  let disabledCode = "";
  try {
    await lifecycle.createNumberingCandidateRevision({
      metadata: { ...metadata, idempotencyKey: "dev052-http-disabled" },
      workspaceId: "dev052-http",
      drawingDraftId: "dev052-http-drawing",
      expectedWorkspaceRowVersion: 2
    });
  } catch (error) {
    disabledCode = error && typeof error === "object" && "code" in error ? String(error.code) : String(error);
  }
  record("DEV052-HTTP-009 flag-off mutation fails closed before business write", disabledCode === "number_lifecycle_v2_not_enabled", disabledCode);
} catch (error) {
  record("DEV052-HTTP-fixture", false, error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  try { database?.close(); } catch {}
  const resolvedFixture = path.resolve(fixtureRoot);
  const resolvedTmp = path.resolve(root, ".tmp");
  if (resolvedFixture.startsWith(`${resolvedTmp}${path.sep}`)) fs.rmSync(resolvedFixture, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
