import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import { normalizeChineseEmployeeName } from '@/lib/principal-employee-display-name'

/** Uses the already verified exact Principal/Employee; provider aliases and
 * business approver names are not queried or changed here. */
export async function readPrincipalChineseEmployeeName(client: AsyncDatabaseClient,
  principalId: string, employeeId: string): Promise<string | null> {
  if (client.kind !== 'postgres' || !principalId || !employeeId) return null
  const savepoint = client.transactionScope === 'postgres'
  let started = false
  try {
    if (savepoint) { await client.query('SAVEPOINT dev127_employee_display_name'); started = true }
    const rows = await client.query<{ principal_id: string; employee_id: string; employee_name: unknown }>(`
      SELECT principal_id,employee_id,employee_name
      FROM orgmaster_contract.v_principal_display_profiles_v1
      WHERE principal_id=:principalId AND employee_id=:employeeId
      LIMIT 2`, { principalId, employeeId })
    if (started) { await client.query('RELEASE SAVEPOINT dev127_employee_display_name'); started = false }
    if (rows.length !== 1 || rows[0].principal_id !== principalId || rows[0].employee_id !== employeeId) return null
    return normalizeChineseEmployeeName(rows[0].employee_name)
  } catch {
    // A missing or temporarily unavailable display-only view must not abort the
    // verified Principal transaction and turn an ordinary login into a failure.
    if (started) {
      await client.query('ROLLBACK TO SAVEPOINT dev127_employee_display_name').catch(() => [])
      await client.query('RELEASE SAVEPOINT dev127_employee_display_name').catch(() => [])
    }
    return null
  }
}
