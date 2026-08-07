import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const results = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function record(id, passed, detail = "") {
  results.push({ id, passed: Boolean(passed), detail });
}

function all(source, values) {
  return values.every((value) => source.includes(value));
}

const legacyResolver = read("src/lib/number-state-flow-legacy-route.ts");
const handoffLayout = read("src/app/handoff/layout.tsx");
const uploadLayout = read("src/app/upload/layout.tsx");
const legacyComponent = read("src/components/number-state-legacy-route.tsx");
const sidebar = read("src/components/sidebar-nav.tsx");
const technicalPage = read("src/components/technical-transfer-workspace.tsx");
const technicalApi = read("src/app/api/technical-transfer/route.ts");
const exportApi = read("src/app/api/technical-transfer/[id]/export/route.ts");
const phase1d = read("src/lib/transfer-package-phase1d.ts");
const transferRepository = read("src/lib/repositories/transfer-package-async-repository.ts");
const draftRoute = read("src/app/api/transfer-packages/[id]/draft-items/route.ts");
const draftRemoveRoute = read("src/app/api/transfer-packages/[id]/draft-items/[itemId]/route.ts");
const submitRoute = read("src/app/api/transfer-packages/[id]/submit-review/route.ts");
const publishRoute = read("src/app/api/transfer-packages/[id]/publish/route.ts");
const decisionRoute = read("src/app/api/approvals/requests/[requestId]/decisions/route.ts");
const transferApi = read("src/lib/transfer-package-api.ts");
const transferCreateRoute = read("src/app/api/transfer-packages/route.ts");
const transferContextRoute = read("src/app/api/transfer-packages/workbench-context/route.ts");
const transferDetailRoute = read("src/app/api/transfer-packages/[id]/route.ts");
const transferItemsRoute = read("src/app/api/transfer-packages/[id]/items/route.ts");
const transferItemRoute = read("src/app/api/transfer-packages/[id]/items/[itemId]/route.ts");
const transferCancelRoute = read("src/app/api/transfer-packages/[id]/cancel/route.ts");
const transferWorkbench = read("src/components/transfer-package-workbench.tsx");
const schema = read("db/schema.sql");
const postgres = read("db/postgres/017_number_state_flow_phase1d.sql");
const supabase = read("supabase/migrations/20260713090000_number_state_flow_phase1d.sql");

record("CON-006 /handoff resolves to published technical transfer", all(legacyResolver, [
  'pathname === "/handoff"',
  'destinationPathname = "/technical-transfer"',
  'nextSearchParams.set("tab", "published")',
  'nextSearchParams.set("legacyFrom", pathname)'
]) && all(handoffLayout, ['destination="/technical-transfer?tab=published"', 'strategy="redirect"']));

record("UI-015 legacy query and return context are preserved", all(legacyComponent, [
  "source.searchParams.forEach",
  "if (!target.searchParams.has(key))",
  'target.searchParams.set("legacyFrom", source.pathname)'
]));

record("CON-006 contextless upload remains guidance-only", all(uploadLayout, [
  'strategy="upload"',
  'destination="/numbering/search?legacyIntent=upload"'
]) && all(legacyComponent, ["uploadHasContext", "請改從物件或案件開始"]));

record("TRF-001 three tabs and one page-level create CTA exist", all(technicalPage, [
  'label: "準備中"', 'label: "審核中"', 'label: "已發布交接"',
  'href="/transfer-packages/new?returnTo=', "建立技轉包"
]));

record(
  "UI-003 sidebar exposes canonical technical transfer and omits retired routes",
  sidebar.includes('{ href: "/technical-transfer", label: "技術移轉"') &&
    ["/numbering/part-drafts", "/numbering/request", "/upload", "/handoff"]
      .every((route) => !sidebar.includes(`href: "${route}"`))
);

record("TRF-012 API and export share the same published-only predicate", all(technicalApi, [
  '"handoff.published.view"', "listPublishedTransferHandoffs"
]) && all(exportApi, ['"handoff.published.view"', "listPublishedTransferHandoffs", "PUBLISHED_HANDOFF_NOT_FOUND"]) && all(phase1d, [
  "package_status = 'Published'", 'new Set(["Active", "Released"])', "officialReady", "draftReady",
  'reservation.reservation_state === "promoted"'
]));

