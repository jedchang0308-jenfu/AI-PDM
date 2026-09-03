import { NextResponse } from "next/server";
import {
  initializeApprovalMatrixRequirementsAsync,
  refreshApprovalMatrixRequirementsAsync
} from "@/lib/approval-async";
import { forbidden, requireAuthAsync, requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";
import type { ApprovalMatrixRequirement } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const requirements = await refreshApprovalMatrixRequirementsAsync(id);
  return NextResponse.json({
    requirements,
    summary: buildApprovalMatrixSummary(requirements)
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const body = await request.json().catch(() => ({}));
  const requirements = parseRequirements(body.requirements);
  if (requirements.error) return NextResponse.json({ error: requirements.error }, { status: 400 });

  const result = await initializeApprovalMatrixRequirementsAsync({
    submissionId: id,
    createdBy: auth.user.id,
    requirements: requirements.value
  });
  return NextResponse.json(
    {
      requirements: result.requirements,
      created: result.created,
      summary: buildApprovalMatrixSummary(result.requirements)
    },
    { status: result.created ? 201 : 200 }
  );
}

function parseRequirements(
  raw: unknown
):
  | { value: Array<{ requiredRole: ApprovalMatrixRequirement["required_role"]; minCount: number }> | undefined; error?: never }
  | { value?: never; error: string } {
  if (raw === undefined) return { value: undefined };
  if (!Array.isArray(raw)) return { error: "requirements must be an array" };
  if (raw.length < 1 || raw.length > 2) return { error: "requirements must contain 1 to 2 entries" };

  const seen = new Set<string>();
  const parsed = raw.map((entry) => {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const requiredRole = String(item.requiredRole ?? item.required_role ?? "").trim() as ApprovalMatrixRequirement["required_role"];
    const minCount = Number(item.minCount ?? item.min_count ?? 1);
    return { requiredRole, minCount };
  });

  for (const requirement of parsed) {
    if (requirement.requiredRole !== "R&D Manager" && requirement.requiredRole !== "Admin") {
      return { error: "requiredRole must be R&D Manager or Admin" };
    }
    if (!Number.isInteger(requirement.minCount) || requirement.minCount < 1 || requirement.minCount > 3) {
      return { error: "minCount must be an integer from 1 to 3" };
    }
    if (seen.has(requirement.requiredRole)) return { error: "requiredRole must be unique" };
    seen.add(requirement.requiredRole);
  }

  return { value: parsed };
}

function buildApprovalMatrixSummary(requirements: ApprovalMatrixRequirement[]) {
  const openRequirements = requirements.filter((requirement) => requirement.status === "open");
  return {
    enabled: requirements.length > 0,
    total: requirements.length,
    open_required: openRequirements.length,
    ready_for_release: requirements.length === 0 || openRequirements.length === 0
  };
}
