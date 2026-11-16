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
        CREATE TABLE users (id text PRIMARY KEY);
        CREATE TABLE drawing_rd_branches (id text PRIMARY KEY);
        INSERT INTO companies VALUES ('company-one'), ('company-two');
        INSERT INTO users VALUES ('submitter'), ('assigned-reviewer');
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
          requested_at timestamptz, request_status text, apply_status text, payload_json jsonb
        );
        CREATE TABLE transfer_packages (id text PRIMARY KEY, company_id text);
        INSERT INTO drawings VALUES ('drawing-one','company-one','D-001','Drawing'),
          ('drawing-other','company-two','D-OTHER','Unrelated');
        INSERT INTO part_numbers VALUES ('part-one','company-one','P-001','Part');
        INSERT INTO transfer_packages VALUES ('package-one','company-one');
        INSERT INTO approval_platform_requests VALUES ('transfer-one','company-one','transfer.package_review',
          'Transfer','submitter',CURRENT_TIMESTAMP,'approved','applied','{"transferPackageId":"package-one"}');
      `);
      await raw.query(readFileSync("db/postgres/107_dev121_shared_work_review.sql", "utf8"));
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
      await repository.create(database, { ...assignment, companyId: "company-two",
        requestKind: "drawing_revision", entityType: "drawing", canonicalEntityId: "drawing-other", workId: "work-other" });
      await repository.create(database, { ...assignment, submittedBy: "another-submitter", companyId: "company-one",
        requestKind: "drawing_revision", entityType: "drawing", canonicalEntityId: "drawing-one", workId: "work-another" });
      await expect(raw.query("UPDATE pdm_work_review_requests SET submitted_by=NULL WHERE id=$1", [drawing.id]))
        .rejects.toMatchObject({ code: "23514" });
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
    } finally {
      await database.close();
      await raw.end();
    }
  });
});
