import { NextResponse } from "next/server";
import { listDriveFolders } from "@/lib/gdrive";
import { authorizePrincipalWorkspaceExternalRead } from "@/lib/principal-company-read";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizePrincipalWorkspaceExternalRead(request,
    "src/app/api/settings/gdrive/folders/route.ts", "settings.integration.manage");
  if (authorization instanceof Response) return authorization;

  const url = new URL(request.url);
  const parentId = url.searchParams.get("parentId")?.trim() || "root";

  try {
    const folders = await listDriveFolders(parentId);
    return NextResponse.json({ parentId, folders },
      { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        error: "GDRIVE_FOLDER_LIST_FAILED",
        message: safeDriveErrorMessage(error)
      },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}

function safeDriveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("GOOGLE_SERVICE_ACCOUNT_KEY_PATH")) return "Google Drive service account is not configured.";
  if (message.includes("Service account key file not found")) return "Google Drive service account key file is not available.";
  return "Google Drive folder list could not be loaded.";
}
