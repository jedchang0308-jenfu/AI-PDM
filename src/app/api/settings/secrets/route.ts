import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { listSettingsSecretStatuses, SettingsSecretLifecycleError } from "@/lib/settings-secret-lifecycle";

export const runtime = "nodejs";

const noStoreHeaders = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json({ secrets: await listSettingsSecretStatuses() }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof SettingsSecretLifecycleError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.status, headers: noStoreHeaders }
      );
    }
    return NextResponse.json(
      { error: "SETTINGS_SECRET_STATUS_FAILED", message: "讀取 secret 狀態失敗，請稍後重試或通知 Admin。" },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
