import { afterAll, describe, expect, it } from "vitest";
import { PostgresAsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuEntitlementRepository } from "@/lib/repositories/jenfu-entitlement-repository";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { selectPrincipalReviewerIdentityInSnapshot } from "@/lib/repositories/pdm-principal-reviewer-selector";

const connectionString = process.env.DEV057_CONTRACT_POSTGRES_URL;
const phase = process.env.DEV057_CONTRACT_PHASE;
const expectedVersion = process.env.DEV057_CONTRACT_VERSION;
const phases = ["assigned", "revoked", "out-of-scope", "restored"];
const active = Boolean(connectionString && expectedVersion && phase && phases.includes(phase));

const database = active ? new PostgresAsyncDatabaseClient({
  kind: "postgres",
  connectionString,
  applicationName: "ai-pdm-dev057-contract-consumer",
  searchPath: "ai_pdm_core,pg_catalog",
  maxConnections: 1
}) : null;

afterAll(async () => { await database?.close(); });

describe.runIf(active)("OrgMaster v3 published grant → AI-PDM PostgreSQL consumer", () => {
  it("enforces the published assignment, revocation, and workspace scope as the runtime reader", async () => {
    if (!database) throw new Error("DEV057_CONTRACT_POSTGRES_URL_REQUIRED");
    const [session] = await database.query<{ current_user: string }>("SELECT current_user");
    expect(session.current_user).toBe("dev057_ai_pdm_consumer_probe");

    const actor = {
      identityIssuer: "issuer-legacy",
      identitySubject: "subject-legacy",
      principalId: "principal-legacy",
      employeeId: "employee-legacy",
      localPrincipalId: "qc-profile-legacy",
      companyId: "company-jenfu",
      sessionSchemaVersion: 2 as const
    };
    const repository = new JenfuEntitlementRepository(database);
    const assignments = await repository.listEffectiveAssignments(actor);
    expect(assignments).toHaveLength(phase === "revoked" ? 0 : 1);
    if (phase !== "revoked") {
      expect(assignments[0]).toMatchObject({
        assignmentVersionId: expectedVersion,
        principalId: actor.principalId,
        employeeId: actor.employeeId,
        stableRoleId: "role-rd-manager",
        roleCode: "rd_manager",
        scopeKind: "workspace",
        scopeKey: phase === "out-of-scope" ? "company-other" : "company-jenfu"
      });
    }

    const decision = repository.evaluatePermission({
      actor,
      rolePriority: ["rd_manager"],
      permissionKind: "page",
      permissionCode: "numbering.request",
      workspaceCode: "company-jenfu"
    });
    if (phase === "revoked") {
      await expect(decision).rejects.toMatchObject({ code: "entitlement_assignment_not_found" });
    } else if (phase === "out-of-scope") {
      await expect(decision).rejects.toMatchObject({ code: "entitlement_scope_mismatch" });
    } else {
      await expect(decision).resolves.toMatchObject({
        decisionCode: "allowed",
        assignment: { assignmentVersionId: expectedVersion, principalId: actor.principalId }
      });
    }

    const catalogRows = await database.query<{ stable_role_id: string }>(`
      SELECT stable_role_id FROM ai_pdm_contract.v_application_role_catalog_v1
      ORDER BY display_order`);
    expect(catalogRows).toHaveLength(9);
    const normalConsumer = () => database.transaction((snapshot) =>
      evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, {
        profile: { pdmUserId: "qc-profile-legacy", companyId: "company-jenfu" },
        session: {
          contractVersion: "jenfu.ai-pdm-session.v2", appId: "ai-pdm",
          sessionId: "dev057-contract-session", identityIssuer: actor.identityIssuer,
          identitySubject: actor.identitySubject, principalId: actor.principalId,
          employeeId: actor.employeeId, authEpoch: 1, profileVersion: 1,
          issuedAt: "2026-09-29T00:00:00.000Z", expiresAt: "2026-09-30T00:00:00.000Z",
          assuranceLevel: "aal2"
        }
      }, [
        { permissionKind: "page", permissionCode: "numbering.request" },
        { permissionKind: "action", permissionCode: "transfer.package.review.submit" }
      ]),
    { readOnly: true, isolationLevel: "repeatable_read" });
    if (phase === "revoked") {
      await expect(normalConsumer()).rejects.toMatchObject({ code: "entitlement_assignment_not_found" });
    } else {
      await expect(normalConsumer()).resolves.toMatchObject([
        { allowed: phase !== "out-of-scope",
          decisionCode: phase === "out-of-scope" ? "entitlement_scope_mismatch" : "allowed",
          principalId: actor.principalId },
        { allowed: phase !== "out-of-scope",
          permissionCode: "transfer.package.review.submit",
          decisionCode: phase === "out-of-scope" ? "entitlement_scope_mismatch" : "allowed",
          principalId: actor.principalId }
      ]);
    }

    const reviewer = () => database.transaction((snapshot) =>
      selectPrincipalReviewerIdentityInSnapshot(snapshot, {
        companyId: "company-jenfu", ownerUserId: "qc-owner-profile"
      }), { readOnly: true, isolationLevel: "repeatable_read" });
    if (phase === "revoked") {
      await expect(reviewer()).rejects.toMatchObject({ status: 409 });
    } else if (phase === "out-of-scope") {
      // The selector deliberately hides the grant's internal scope reason.
      await expect(reviewer()).rejects.toMatchObject({ status: 409,
        code: "WORKBENCH_BAD_REQUEST" });
    } else {
      await expect(reviewer()).resolves.toEqual({
        principalId: "principal-legacy", profileId: "qc-profile-legacy"
      });
    }
  });
});
