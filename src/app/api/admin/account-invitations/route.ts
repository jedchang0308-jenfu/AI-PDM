import { NextResponse } from "next/server";
import {
  AccountInvitationError,
  createAccountInvitationAsync,
  listAccountInvitationsAsync,
  revokeAccountInvitationAsync
} from "@/lib/account-invitations";
import { requireRoleAsync } from "@/lib/auth-async";
import { getAuthMode, type UserRole } from "@/lib/auth-config";
import { createFirebaseManagedInvitation, revokeFirebaseManagedInvitation } from "@/lib/firebase-managed-invitations";

export const runtime = "nodejs";

function invitationError(error: unknown) {
  if (error instanceof AccountInvitationError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "account_invitation_failed", message: "邀請處理失敗，請稍後重試。" }, { status: 500 });
}

function invitationBaseUrl(request: Request) {
  const configured = process.env.PDM_PUBLIC_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // The production branch below reports the invalid canonical URL.
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new AccountInvitationError(
      "invitation_public_url_not_configured",
      "正式環境尚未設定有效的 PDM_PUBLIC_BASE_URL，請完成網址設定後再建立邀請。",
      503
    );
  }
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const auth = await requireRoleAsync(request, ["Admin"]);
  if (auth.response) return auth.response;

  try {
    return NextResponse.json({ invitations: await listAccountInvitationsAsync() });
  } catch (error) {
    return invitationError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireRoleAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response;

  const body = await request.json().catch(() => ({}));
  try {
    if (getAuthMode() === "firebase_bff") {
      const created = await createFirebaseManagedInvitation({
        email: String(body.email ?? ""),
        displayName: String(body.displayName ?? body.display_name ?? ""),
        role: String(body.role ?? "") as UserRole,
        expiresInDays: body.expiresInDays === undefined ? undefined : Number(body.expiresInDays),
        reissueInvitationId: typeof body.reissueInvitationId === "string" && body.reissueInvitationId.trim()
          ? body.reissueInvitationId.trim()
          : undefined,
        invitedBy: auth.user.id
      });
      return NextResponse.json(created, { status: 201 });
    }
    const created = await createAccountInvitationAsync({
      email: String(body.email ?? ""),
      displayName: String(body.displayName ?? body.display_name ?? ""),
      role: String(body.role ?? "") as UserRole,
      expiresInDays: body.expiresInDays === undefined ? undefined : Number(body.expiresInDays),
      invitedBy: auth.user.id
    });
    const inviteUrl = new URL("/invite/accept", invitationBaseUrl(request));
    inviteUrl.searchParams.set("token", created.token);
    return NextResponse.json({ invitation: created.invitation, inviteUrl: inviteUrl.toString(), delivery: "manual_email" }, { status: 201 });
  } catch (error) {
    return invitationError(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRoleAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (String(body.action ?? "") !== "revoke") {
    return NextResponse.json({ error: "invalid_invitation_action", message: "目前只支援撤銷邀請。" }, { status: 400 });
  }

  try {
    const revokeInput = {
      invitationId: String(body.invitationId ?? body.invitation_id ?? ""),
      revokedBy: auth.user.id
    };
    const invitation = getAuthMode() === "firebase_bff"
      ? await revokeFirebaseManagedInvitation(revokeInput)
      : await revokeAccountInvitationAsync(revokeInput);
    return NextResponse.json({ invitation });
  } catch (error) {
    return invitationError(error);
  }
}
