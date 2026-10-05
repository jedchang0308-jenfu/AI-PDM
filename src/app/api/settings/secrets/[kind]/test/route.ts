import { NextResponse } from "next/server";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { principalRequestFailure } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { enqueueSettingsSecretProbe, listSettingsSecretStatuses, SettingsSecretLifecycleError } from "@/lib/settings-secret-lifecycle";

export const runtime = "nodejs";

const noStoreHeaders = { "cache-control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const access = await requireNumberingPlatformCommandAsync(request, { action: "settings.secret.manage", body });
  if (access.response) return access.response;

  const { kind: secretReferenceId } = await params;

  try {
    const probeJob = await enqueueSettingsSecretProbe({ secretReferenceId, autoActivate: body.autoActivate as boolean | undefined }, access.metadata);
    return NextResponse.json(
      { probeJob, workflow:probeJob.workflow, secrets: await listSettingsSecretStatuses() },
      { status: 202, headers: noStoreHeaders }
    );
  } catch (error) {
    return secretLifecycleErrorResponse(error);
  }
}

function secretLifecycleErrorResponse(error: unknown) {
  if (error instanceof JenfuPrincipalRequestError || error instanceof JenfuEntitlementRepositoryError) return principalRequestFailure(error);
  if (error instanceof SettingsSecretLifecycleError) {
    return NextResponse.json(
      { error: error.code, message: error.message, details: error.details },
      { status: error.status, headers: noStoreHeaders }
    );
  }
  return NextResponse.json(
    { error: "SETTINGS_SECRET_TEST_FAILED", message: "Secret 測試失敗，請稍後重試或通知 Admin。" },
    { status: 500, headers: noStoreHeaders }
  );
}
