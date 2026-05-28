import { getDb } from "@/lib/db";

export function getDashboardMetrics(submittedBy?: string) {
  const database = getDb();
  const statuses = (
    submittedBy
      ? database.prepare("SELECT status, COUNT(*) as count FROM submissions WHERE submitted_by = ? GROUP BY status").all(submittedBy)
      : database.prepare("SELECT status, COUNT(*) as count FROM submissions GROUP BY status").all()
  ) as Array<{ status: string; count: number }>;
  return {
    pending: statuses.find((row) => row.status === "Pending")?.count ?? 0,
    released: statuses.find((row) => row.status === "Released")?.count ?? 0,
    rejected: statuses.find((row) => row.status === "Rejected")?.count ?? 0,
    failed: statuses.find((row) => row.status === "ReleaseFailed")?.count ?? 0
  };
}
