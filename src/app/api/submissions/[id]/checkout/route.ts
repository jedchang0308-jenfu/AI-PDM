import { NextResponse } from "next/server";
import { forbidden, requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { createItemLockAsync, releaseItemLockAsync } from "@/lib/item-locks-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) {
    return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();
  if (submission.release_actionability && !submission.release_actionability.allowed) {
    return NextResponse.json(
      {
        error: submission.release_actionability.code,
        code: submission.release_actionability.code,
        message: submission.release_actionability.message,
        recoveryHref: submission.release_actionability.recovery_href
      },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? "Edit reservation").trim();
  const hours = Number.parseInt(String(body.hours ?? "8"), 10);
  if (reason.length < 3 || reason.length > 120) {
    return NextResponse.json({ error: "?????3 ??120 ??" }, { status: 400 });
  }

  const result = await createItemLockAsync({
    submissionId: id,
    userId: auth.user.id,
    reason,
    hours: Number.isFinite(hours) && hours > 0 && hours <= 72 ? hours : 8
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, lock: result.lock ?? null }, { status: result.status });
  }

  return NextResponse.json({ lock: result.lock, reused: result.reused });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) {
    return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  if (submission.release_actionability?.code.startsWith("SUBMISSION_RELEASE_TERMINAL_")) {
    return NextResponse.json(
      {
        error: submission.release_actionability.code,
        code: submission.release_actionability.code,
        message: submission.release_actionability.message,
        recoveryHref: submission.release_actionability.recovery_href
      },
      { status: 409 }
    );
  }

  const result = await releaseItemLockAsync({
    submissionId: id,
    userId: auth.user.id,
    force: auth.authorizationRoleCode === "pdm_admin" || auth.authorizationRoleCode === "system_admin"
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, lock: result.lock ?? null }, { status: result.status });
  }

  return NextResponse.json({ released: result.released });
}

