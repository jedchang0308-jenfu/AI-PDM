import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { evaluatePrincipalResourcePermissionsInSnapshot,
  evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { canonicalCapabilityGroups, isDynamicRolePolicyInSnapshot,
  type PrincipalCapabilityGroup } from "@/lib/principal-resource-capability";
import { submissionFileCapabilityGroups, type SubmissionFileCapabilitySource } from "@/lib/principal-submission-file-capability";

export type PrincipalSubmissionResource = { company_id: string; submitted_by: string; project_code: string; status: string;
  externalAssignmentId?: string };
export type PrincipalSubmissionListScope = { submittedBy?: string; visibleSubmissionIds?: string[] };

type SubmissionCapabilityRow = SubmissionFileCapabilitySource & {
  submission_id: string;
  project_code: string;
  member_id: string | null;
};

type SubmissionCapabilityRecord = {
  id: string;
  projectCode: string;
  groups: PrincipalCapabilityGroup[];
};

function denied(code: string): Response {
  const response = jenfuEntitlementFailureResponse(code);
  response.headers.set("x-jenfu-principal-historical", "1");
  return response;
}

/** The same published grant and selected role constrain list, search, and detail reads. */
export async function authorizePrincipalSubmissionListInSnapshot(
  snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest
): Promise<Response | PrincipalSubmissionListScope> {
  if (await isDynamicRolePolicyInSnapshot(snapshot)) {
    const candidates = await loadSubmissionCapabilityRecords(snapshot, verified.profile.companyId);
    const visible = await filterVisibleSubmissionIds(snapshot, verified, candidates);
    if (visible instanceof Response) return visible;
    return { visibleSubmissionIds: visible };
  }
  const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
    [{ permissionKind: "action", permissionCode: "submission.view" }]);
  const decision = decisions[0];
  if (decisions.length !== 1 || !decision || decision.permissionCode !== "submission.view" ||
      decision.principalId !== verified.session.principalId) {
    return Response.json({ code: "principal_dependency_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!decision.allowed) return denied(decision.decisionCode);
  const role = decision.roleCode;
  if (role !== "rd" && role !== "rd_manager" && role !== "pdm_admin" && role !== "system_admin") {
    return Response.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  return { submittedBy: role === "rd" ? verified.profile.pdmUserId : undefined };
}

/** Authorize the published Principal and historical profile relation before any detail or file read. */
export async function authorizePrincipalSubmissionReadInSnapshot(
  snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, id: string,
  options: { shareId?: string } = {}
): Promise<Response | PrincipalSubmissionResource> {
  const resource = await snapshot.queryOne<PrincipalSubmissionResource>(
    "SELECT company_id, submitted_by, project_code, status FROM ai_pdm_core.submissions WHERE id=:id", { id });
  if (!resource || !resource.company_id || resource.company_id !== verified.profile.companyId) {
    return Response.json({ error: "submission_not_found" }, { status: 404 });
  }
  if (await isDynamicRolePolicyInSnapshot(snapshot)) {
    const candidates = await loadSubmissionCapabilityRecords(snapshot, verified.profile.companyId, id);
    const candidate = candidates.find(item => item.id === id);
    if (!candidate?.groups.length) {
      return Response.json({ code: "principal_resource_group_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    const decisions = await evaluatePrincipalResourcePermissionsInSnapshot(snapshot, verified,
      candidate.groups.map(group => ({ permissionKind: "action" as const, permissionCode: `pdm.${group}.view` })),
      { workspaceCode: verified.profile.companyId, projectCode: resource.project_code.trim() || null });
    if (decisions.length !== candidate.groups.length || decisions.some((decision, index) =>
      !decision || decision.principalId !== verified.session.principalId ||
      decision.permissionCode !== `pdm.${candidate.groups[index]}.view`)) {
      return Response.json({ code: "principal_dependency_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    const denial = decisions.find(decision => !decision.allowed);
    if (denial) return denied(denial.decisionCode);
    const roleCodes = new Set(decisions.map(decision => decision.roleCode).filter((role): role is string => !!role));
    const role = roleCodes.has("external_specialist") ? "external_specialist" : null;
    if (role === "external_specialist") {
      if (!options.shareId || resource.status !== "Released" || !resource.project_code.trim()) {
        return denied("permission_not_granted");
      }
      const shared = await snapshot.queryOne<{ id: string }>(
        "SELECT id FROM ai_pdm_core.readonly_shares WHERE id=:shareId AND submission_id=:submissionId" +
        " AND project_scope_key=:projectCode AND revoked_at IS NULL AND expires_at > transaction_timestamp()",
        { shareId: options.shareId, submissionId: id, projectCode: resource.project_code.trim() });
      if (!shared || shared.id !== options.shareId) return denied("permission_not_granted");
      const assignmentId = decisions.find(decision => decision.roleCode === 'external_specialist')?.assignmentId;
      if (!assignmentId) return Response.json({ code: 'principal_dependency_unavailable' },
        { status: 503, headers: { 'cache-control': 'private, no-store' } });
      return { ...resource, externalAssignmentId: assignmentId };
    }
    return resource;
  }
  const decisions = await evaluatePrincipalResourcePermissionsInSnapshot(snapshot, verified,
    [{ permissionKind: "action", permissionCode: "submission.view" }],
    { workspaceCode: verified.profile.companyId, projectCode: resource.project_code.trim() || null });
  const decision = decisions[0];
  if (decisions.length !== 1 || !decision || decision.permissionCode !== "submission.view" ||
      decision.principalId !== verified.session.principalId) {
    return Response.json({ code: "principal_dependency_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!decision.allowed) return denied(decision.decisionCode);
  if (!["rd", "rd_manager", "pdm_admin", "system_admin", "external_specialist"].includes(decision.roleCode ?? "")) {
    return Response.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (decision.roleCode === "external_specialist") {
    if (!options.shareId || resource.status !== "Released" || !resource.project_code.trim()) {
      return denied("permission_not_granted");
    }
    const shared = await snapshot.queryOne<{ id: string }>(
      "SELECT id FROM ai_pdm_core.readonly_shares WHERE id=:shareId AND submission_id=:submissionId" +
      " AND project_scope_key=:projectCode AND revoked_at IS NULL AND expires_at > transaction_timestamp()",
      { shareId: options.shareId, submissionId: id, projectCode: resource.project_code.trim() });
    if (!shared || shared.id !== options.shareId) return denied("permission_not_granted");
  }
  if (decision.roleCode === "rd" && resource.submitted_by !== verified.profile.pdmUserId) {
    return denied("permission_not_granted");
  }
  return resource;
}

async function loadSubmissionCapabilityRecords(
  snapshot: AsyncDatabaseClient, companyId: string, submissionId?: string
): Promise<SubmissionCapabilityRecord[]> {
  const schema = snapshot.kind === "postgres" ? "ai_pdm_core." : "";
  const rows = await snapshot.query<SubmissionCapabilityRow>(`
    SELECT s.id AS submission_id,s.project_code,s.source_entity_type,
           f.id AS member_id,f.file_role,
           a.linked_entity_type,a.document_category
    FROM ${schema}submissions s
    LEFT JOIN ${schema}submission_files f ON f.submission_id=s.id
    LEFT JOIN ${schema}file_assets a ON a.id=COALESCE(f.source_file_asset_id,f.source_master_attachment_id)
    WHERE s.company_id=:companyId AND (CAST(:submissionId AS text) IS NULL OR s.id=CAST(:submissionId AS text))
    ORDER BY s.id,f.id`, { companyId, submissionId: submissionId ?? null });
  const byId = new Map<string, SubmissionCapabilityRecord & { sourceType: string | null; invalid: boolean; hasMember: boolean }>();
  for (const row of rows) {
    let record = byId.get(row.submission_id);
    if (!record) {
      const sourceType = row.source_entity_type ?? null;
      const parentGroups = sourceType === null ? [] : canonicalCapabilityGroups(sourceType);
      record = { id: row.submission_id, projectCode: row.project_code ?? "", groups: [...parentGroups],
        sourceType, invalid: sourceType !== null && parentGroups.length === 0, hasMember: false };
      byId.set(row.submission_id, record);
    } else if (record.sourceType !== (row.source_entity_type ?? null) || record.projectCode !== (row.project_code ?? "")) {
      record.invalid = true;
    }
    if (!row.member_id) continue;
    record.hasMember = true;
    const memberGroups = submissionFileCapabilityGroups({ ...row, id: row.member_id,
      file_role: row.file_role ?? "" });
    if (!memberGroups.length) record.invalid = true;
    record.groups = [...new Set([...record.groups, ...memberGroups])];
  }
  return [...byId.values()].filter(record => !record.invalid && record.groups.length > 0 &&
    (record.sourceType !== null || record.hasMember)).map(({ id, projectCode, groups }) => ({ id, projectCode, groups }));
}

async function filterVisibleSubmissionIds(
  snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, candidates: SubmissionCapabilityRecord[]
): Promise<string[] | Response> {
  const byProject = new Map<string, Set<PrincipalCapabilityGroup>>();
  for (const candidate of candidates) {
    const projectKey = candidate.projectCode.trim();
    const groups = byProject.get(projectKey) ?? new Set<PrincipalCapabilityGroup>();
    candidate.groups.forEach(group => groups.add(group));
    byProject.set(projectKey, groups);
  }
  const allowedByProject = new Map<string, Set<PrincipalCapabilityGroup>>();
  for (const [projectKey, groups] of byProject) {
    const permissions = [...groups].map(group => ({ permissionKind: "action" as const,
      permissionCode: `pdm.${group}.view` }));
    const decisions = await evaluatePrincipalResourcePermissionsInSnapshot(snapshot, verified, permissions,
      { workspaceCode: verified.profile.companyId, projectCode: projectKey || null });
    if (decisions.length !== permissions.length || decisions.some((decision, index) =>
      !decision || decision.principalId !== verified.session.principalId ||
      decision.permissionCode !== permissions[index].permissionCode)) {
      return Response.json({ code: "principal_dependency_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    if (decisions.some(decision => decision.allowed && decision.roleCode === "external_specialist")) {
      return denied("permission_not_granted");
    }
    const allowed = new Set<PrincipalCapabilityGroup>();
    decisions.forEach((decision, index) => { if (decision.allowed) allowed.add([...groups][index]); });
    allowedByProject.set(projectKey, allowed);
  }
  return candidates.filter(candidate => {
    const allowed = allowedByProject.get(candidate.projectCode.trim());
    return !!allowed && candidate.groups.every(group => allowed.has(group));
  }).map(candidate => candidate.id);
}
