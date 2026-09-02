import { NextResponse } from "next/server";
import { forbidden, requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import {
  createProcurementSyncRunAsync,
  listProcurementSyncRunsAsync
} from "@/lib/release-records-async";
import { getSubmissionAsync } from "@/lib/submissions-async";
import type { ProcurementSyncRun } from "@/lib/types";

export const runtime = "nodejs";

function parseTargetSystem(value: unknown): ProcurementSyncRun["target_system"] | null {
  const target = String(value ?? "procurement").trim();
  if (target === "ERP" || target === "inventory" || target === "procurement") return target;
  return null;
}

export async function GET(request: Request) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const submissionId = url.searchParams.get("submissionId")?.trim() || undefined;
  const targetSystemParam = url.searchParams.get("targetSystem");
  const targetSystem = targetSystemParam ? parseTargetSystem(targetSystemParam) : undefined;
  if (targetSystemParam && !targetSystem) {
    return NextResponse.json({ error: "?格?蝟餌絞敹???ERP?澈摮??∟頃" }, { status: 400 });
  }

  return NextResponse.json({ runs: await listProcurementSyncRunsAsync({ submissionId, targetSystem: targetSystem ?? undefined }) });
}

export async function POST(request: Request) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const submissionId = String(body.submissionId ?? body.submission_id ?? "").trim();
  const targetSystem = parseTargetSystem(body.targetSystem ?? body.target_system);
  const externalReference = String(body.externalReference ?? body.external_reference ?? "").trim() || undefined;

  if (!submissionId) return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  if (!targetSystem) return NextResponse.json({ error: "?格?蝟餌絞敹???ERP?澈摮??∟頃" }, { status: 400 });

  const submission = await getSubmissionAsync(submissionId);
  if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();
  if (submission.status !== "Released") {
    return NextResponse.json({ error: "Release package is required" }, { status: 409 });
  }
  if (!submission.release_package) {
    return NextResponse.json({ error: "Release package is required" }, { status: 409 });
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

  const run = await createProcurementSyncRunAsync({
    submissionId,
    targetSystem,
    payload,
    externalReference,
    createdBy: auth.user.id
  });

  return NextResponse.json({ run }, { status: 201 });
}

