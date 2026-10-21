import { setTimeout as sleepDefault } from 'node:timers/promises'
import { fetchProviderRead } from './dev012-read-retry.mjs'
import { CURRENT_REQUIRED_STATUS_CHECKS } from './required-ci-checks.mjs'

const REVISION = /^[a-f0-9]{40}$/u
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u
const BRANCH = /^[A-Za-z0-9._/-]+$/u

function fail(code) { throw new Error(`DEV012_OFFICIAL_SOURCE_REVIEW_${code}`) }

/** Provider readback for the owner workflow's exact official merge commit. */
export async function verifyOfficialMergedSource({ repository, branch, revision,
  sourceTree, token, rulesetId = null, fetchImpl = fetch, sleep = sleepDefault }) {
  if (!REPOSITORY.test(repository ?? '') || !BRANCH.test(branch ?? '') ||
      !REVISION.test(revision ?? '') || !REVISION.test(sourceTree ?? '') ||
      typeof token !== 'string' || token.length < 20) fail('INPUT_INVALID')
  let providerReadRetries = 0
  const read = async (path) => {
    let response
    try {
      response = await fetchProviderRead(`https://api.github.com/repos/${repository}/${path}`, {
        redirect: 'error', headers: { accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
      }, { fetchImpl, sleep, timeoutMs: 20_000, onRetry: () => { providerReadRetries += 1 } })
    } catch { fail('PROVIDER_READ_FAILED') }
    if (!response?.ok) fail('PROVIDER_READ_FAILED')
    try { return await response.json() } catch { fail('PROVIDER_JSON_INVALID') }
  }
  const encodedBranch = branch.split('/').map(encodeURIComponent).join('/')
  const requiredChecks = CURRENT_REQUIRED_STATUS_CHECKS
  const [official, commit, pulls, checkRuns] = await Promise.all([
    read(`branches/${encodedBranch}`),
    read(`git/commits/${revision}`),
    read(`commits/${revision}/pulls?per_page=100`),
    read(`commits/${revision}/check-runs?per_page=100&filter=latest`),
  ])
  if (official?.name !== branch || !REVISION.test(official?.commit?.sha ?? '') ||
      commit?.sha !== revision || commit?.tree?.sha !== sourceTree) {
    fail('OFFICIAL_REF_MISMATCH')
  }
  if (official.protected !== true) fail('BRANCH_UNPROTECTED')
  const expectedRulesetId = rulesetId
  const rules = await read(`rules/branches/${encodedBranch}?per_page=100`)
  if (!Array.isArray(rules)) fail('SMALL_TEAM_PROTECTION_INVALID')
  const sameRuleset = rules.filter((rule) => rule?.ruleset_id === expectedRulesetId)
  const byType = new Map(sameRuleset.map((rule) => [rule.type, rule]))
  const pr = byType.get('pull_request')?.parameters
  const checks = byType.get('required_status_checks')?.parameters?.required_status_checks
  if (!Number.isInteger(expectedRulesetId) ||
      !byType.has('deletion') || !byType.has('non_fast_forward') ||
      pr?.required_approving_review_count !== 0 ||
      pr?.require_code_owner_review !== false ||
      pr?.require_last_push_approval !== false ||
      pr?.require_extra_approval_for_unattributed_changes !== false ||
      !pr?.allowed_merge_methods?.includes('merge') ||
      !Array.isArray(checks) ||
      requiredChecks.some((name) => !checks.some((check) =>
        check.context === name && check.integration_id === 15368))) {
    fail('SMALL_TEAM_PROTECTION_INVALID')
  }
  if (!Array.isArray(pulls)) fail('PULLS_INVALID')
  const matches = pulls.filter((pull) => pull?.state === 'closed' &&
    pull?.base?.repo?.full_name === repository && pull?.base?.ref === branch &&
    pull?.merge_commit_sha === revision &&
    Number.isInteger(pull?.number) && pull.number > 0 &&
    Number.isFinite(Date.parse(pull?.merged_at)))
  if (matches.length !== 1) fail('MERGED_PR_NOT_UNIQUE')

  if (!Array.isArray(checkRuns?.check_runs)) fail('REQUIRED_CHECKS_INVALID')
  const verifiedCheckRuns = requiredChecks.map((name) => {
    const rows = checkRuns.check_runs.filter((row) => row?.name === name &&
      row?.head_sha === revision && row?.app?.id === 15368)
    if (rows.length !== 1 || rows[0].status !== 'completed' ||
        rows[0].conclusion !== 'success' || !Number.isInteger(rows[0].id)) {
      fail('REQUIRED_CHECKS_NOT_SUCCESSFUL')
    }
    return { name, id: rows[0].id, status: rows[0].status,
      conclusion: rows[0].conclusion, detailsUrl: rows[0].details_url ?? null,
      completedAt: rows[0].completed_at ?? null }
  })

  // The workflow, checkout and capsule remain pinned to revision. Advancing main
  // after dispatch must not invalidate that source; never substitute the new tip.
  const observedBranchRevision = official.commit.sha
  if (observedBranchRevision !== revision) {
    const comparison = await read(`compare/${revision}...${observedBranchRevision}?per_page=1`)
    if (comparison?.status !== 'ahead' || comparison?.behind_by !== 0 ||
        !Number.isSafeInteger(comparison?.ahead_by) || comparison.ahead_by <= 0 ||
        comparison?.base_commit?.sha !== revision || comparison?.merge_base_commit?.sha !== revision) {
      fail('OFFICIAL_REF_MISMATCH')
    }
  }
  return { schemaVersion: 'jenfu.dev012.official-merged-source.v1',
    repository, branch, sourceRevision: revision, sourceTree,
    observedBranchRevision,
    sourceRelation: observedBranchRevision === revision ? 'HEAD' : 'ANCESTOR',
    providerReadRetries,
    branchProtected: true,
    reviewMode: 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED',
    rulesetId: expectedRulesetId,
    requiredChecks,
    requiredCheckRuns: verifiedCheckRuns,
    pullRequestNumber: matches[0].number,
    pullRequestUrl: matches[0].html_url,
    mergedAt: matches[0].merged_at,
    status: 'OFFICIAL_MERGED_PR_VERIFIED' }
}
