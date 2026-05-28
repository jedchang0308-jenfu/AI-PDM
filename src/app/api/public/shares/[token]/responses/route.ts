import { NextResponse } from "next/server";
import { createSupplierPortalResponse } from "@/lib/db";
import { getPublicShare } from "@/lib/readonly-share";
import type { SupplierPortalResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const publicShare = getPublicShare(token);
  if (!publicShare) return NextResponse.json({ error: "找不到分享連結" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = parseSupplierResponse(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const value = parsed.value;

  const response = createSupplierPortalResponse({
    shareId: publicShare.share.id,
    submissionId: publicShare.submission.id,
    responseKind: value.responseKind,
    supplierName: value.supplierName,
    supplierEmail: value.supplierEmail,
    message: value.message
  });

  return NextResponse.json({ response }, { status: 201 });
}

function parseSupplierResponse(body: unknown):
  | {
      value: {
        responseKind: SupplierPortalResponse["response_kind"];
        supplierName: string;
        supplierEmail: string;
        message: string;
      };
      error?: never;
    }
  | { value?: never; error: string } {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const responseKind = String(value.responseKind ?? value.response_kind ?? "question").trim() as SupplierPortalResponse["response_kind"];
  const supplierName = String(value.supplierName ?? value.supplier_name ?? "").trim();
  const supplierEmail = String(value.supplierEmail ?? value.supplier_email ?? "").trim().toLowerCase();
  const message = String(value.message ?? "").trim();

  if (responseKind !== "acknowledgement" && responseKind !== "question") {
    return { error: "回覆類型必須為確認或提問" };
  }
  if (supplierName.length < 2 || supplierName.length > 80) {
    return { error: "供應商姓名需為 2 到 80 個字" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierEmail) || supplierEmail.length > 120) {
    return { error: "供應商電子郵件格式不正確" };
  }
  if (message.length < 2 || message.length > 1000) {
    return { error: "訊息需為 2 到 1000 個字" };
  }

  return { value: { responseKind, supplierName, supplierEmail, message } };
}
