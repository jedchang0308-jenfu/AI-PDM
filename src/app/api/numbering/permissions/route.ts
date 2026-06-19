import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { checkNumberingPermissionAsync } from "@/lib/numbering-permission-async";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const pages = Object.fromEntries(
    await Promise.all(NUMBERING_PAGE_PERMISSION_CODES.map(async (permissionCode) => [
      permissionCode,
      (await checkNumberingPermissionAsync({ user: auth.user, permissionKind: "page", permissionCode })).allowed
    ]))
  );
  const actions = Object.fromEntries(
    await Promise.all(NUMBERING_ACTION_PERMISSION_CODES.map(async (permissionCode) => [
      permissionCode,
      (await checkNumberingPermissionAsync({ user: auth.user, permissionKind: "action", permissionCode })).allowed
    ]))
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    pages,
    actions
  });
}
