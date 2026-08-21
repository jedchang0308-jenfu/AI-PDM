import crypto from "node:crypto";
import { NextResponse } from "next/server";

export function requireWorkerServiceToken(request: Request) {
  const configured = String(process.env.PDM_PREVIEW_WORKER_TOKEN ?? "").trim();
  if (configured.length < 32) return NextResponse.json({ error: "WORKER_SERVICE_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/iu, "").trim()
    || request.headers.get("x-pdm-preview-worker-token")?.trim();
  if (!provided) return NextResponse.json({ error: "WORKER_FORBIDDEN" }, { status: 403 });
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(configured, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: "WORKER_FORBIDDEN" }, { status: 403 });
  return null;
}

export function safeWorkerId(value: unknown) {
  const workerId = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{1,120}$/u.test(workerId)) return null;
  return workerId;
}
