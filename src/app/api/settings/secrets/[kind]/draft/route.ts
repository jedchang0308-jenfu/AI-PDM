import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import {
  createSettingsSecretDraft,
  listSettingsSecretStatuses,
  redactSettingsSecretReference,
  SettingsSecretLifecycleError
} from "@/lib/settings-secret-lifecycle";

export const runtime = "nodejs";

const noStoreHeaders = { "cache-control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const reference = await createSettingsSecretDraft({
      kind,
      secretValue: String(body.secretValue ?? ""),
      actorId: auth.user.id
    });
    return NextResponse.json(
      {
        reference: redactSettingsSecretReference(reference),
        secrets: await listSettingsSecretStatuses()
      },
      { status: 201, headers: noStoreHeaders }
    );
  } catch (error) {
    return secretLifecycleErrorResponse(error);
  }
}

function secretLifecycleErrorResponse(error: unknown) {
  if (error instanceof SettingsSecretLifecycleError) {
    return NextResponse.json(
      { error: error.code, message: error.message, details: error.details },
      { status: error.status, headers: noStoreHeaders }
    );
  }
  return NextResponse.json(
    { error: "SETTINGS_SECRET_DRAFT_FAILED", message: "建立 secret 草稿失敗，請稍後重試或通知 Admin。" },
    { status: 500, headers: noStoreHeaders }
  );
}
