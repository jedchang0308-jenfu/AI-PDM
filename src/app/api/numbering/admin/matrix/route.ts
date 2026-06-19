import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-async";
import {
  applyNumberingRuleTemplateAsync,
  listNumberingAdminMatrixAsync,
  revokeNumberingApprovalDelegationAsync,
  revokeNumberingUserRoleAssignmentAsync,
  saveNumberingRolePriorityAsync,
  upsertNumberingAdminRoleAsync,
  upsertNumberingApprovalDelegationAsync,
  upsertNumberingApprovalRuleAsync,
  upsertNumberingRolePermissionAsync,
  upsertNumberingRoleScopeAsync,
  upsertNumberingUserRoleAssignmentAsync
} from "@/lib/numbering-async";
import {
  type NumberingRoleScopeKind
} from "@/lib/repositories/numbering-repository";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "settings.admin_matrix");
  if (auth.response) return auth.response;
  if (auth.user.role !== "Admin") return forbidden();

  return NextResponse.json(await listNumberingAdminMatrixAsync());
}

export async function PATCH(request: Request) {
  const auth = await requireNumberingActionAsync(request, "settings.admin_matrix");
  if (auth.response) return auth.response;
  if (auth.user.role !== "Admin") return forbidden();

  const body = await request.json().catch(() => ({}));
  try {
    const operation = String(body.operation ?? body.type ?? "approval_rule");
    if (operation === "role") {
      const role = await upsertNumberingAdminRoleAsync({
        id: typeof body.id === "string" ? body.id : undefined,
        roleCode: String(body.roleCode ?? body.role_code ?? ""),
        title: String(body.title ?? ""),
        actorId: auth.user.id
      });
      return NextResponse.json({ role });
    }
    if (operation === "role_permission") {
      const permissionKind = String(body.permissionKind ?? body.permission_kind ?? "");
      if (permissionKind !== "page" && permissionKind !== "action") {
        return NextResponse.json({ error: "permissionKind must be page or action" }, { status: 400 });
      }
      const permission = await upsertNumberingRolePermissionAsync({
        roleId: typeof body.roleId === "string" ? body.roleId : undefined,
        roleCode: typeof body.roleCode === "string" ? body.roleCode : undefined,
        permissionKind,
        permissionCode: String(body.permissionCode ?? body.permission_code ?? ""),
        allowed: body.allowed === undefined ? true : Boolean(body.allowed),
        actorId: auth.user.id
      });
      return NextResponse.json({ permission });
    }
    if (operation === "role_scope") {
      const scopeKind = String(body.scopeKind ?? body.scope_kind ?? "");
      if (scopeKind !== "department" && scopeKind !== "project" && scopeKind !== "action") {
        return NextResponse.json({ error: "scopeKind must be department, project, or action" }, { status: 400 });
      }
      const scope = await upsertNumberingRoleScopeAsync({
        roleId: typeof body.roleId === "string" ? body.roleId : undefined,
        roleCode: typeof body.roleCode === "string" ? body.roleCode : undefined,
        scopeKind: scopeKind as NumberingRoleScopeKind,
        scopeCode: String(body.scopeCode ?? body.scope_code ?? ""),
        allowed: body.allowed === undefined ? true : Boolean(body.allowed),
        actorId: auth.user.id
      });
      return NextResponse.json({ scope });
    }
    if (operation === "role_assignment") {
      const assignment = await upsertNumberingUserRoleAssignmentAsync({
        id: typeof body.id === "string" ? body.id : undefined,
        userId: String(body.userId ?? body.user_id ?? ""),
        roleId: typeof body.roleId === "string" ? body.roleId : undefined,
        roleCode: typeof body.roleCode === "string" ? body.roleCode : undefined,
        reason: String(body.reason ?? ""),
        actorId: auth.user.id
      });
      return NextResponse.json({ assignment });
    }
    if (operation === "revoke_role_assignment") {
      const assignment = await revokeNumberingUserRoleAssignmentAsync({
        id: String(body.id ?? ""),
        actorId: auth.user.id,
        reason: typeof body.reason === "string" ? body.reason : undefined
      });
      return NextResponse.json({ assignment });
    }
    if (operation === "role_priority") {
      const priority = Array.isArray(body.priority) ? body.priority.map((item: unknown) => String(item)) : String(body.priority ?? "").split(",");
      const version = await saveNumberingRolePriorityAsync({
        priority,
        reason: String(body.reason ?? ""),
        actorId: auth.user.id
      });
      return NextResponse.json({ version });
    }
    if (operation === "delegation") {
      const delegation = await upsertNumberingApprovalDelegationAsync({
        id: typeof body.id === "string" ? body.id : undefined,
        delegatedFrom: String(body.delegatedFrom ?? body.delegated_from ?? ""),
        delegatedTo: String(body.delegatedTo ?? body.delegated_to ?? ""),
        projectCode: typeof body.projectCode === "string" ? body.projectCode : typeof body.project_code === "string" ? body.project_code : undefined,
        actionCode: typeof body.actionCode === "string" ? body.actionCode : typeof body.action_code === "string" ? body.action_code : undefined,
        startsAt: typeof body.startsAt === "string" ? body.startsAt : typeof body.starts_at === "string" ? body.starts_at : undefined,
        endsAt: typeof body.endsAt === "string" ? body.endsAt : typeof body.ends_at === "string" ? body.ends_at : undefined,
        reason: String(body.reason ?? ""),
        actorId: auth.user.id
      });
      return NextResponse.json({ delegation });
    }
    if (operation === "revoke_delegation") {
      const delegation = await revokeNumberingApprovalDelegationAsync({
        id: String(body.id ?? ""),
        actorId: auth.user.id,
        reason: typeof body.reason === "string" ? body.reason : undefined
      });
      return NextResponse.json({ delegation });
    }

    const rule = await upsertNumberingApprovalRuleAsync({
      id: typeof body.id === "string" ? body.id : undefined,
      ruleVersionId: typeof body.ruleVersionId === "string" ? body.ruleVersionId : undefined,
      ruleName: String(body.ruleName ?? ""),
      actionCode: String(body.actionCode ?? ""),
      phase: typeof body.phase === "string" ? body.phase : undefined,
      recordStatus: typeof body.recordStatus === "string" ? body.recordStatus : undefined,
      itemKind: typeof body.itemKind === "string" ? body.itemKind : undefined,
      riskFlag: typeof body.riskFlag === "string" ? body.riskFlag : undefined,
      requiresApproval: Boolean(body.requiresApproval),
      approverRole: typeof body.approverRole === "string" ? body.approverRole : undefined,
      blocksUsage: Boolean(body.blocksUsage),
      blocksRelease: Boolean(body.blocksRelease),
      showsWarning: body.showsWarning === undefined ? true : Boolean(body.showsWarning),
      exportMarker: body.exportMarker === undefined ? true : Boolean(body.exportMarker),
      actorId: auth.user.id
    });
    return NextResponse.json({ rule });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Approval rule update failed" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "settings.admin_matrix");
  if (auth.response) return auth.response;
  if (auth.user.role !== "Admin") return forbidden();

  const body = await request.json().catch(() => ({}));
  const templateCode = String(body.templateCode ?? body.template_code ?? "").trim();
  if (templateCode !== "rd_efficiency" && templateCode !== "standard_control" && templateCode !== "strict_control") {
    return NextResponse.json({ error: "templateCode must be rd_efficiency, standard_control, or strict_control" }, { status: 400 });
  }

  try {
    return NextResponse.json(await applyNumberingRuleTemplateAsync({ templateCode, actorId: auth.user.id }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Approval rule template apply failed" }, { status: 400 });
  }
}
