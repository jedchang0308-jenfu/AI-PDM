import { describe, expect, it, vi } from 'vitest'
import { normalizeChineseEmployeeName, pdmPersonDisplayName, principalHeaderDisplayName } from '@/lib/principal-employee-display-name'
import { readPdmPersonDisplayNames, readPrincipalChineseEmployeeName } from '@/lib/principal-employee-display-name-repository'

describe('DEV-127 Chinese Principal header display', () => {
  it.each(['張仕杰', ' 張 仕杰 ', '陳·志明', '林・美華', '王‧小明'])('accepts the shared Chinese-name rule: %s', value => {
    expect(normalizeChineseEmployeeName(value)).toBe(value.trim())
  })
  it.each(['Win', 'JFS0005', 'employee-one', 'jedchang0308@jenfu.com.tw', '張 Jack', '張<仕杰>', '張\n仕杰', '張'.repeat(121), null])('does not invent a Chinese name from %j', value => {
    expect(normalizeChineseEmployeeName(value)).toBeNull()
    expect(principalHeaderDisplayName({employee_name:value})).toBe('員工')
  })
  it('uses formal employee name, then email, then app display name', () => {
    const profile = { email: ' test@example.test ', display_name: '張測試' }
    expect(pdmPersonDisplayName({ ...profile, employee_name: '陳測試' })).toBe('陳測試')
    expect(pdmPersonDisplayName({ ...profile, employee_name: 'Invalid formal name' })).toBe('test@example.test')
    expect(pdmPersonDisplayName({ ...profile, email: ' ' })).toBe('張測試')
    expect(pdmPersonDisplayName({ email: null, display_name: ' ' })).toBeNull()
  })
  it('batches scoped PDM profiles and keeps email when the employee view is unavailable', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM users')) return [{ id: 'profile-a', email: 'a@example.test', display_name: 'Alias' }]
      if (sql.includes('v_principal_display_profiles_v1')) throw new Error('missing view')
      return []
    })
    const client = { kind: 'postgres', transactionScope: 'postgres', query }
    await expect(readPdmPersonDisplayNames(client as never, 'company-a', ['profile-a', 'profile-a', 'profile-other']))
      .resolves.toEqual(new Map([['profile-a', 'a@example.test']]))
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE company_id = :companyId'),
      { companyId: 'company-a', profileIds: '["profile-a","profile-other"]' })
    expect(query).toHaveBeenCalledWith(expect.stringContaining('employee.employee_id = account.employee_id'),
      { companyId: 'company-a', profileIds: '["profile-a"]' })
    expect(query.mock.calls.at(-2)).toEqual(['ROLLBACK TO SAVEPOINT dev127_employee_display_name'])
  })
  it('queries exact Principal and Employee and denies a second Principal or ambiguous projection', async () => {
    const query=vi.fn(async()=>[{principal_id:'principal-a',employee_id:'JFS0005',employee_name:'張仕杰'}])
    const client={kind:'postgres',query}
    await expect(readPrincipalChineseEmployeeName(client as never,'principal-a','JFS0005')).resolves.toBe('張仕杰')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('principal_id=:principalId AND employee_id=:employeeId'),
      {principalId:'principal-a',employeeId:'JFS0005'})
    await expect(readPrincipalChineseEmployeeName(client as never,'other-principal','JFS0005')).resolves.toBeNull()
    query.mockResolvedValue([{principal_id:'principal-a',employee_id:'JFS0005',employee_name:'張仕杰'},
      {principal_id:'principal-a',employee_id:'JFS0005',employee_name:'張仕杰'}])
    await expect(readPrincipalChineseEmployeeName(client as never,'principal-a','JFS0005')).resolves.toBeNull()
  })
  it('rolls back only the optional display query when the view is unavailable inside a Principal transaction', async () => {
    const sql:string[]=[]
    const query=vi.fn(async(text:string)=>{sql.push(text);if(text.includes('v_principal_display_profiles_v1'))throw Error('missing view');return[]})
    await expect(readPrincipalChineseEmployeeName({kind:'postgres',transactionScope:'postgres',query} as never,'principal-a','JFS0005')).resolves.toBeNull()
    expect(sql[0]).toBe('SAVEPOINT dev127_employee_display_name')
    expect(sql.slice(-2)).toEqual(['ROLLBACK TO SAVEPOINT dev127_employee_display_name','RELEASE SAVEPOINT dev127_employee_display_name'])
  })
})
