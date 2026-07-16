import path from "node:path";
import { NextResponse } from "next/server";
import type { DbUser } from "@/lib/db";
import { createFileStorageServiceForPointer, storagePointerFromRecord } from "@/lib/file-storage";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionFileAsync } from "@/lib/submission-files-async";
import { getSubmissionAsync } from "@/lib/submissions-async";
import type { SubmissionFile } from "@/lib/types";

export async function getStoredSubmissionFile(submissionId: string, fileId: string, user: DbUser) {
  const submission = await getSubmissionAsync(submissionId);
  if (!submission) {
    return { response: NextResponse.json({ error: "Submission not found" }, { status: 404 }) };
  }
  if (!(await canReadSubmissionAsync(user, submission))) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const file = await getSubmissionFileAsync({ submissionId, fileId });
  if (!file) {
    return { response: NextResponse.json({ error: "Submission file not found" }, { status: 404 }) };
  }

  let storagePointer;
  try {
    storagePointer = storagePointerFromRecord(file);
  } catch {
    return { response: NextResponse.json({ error: "Stored file pointer is invalid" }, { status: 500 }) };
  }

  try {
    const bytes = await createFileStorageServiceForPointer(storagePointer).readObject(storagePointer.key);
    return { file, bytes, storageKey: storagePointer.key, storagePointer };
  } catch {
    return { response: NextResponse.json({ error: "Stored file is missing" }, { status: 404 }) };
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

export function contentDispositionFilename(filename: string) {
  return filename.replace(/["\r\n\\]/g, "_");
}
