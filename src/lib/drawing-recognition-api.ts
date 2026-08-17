import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { DrawingRecognitionError } from "@/lib/drawing-recognition-contract";

export async function recognitionJsonBody(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DrawingRecognitionError("RECOGNITION_BODY_INVALID", "請提供有效的 JSON 內容。", 400);
  }
  return body as Record<string, unknown>;
}

export function recognitionRoles(access: { actor: { roles: readonly string[] } }) {
  return [...new Set(access.actor.roles.map((role) => String(role).trim()).filter(Boolean))];
}

export function recognitionErrorResponse(error: unknown, context: string) {
  if (error instanceof DrawingRecognitionError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, retryable: error.retryable } }, { status: error.status });
  }
  console.error("Drawing recognition request failed.", { context, error });
  return NextResponse.json({ error: { code: "RECOGNITION_INTERNAL_ERROR", message: "辨識服務暫時無法處理此要求。", retryable: true } }, { status: 500 });
}

export function requireRecognitionWorker(request: Request) {
  const expected = String(process.env.PDM_DRAWING_RECOGNITION_WORKER_TOKEN ?? "").trim();
  const supplied = String(request.headers.get("authorization") ?? "").replace(/^Bearer\s+/iu, "").trim();
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function workerUnauthorizedResponse() {
  return NextResponse.json({ error: { code: "RECOGNITION_WORKER_UNAUTHORIZED", message: "Worker authorization failed.", retryable: false } }, { status: 401 });
}
