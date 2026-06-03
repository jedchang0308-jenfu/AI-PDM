import { NextResponse } from "next/server";
import { listDvtPromotionCandidates, submitDvtPromotionDecisions, type DvtPromotionDecisionAction } from "@/lib/db";
import { requireNumberingAction, requireNumberingPage } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

const decisionActions = new Set(["submit_dvt", "keep_evt", "disable_evt", "obsolete"]);

export async function GET(request: Request) {
  const auth = requireNumberingPage(request, "numbering.dvt");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const includeBlocked = url.searchParams.get("includeBlocked") !== "false";
  const candidates = listDvtPromotionCandidates({ limit, includeBlocked });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: candidates.length,
      ready: candidates.filter((candidate) => candidate.status === "ready").length,
      needsOverride: candidates.filter((candidate) => candidate.status === "needs_override").length,
      blocked: candidates.filter((candidate) => candidate.status === "blocked").length
    },
    candidates
  });
}

export async function POST(request: Request) {
  const auth = requireNumberingAction(request, "numbering.dvt.submit");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const rawDecisions = Array.isArray(body.decisions) ? body.decisions : [];
  const decisions = rawDecisions
    .map((item: unknown) => {
      const record = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
      const action = String(record.action ?? "").trim();
      return {
        partNumber: String(record.partNumber ?? record.part_number ?? "").trim(),
        action: decisionActions.has(action) ? (action as DvtPromotionDecisionAction) : null,
        reason: String(record.reason ?? "").trim()
      };
    })
    .filter(
      (decision: { partNumber: string; action: DvtPromotionDecisionAction | null; reason: string }): decision is {
        partNumber: string;
        action: DvtPromotionDecisionAction;
        reason: string;
      } => Boolean(decision.partNumber && decision.action)
    );

  if (decisions.length === 0) {
    return NextResponse.json({ error: "decisions is required" }, { status: 400 });
  }

  try {
    const result = submitDvtPromotionDecisions({
      decisions,
      projectCode: String(body.projectCode ?? body.project_code ?? "").trim() || undefined,
      submittedBy: auth.user.id
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process DVT promotion decisions";
    const status = message.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
