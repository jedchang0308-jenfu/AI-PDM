import { requireAuthAsync } from "@/lib/auth-async";
import { checkNumberingPermissionsAsync } from "@/lib/numbering-permission-async";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";
import { numberStateFlowJson } from "@/lib/number-state-flow-api";
import { numberingUserScopeFromVerifiedSession } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const user = numberingUserScopeFromVerifiedSession(auth.user, auth.session);
  const inputs = [
    ...NUMBERING_PAGE_PERMISSION_CODES.map((permissionCode) => ({ user, permissionKind: "page" as const, permissionCode, workspaceCode: user.company_id })),
    ...NUMBERING_ACTION_PERMISSION_CODES.map((permissionCode) => ({ user, permissionKind: "action" as const, permissionCode, workspaceCode: user.company_id }))
  ];
  const results = await checkNumberingPermissionsAsync(inputs);
  const pages = Object.fromEntries(NUMBERING_PAGE_PERMISSION_CODES.map((permissionCode, index) => [permissionCode, results[index]?.allowed ?? false]));
  const actionsOffset = NUMBERING_PAGE_PERMISSION_CODES.length;
  const actions = Object.fromEntries(NUMBERING_ACTION_PERMISSION_CODES.map((permissionCode, index) => [permissionCode, results[actionsOffset + index]?.allowed ?? false]));

  return numberStateFlowJson({
    generatedAt: new Date().toISOString(),
    pages,
    actions
  });
}