record("SEC-001..012 mutations use same-origin JSON, explicit permission and idempotency", all(draftRoute, [
  "validateNumberStateMutationRequest", "requireIdempotency: true", '"transfer.package.update"'
]) && all(draftRemoveRoute, [
  "validateNumberStateMutationRequest", "requireIdempotency: true", '"transfer.package.update"'
]) && all(submitRoute, [
  "validateNumberStateMutationRequest", "requireIdempotency: true", '"transfer.package.review.submit"'
]) && all(publishRoute, [
  "validateNumberStateMutationRequest", "requireIdempotency: true", '"transfer.package.publish"'
]) && all(decisionRoute, [
  'detail.actionCode === "transfer.package_review"', '"transfer.package.review.decide"'
]));

record("SEC-013 legacy transfer APIs share number-state permission and same-origin guards", all(transferApi, [
  "requireNumberStateReadAccessAsync", "requireNumberStateCommandAccessAsync"
]) && all(transferCreateRoute, [
  "validateNumberStateMutationRequest", "requireIdempotency: true", '"transfer.package.create"'
]) && all(transferContextRoute, ['"transfer.package.create"']) && all(transferDetailRoute, [
  "validateNumberStateMutationRequest", '"transfer.package.update"'
]) && all(transferItemsRoute, [
  "validateNumberStateMutationRequest", '"transfer.package.update"'
]) && all(transferItemRoute, [
  "validateNumberStateMutationRequest", '"transfer.package.update"'
]) && all(transferCancelRoute, [
  "validateNumberStateMutationRequest", '"transfer.package.update"'
]));

record("TRF-003C draft scope command receipts and UI replay keys are explicit", all(phase1d, [
  'commandName: "pdm.transfer.add_draft_workspace"',
  'commandName: "pdm.transfer.remove_draft_workspace"',
  "reusedFromCommandReceipt"
]) && all(transferWorkbench, [
  "transfer:add-workspace:", "transfer:remove-workspace:", 'headers["Idempotency-Key"]'
]));

record("UI-016 transfer lifecycle controls consume explicit action permissions", all(transferWorkbench, [
  'actionPermissions["transfer.package.create"] === true',
  'actionPermissions["transfer.package.update"] === true',
  'actionPermissions["transfer.package.review.submit"] === true',
  'actionPermissions["transfer.package.review.withdraw"] === true',
  'actionPermissions["transfer.package.publish"] === true',
  "!canPublish"
]));

record("TRF-003 draft scope accepts stable workspace ID only", phase1d.includes("TRANSFER_WORKSPACE_ID_INVALID") &&
  transferRepository.includes("WHERE id = :workspaceId AND company_id = :companyId") &&
  schema.includes("UNIQUE (package_id, workspace_id)") && !draftRoute.includes("candidateCode"));

record("MIG-011 provider mirror has status validation, RLS and direct-access revoke", all(schema, [
  "CREATE TABLE IF NOT EXISTS transfer_package_draft_items", "ApprovedPendingPublish", "PackagePublished"
]) && all(postgres, [
  "VALIDATE CONSTRAINT transfer_packages_phase1d_status_check",
  "ALTER TABLE transfer_package_draft_items FORCE ROW LEVEL SECURITY",
  "REVOKE ALL ON transfer_package_draft_items FROM anon, authenticated",
  "transfer.package_review"
]) && [postgres, supabase].every((source) => all(source, [
  "reject_transfer_package_event_mutation",
  "TRANSFER_PACKAGE_EVENT_APPEND_ONLY",
  "trg_transfer_package_events_no_update",
  "trg_transfer_package_events_no_delete"
])));

record("TRF-001 old transfer workbench routes remain present", [
  "src/app/transfer-packages/new/page.tsx",
  "src/app/transfer-packages/[id]/page.tsx",
  "src/app/api/transfer-packages/route.ts",
  "src/app/api/transfer-packages/[id]/route.ts"
].every((relative) => fs.existsSync(path.join(root, relative))));

const regression = spawnSync(process.execPath, ["scripts/qc-pdm-transfer-package-phase3a0.mjs"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true
});
record("REG-TRF Phase 3A-0 compatibility regression remains green", regression.status === 0, String(regression.stderr || regression.stdout || regression.error || "").slice(-3000));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
