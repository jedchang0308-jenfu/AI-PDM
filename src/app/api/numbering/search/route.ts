import { NextResponse } from "next/server";
import { searchNumberingRecords, type NumberingPhase, type NumberingRecordStatus, type NumberingSearchEntityType } from "@/lib/db";
import { requireNumberingPage } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

const entityTypes = new Set(["all", "part_root", "part_number", "drawing_number"]);
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

export async function GET(request: Request) {
  const auth = requireNumberingPage(request, "numbering.search");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const entityType = normalizeEnum(url.searchParams.get("entityType"), entityTypes) as NumberingSearchEntityType | undefined;
  const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  const developmentPhase = normalizeEnum(url.searchParams.get("developmentPhase"), phases) as NumberingPhase | undefined;

  const results = searchNumberingRecords({
    query: url.searchParams.get("query") ?? "",
    entityType,
    recordStatus,
    developmentPhase,
    limit: Number(url.searchParams.get("limit") ?? 50)
  });

  return NextResponse.json({ results });
}

function normalizeEnum(value: string | null, allowed: Set<string>) {
  const text = value?.trim();
  return text && allowed.has(text) ? text : undefined;
}
