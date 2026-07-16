import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncSystemSettingsRepository } from "@/lib/repositories/system-settings-async-repository";

export async function getSystemSettingAsync(key: string): Promise<string | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncSystemSettingsRepository(client);
  return repository.getSetting(key);
}

export async function getAllSystemSettingsAsync(): Promise<Record<string, string>> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncSystemSettingsRepository(client);
  return repository.getAllSettings();
}

export async function setSystemSettingAsync(key: string, value: string, updatedBy: string): Promise<void> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncSystemSettingsRepository(client);
  await repository.setSetting(key, value, updatedBy);
}
