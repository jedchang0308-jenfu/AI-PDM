import { setTimeout as sleepDefault } from 'node:timers/promises'

const REVISION = /^[a-f0-9]{40}$/u
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u
const BRANCH = /^[A-Za-z0-9._/-]+$/u

function fail(code) { throw new Error(`DEV012_OFFICIAL_SOURCE_REVIEW_${code}`) }

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
])

// GET only: never replay a mutation or spin on authentication/authorization.
// Respect server delays; a long or unknown rate limit remains an explicit stop.
function retryDelay(response, attempt) {
  if (![429, 500, 502, 503, 504].includes(response?.status)) return null
  const header = response.headers?.get('retry-after')
  if (header != null) {
    const delay = /^\d+$/u.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()
    return Number.isFinite(delay) && delay >= 0 && delay <= 5000 ? Math.max(500, delay) : null
  }
  return response.status === 429 ? null : 500 * 2 ** attempt
}

/** Provider readback for the owner workflow's exact official merge commit. */
export async function verifyOfficialMergedSource({ repository, branch, revision,
  sourceTree, token, rulesetId = null, fetchImpl = fetch, sleep = sleepDefault }) {
  if (!REPOSITORY.test(repository ?? '') || !BRANCH.test(branch ?? '') ||
      !REVISION.test(revision ?? '') || !REVISION.test(sourceTree ?? '') ||
      typeof token !== 'string' || token.length < 20) fail('INPUT_INVALID')
  let providerReadRetries = 0
  const read = async (path) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response
      let delay
      try {
        response = await fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
          method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20_000),
          headers: { accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
        })
      } catch (error) {
        if (error?.name !== 'TimeoutError' &&
            !TRANSIENT_NETWORK_CODES.has(error?.cause?.code ?? error?.code)) fail('PROVIDER_READ_FAILED')
        delay = 500 * 2 ** attempt
      }
      if (response?.ok) {
        try { return await response.json() } catch { fail('PROVIDER_JSON_INVALID') }
      }
      if (response) delay = retryDelay(response, attempt)
      // Releasing an error body must not hide the original provider failure.
      try { await response?.body?.cancel() } catch { /* no mutation to recover */ }
      if (delay == null || attempt === 2) fail('PROVIDER_READ_FAILED')
      providerReadRetries += 1
      await sleep(delay)
    }
  }
  const encodedBranch = branch.split('/').map(encodeURIComponent).join('/')
  const [official, commit, pulls] = await Promise.all([
    read(`branches/${encodedBranch}`),
    read(`git/commits/${revision}`),
    read(`commits/${revision}/pulls?per_page=100`),
  ])
  if (official?.name !== branch || !REVISION.test(official?.commit?.sha ?? '') ||
      commit?.sha !== revision || commit?.tree?.sha !== sourceTree) {
    fail('OFFICIAL_REF_MISMATCH')
  }
  if (official.protected !== true) fail('BRANCH_UNPROTECTED')
  const requiredChecks = ['DEV-012 Isolated PostgreSQL Cutover', 'Production Slice QC']
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
    pullRequestNumber: matches[0].number,
    pullRequestUrl: matches[0].html_url,
    mergedAt: matches[0].merged_at,
    status: 'OFFICIAL_MERGED_PR_VERIFIED' }
}
