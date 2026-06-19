import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { createPdfMarkupAsync, listPdfMarkupsAsync } from "@/lib/collaboration-async";
import { isPdfFile } from "@/lib/file-response";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionFileAsync } from "@/lib/submission-files-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  return NextResponse.json({
    submissionId: id,
    markups: await listPdfMarkupsAsync(id)
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const body = await request.json().catch(() => ({}));
  const fileId = String(body.fileId ?? body.file_id ?? "").trim();
  const file = fileId ? await getSubmissionFileAsync({ submissionId: id, fileId }) : null;
  if (!file) {
    return NextResponse.json({ error: "Submission file is required" }, { status: 400 });
  }
  if (!isPdfFile(file)) {
    return NextResponse.json({ error: "PDF markup requires a PDF file" }, { status: 400 });
  }

  const pageNumber = Number(body.pageNumber ?? body.page_number ?? 1);
  const xPercent = Number(body.xPercent ?? body.x_percent);
  const yPercent = Number(body.yPercent ?? body.y_percent);
  const markupBody = String(body.body ?? body.note ?? "").trim();

  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 9999) {
    return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
  }
  if (
    !Number.isFinite(xPercent) ||
    xPercent < 0 ||
    xPercent > 100 ||
    !Number.isFinite(yPercent) ||
    yPercent < 0 ||
    yPercent > 100
  ) {
    return NextResponse.json({ error: "X and Y percentages must be between 0 and 100" }, { status: 400 });
  }
  if (markupBody.length < 2) {
    return NextResponse.json({ error: "markup body is too short" }, { status: 400 });
  }
  if (markupBody.length > 2000) {
    return NextResponse.json({ error: "markup body is too long" }, { status: 400 });
  }

  const markup = await createPdfMarkupAsync({
    submissionId: id,
    fileId,
    authorId: auth.user.id,
    pageNumber,
    xPercent: roundPercent(xPercent),
    yPercent: roundPercent(yPercent),
    body: markupBody
  });

  return NextResponse.json({ markup }, { status: 201 });
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}
