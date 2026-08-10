import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export async function withPdmWorkbenchReadSnapshot<T>(
  client: AsyncDatabaseClient,
  read: (snapshot: AsyncDatabaseClient) => Promise<T>
) {
  return client.transaction(async (snapshot) => {
    if (snapshot.kind === "postgres") {
      await snapshot.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    }
    return read(snapshot);
  });
}
