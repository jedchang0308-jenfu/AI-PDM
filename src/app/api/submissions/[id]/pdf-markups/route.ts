import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { createPdfMarkup, getSubmission, getSubmissionFile, listPdfMarkups } from "@/lib/db";
import { isPdfFile } from "@/lib/file-response";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  return NextResponse.json({
    submissionId: id,
    markups: listPdfMarkups(id)
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const body = await request.json().catch(() => ({}));
  const fileId = String(body.fileId ?? body.file_id ?? "").trim();
  const file = fileId ? getSubmissionFile({ submissionId: id, fileId }) : null;
  if (!file) {
    return NextResponse.json({ error: "檔案 ID 為必填且必須屬於此送審資料" }, { status: 400 });
  }
  if (!isPdfFile(file)) {
    return NextResponse.json({ error: "PDF 標註僅支援 PDF 檔案" }, { status: 400 });
  }

  const pageNumber = Number(body.pageNumber ?? body.page_number ?? 1);
  const xPercent = Number(body.xPercent ?? body.x_percent);
  const yPercent = Number(body.yPercent ?? body.y_percent);
  const markupBody = String(body.body ?? body.note ?? "").trim();

  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 9999) {
    return NextResponse.json({ error: "頁次必須為正整數" }, { status: 400 });
  }
  if (!Number.isFinite(xPercent) || xPercent < 0 || xPercent > 100 || !Number.isFinite(yPercent) || yPercent < 0 || yPercent > 100) {
    return NextResponse.json({ error: "X 與 Y 百分比必須介於 0 到 100" }, { status: 400 });
  }
  if (markupBody.length < 2) {
    return NextResponse.json({ error: "標註內容為必填" }, { status: 400 });
  }
  if (markupBody.length > 2000) {
    return NextResponse.json({ error: "markup body is too long" }, { status: 400 });
  }

  const markup = createPdfMarkup({
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
