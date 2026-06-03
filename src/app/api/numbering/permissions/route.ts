import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkNumberingPermission } from "@/lib/db";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const pages = Object.fromEntries(
    NUMBERING_PAGE_PERMISSION_CODES.map((permissionCode) => [
      permissionCode,
      checkNumberingPermission({ user: auth.user, permissionKind: "page", permissionCode }).allowed
    ])
  );
  const actions = Object.fromEntries(
    NUMBERING_ACTION_PERMISSION_CODES.map((permissionCode) => [
      permissionCode,
      checkNumberingPermission({ user: auth.user, permissionKind: "action", permissionCode }).allowed
    ])
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    pages,
    actions
  });
}
