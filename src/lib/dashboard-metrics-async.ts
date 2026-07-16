import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncDashboardRepository } from "@/lib/repositories/dashboard-async-repository";

export async function getDashboardMetricsAsync(input: { submittedBy?: string; companyId?: string } = {}) {
  return new AsyncDashboardRepository(getAsyncDatabaseClient()).getDashboardMetrics(input);
}
