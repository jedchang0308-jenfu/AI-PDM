import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncNotificationRepository, summarizeNotifications } from "@/lib/repositories/notification-async-repository";

export { summarizeNotifications };

export async function listNotificationsAsync(user: { id: string; role: string }) {
  return new AsyncNotificationRepository(getAsyncDatabaseClient()).listNotifications(user);
}
