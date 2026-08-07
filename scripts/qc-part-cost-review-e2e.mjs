import crypto from "node:crypto";
import Database from "better-sqlite3";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

function assert(condition, message) {
  checks.push({ message, passed: Boolean(condition) });
  if (!condition) throw new Error(message);
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

const database = new Database(":memory:");
database.pragma("foreign_keys = ON");
database.exec(readProjectFile(root, "db/schema.sql"));

const now = new Date("2026-06-11T00:00:00.000Z").toISOString();
const procurementUserId = id("procurement");
const managerUserId = id("manager");
const rootId = id("root");
const partNumberId = id("part");
const approvedProfileId = id("profile-approved");
const rejectedProfileId = id("profile-rejected");
const approvedRequestId = id("request-approved");
const rejectedRequestId = id("request-rejected");

database.prepare("INSERT INTO users (id, display_name, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
  procurementUserId,
  "Procurement Reviewer",
  "procurement-e2e@example.test",
  "Procurement",
  now,
  now
);
database.prepare("INSERT INTO users (id, display_name, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
  managerUserId,
  "R&D Manager",
  "rd-manager-e2e@example.test",
  "R&D Manager",
  now,
  now
);
database
  .prepare(
    `
    INSERT INTO part_roots (id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  )
  .run(rootId, "9001", "Cost Review Fixture", "manufactured", "Active", "numbering-rule-v1", managerUserId, now, now);
database
  .prepare(
    `
    INSERT INTO part_numbers (
      id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind,
      is_universal, record_status, rule_version_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  )
  .run(partNumberId, rootId, "P-9001-001", 1, "001", "Costed Part", "manufactured", 0, "Active", "numbering-rule-v1", managerUserId, now, now);

function createPendingProfile(profileId, requestId, unitCost) {
  database
    .prepare(
      `
      INSERT INTO part_cost_profiles (
        id, part_number_id, cost_type, profile_name, currency, uom, supplier_name,
        process_name, cost_basis, status, effective_from, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(profileId, partNumberId, "purchase", `Purchase ${unitCost}`, "TWD", "pcs", "Fixture Supplier", null, "quote", "pending_review", now, procurementUserId, now, now);
  database
    .prepare(
      `
      INSERT INTO part_cost_tiers (id, cost_profile_id, min_qty, max_qty, unit_cost, setup_cost, lead_time_days, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(id("tier"), profileId, 1, 9, unitCost, 100, 7, "base tier", now, now);
  database
    .prepare(
      `
      INSERT INTO part_cost_tiers (id, cost_profile_id, min_qty, max_qty, unit_cost, setup_cost, lead_time_days, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(id("tier"), profileId, 10, null, unitCost - 20, 50, 10, "volume tier", now, now);
  database
    .prepare(
      `
      INSERT INTO part_cost_change_requests (
        id, part_number_id, proposed_cost_profile_id, request_type, change_reason,
        review_status, requested_by, requested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(requestId, partNumberId, profileId, "set_standard", "supplier quote update", "pending", procurementUserId, now);
}

function approveCostRequest(requestId, profileId) {
  database
    .prepare("UPDATE part_cost_change_requests SET review_status = 'approved', reviewed_by = ?, reviewed_at = ?, review_comment = ? WHERE id = ?")
    .run(managerUserId, now, "approved by E2E", requestId);
  database.prepare("UPDATE part_cost_profiles SET status = 'approved', approved_by = ?, updated_at = ? WHERE id = ?").run(managerUserId, now, profileId);
  database.prepare("UPDATE part_standard_costs SET effective_to = ?, updated_at = ? WHERE part_number_id = ? AND effective_to IS NULL").run(now, now, partNumberId);
  database
    .prepare(
      `
      INSERT INTO part_standard_costs (
        id, part_number_id, cost_profile_id, basis_qty, standard_reason,
        selected_by, approved_by, effective_from, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(id("standard"), partNumberId, profileId, 1, "approved by E2E", managerUserId, managerUserId, now, now, now);
  database
    .prepare("INSERT INTO audit_logs (id, actor_id, action, detail_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id("audit"), managerUserId, "numbering.part_cost_change.approve", JSON.stringify({ requestId, profileId, partNumber: "P-9001-001" }), now);
}

function rejectCostRequest(requestId, profileId) {
  database
    .prepare("UPDATE part_cost_change_requests SET review_status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_comment = ? WHERE id = ?")
    .run(managerUserId, now, "rejected by E2E", requestId);
  database.prepare("UPDATE part_cost_profiles SET status = 'rejected', updated_at = ? WHERE id = ? AND status = 'pending_review'").run(now, profileId);
  database
    .prepare("INSERT INTO audit_logs (id, actor_id, action, detail_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id("audit"), managerUserId, "numbering.part_cost_change.reject", JSON.stringify({ requestId, profileId, partNumber: "P-9001-001" }), now);
}

function resolveStandardCost(quantity) {
  return database
    .prepare(
      `
      SELECT cp.id AS profile_id, cp.status, t.unit_cost, t.setup_cost
      FROM part_standard_costs sc
      JOIN part_cost_profiles cp ON cp.id = sc.cost_profile_id
      JOIN part_cost_tiers t ON t.cost_profile_id = cp.id
      WHERE sc.part_number_id = ?
        AND sc.effective_to IS NULL
        AND cp.status = 'approved'
        AND t.min_qty <= ?
        AND (t.max_qty IS NULL OR t.max_qty >= ?)
      ORDER BY t.min_qty DESC
      LIMIT 1
    `
    )
    .get(partNumberId, quantity, quantity);
}

createPendingProfile(approvedProfileId, approvedRequestId, 250);
assert(database.prepare("SELECT COUNT(*) AS count FROM part_standard_costs WHERE part_number_id = ? AND effective_to IS NULL").get(partNumberId).count === 0, "pending procurement request does not create active standard cost");
assert(database.prepare("SELECT review_status FROM part_cost_change_requests WHERE id = ?").get(approvedRequestId).review_status === "pending", "procurement request starts pending");

approveCostRequest(approvedRequestId, approvedProfileId);
assert(database.prepare("SELECT status FROM part_cost_profiles WHERE id = ?").get(approvedProfileId).status === "approved", "manager approval marks profile approved");
assert(database.prepare("SELECT review_status FROM part_cost_change_requests WHERE id = ?").get(approvedRequestId).review_status === "approved", "manager approval marks request approved");
assert(database.prepare("SELECT COUNT(*) AS count FROM part_standard_costs WHERE part_number_id = ? AND effective_to IS NULL").get(partNumberId).count === 1, "manager approval creates exactly one active standard cost");
assert(resolveStandardCost(1)?.unit_cost === 250, "standard cost resolves basis quantity tier after approval");
assert(resolveStandardCost(10)?.unit_cost === 230, "standard cost resolves volume tier after approval");
assert(database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'numbering.part_cost_change.approve'").get().count === 1, "approval writes append-only audit");

createPendingProfile(rejectedProfileId, rejectedRequestId, 500);
const standardBeforeReject = database.prepare("SELECT cost_profile_id FROM part_standard_costs WHERE part_number_id = ? AND effective_to IS NULL").get(partNumberId).cost_profile_id;
rejectCostRequest(rejectedRequestId, rejectedProfileId);
assert(database.prepare("SELECT status FROM part_cost_profiles WHERE id = ?").get(rejectedProfileId).status === "rejected", "manager rejection marks profile rejected");
assert(database.prepare("SELECT review_status FROM part_cost_change_requests WHERE id = ?").get(rejectedRequestId).review_status === "rejected", "manager rejection marks request rejected");
assert(database.prepare("SELECT cost_profile_id FROM part_standard_costs WHERE part_number_id = ? AND effective_to IS NULL").get(partNumberId).cost_profile_id === standardBeforeReject, "rejection does not replace active standard cost");
assert(resolveStandardCost(1)?.unit_cost === 250, "rejected profile does not affect standard cost resolution");
assert(database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'numbering.part_cost_change.reject'").get().count === 1, "rejection writes append-only audit");

const itemId = id("item");
const submissionId = id("submission");
database.prepare("INSERT INTO items (id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(itemId, "P-9001-001", "Costed Part", "A", now, now);
database
  .prepare(
    `
    INSERT INTO submissions (
      id, item_id, drawing_number, revision, material, surface_finish, document_type,
      change_description, status, submitted_by, approval_required, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  )
  .run(submissionId, itemId, "D-9001-MA-001", "B", "AL6061", "Anodized", "drawing", "revision only", "Pending", procurementUserId, 1, now, now);
const costRequestCountBeforeRevisionLookup = database.prepare("SELECT COUNT(*) AS count FROM part_cost_change_requests").get().count;
const activeStandardBeforeRevisionLookup = database.prepare("SELECT COUNT(*) AS count FROM part_standard_costs WHERE part_number_id = ? AND effective_to IS NULL").get(partNumberId).count;
const revisions = database
  .prepare(
    `
    SELECT s.id AS submission_id, s.revision, s.status
    FROM submissions s
    JOIN items i ON i.id = s.item_id
    WHERE i.part_number = ?
    ORDER BY s.created_at DESC, s.revision DESC
  `
  )
  .all("P-9001-001");
assert(revisions.length === 1 && revisions[0].revision === "B", "revision history lookup returns drawing revision");
assert(database.prepare("SELECT COUNT(*) AS count FROM part_cost_change_requests").get().count === costRequestCountBeforeRevisionLookup, "revision lookup does not create cost change requests");
assert(database.prepare("SELECT COUNT(*) AS count FROM part_standard_costs WHERE part_number_id = ? AND effective_to IS NULL").get(partNumberId).count === activeStandardBeforeRevisionLookup, "revision lookup does not change active standard cost");

database.close();
console.log(`qc:part-cost-review-e2e passed ${checks.length}/${checks.length} checks`);
