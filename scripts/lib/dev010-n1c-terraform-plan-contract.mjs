import fs from 'node:fs'

function fail(code, detail = '') {
  throw new Error(detail ? `${code}: ${detail}` : code)
}

export function loadPlanAllowlist(filePath) {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value) || !value.requiredVariables || !value.profiles) {
    fail('DEV010_N1C_INVALID_PLAN_ALLOWLIST')
  }
  return value
}

export function normalizePlanChanges(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) fail('DEV010_N1C_INVALID_PLAN')
  const source = Array.isArray(plan.resourceChanges)
    ? plan.resourceChanges
    : Array.isArray(plan.resource_changes)
      ? plan.resource_changes
      : []
  return source.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('DEV010_N1C_INVALID_PLAN')
    const actions = Array.isArray(entry.actions) ? entry.actions : entry.change?.actions
    if (typeof entry.address !== 'string' || !Array.isArray(actions)) fail('DEV010_N1C_INVALID_PLAN')
    return { address: entry.address, actions: [...actions] }
  })
}

export function assertPlanAllowlist(changes, allowedAddresses) {
  if (!Array.isArray(changes) || !Array.isArray(allowedAddresses)) fail('DEV010_N1C_INVALID_PLAN')
  const allow = new Set(allowedAddresses)
  if (allow.size !== allowedAddresses.length || [...allow].some((address) => typeof address !== 'string' || address.length === 0)) {
    fail('DEV010_N1C_INVALID_PLAN_ALLOWLIST')
  }
  for (const change of changes) {
    if (!change || typeof change !== 'object' || !allow.has(change.address)) fail('DEV010_N1C_UNKNOWN_RESOURCE', change?.address)
    if (!Array.isArray(change.actions) || change.actions.some((action) => !['create', 'no-op', 'read'].includes(action))) {
      fail('DEV010_N1C_DESTROY_OR_REPLACE_FORBIDDEN', change.address)
    }
  }
  return {
    allowedAddressCount: allow.size,
    changeCount: changes.length,
    observedAddresses: changes.map((change) => change.address).sort(),
    status: 'PASS',
  }
}

export function assertPlanProfile(plan, allowlist, profileName) {
  const profile = allowlist?.profiles?.[profileName]
  if (!profile || !Array.isArray(profile.addresses) || !profile.variables) fail('DEV010_N1C_UNKNOWN_PLAN_PROFILE', profileName)
  const expectedVariables = { ...allowlist.requiredVariables, ...profile.variables }
  for (const [name, expected] of Object.entries(expectedVariables)) {
    const actual = plan?.variables?.[name]?.value
    const matchesTypedCliValue = typeof expected === 'boolean' && actual === String(expected)
    if (actual !== expected && !matchesTypedCliValue) fail('DEV010_N1C_PLAN_VARIABLE_MISMATCH', name)
  }
  const changes = normalizePlanChanges(plan)
  const gate = assertPlanAllowlist(changes, profile.addresses)
  const observed = changes.map((change) => change.address)
  if (new Set(observed).size !== observed.length) fail('DEV010_N1C_DUPLICATE_PLAN_RESOURCE')
  if (observed.length !== profile.addresses.length || profile.addresses.some((address) => !observed.includes(address))) {
    fail('DEV010_N1C_PLAN_PROFILE_MISMATCH', profileName)
  }
  return { ...gate, profile: profileName }
}
