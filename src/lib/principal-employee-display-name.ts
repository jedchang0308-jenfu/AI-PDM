/** Display only; this value never contributes to authentication or permission. */
export function normalizeChineseEmployeeName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  if (!name || Array.from(name).length > 120 || !/\p{Script=Han}/u.test(name) ||
      !/^[\p{Script=Han}\p{Zs}·・‧]+$/u.test(name)) return null
  return name
}

export function principalHeaderDisplayName(user: { employee_name?: unknown; display_name?: unknown } | null) {
  // Legacy display_name may be a Google nickname or an old app profile. Even a
  // Chinese-looking value is not proof of the current Employee's formal name.
  return normalizeChineseEmployeeName(user?.employee_name) ?? '員工'
}
