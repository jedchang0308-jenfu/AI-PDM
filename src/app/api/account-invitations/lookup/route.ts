import { NextResponse } from "next/server";
import { AccountInvitationError, lookupAccountInvitationAsync } from "@/lib/account-invitations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    const invitation = await lookupAccountInvitationAsync(token);
    return NextResponse.json({ invitation });
  } catch (error) {
    if (error instanceof AccountInvitationError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
    }
    return NextResponse.json({ error: "account_invitation_lookup_failed", message: "邀請資料暫時無法讀取，請稍後重試。" }, { status: 500 });
  }
}
