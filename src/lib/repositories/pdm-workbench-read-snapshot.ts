import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export async function withPdmWorkbenchReadSnapshot<T>(
  client: AsyncDatabaseClient,
  read: (snapshot: AsyncDatabaseClient) => Promise<T>
) {
  if (client.transactionScope === "postgres") {
    const state = await client.queryOne<{ isolation_level: string; read_only: string }>(
      "SELECT current_setting('transaction_isolation') AS isolation_level, current_setting('transaction_read_only') AS read_only"
    );
    if (!state || !["repeatable read", "serializable"].includes(state.isolation_level) || state.read_only !== "on") {
      throw new Error("PDM_WORKBENCH_READ_SNAPSHOT_REQUIRED");
    }
    return read(client);
  }
  return client.transaction(read, { isolationLevel: "repeatable_read", readOnly: true });
}
