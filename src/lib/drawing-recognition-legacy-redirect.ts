import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { DrawingRecognitionError } from "@/lib/drawing-recognition-contract";
import { DrawingRecognitionAsyncRepository } from "@/lib/repositories/drawing-recognition-async-repository";

/**
 * Resolve the retired recognition URL to the canonical Drawing workspace.
 *
 * The old route is intentionally not a second review UI.  It only performs a
 * server-side, company-scoped lookup and returns the exact current Drawing
 * work target when one exists.  Missing, cross-company, or unauthorized
 * sessions fail closed to the Drawing list.
 */
export async function resolveDrawingRecognitionNavigation(input: {
  snapshot: AsyncDatabaseClient;
  sessionId: string;
  companyId: string;
  actorId: string;
  canReviewNonOwned: boolean;
  returnTo?: string | null;
}) {
  const client = input.snapshot;
  const repository = new DrawingRecognitionAsyncRepository(client);
  let session: Awaited<ReturnType<DrawingRecognitionAsyncRepository["assertSessionScope"]>>;
  try {
    session = await repository.assertSessionScope({
      sessionId: input.sessionId,
      companyId: input.companyId,
      actorId: input.actorId,
      privileged: input.canReviewNonOwned
    });
  } catch (error) {
    if (error instanceof DrawingRecognitionError && [403, 404].includes(error.status)) return null;
    throw error;
  }

  if (!session.drawing_id) return null;

  const target = await client.queryOne<{
    drawing_id: string;
    drawing_number: string | null;
    work_id: string | null;
  }>(
    `SELECT drawing.id AS drawing_id, drawing.drawing_number, state.work_id
       FROM drawings drawing
       LEFT JOIN canonical_workbench_states state
         ON state.company_id = drawing.company_id
        AND state.entity_type = 'drawing'
        AND state.canonical_entity_id = drawing.id
        AND state.revision_id = :revisionId
        AND state.work_id IS NOT NULL
      WHERE drawing.id = :drawingId AND drawing.company_id = :companyId
      LIMIT 1`,
    {
      companyId: input.companyId,
      drawingId: session.drawing_id,
      revisionId: session.drawing_revision_id
    }
  );
  if (!target) return null;

  const encodedDrawingId = encodeURIComponent(target.drawing_id);
  const encodedWorkId = target.work_id ? encodeURIComponent(target.work_id) : null;
  const returnTo = safeReturnTo(input.returnTo);
  const returnQuery = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : "";
  const href = encodedWorkId
    ? `/numbering/drawings/${encodedDrawingId}/workspace?workId=${encodedWorkId}${returnQuery}`
    : `/numbering/drawings?query=${encodeURIComponent(target.drawing_number ?? target.drawing_id)}`;

  return {
    href,
    drawingId: target.drawing_id,
    workId: target.work_id
  };
}

function safeReturnTo(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (!(trimmed.startsWith("/numbering/") || trimmed.startsWith("/parts/"))) return null;
  return trimmed;
}
