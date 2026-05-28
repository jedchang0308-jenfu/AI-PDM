import { getDb } from "@/lib/db";

export function getSystemSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM system_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSystemSetting(key: string, value: string, updatedBy: string) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO system_settings (key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .run(key, value, now, updatedBy);
}

export function getAllSystemSettings(): Record<string, string> {
  const rows = getDb()
    .prepare("SELECT key, value FROM system_settings")
    .all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}
