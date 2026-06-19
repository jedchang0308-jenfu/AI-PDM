import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import type { CheckNumberingPermissionInput, NumberingPermissionCheckResult } from "@/lib/db";
import { AsyncAccessControlRepository } from "@/lib/repositories/access-control-async-repository";

export async function checkNumberingPermissionAsync(input: CheckNumberingPermissionInput): Promise<NumberingPermissionCheckResult> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncAccessControlRepository(client);
  return repository.checkPermission(input);
}
