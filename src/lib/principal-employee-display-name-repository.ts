import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import { normalizeChineseEmployeeName, pdmPersonDisplayName } from '@/lib/principal-employee-display-name'

/** Uses the already verified exact Principal/Employee; provider aliases and
 * business approver names are not queried or changed here. */
export async function readPrincipalChineseEmployeeName(client: AsyncDatabaseClient,
  principalId: string, employeeId: string): Promise<string | null> {
  if (client.kind !== 'postgres' || !principalId || !employeeId) return null
  const rows = await readOptionalEmployeeNames(client, () =>
    client.query<{ principal_id: string; employee_id: string; employee_name: unknown }>(`
      SELECT principal_id,employee_id,employee_name
      FROM orgmaster_contract.v_principal_display_profiles_v1
      WHERE principal_id=:principalId AND employee_id=:employeeId
      LIMIT 2`, { principalId, employeeId }))
  if (rows.length !== 1 || rows[0].principal_id !== principalId || rows[0].employee_id !== employeeId) return null
  return normalizeChineseEmployeeName(rows[0].employee_name)
}

/** Resolve only PDM profiles already selected by the caller's resource authorization. */
export async function readPdmPersonDisplayNames(client: AsyncDatabaseClient,
  companyId: string, profileIds: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(profileIds.filter((id): id is string => Boolean(id)))]
  const names = new Map<string, string>()
  if (!companyId || !ids.length) return names

  const params = { companyId, profileIds: JSON.stringify(ids) }
  const scopedIds = client.kind === 'postgres'
    ? 'SELECT jsonb_array_elements_text(CAST(:profileIds AS jsonb))'
    : 'SELECT value FROM json_each(:profileIds)'
  const profiles = await client.query<{ id: string; email: string | null; display_name: string }>(`
    SELECT id, email, display_name FROM users
    WHERE company_id = :companyId AND id IN (${scopedIds})
  `, params)
  if (!profiles.length) return names

  const employees = client.kind !== 'postgres' ? [] : await readOptionalEmployeeNames(client, () =>
    client.query<{ id: string; employee_name: string | null }>(`
      SELECT account.pdm_user_id AS id,
             CASE WHEN count(*) = 1 THEN min(employee.employee_name) END AS employee_name
      FROM ai_pdm_core.principal_accounts account
      JOIN orgmaster_contract.v_principal_display_profiles_v1 employee
        ON employee.principal_id = account.principal_id AND employee.employee_id = account.employee_id
      WHERE account.company_id = :companyId
        AND account.pdm_user_id IN (${scopedIds})
      GROUP BY account.pdm_user_id
    `, { companyId, profileIds: JSON.stringify(profiles.map(profile => profile.id)) }))

  const employeeNameByProfile = new Map(employees.map(employee => [employee.id, employee.employee_name]))
  for (const profile of profiles) {
    const name = pdmPersonDisplayName({ ...profile, employee_name: employeeNameByProfile.get(profile.id) })
    if (name) names.set(profile.id, name)
  }
  return names
}

async function readOptionalEmployeeNames<T>(client: AsyncDatabaseClient, read: () => Promise<T[]>): Promise<T[]> {
  const savepoint = client.transactionScope === 'postgres'
  let started = false
  try {
    if (savepoint) { await client.query('SAVEPOINT dev127_employee_display_name'); started = true }
    const rows = await read()
    if (started) { await client.query('RELEASE SAVEPOINT dev127_employee_display_name'); started = false }
    return rows
  } catch {
    // A missing or temporarily unavailable display-only view must not abort the
    // verified Principal transaction and turn an ordinary login into a failure.
    if (started) {
      await client.query('ROLLBACK TO SAVEPOINT dev127_employee_display_name').catch(() => [])
      await client.query('RELEASE SAVEPOINT dev127_employee_display_name').catch(() => [])
    }
    return []
  }
}
