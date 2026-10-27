import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { windowsServiceDeviceErrorResponse } from "@/lib/windows-service-device-auth";
import {
  WINDOWS_SERVICE_PROTOCOL_VERSION,
  WindowsServiceDeviceRepository
} from "@/lib/windows-service-devices";

export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store" };
const maxBodyBytes = 2 * 1024;

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "CONTENT_TYPE_INVALID" }, { status: 415, headers });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBodyBytes) {
    return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413, headers });
  }
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_JSON");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers });
  }
  const expected = ["enrollmentId", "code", "deviceId", "credentialHash", "name", "serviceVersion", "protocolVersion"];
  if (Object.keys(body).length !== expected.length || expected.some((key) => !(key in body))) {
    return NextResponse.json({ error: "REQUEST_SCHEMA_INVALID" }, { status: 422, headers });
  }
  if (body.protocolVersion !== WINDOWS_SERVICE_PROTOCOL_VERSION) {
    return NextResponse.json({ error: "WORKER_PROTOCOL_UNSUPPORTED", protocolVersion: WINDOWS_SERVICE_PROTOCOL_VERSION },
      { status: 426, headers });
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const sourceKey = forwarded || "unknown";
  try {
    const result = await new WindowsServiceDeviceRepository(getAsyncDatabaseClient()).enroll({
      enrollmentId: String(body.enrollmentId ?? ""),
      code: String(body.code ?? ""),
      deviceId: String(body.deviceId ?? ""),
      credentialHash: String(body.credentialHash ?? "").toLowerCase(),
      name: String(body.name ?? ""),
      serviceVersion: String(body.serviceVersion ?? ""),
      protocolVersion: Number(body.protocolVersion),
      sourceKey
    });
    return NextResponse.json({ deviceId: result.device.id, rowVersion: result.device.rowVersion },
      { status: result.created ? 201 : 200, headers });
  } catch (error) { return windowsServiceDeviceErrorResponse(error); }
}
