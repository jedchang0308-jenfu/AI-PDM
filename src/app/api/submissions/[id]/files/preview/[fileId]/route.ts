import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { buildFileResponse, getStoredSubmissionFile, isPdfFile } from "@/lib/file-response";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id, fileId } = await params;
  const result = await getStoredSubmissionFile(id, fileId, auth.user);
  if (result.response) return result.response;

  if (!isPdfFile(result.file)) {
    return NextResponse.json({ error: "僅 PDF 檔案可預覽" }, { status: 415 });
  }

  return buildFileResponse({
    file: result.file,
    bytes: result.bytes,
    disposition: "inline"
  });
}
