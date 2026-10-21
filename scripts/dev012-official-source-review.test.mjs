import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { verifyOfficialMergedSource } from './lib/dev012-official-source-review.mjs'
import { CURRENT_REQUIRED_STATUS_CHECKS } from './lib/required-ci-checks.mjs'
import { assertOfficialSourceWorkflow, OFFICIAL_SOURCE_WORKFLOW_REFS, verifyOfficialWorkflowSource } from './dev012-verify-official-source.mjs'

const repository = 'jedchang0308-jenfu/AI-PDM'
const branch = 'main'
const revision = 'a'.repeat(40)
const sourceTree = 'b'.repeat(40)
const input = { repository, branch, revision, sourceTree, token: 'x'.repeat(25),
  rulesetId: 24077878 }

test('official source gate accepts the RD permission readback workflow ref', () => {
  assert.equal(OFFICIAL_SOURCE_WORKFLOW_REFS.size, 3)
  assert.doesNotThrow(() => assertOfficialSourceWorkflow({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/read-ai-pdm-rd-permission-state-production.yml@refs/heads/main` }))
  assert.throws(() => assertOfficialSourceWorkflow({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/unknown.yml@refs/heads/main` }), /WORKFLOW_INVALID/u)
})

test('required full QC executes and source-binds the official source regression', () => {
  const source = fs.readFileSync(new URL('./qc-dev-117-continuous-release.mjs', import.meta.url), 'utf8')
  const invocation = source.slice(source.indexOf('const run ='), source.indexOf('const imageTempPrefix'))
  assert.match(invocation, /'scripts\/dev012-official-source-review\.test\.mjs'/u)
  const snapshot = source.slice(source.indexOf('const files ='))
  for (const file of ['scripts/lib/dev012-official-source-review.mjs', 'scripts/lib/required-ci-checks.mjs',
    'scripts/dev012-verify-official-source.mjs', 'scripts/dev012-official-source-review.test.mjs']) {
    assert.ok(snapshot.includes(`'${file}'`), file)
  }
})

const requiredCheckNames = ['DEV-012 Isolated PostgreSQL Cutover', 'Production Slice QC']
const successfulCheckRuns = requiredCheckNames.map((name, index) => ({
  id: index + 1, name, head_sha: revision, status: 'completed', conclusion: 'success',
  app: { id: 15368 }, details_url: `https://github.com/${repository}/actions/runs/${index + 1}`,
  completed_at: '2026-09-27T11:40:00Z',
}))

function provider({ officialChange = {}, rulesChange = null, commitChange = {}, pullsChange = null,
  checkRunsChange = null, comparison = null, status = 200 } = {}) {
  let requests = 0
  const fetchImpl = async (url, options) => {
    requests += 1
    assert.equal(options.headers.authorization, `Bearer ${input.token}`)
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    if (status !== 200) return new Response('', { status })
    if (url.endsWith('/branches/main')) return new Response(JSON.stringify({
      name: branch, protected: true, commit: { sha: revision }, ...officialChange,
    }))
    if (url.includes(`/rules/branches/${branch}?`)) return new Response(JSON.stringify(
      rulesChange ?? [
        { ruleset_id: 24077878, type: 'deletion' },
        { ruleset_id: 24077878, type: 'non_fast_forward' },
        { ruleset_id: 24077878, type: 'pull_request', parameters: {
          required_approving_review_count: 0,
          require_code_owner_review: false, require_last_push_approval: false,
          require_extra_approval_for_unattributed_changes: false,
          allowed_merge_methods: ['merge'],
        } },
        { ruleset_id: 24077878, type: 'required_status_checks', parameters: {
          required_status_checks: CURRENT_REQUIRED_STATUS_CHECKS.map((context) => ({
            context, integration_id: 15368,
          })),
        } },
      ]))
    if (url.endsWith(`/git/commits/${revision}`)) return new Response(JSON.stringify({
      sha: revision, tree: { sha: sourceTree }, ...commitChange,
    }))
    if (url.includes(`/commits/${revision}/check-runs?`)) return new Response(JSON.stringify(
      checkRunsChange ?? { total_count: successfulCheckRuns.length, check_runs: successfulCheckRuns }))
    if (url.includes('/compare/')) {
      assert.equal(url, `https://api.github.com/repos/${repository}/compare/${revision}...${officialChange.commit.sha}?per_page=1`)
      return new Response(JSON.stringify(comparison))
    }
    if (url.includes(`/commits/${revision}/pulls?`)) return new Response(JSON.stringify(
      pullsChange ?? [{ number: 94, state: 'closed',
        base: { repo: { full_name: repository }, ref: branch },
        merge_commit_sha: revision, merged_at: '2026-09-27T11:38:10Z',
        html_url: 'https://github.com/jedchang0308-jenfu/AI-PDM/pull/94' }] ))
    throw new Error('UNEXPECTED_PROVIDER_URL')
  }
  return { fetchImpl, requests: () => requests }
}

