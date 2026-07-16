import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync, requireRoleAsync } from "@/lib/auth-async";
import { initializePhaseGateChecksAsync, listPhaseGateChecksAsync } from "@/lib/collaboration-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";
import type { PhaseGateCheck } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const checks = await listPhaseGateChecksAsync(id);
  return NextResponse.json({
    checks,
    summary: buildPhaseGateSummary(checks)
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const result = await initializePhaseGateChecksAsync({ submissionId: id, createdBy: auth.user.id });
  return NextResponse.json(
    {
      checks: result.checks,
      created: result.created,
      summary: buildPhaseGateSummary(result.checks)
    },
    { status: result.created ? 201 : 200 }
  );
}

function buildPhaseGateSummary(checks: PhaseGateCheck[]) {
  const required = checks.filter((check) => check.required === 1);
  const openRequired = required.filter((check) => check.status === "open");
  return {
    enabled: checks.length > 0,
    total: checks.length,
    required: required.length,
    open_required: openRequired.length,
    ready_for_release: checks.length === 0 || openRequired.length === 0
  };
}
