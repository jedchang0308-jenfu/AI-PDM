import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listDriveFolders } from "@/lib/gdrive";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireRole(request, ["Admin"]);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const parentId = url.searchParams.get("parentId")?.trim() || "root";

  try {
    const folders = await listDriveFolders(parentId);
    return NextResponse.json({ parentId, folders });
  } catch (error) {
    return NextResponse.json(
      {
        error: "GDRIVE_FOLDER_LIST_FAILED",
        message: safeDriveErrorMessage(error)
      },
      { status: 503 }
    );
  }
}

function safeDriveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("GOOGLE_SERVICE_ACCOUNT_KEY_PATH")) return "Google Drive service account is not configured.";
  if (message.includes("Service account key file not found")) return "Google Drive service account key file is not available.";
  return "Google Drive folder list could not be loaded.";
}
