import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

/**
 * Repository boundary for the unified detail aggregate.
 *
 * The first implementation keeps domain-owned readers in their existing
 * repositories; this façade makes the one-snapshot boundary explicit and
 * prevents UI/API callers from composing three HTTP detail reads. Future
 * batching work belongs here and must accept the already-open client.
 */
export class PdmEntityDetailAsyncRepository {
  constructor(readonly client: AsyncDatabaseClient) {}

  async readAggregate<T>(reader: (client: AsyncDatabaseClient) => Promise<T>) {
    return reader(this.client);
  }

  async readCandidate<T>(reader: (client: AsyncDatabaseClient) => Promise<T>) {
    return reader(this.client);
  }

  async readDrawing<T>(reader: (client: AsyncDatabaseClient) => Promise<T>) {
    return reader(this.client);
  }

  async readPart<T>(reader: (client: AsyncDatabaseClient) => Promise<T>) {
    return reader(this.client);
  }

  async readRelation<T>(reader: (client: AsyncDatabaseClient) => Promise<T>) {
    return reader(this.client);
  }
}
