import { checkDraftNumberingDelete, draftNumberingDeleteFingerprint } from "@/lib/draft-numbering-delete-policy";
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
  NUMBERING_BUNDLE_NOT_DRAFT: { status: 409, message: "整組圖料須處於草稿或待補狀態。" },
  NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES: { status: 409, message: "此組圖料仍有受控資料或審核紀錄。" },
  NUMBERING_DRAFT_DELETE_OPEN_SWX_ACTIVE: { status: 409, message: "此組圖料仍有未終止的 OpenSWX 工作。" },
  NUMBERING_DRAFT_DELETE_NUMBER_STILL_RESERVED: { status: 409, message: "仍有編號保留或使用紀錄。這次刪除未生效。" },
  NUMBERING_DRAFT_DELETE_STALE: { status: 409, message: "資料已更新，請重新預覽後再確認。" }
};

async function handle(request: Request, route: Route, fingerprint?: string) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return numberStateFlowJson({ code: "auth_session_invalid" }, { status: 401 });
  const rootCode = (await route.params).rootCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,32}$/u.test(rootCode)) {
    return numberStateFlowJson({ code: "NUMBERING_ROOT_INVALID" }, { status: 400 });
  }
  try {
    return await withVerifiedJenfuPrincipalRequest(await principalRequestInput(token, request), async (client, verified) => {
      const { companyId, pdmUserId } = verified.profile;
      const [draft, transfer] = await evaluatePrincipalWorkspacePermissionsInSnapshot(client, verified, [
        { permissionKind: "action", permissionCode: "numbering.draft.update", resourceGroups: ["drawing", "part"] },
        { permissionKind: "action", permissionCode: "transfer.package.update", resourceGroup: "transfer" }
      ]);
      const rd = draft?.allowed === true && draft.roleCode === "rd";
      const basis = await new AsyncNumberingRepository(client).readDraftNumberingDeleteBasis(companyId, rootCode);
      const ownActor = { userId: pdmUserId, systemAdmin: false };
      const needsAdmin = !rd || Boolean(basis && checkDraftNumberingDelete(basis, ownActor) === "NUMBERING_DRAFT_DELETE_NOT_RESPONSIBLE");
      const systemAdmin = needsAdmin && await canManageRolePolicy(client, verified);
      if (!rd && !systemAdmin) throw new Error("NUMBERING_DRAFT_DELETE_NOT_RESPONSIBLE");
      if (!basis) throw new Error("NUMBERING_DRAFT_DELETE_NOT_FOUND");
      const actor = { userId: pdmUserId, systemAdmin };
      const denial = checkDraftNumberingDelete(basis, actor);
      if (denial) throw new Error(denial);
      if (basis.transfers.length && transfer?.allowed !== true) {
        throw new Error("NUMBERING_DRAFT_DELETE_TRANSFER_PERMISSION_REQUIRED");
      }
      if (fingerprint) {
        const result = await deleteVerifiedDraftNumberingBundleInClient(client, {
          companyId, rootCode, fingerprint, actor, verified,
          transferActor: transfer?.allowed ? { userId: pdmUserId, companyId, role: "Principal",
            principalId: verified.session.principalId, principalDecision: transfer } : undefined
        });
        return numberStateFlowJson({ result });
      }
      return numberStateFlowJson({ rootCode,
        drawingNumbers: basis.drawings.map(row => row.code), partNumbers: basis.parts.map(row => row.code),
        affectedFileAssets: basis.fileIds.length,
        fileNames: basis.fileNames ?? [],
        affectedAuxiliaryJobs: basis.auxiliaryJobs?.length ?? 0,
        transferReferences: basis.transfers.map(ref => ({ packageCode: ref.packageCode, entityCode: ref.entityCode })),
        fingerprint: draftNumberingDeleteFingerprint(basis, actor) });
    }, { readOnly: !fingerprint, isolationLevel: fingerprint ? "serializable" : "repeatable_read" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const reason = Object.hasOwn(reasons, code) ? reasons[code] : undefined;
    if (reason) return numberStateFlowJson({ code, message: reason.message }, { status: reason.status });
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
