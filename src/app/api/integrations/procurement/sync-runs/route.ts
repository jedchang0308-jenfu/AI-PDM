import { NextResponse } from "next/server";
import { createProcurementSyncRun, getSubmission, listProcurementSyncRuns } from "@/lib/db";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import type { ProcurementSyncRun } from "@/lib/types";

export const runtime = "nodejs";

function canManageProcurementSync(role: string) {
  return role === "R&D Manager" || role === "Admin";
}

function parseTargetSystem(value: unknown): ProcurementSyncRun["target_system"] | null {
  const target = String(value ?? "procurement").trim();
  if (target === "ERP" || target === "inventory" || target === "procurement") return target;
  return null;
}

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;
  if (!canManageProcurementSync(auth.user.role)) return forbidden();

  const url = new URL(request.url);
  const submissionId = url.searchParams.get("submissionId")?.trim() || undefined;
  const targetSystemParam = url.searchParams.get("targetSystem");
  const targetSystem = targetSystemParam ? parseTargetSystem(targetSystemParam) : undefined;
  if (targetSystemParam && !targetSystem) {
    return NextResponse.json({ error: "目標系統必須為 ERP、庫存或採購" }, { status: 400 });
  }

  return NextResponse.json({ runs: listProcurementSyncRuns({ submissionId, targetSystem: targetSystem ?? undefined }) });
}

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;
  if (!canManageProcurementSync(auth.user.role)) return forbidden();

  const body = await request.json().catch(() => ({}));
  const submissionId = String(body.submissionId ?? body.submission_id ?? "").trim();
  const targetSystem = parseTargetSystem(body.targetSystem ?? body.target_system);
  const externalReference = String(body.externalReference ?? body.external_reference ?? "").trim() || undefined;

  if (!submissionId) return NextResponse.json({ error: "送審 ID 為必填" }, { status: 400 });
  if (!targetSystem) return NextResponse.json({ error: "目標系統必須為 ERP、庫存或採購" }, { status: 400 });

  const submission = getSubmission(submissionId);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();
  if (submission.status !== "Released") {
    return NextResponse.json({ error: "只有已發布送審資料可以同步" }, { status: 409 });
  }
  if (!submission.release_package) {
    return NextResponse.json({ error: "同步前必須先產生發布包" }, { status: 409 });
  }

  const payload = {
    schema: "ai-pdm-procurement-sync.v1",
    target_system: targetSystem,
    submission_id: submission.id,
    drawing_number: submission.drawing_number,
    revision: submission.revision,
    part_number: submission.part_number,
    part_name: submission.part_name,
    released_at: submission.released_at,
    package: {
      filename: submission.release_package.package_filename,
      sha256: submission.release_package.sha256,
      file_size: submission.release_package.file_size
    },
    bom: submission.bom
      ? {
          line_count: submission.bom.line_count,
          lines: submission.bom.lines.map((line) => ({
            line_no: line.line_no,
            child_part_number: line.child_part_number,
            child_revision: line.child_revision,
            quantity: line.quantity
          }))
        }
      : null
  };

  const run = createProcurementSyncRun({
    submissionId,
    targetSystem,
    payload,
    externalReference,
    createdBy: auth.user.id
  });

  return NextResponse.json({ run }, { status: 201 });
}
