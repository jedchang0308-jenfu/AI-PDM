import { createAuditLogAsync } from "@/lib/audit-async";
import { ensureDrawingRevisionPackageForSubmissionAsync } from "@/lib/drawing-revision-packages-async";
import { releaseSubmissionViaCloudFunctionAsync } from "@/lib/release-async";
import { createReleasePackageAsync } from "@/lib/release-package-async";
import { assertDrawingPackageModelBasisForReleaseAsync } from "@/lib/shared-3d-baseline";
import {
  markSubmissionReleaseFailedAsync,
  markSubmissionReleasedAndObsoletePreviousAsync,
  markSubmissionReleasingAsync
} from "@/lib/submission-status-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export type SubmissionReleaseWorkflowResult =
  | {
      ok: true;
      submissionId: string;
      status: "Released";
      release: Record<string, unknown>;
      lifecycle: Awaited<ReturnType<typeof markSubmissionReleasedAndObsoletePreviousAsync>>;
    }
  | {
      ok: false;
      submissionId: string;
      status: "ReleaseFailed";
      error: string;
    };

export async function executeSubmissionReleaseWorkflowAsync(input: {
  submissionId: string;
  actorId: string;
  auditAction?: string;
}): Promise<SubmissionReleaseWorkflowResult> {
  let releaseStarted = false;
  try {
    await markSubmissionReleasingAsync(input.submissionId);
    releaseStarted = true;
    const latest = await getSubmissionAsync(input.submissionId);
    if (!latest) throw new Error("送審資料在發行前已不存在。");
    const revisionPackage = await ensureDrawingRevisionPackageForSubmissionAsync({ submissionId: input.submissionId, actorId: input.actorId });
    await assertDrawingPackageModelBasisForReleaseAsync(revisionPackage.id);
    const result = await releaseSubmissionViaCloudFunctionAsync(latest, input.actorId);
    const releasePackage = await createReleasePackageAsync(latest, input.actorId, result);
    const lifecycle = await markSubmissionReleasedAndObsoletePreviousAsync({ id: input.submissionId, actorId: input.actorId });
    await createAuditLogAsync({
      submissionId: input.submissionId,
      actorId: input.actorId,
      action: input.auditAction ?? "ReleaseSucceeded",
      detail: { ...result, releasePackage, revisionPackageId: revisionPackage.id, lifecycle }
    });
    return {
      ok: true,
      submissionId: input.submissionId,
      status: "Released",
      release: { ...result, package: releasePackage, revisionPackageId: revisionPackage.id },
      lifecycle
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "發行失敗，請通知主管或 Admin 處理。";
    if (releaseStarted) {
      await markSubmissionReleaseFailedAsync({ id: input.submissionId, releaseError: message });
    }
    await createAuditLogAsync({
      submissionId: input.submissionId,
      actorId: input.actorId,
      action: "ReleaseFailed",
      detail: { error: message }
    });
    return { ok: false, submissionId: input.submissionId, status: "ReleaseFailed", error: message };
  }
}