test('accepts an exact merged PR on the protected official branch', async () => {
  const fake = provider()
  const result = await verifyOfficialMergedSource({ ...input, fetchImpl: fake.fetchImpl })
  assert.equal(result.status, 'OFFICIAL_MERGED_PR_VERIFIED')
  assert.equal(result.branchProtected, true)
  assert.equal(result.pullRequestNumber, 94)
  assert.equal(result.reviewMode, 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED')
  assert.equal(result.sourceRelation, 'HEAD')
  assert.equal(result.observedBranchRevision, revision)
  assert.deepEqual(result.requiredCheckRuns.map((row) => row.name), requiredCheckNames)
  assert.equal(result.providerReadRetries, 0)
  assert.equal(fake.requests(), 5)
})

test('exact merged source requires both GitHub Actions check runs to succeed', async () => {
  const invalid = [
    { total_count: 1, check_runs: successfulCheckRuns.slice(0, 1) },
    { total_count: 2, check_runs: successfulCheckRuns.map((row, index) => index === 0 ? { ...row, conclusion: 'failure' } : row) },
    { total_count: 2, check_runs: successfulCheckRuns.map((row, index) => index === 0 ? { ...row, status: 'in_progress', conclusion: null } : row) },
    { total_count: 2, check_runs: successfulCheckRuns.map((row, index) => index === 0 ? { ...row, head_sha: 'c'.repeat(40) } : row) },
    { total_count: 2, check_runs: successfulCheckRuns.map((row, index) => index === 0 ? { ...row, app: { id: 1 } } : row) },
    { total_count: 3, check_runs: [...successfulCheckRuns, successfulCheckRuns[0]] },
  ]
  for (const checkRunsChange of invalid) {
    await assert.rejects(verifyOfficialMergedSource({ ...input,
      fetchImpl: provider({ checkRunsChange }).fetchImpl }), /REQUIRED_CHECKS_NOT_SUCCESSFUL/u)
  }
  await assert.rejects(verifyOfficialMergedSource({ ...input,
    fetchImpl: provider({ checkRunsChange: {} }).fetchImpl }), /REQUIRED_CHECKS_INVALID/u)
})

test('rejects incomplete or wrong ruleset', async () => {
  for (const rulesChange of [[], [{ ruleset_id: 24077878, type: 'pull_request',
    parameters: { required_approving_review_count: 1 } }]]) {
    await assert.rejects(verifyOfficialMergedSource({ ...input,
      fetchImpl: provider({ rulesChange }).fetchImpl }), /SMALL_TEAM_PROTECTION_INVALID/u)
  }
})

test('rejects an unprotected official branch before release', async () => {
  await assert.rejects(verifyOfficialMergedSource({ ...input,
    fetchImpl: provider({ officialChange: { protected: false } }).fetchImpl }),
  /BRANCH_UNPROTECTED/u)
})

test('rejects direct push, wrong base, ambiguous PR and source tree drift', async () => {
  for (const fake of [
    provider({ pullsChange: [] }),
    provider({ pullsChange: [{ number: 1, state: 'closed',
      base: { repo: { full_name: repository }, ref: 'feature' },
      merge_commit_sha: revision, merged_at: '2026-09-27T11:38:10Z' }] }),
    provider({ pullsChange: [1, 2].map((number) => ({ number, state: 'closed',
      base: { repo: { full_name: repository }, ref: branch },
      merge_commit_sha: revision, merged_at: '2026-09-27T11:38:10Z' })) }),
  ]) await assert.rejects(verifyOfficialMergedSource({ ...input,
    fetchImpl: fake.fetchImpl }), /MERGED_PR_NOT_UNIQUE/u)
  await assert.rejects(verifyOfficialMergedSource({ ...input,
    fetchImpl: provider({ commitChange: { tree: { sha: 'c'.repeat(40) } } }).fetchImpl }),
  /OFFICIAL_REF_MISMATCH/u)
})

const advancedHead = 'c'.repeat(40)
const advancedBranch = { commit: { sha: advancedHead } }
const descendant = { status: 'ahead', ahead_by: 2, behind_by: 0,
  base_commit: { sha: revision }, merge_base_commit: { sha: revision } }

test('release, migration and readback entrypoints share pinned-source checks without a revision override', async () => {
  for (const workflowRef of OFFICIAL_SOURCE_WORKFLOW_REFS) {
    const environment = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main',
      GITHUB_WORKFLOW_REF: workflowRef, GITHUB_SHA: revision, GITHUB_TOKEN: input.token }
    const fake = provider({ officialChange: advancedBranch, comparison: descendant })
    const result = await verifyOfficialWorkflowSource({ environment, revision, sourceTree,
      fetchImpl: fake.fetchImpl })
    assert.equal(result.sourceRevision, revision)
    assert.equal(result.sourceRelation, 'ANCESTOR')
    const requests = fake.requests()
    await assert.rejects(verifyOfficialWorkflowSource({ environment, revision: advancedHead,
      sourceTree, fetchImpl: fake.fetchImpl }), /CHECKOUT_MISMATCH/u)
    assert.equal(fake.requests(), requests)
  }
})

