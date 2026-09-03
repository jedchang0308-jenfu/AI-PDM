import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { issueCanonicalWorkbenchContract } from "@/lib/pdm-workbench-authority-control";
import { PartNumberMatrixAsyncRepository, type PartMatrixActor } from "@/lib/repositories/part-number-matrix-async-repository";
import type { PartChangeActor } from "@/lib/part-change-work";

export async function readPartNumberMatrixWorkspace(input: {
  client?: AsyncDatabaseClient;
  sourcePartId: string;
  sourceWorkId: string;
  actor: PartChangeActor;
}) {
  const client = input.client ?? getAsyncDatabaseClient();
  const actor: PartMatrixActor = {
    id: input.actor.id,
    canEditNonOwned: input.actor.canEditNonOwned,
    permissions: {
      create: input.actor.permissions.create,
      update: input.actor.permissions.update,
      submit: input.actor.permissions.submit
    }
  };
  const data = await new PartNumberMatrixAsyncRepository(client).getMatrix({
    companyId: input.actor.companyId,
    sourcePartId: input.sourcePartId,
    sourceWorkId: input.sourceWorkId,
    actor
  });
  return {
    data,
    meta: {
      actorId: input.actor.id,
      companyId: input.actor.companyId,
      contractToken: await issueCanonicalWorkbenchContract(client, { companyId: input.actor.companyId, actorId: input.actor.id }),
      correlationId: crypto.randomUUID()
    }
  };
}
