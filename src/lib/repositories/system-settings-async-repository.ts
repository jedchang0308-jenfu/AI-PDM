import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export const SELECT_SYSTEM_SETTING_SQL = "SELECT value FROM system_settings WHERE key = :key";
export const SELECT_ALL_SYSTEM_SETTINGS_SQL = "SELECT key, value FROM system_settings ORDER BY key";
export const UPSERT_SYSTEM_SETTING_SQL = `
  INSERT INTO system_settings (key, value, updated_at, updated_by)
  VALUES (:key, :value, :updatedAt, :updatedBy)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by
`;

export class AsyncSystemSettingsRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString()
  ) {}

  async getSetting(key: string): Promise<string | null> {
    const row = await this.client.queryOne<{ value: string }>(SELECT_SYSTEM_SETTING_SQL, { key });
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string, updatedBy: string): Promise<void> {
    await this.client.execute(UPSERT_SYSTEM_SETTING_SQL, {
      key,
      value,
      updatedAt: this.clock(),
      updatedBy
    });
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const rows = await this.client.query<Array<{ key: string; value: string }>[number]>(SELECT_ALL_SYSTEM_SETTINGS_SQL);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }
}