test('main advancing after dispatch preserves the exact pinned merge and tree', async () => {
  const fake = provider({ officialChange: advancedBranch, comparison: descendant })
  const result = await verifyOfficialMergedSource({ ...input, fetchImpl: fake.fetchImpl })
  assert.equal(result.sourceRevision, revision)
  assert.equal(result.sourceTree, sourceTree)
  assert.equal(result.observedBranchRevision, advancedHead)
  assert.equal(result.sourceRelation, 'ANCESTOR')
  assert.equal(result.status, 'OFFICIAL_MERGED_PR_VERIFIED')
  assert.equal(fake.requests(), 6)
})

test('advanced main does not admit a divergent, removed, unknown or mismatched source', async () => {
  for (const comparison of [null, {},
    { ...descendant, status: 'behind' }, { ...descendant, status: 'diverged' },
    { ...descendant, status: 'identical' }, { ...descendant, behind_by: 1 },
    { ...descendant, ahead_by: 0 }, { ...descendant, ahead_by: '2' },
    { ...descendant, base_commit: { sha: advancedHead } },
    { ...descendant, merge_base_commit: { sha: advancedHead } },
  ]) {
    await assert.rejects(verifyOfficialMergedSource({ ...input,
      fetchImpl: provider({ officialChange: advancedBranch, comparison }).fetchImpl }),
    /OFFICIAL_REF_MISMATCH/u)
  }
})

test('ancestor source still requires the exact merged PR and current protection', async () => {
  for (const [changes, error] of [
    [{ pullsChange: [] }, /MERGED_PR_NOT_UNIQUE/u],
    [{ rulesChange: [] }, /SMALL_TEAM_PROTECTION_INVALID/u],
    [{ officialChange: { ...advancedBranch, protected: false } }, /BRANCH_UNPROTECTED/u],
  ]) {
    await assert.rejects(verifyOfficialMergedSource({ ...input,
      fetchImpl: provider({ officialChange: advancedBranch, comparison: descendant, ...changes }).fetchImpl }), error)
  }
})

test('a transient read is retried without restarting successful reads or changing the source', async () => {
  for (const failure of [
    () => new Response('', { status: 500 }),
    () => new Response('', { status: 502 }),
    () => new Response('', { status: 503 }),
    () => new Response('', { status: 504 }),
    () => new Response('', { status: 429, headers: { 'retry-after': '1' } }),
    () => { throw Object.assign(new Error('connection reset'), { cause: { code: 'ECONNRESET' } }) },
    () => { throw new DOMException('timeout', 'TimeoutError') },
  ]) {
    const fake = provider()
    const waits = []
    let failed = false
    const result = await verifyOfficialMergedSource({ ...input, sleep: async ms => waits.push(ms),
      fetchImpl: (url, options) => {
        if (url.endsWith('/branches/main') && !failed) { failed = true; return failure() }
        return fake.fetchImpl(url, options)
      } })
    assert.equal(result.status, 'OFFICIAL_MERGED_PR_VERIFIED')
    assert.equal(result.sourceRevision, revision)
    assert.equal(result.providerReadRetries, 1)
    assert.equal(fake.requests(), 5)
    assert.equal(waits.length, 1)
  }
})

test('transient read retries are bounded and preserve the first failure category', async () => {
  const waits = []
  let attempts = 0
  await assert.rejects(verifyOfficialMergedSource({ ...input, sleep: async ms => waits.push(ms),
    fetchImpl: (url, options) => {
      if (!url.includes('/rules/')) return provider().fetchImpl(url, options)
      attempts += 1
      return new Response('', { status: 503 })
    } }), /PROVIDER_READ_FAILED/u)
  assert.equal(attempts, 3)
  assert.deepEqual(waits, [500, 1000])
})

test('denials, long rate limits, malformed JSON and non-transient failures are not retried', async () => {
  for (const failure of [
    () => new Response('', { status: 401 }),
    () => new Response('', { status: 403 }),
    () => new Response('', { status: 404 }),
    () => new Response('', { status: 429 }),
    () => new Response('', { status: 429, headers: { 'retry-after': '60' } }),
    () => new Response('not json'),
    () => { throw new Error('configuration failure') },
  ]) {
    let attempts = 0
    const waits = []
    await assert.rejects(verifyOfficialMergedSource({ ...input, sleep: async ms => waits.push(ms),
      fetchImpl: (url, options) => {
        if (!url.includes('/rules/')) return provider().fetchImpl(url, options)
        attempts += 1
        return failure()
      } }), /PROVIDER_(?:READ_FAILED|JSON_INVALID)/u)
    assert.equal(attempts, 1)
    assert.deepEqual(waits, [])
  }
})

test('provider denial fails closed and malformed input makes no request', async () => {
  await assert.rejects(verifyOfficialMergedSource({ ...input,
    fetchImpl: provider({ status: 403 }).fetchImpl }), /PROVIDER_READ_FAILED/u)
  const fake = provider()
  await assert.rejects(verifyOfficialMergedSource({ ...input, token: '',
    fetchImpl: fake.fetchImpl }), /INPUT_INVALID/u)
  assert.equal(fake.requests(), 0)
})
