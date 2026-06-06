import { NextResponse } from "next/server";
import { listDrawingModuleRecords, type DrawingPurposeCode, type NumberingPhase, type NumberingRecordStatus } from "@/lib/db";
import { requireNumberingPage } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

const recordStatuses = new Set([
  "Draft",
  "NeedInfo",
  "Active",
  "PendingReview",
  "Released",
  "Rejected",
  "Obsolete",
  "Merged",
  "EVTDisabled",
  "PendingAdminConfirm",
  "MainDrawingInvalid"
]);
const phases = new Set(["EVT", "DVT", "PVT", "Release", "ECR"]);
const purposeCodes = new Set(["MA", "OT"]);

export async function GET(request: Request) {
  const auth = requireNumberingPage(request, "numbering.drawings.view");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  const developmentPhase = normalizeEnum(url.searchParams.get("developmentPhase"), phases) as NumberingPhase | undefined;
  const purposeCode = normalizeEnum(url.searchParams.get("purposeCode"), purposeCodes) as DrawingPurposeCode | undefined;

  const drawings = listDrawingModuleRecords({
    query: url.searchParams.get("query") ?? "",
    recordStatus,
    developmentPhase,
    purposeCode,
    limit: Number(url.searchParams.get("limit") ?? 50)
  });

  return NextResponse.json({ drawings });
}

function normalizeEnum(value: string | null, allowed: Set<string>) {
  const text = value?.trim();
  return text && allowed.has(text) ? text : undefined;
}
