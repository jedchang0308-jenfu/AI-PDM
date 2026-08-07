import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncDrawingRevisionLifecycleRepository } from "@/lib/repositories/drawing-revision-lifecycle-async-repository";

/**
 * The only application entrypoint allowed to physically remove a completed
 * DEV-053 Phase 1H workflow graph. Durable revision/package data is retained.
 */
export async function cleanupTerminalDrawingRevisionLifecycleWorkflow(workflowId: string) {
  return new AsyncDrawingRevisionLifecycleRepository(getAsyncDatabaseClient()).cleanupTerminalWorkflow(workflowId);
}

export async function cleanupPendingDrawingRevisionLifecycleWorkflows(limit = 25) {
  const repository = new AsyncDrawingRevisionLifecycleRepository(getAsyncDatabaseClient());
  const pending = await repository.listCleanupPending(limit);
  const result = { attempted: pending.length, cleaned: 0, failed: 0 };
  for (const workflow of pending) {
    try {
      await repository.cleanupTerminalWorkflow(workflow.id);
      result.cleaned += 1;
    } catch {
      result.failed += 1;
    }
  }
  await repository.purgeExpiredTokens();
  return result;
}
