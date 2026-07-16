import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type AsyncAuditLogInput = {
  submissionId?: string | null;
  actorId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
};

export const INSERT_ASYNC_AUDIT_LOG_SQL = `
  INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
  VALUES (:id, :submissionId, :actorId, :action, :detailJson, :createdAt)
`;

export class AsyncAuditRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async createAuditLog(input: AsyncAuditLogInput): Promise<void> {
    await this.client.execute(INSERT_ASYNC_AUDIT_LOG_SQL, {
      id: this.idFactory(),
      submissionId: input.submissionId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      detailJson: JSON.stringify(input.detail ?? {}),
      createdAt: this.clock()
    });
  }
}
