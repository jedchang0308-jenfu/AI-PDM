import { NextResponse } from "next/server";
import { forbidden, requireAuth, requireRole } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { getSubmission, initializePhaseGateChecks, listPhaseGateChecks } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const checks = listPhaseGateChecks(id);
  return NextResponse.json({
    checks,
    summary: buildPhaseGateSummary(checks)
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const result = initializePhaseGateChecks({ submissionId: id, createdBy: auth.user.id });
  return NextResponse.json(
    {
      checks: result.checks,
      created: result.created,
      summary: buildPhaseGateSummary(result.checks)
    },
    { status: result.created ? 201 : 200 }
  );
}

function buildPhaseGateSummary(checks: ReturnType<typeof listPhaseGateChecks>) {
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
