import { NextResponse } from "next/server";
import { forbidden, requireAuth, requireRole } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { getSubmission, initializeApprovalMatrixRequirements, listApprovalMatrixRequirements, refreshApprovalMatrixRequirements } from "@/lib/db";
import type { ApprovalMatrixRequirement } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const requirements = refreshApprovalMatrixRequirements(id);
  return NextResponse.json({
    requirements,
    summary: buildApprovalMatrixSummary(requirements)
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const body = await request.json().catch(() => ({}));
  const requirements = parseRequirements(body.requirements);
  if (requirements.error) return NextResponse.json({ error: requirements.error }, { status: 400 });

  const result = initializeApprovalMatrixRequirements({
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

function parseRequirements(raw: unknown):
  | { value: Array<{ requiredRole: ApprovalMatrixRequirement["required_role"]; minCount: number }> | undefined; error?: never }
  | { value?: never; error: string } {
  if (raw === undefined) return { value: undefined };
  if (!Array.isArray(raw)) return { error: "簽核需求必須為陣列" };
  if (raw.length < 1 || raw.length > 2) return { error: "簽核需求需包含 1 到 2 個角色" };

  const seen = new Set<string>();
  const parsed = raw.map((entry) => {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const requiredRole = String(item.requiredRole ?? item.required_role ?? "").trim() as ApprovalMatrixRequirement["required_role"];
    const minCount = Number(item.minCount ?? item.min_count ?? 1);
    return { requiredRole, minCount };
  });

  for (const requirement of parsed) {
    if (requirement.requiredRole !== "R&D Manager" && requirement.requiredRole !== "Admin") {
      return { error: "必要角色必須為研發主管或系統管理員" };
    }
    if (!Number.isInteger(requirement.minCount) || requirement.minCount < 1 || requirement.minCount > 3) {
      return { error: "最低人數必須為 1 到 3 的整數" };
    }
    if (seen.has(requirement.requiredRole)) return { error: "必要角色不可重複" };
    seen.add(requirement.requiredRole);
  }

  return { value: parsed };
}

function buildApprovalMatrixSummary(requirements: ReturnType<typeof listApprovalMatrixRequirements>) {
  const openRequirements = requirements.filter((requirement) => requirement.status === "open");
  return {
    enabled: requirements.length > 0,
    total: requirements.length,
    open_required: openRequirements.length,
    ready_for_release: requirements.length === 0 || openRequirements.length === 0
  };
}
