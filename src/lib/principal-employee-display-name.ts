/** Display only; this value never contributes to authentication or permission. */
export function normalizeChineseEmployeeName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  if (!name || Array.from(name).length > 120 || !/\p{Script=Han}/u.test(name) ||
      !/^[\p{Script=Han}\p{Zs}·・‧]+$/u.test(name)) return null
  return name
}

export function pdmPersonDisplayName(person: {
  employee_name?: unknown
  email?: string | null
  display_name?: string | null
} | null | undefined): string | null {
  return normalizeChineseEmployeeName(person?.employee_name) ||
    person?.email?.trim() || person?.display_name?.trim() || null
}

export function principalHeaderDisplayName(user: Parameters<typeof pdmPersonDisplayName>[0]) {
  return pdmPersonDisplayName(user) ?? '員工'
}
