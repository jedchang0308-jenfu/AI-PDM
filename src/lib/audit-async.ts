import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository, type AsyncAuditLogInput } from "@/lib/repositories/audit-async-repository";

export async function createAuditLogAsync(input: AsyncAuditLogInput): Promise<void> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncAuditRepository(client);
  await repository.createAuditLog(input);
}
