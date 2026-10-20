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
  FROM submissions s
  WHERE (CAST(:submittedBy AS text) IS NULL OR s.submitted_by = CAST(:submittedBy AS text))
    AND (CAST(:companyId AS text) IS NULL OR s.company_id = CAST(:companyId AS text))
    AND (s.status <> 'ReleaseFailed' OR s.resolved_by_submission_id IS NULL)
    AND __CAPABILITY_FILTER__
  GROUP BY s.status
`;

export class AsyncDashboardRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async getDashboardMetrics(input: { submittedBy?: string; companyId?: string; visibleSubmissionIds?: string[] } = {}): Promise<DashboardMetrics> {
    const filter = dashboardCapabilityFilter(this.client.kind, input.visibleSubmissionIds);
    const sql = SELECT_ASYNC_DASHBOARD_STATUS_COUNTS_SQL.replace("__CAPABILITY_FILTER__", filter.sql);
    const rows = await this.client.query<DashboardStatusCountRow>(sql, {
      submittedBy: input.submittedBy ?? null,
      companyId: input.companyId ?? null,
      ...filter.params
    });

    return {
      pending: getStatusCount(rows, "Pending"),
      released: getStatusCount(rows, "Released"),
      rejected: getStatusCount(rows, "Rejected"),
      failed: getStatusCount(rows, "ReleaseFailed")
    };
  }
}

function dashboardCapabilityFilter(kind: AsyncDatabaseClient["kind"], ids?: string[]) {
  if (ids === undefined) return { sql: "TRUE", params: {} };
  const sql = kind === "postgres"
    ? "s.id IN (SELECT jsonb_array_elements_text(CAST(:visibleSubmissionIdsJson AS jsonb)))"
    : "s.id IN (SELECT value FROM json_each(:visibleSubmissionIdsJson))";
  return { sql, params: { visibleSubmissionIdsJson: JSON.stringify(ids) } };
}

function getStatusCount(rows: DashboardStatusCountRow[], status: string) {
  return rows.find((row) => row.status === status)?.count ?? 0;
}
