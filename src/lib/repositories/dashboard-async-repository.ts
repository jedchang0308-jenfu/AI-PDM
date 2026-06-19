import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type DashboardMetrics = {
  pending: number;
  released: number;
  rejected: number;
  failed: number;
};

type DashboardStatusCountRow = {
  status: string;
  count: number;
};

export const SELECT_ASYNC_DASHBOARD_STATUS_COUNTS_SQL = `
  SELECT status, COUNT(*) as count
  FROM submissions
  WHERE (:submittedBy IS NULL OR submitted_by = :submittedBy)
    AND (:companyId IS NULL OR company_id = :companyId)
  GROUP BY status
`;

export class AsyncDashboardRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async getDashboardMetrics(input: { submittedBy?: string; companyId?: string } = {}): Promise<DashboardMetrics> {
    const rows = await this.client.query<DashboardStatusCountRow>(SELECT_ASYNC_DASHBOARD_STATUS_COUNTS_SQL, {
      submittedBy: input.submittedBy ?? null,
      companyId: input.companyId ?? null
    });

    return {
      pending: getStatusCount(rows, "Pending"),
      released: getStatusCount(rows, "Released"),
      rejected: getStatusCount(rows, "Rejected"),
      failed: getStatusCount(rows, "ReleaseFailed")
    };
  }
}

function getStatusCount(rows: DashboardStatusCountRow[], status: string) {
  return rows.find((row) => row.status === status)?.count ?? 0;
}
