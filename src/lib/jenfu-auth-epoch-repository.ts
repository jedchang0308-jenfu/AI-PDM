import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

const READ_AUTH_EPOCH_SQL = `
  SELECT platform_core.read_principal_auth_epoch_v1(
    :identityIssuer,
    :identitySubject
  ) AS auth_epoch
`;

export class JenfuAuthEpochError extends Error {
  readonly code = "auth_epoch_unavailable";
  readonly httpStatus = 503;

  constructor() {
    super("auth_epoch_unavailable");
    this.name = "JenfuAuthEpochError";
  }
}

export class JenfuAuthEpochRepository {
  constructor(private readonly client: Pick<AsyncDatabaseClient, "kind" | "queryOne">) {}

  async readPrincipalAuthEpoch(identityIssuer: string, identitySubject: string): Promise<number> {
    if (this.client.kind !== "postgres") throw new JenfuAuthEpochError();
    try {
      const row = await this.client.queryOne<{ auth_epoch: number | string }>(READ_AUTH_EPOCH_SQL, {
        identityIssuer,
        identitySubject
      });
      const authEpoch = Number(row?.auth_epoch);
      if (!Number.isSafeInteger(authEpoch) || authEpoch < 0) throw new JenfuAuthEpochError();
      return authEpoch;
    } catch (error) {
      if (error instanceof JenfuAuthEpochError) throw error;
      throw new JenfuAuthEpochError();
    }
  }
}
