import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository, type AsyncAuditLogInput } from "@/lib/repositories/audit-async-repository";

export async function createAuditLogAsync(
  input: AsyncAuditLogInput, client: AsyncDatabaseClient = getAsyncDatabaseClient()
): Promise<void> {
  const repository = new AsyncAuditRepository(client);
  await repository.createAuditLog(input);
}
