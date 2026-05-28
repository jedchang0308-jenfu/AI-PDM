import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSubmission, getSubmissionFile, type DbUser } from "@/lib/db";
import { canReadSubmission } from "@/lib/permissions";
import type { SubmissionFile } from "@/lib/types";

export async function getStoredSubmissionFile(submissionId: string, fileId: string, user: DbUser) {
  const submission = getSubmission(submissionId);
  if (!submission) {
    return { response: NextResponse.json({ error: "找不到送審資料" }, { status: 404 }) };
  }
  if (!canReadSubmission(user, submission)) {
    return { response: NextResponse.json({ error: "角色權限不足" }, { status: 403 }) };
  }

  const file = getSubmissionFile({ submissionId, fileId });
  if (!file) {
    return { response: NextResponse.json({ error: "找不到送審檔案" }, { status: 404 }) };
  }

  const repositoryRoot = path.resolve(/*turbopackIgnore: true*/ getRepositoryDir());
  const resolvedPath = path.resolve(/*turbopackIgnore: true*/ file.local_path);
  if (!resolvedPath.startsWith(repositoryRoot + path.sep)) {
    return { response: NextResponse.json({ error: "儲存檔案路徑超出檔案庫" }, { status: 500 }) };
  }

  try {
    const bytes = await fs.readFile(resolvedPath);
    return { file, bytes };
  } catch {
    return { response: NextResponse.json({ error: "儲存檔案遺失" }, { status: 404 }) };
  }
}

export function buildFileResponse(input: { file: SubmissionFile; bytes: Buffer; disposition: "inline" | "attachment" }) {
  const filename = input.file.original_filename || "submission-file";
  return new Response(new Uint8Array(input.bytes), {
    headers: {
      "content-type": contentTypeFor(input.file),
      "content-length": String(input.bytes.byteLength),
      "content-disposition": `${input.disposition}; filename="${contentDispositionFilename(filename)}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store"
    }
  });
}

export function isPdfFile(file: SubmissionFile) {
  return file.file_role === "pdf" || file.original_filename.toLowerCase().endsWith(".pdf");
}

function contentTypeFor(file: SubmissionFile) {
  const extension = path.extname(file.original_filename).toLowerCase();
  if (file.file_role === "pdf" || extension === ".pdf") return "application/pdf";
  if (extension === ".dwg") return "application/acad";
  return "application/octet-stream";
}

function contentDispositionFilename(filename: string) {
  return filename.replace(/["\r\n\\]/g, "_");
}

function getRepositoryDir() {
  const configured = process.env.PDM_REPOSITORY_DIR?.trim();
  if (!configured) return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "repository");
  return path.isAbsolute(configured) ? configured : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
}
