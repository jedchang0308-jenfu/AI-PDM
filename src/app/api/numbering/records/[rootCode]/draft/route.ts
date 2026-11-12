import {
  checkDraftNumberingDelete, draftNumberingDeleteFingerprint, draftNumberingDeleteMembers,
  isResponsibleForDraftNumberingDelete, type DraftNumberingMemberTarget
} from "@/lib/draft-numbering-delete-policy";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { deleteVerifiedDraftNumberingBundleInClient } from "@/lib/numbering-async";
import { numberStateFlowJson, validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { canManageRolePolicy } from "@/lib/role-policy-service";

export const runtime = "nodejs";

type Route = { params: Promise<{ rootCode: string }> };

const reasons: Record<string, { status: number; message: string }> = {
  NUMBERING_DRAFT_DELETE_NOT_FOUND: { status: 404, message: "找不到指定的圖料根號。" },
  NUMBERING_DRAFT_DELETE_NOT_RESPONSIBLE: { status: 403, message: "整組草稿及其技轉引用須由負責人或系統管理員處理。" },
  NUMBERING_DRAFT_DELETE_TRANSFER_PERMISSION_REQUIRED: { status: 403, message: "需要技轉範圍的修改權限。" },
  NUMBERING_BUNDLE_NOT_DRAFT: { status: 409, message: "整組圖料含有非草稿資料，不能永久刪除。" },
  NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES: { status: 409, message: "此組圖料仍有受控資料或審核紀錄。" },
  NUMBERING_DRAFT_DELETE_BLOCKED: { status: 409, message: "這些資料仍被其他資料使用。" },
  NUMBERING_DRAFT_DELETE_OPEN_SWX_ACTIVE: { status: 409, message: "此組圖料仍有未終止的 OpenSWX 工作。" },
  NUMBERING_DRAFT_DELETE_NUMBER_STILL_RESERVED: { status: 409, message: "仍有編號保留或使用紀錄。這次刪除未生效。" },
  NUMBERING_DRAFT_DELETE_STALE: { status: 409, message: "資料已更新，請重新預覽後再確認。" }
};
const memberStates: Readonly<Record<string, string>> = {
  Active: "已啟用", Released: "已發行", PendingReview: "正在審核",
  PendingAdminConfirm: "等待管理員確認", Rejected: "已退回",
  Obsolete: "已作廢", Merged: "已合併", MainDrawingInvalid: "主圖已失效"
};

async function handle(request: Request, route: Route, fingerprint?: string) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return numberStateFlowJson({ code: "auth_session_invalid" }, { status: 401 });
  const rootCode = (await route.params).rootCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,32}$/u.test(rootCode)) {
    return numberStateFlowJson({ code: "NUMBERING_ROOT_INVALID" }, { status: 400 });
  }
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const code = params.get("code");
  let target: DraftNumberingMemberTarget | undefined;
  if (kind !== null || code !== null) {
    if ((kind !== "drawing" && kind !== "part") || !code || !/^[A-Z0-9-]{1,64}$/u.test(code)) {
      return numberStateFlowJson({ code: "NUMBERING_DRAFT_DELETE_INVALID_TARGET", message: "圖號或料號格式不符。" }, { status: 400 });
    }
    target = { kind, code };
  }
  try {
    return await withVerifiedJenfuPrincipalRequest(await principalRequestInput(token, request), async (client, verified) => {
      const { companyId, pdmUserId } = verified.profile;
      const [draft, transfer] = await evaluatePrincipalWorkspacePermissionsInSnapshot(client, verified, [
        { permissionKind: "action", permissionCode: "numbering.draft.update", resourceGroups: ["drawing", "part"] },
        { permissionKind: "action", permissionCode: "transfer.package.update", resourceGroup: "transfer" }
      ]);
      const rd = draft?.allowed === true && draft.roleCode === "rd";
      const repository = new AsyncNumberingRepository(client);
      const basis = target
        ? await repository.readDraftNumberingDeleteBasis(companyId, rootCode, target)
        : await repository.readDraftNumberingDeleteBasis(companyId, rootCode);
      const needsAdmin = !rd || Boolean(basis && !isResponsibleForDraftNumberingDelete(basis, pdmUserId));
      const systemAdmin = needsAdmin && await canManageRolePolicy(client, verified);
      if (!rd && !systemAdmin) {
        return numberStateFlowJson({ code: "NUMBERING_DRAFT_DELETE_NOT_RESPONSIBLE",
          message: "需要研發草稿修改權限或系統管理員權限，才能永久刪除。" }, { status: 403 });
      }
      if (!basis) return numberStateFlowJson({ code: "NUMBERING_DRAFT_DELETE_NOT_FOUND",
        message: target ? "找不到這筆圖號或料號，或它已不屬於這個根號。" : reasons.NUMBERING_DRAFT_DELETE_NOT_FOUND.message }, { status: 404 });
      const actor = { userId: pdmUserId, systemAdmin };
      const denial = checkDraftNumberingDelete(basis, actor);
      if (denial) {
        const messages = denial === "NUMBERING_BUNDLE_NOT_DRAFT"
          ? draftNumberingDeleteMembers(basis)
            .filter(member => !["Draft", "NeedInfo"].includes(member.status))
            .map(member => memberStates[member.status]
              ? member.code + " " + memberStates[member.status] + "，無法永久刪除。"
              : member.code + " 的資料狀態不允許永久刪除。")
          : denial === "NUMBERING_DRAFT_DELETE_BLOCKED" ? basis.blockers
          : denial === "NUMBERING_DRAFT_DELETE_NOT_RESPONSIBLE" && target
            ? ["只有這筆資料的負責人或系統管理員可以永久刪除。"]
          : denial === "NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES" ? [
            ...(basis.controlledReasons ?? []),
            ...basis.transfers.filter(ref => ref.packageStatus !== "Draft")
              .map(ref => "技術移轉 " + ref.packageCode + " 仍引用 " + ref.entityCode + "。")
          ] : null;
        if (messages?.length) return numberStateFlowJson({ code: denial, message: messages.join(" ") }, { status: reasons[denial].status });
        throw new Error(denial);
      }
      if (basis.transfers.length && transfer?.allowed !== true) {
        throw new Error("NUMBERING_DRAFT_DELETE_TRANSFER_PERMISSION_REQUIRED");
      }
      if (fingerprint) {
        const result = await deleteVerifiedDraftNumberingBundleInClient(client, {
          companyId, rootCode, fingerprint, actor, verified, ...(target ? { target } : {}),
          transferActor: transfer?.allowed ? { userId: pdmUserId, companyId, role: "Principal",
            principalId: verified.session.principalId, principalDecision: transfer } : undefined
        });
        return numberStateFlowJson({ result });
      }
      return numberStateFlowJson({ rootCode, ...(target ? { target } : {}), numberReuse: basis.numberReuse,
        drawingNumbers: basis.drawings.map(row => row.code), partNumbers: basis.parts.map(row => row.code),
        affectedFileAssets: basis.fileIds.length,
        fileNames: basis.fileNames ?? [],
        affectedAuxiliaryJobs: basis.auxiliaryJobs?.length ?? 0,
        affectedRecognitionSessions: basis.recognitionSessions?.length ?? 0,
        transferReferences: basis.transfers.map(ref => ({ packageCode: ref.packageCode, entityCode: ref.entityCode })),
        fingerprint: draftNumberingDeleteFingerprint(basis, actor) });
    }, { readOnly: !fingerprint, isolationLevel: fingerprint ? "serializable" : "repeatable_read" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const reason = Object.hasOwn(reasons, code) ? reasons[code] : undefined;
    if (reason) return numberStateFlowJson({ code, message: reason.message }, { status: reason.status });
    const sqlCode = (error as { code?: unknown } | null)?.code;
    if (sqlCode === "23503" || sqlCode === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return numberStateFlowJson({ code: "NUMBERING_DRAFT_DELETE_BLOCKED",
        message: "有其他資料仍引用這筆資料，刪除未生效。請重新載入後查看範圍。" }, { status: 409 });
    }
    return principalRequestFailure(error);
  }
}

export function GET(request: Request, route: Route) {
  return handle(request, route);
}

export async function DELETE(request: Request, route: Route) {
  const invalid = validateNumberStateMutationRequest({ request });
  if (invalid) return invalid;
  const body = await request.json().catch(() => null);
  if (body?.confirmDelete !== true || typeof body.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(body.fingerprint)) {
    return numberStateFlowJson({ code: "NUMBERING_DRAFT_DELETE_CONFIRMATION_REQUIRED", message: "請先預覽並確認刪除範圍。" }, { status: 400 });
  }
  return handle(request, route, body.fingerprint);
}
