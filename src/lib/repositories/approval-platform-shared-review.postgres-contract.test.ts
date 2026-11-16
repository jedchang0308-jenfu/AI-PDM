import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { createAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncApprovalPlatformRepository } from "@/lib/repositories/approval-platform-async-repository";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";

const connectionString = process.env.PDM_DEV121_SHARED_REVIEW_POSTGRES_URL;
const fixtureDatabase = "dev121_shared_review_fixture";

describe.skipIf(!connectionString)("DEV-121 shared review PostgreSQL contract", () => {
  it("keeps assigned requests and traces shared submissions and outcomes within the actor and company", async () => {
    const url = new URL(connectionString!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== `/${fixtureDatabase}`) {
      throw new Error("Use a task-owned DEV-121 PostgreSQL fixture");
    }
    const raw = new Pool({ connectionString, max: 1 });
    const database = createAsyncDatabaseClient({
      kind: "postgres", connectionString: connectionString!, searchPath: "ai_pdm_core,pg_catalog"
    });
    try {
      const { rows } = await raw.query<{ current_database: string; schema_exists: boolean }>(
        "SELECT current_database(), to_regnamespace('ai_pdm_core') IS NOT NULL AS schema_exists"
      );
      if (rows[0]?.current_database !== fixtureDatabase || rows[0]?.schema_exists !== false) {
        throw new Error("Expected an empty DEV-121 PostgreSQL fixture");
      }
      const baseline = readFileSync("db/postgres/042_status_data_rebuild.sql", "utf8");
      const first = baseline.indexOf("CREATE TABLE IF NOT EXISTS pdm_work_review_requests");
      const last = baseline.indexOf("CREATE TABLE IF NOT EXISTS part_approved_change_snapshots", first);
      if (first < 0 || last <= first) throw new Error("Missing migration 042 review schema");
      await raw.query(`
        CREATE ROLE jenfu_ai_pdm_migrator;
        CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
        SET ROLE jenfu_ai_pdm_migrator;
        SET search_path = ai_pdm_core, pg_catalog;
        CREATE TABLE companies (id text PRIMARY KEY);
        CREATE TABLE users (id text PRIMARY KEY, display_name text, company_id text);
        CREATE TABLE drawing_rd_branches (id text PRIMARY KEY);
        INSERT INTO companies VALUES ('company-one'), ('company-two');
        INSERT INTO users VALUES ('submitter','Submitter','company-one'), ('assigned-reviewer','Reviewer','company-one'),
          ('another-submitter','Another','company-one'), ('company-two-submitter','Other company','company-two');
        INSERT INTO drawing_rd_branches VALUES ('branch-one');
        ${baseline.slice(first, last)}
        INSERT INTO pdm_work_review_requests
          (id,company_id,request_kind,entity_type,canonical_entity_id,work_id,
           reviewer_user_id,review_cycle_id,snapshot_payload,snapshot_hash)
        VALUES ('assigned','company-one','drawing_revision','drawing','drawing-one','legacy-work',
          'assigned-reviewer','legacy-cycle','{}','legacy-hash');
        CREATE TABLE drawings (id text PRIMARY KEY, company_id text, drawing_number text, purpose_description text);
        CREATE TABLE part_numbers (id text PRIMARY KEY, company_id text, part_number text, part_name text);
        CREATE TABLE approval_platform_requests (
          id text PRIMARY KEY, company_id text, action_code text, title text, requested_by text,
          requested_at timestamptz, request_status text, apply_status text, payload_json jsonb, reason text
        );
        CREATE TABLE transfer_packages (id text PRIMARY KEY, company_id text, review_request_id text,
          package_status text, review_snapshot_hash text);
        CREATE TABLE drawing_revision_works (id text, company_id text, owner_user_id text);
        CREATE TABLE part_change_works (id text, company_id text, owner_user_id text);
        CREATE TABLE drawing_revisions (id text, company_id text, revision text);
        CREATE TABLE canonical_workbench_states (id text, company_id text, entity_type text, canonical_entity_id text,
          work_id text, branch_id text, revision_id text, updated_at timestamptz);
        ALTER TABLE drawings ADD COLUMN owner_id text, ADD COLUMN created_by text;
        ALTER TABLE part_numbers ADD COLUMN created_by text;
        INSERT INTO drawings (id,company_id,drawing_number,purpose_description) VALUES ('drawing-one','company-one','D-001','Drawing'),
          ('drawing-other','company-two','D-OTHER','Unrelated');
        INSERT INTO part_numbers (id,company_id,part_number,part_name) VALUES ('part-one','company-one','P-001','Part');
        INSERT INTO transfer_packages (id,company_id) VALUES ('package-one','company-one');
        INSERT INTO approval_platform_requests (id,company_id,action_code,title,requested_by,requested_at,request_status,apply_status,payload_json) VALUES ('transfer-one','company-one','transfer.package_review',
          'Transfer','submitter',CURRENT_TIMESTAMP,'approved','applied','{"transferPackageId":"package-one"}');
      `);
      await raw.query(readFileSync("db/postgres/107_dev121_shared_work_review.sql", "utf8"));
      await raw.query(readFileSync("db/postgres/108_dev121_shared_work_review_guards.sql", "utf8"));
      await raw.query("RESET ROLE");

      const repository = new PdmWorkReviewAsyncRepository(database);
      const assignment = { reviewerUserId: null, submittedBy: "submitter", requiresModelReview: false,
        requiresPublish: false, snapshotPayload: {}, snapshotHash: "sha" } as const;
      const drawing = await repository.create(database, { ...assignment, companyId: "company-one",
        requestKind: "drawing_revision", entityType: "drawing", canonicalEntityId: "drawing-one", workId: "work-one" });
      const voided = await repository.create(database, { ...assignment, companyId: "company-one",
        requestKind: "drawing_rd_void", entityType: "drawing", canonicalEntityId: "drawing-one", branchId: "branch-one" });
      const part = await repository.create(database, { ...assignment, companyId: "company-one",
        requestKind: "part_change", entityType: "part", canonicalEntityId: "part-one", workId: "work-part" });
      await repository.create(database, { ...assignment, submittedBy: "company-two-submitter", companyId: "company-two",
        requestKind: "drawing_revision", entityType: "drawing", canonicalEntityId: "drawing-other", workId: "work-other" });
      await repository.create(database, { ...assignment, submittedBy: "another-submitter", companyId: "company-one",
        requestKind: "drawing_revision", entityType: "drawing", canonicalEntityId: "drawing-one", workId: "work-another" });
      await expect(raw.query("UPDATE ai_pdm_core.pdm_work_review_requests SET submitted_by='another-submitter' WHERE id=$1", [drawing.id]))
        .rejects.toMatchObject({ code: "P0001", message: "DEV087_REVIEW_REQUEST_IDENTITY_IMMUTABLE" });
      await expect(repository.create(database, { ...assignment, companyId: "company-two",
        requestKind: "drawing_revision", entityType: "drawing", canonicalEntityId: "drawing-other", workId: "work-illegal" }))
        .rejects.toMatchObject({ code: "P0001", message: "DEV087_REVIEW_REFERENCE_MISMATCH" });
      await expect(repository.get(database, { companyId: "company-one", requestId: "assigned" }))
        .resolves.toMatchObject({ reviewerUserId: "assigned-reviewer" });
      await database.transaction(async tx => {
        const request = await repository.get(tx, { companyId: "company-one", requestId: part.id }, true);
        expect(request?.submission?.userId).toBe("submitter");
        await repository.recordTerminalReceipt(tx, request!, { actorId: "submitter", decision: "approve" });
        await tx.execute("DELETE FROM pdm_work_review_requests WHERE id = :id", { id: part.id });
      });

      const inbox = new AsyncApprovalPlatformRepository(database);
      const scope = { companyId: "company-one", actorId: "submitter",
        readable: { drawing: true, part: true, transfer: true }, status: "all" as const, limit: 2 };
      const page = await inbox.listPrincipalSubmittedReviews(scope);
      expect(page.summary).toMatchObject({ total: 4, pending: 2 });
      expect(page.nextCursor).not.toBeNull();
      const next = await inbox.listPrincipalSubmittedReviews({ ...scope, cursor: page.nextCursor });
      expect([...page.items, ...next.items].map(item => item.id).sort())
        .toEqual([drawing.id, voided.id, part.id, "transfer-one"].sort());
      expect([...page.items, ...next.items].find(item => item.id === part.id)?.status).toBe("approved");
      const previous = await inbox.listPrincipalSubmittedReviews({ ...scope, cursor: next.previousCursor });
      expect(previous.items).toEqual(page.items);
      await expect(inbox.listPrincipalSubmittedReviews({ ...scope, query: "P-001",
        readable: { drawing: true, part: false, transfer: true } }))
        .resolves.toMatchObject({ items: [], summary: { total: 0 } });

      await raw.query(`
        INSERT INTO ai_pdm_core.approval_platform_requests
        SELECT 'transfer-' || n, 'company-one', 'transfer.package_review', 'Transfer ' || n,
               'submitter', CURRENT_TIMESTAMP + n * interval '1 second', 'pending', 'not_ready',
               jsonb_build_object('transferPackageId', 'package-' || n, 'snapshotHash', 'matched', 'reviewMode', 'shared'),
               'Pending'
        FROM generate_series(2,503) AS n;
        INSERT INTO ai_pdm_core.transfer_packages
        SELECT 'package-' || n, 'company-one', 'transfer-' || n, 'InReview', 'matched'
        FROM generate_series(2,503) AS n;
      `);
      const reviewFilter = { companyId: scope.companyId, actorId: "assigned-reviewer", principalId: "reviewer-principal",
        sharedAccess: { drawing: true, part: false, transfer: true, model: false, publishDrawing: false, publishPart: false },
        limit: 2, status: "pending" as const };
      const pending = await inbox.listPrincipalWorkReviewInbox(reviewFilter);
      expect(pending.summary).toMatchObject({ total: 506, pending: 506 });
      expect(pending.items.map(item => item.id)).toEqual(["transfer-503", "transfer-502"]);
      const nextPending = await inbox.listPrincipalWorkReviewInbox({ ...reviewFilter, cursor: pending.nextCursor });
      expect(nextPending.summary).toEqual(pending.summary);
      expect(nextPending.items.map(item => item.id)).toEqual(["transfer-501", "transfer-500"]);
      const priorPending = await inbox.listPrincipalWorkReviewInbox({ ...reviewFilter, cursor: nextPending.previousCursor });
      expect(priorPending.items).toEqual(pending.items);
      const transferDenied = await inbox.listPrincipalWorkReviewInbox({ ...reviewFilter,
        sharedAccess: { ...reviewFilter.sharedAccess, transfer: false } });
      expect(transferDenied.summary.pending).toBe(4);
    } finally {
      await database.close();
      await raw.end();
    }
  });
});
