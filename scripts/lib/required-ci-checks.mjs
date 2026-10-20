/**
 * Current AI-PDM protected status-check names.
 *
 * The legacy DEV-012 label remains accepted only when validating sealed
 * historical source proofs. It is not a current branch-protection name.
 */
export const AI_PDM_POSTGRES_CUTOVER_CHECK = 'AI-PDM Isolated PostgreSQL Cutover'
export const LEGACY_PLATFORM_DEV012_POSTGRES_CUTOVER_CHECK = 'DEV-012 Isolated PostgreSQL Cutover'
export const PRODUCTION_SLICE_QC_CHECK = 'Production Slice QC'

export const CURRENT_REQUIRED_STATUS_CHECKS = Object.freeze([
  AI_PDM_POSTGRES_CUTOVER_CHECK,
  PRODUCTION_SLICE_QC_CHECK,
])

export function hasCurrentRequiredStatusChecks(checks) {
  return Array.isArray(checks) && CURRENT_REQUIRED_STATUS_CHECKS.every((name) => checks.includes(name))
}

export function hasCompatibleRequiredStatusChecks(checks) {
  return Array.isArray(checks) && checks.includes(PRODUCTION_SLICE_QC_CHECK) &&
    (checks.includes(AI_PDM_POSTGRES_CUTOVER_CHECK) ||
      checks.includes(LEGACY_PLATFORM_DEV012_POSTGRES_CUTOVER_CHECK))
}
