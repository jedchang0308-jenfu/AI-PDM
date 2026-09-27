import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyOfficialMergedSource } from './lib/dev012-official-source-review.mjs'

const repository = 'jedchang0308-jenfu/AI-PDM'
const branch = 'main'
const revision = 'a'.repeat(40)
const sourceTree = 'b'.repeat(40)
const input = { repository, branch, revision, sourceTree, token: 'x'.repeat(25) }

function provider({ officialChange = {}, commitChange = {}, pullsChange = null,
  status = 200 } = {}) {
  let requests = 0
  const fetchImpl = async (url, options) => {
    requests += 1
    assert.equal(options.headers.authorization, `Bearer ${input.token}`)
    if (status !== 200) return new Response('', { status })
    if (url.endsWith('/branches/main')) return new Response(JSON.stringify({
      name: branch, protected: true, commit: { sha: revision }, ...officialChange,
    }))
    if (url.endsWith(`/git/commits/${revision}`)) return new Response(JSON.stringify({
      sha: revision, tree: { sha: sourceTree }, ...commitChange,
    }))
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
  assert.equal(fake.requests(), 3)
})

test('rejects an unprotected official branch before release', async () => {
  await assert.rejects(verifyOfficialMergedSource({ ...input,
    fetchImpl: provider({ officialChange: { protected: false } }).fetchImpl }),
  /BRANCH_UNPROTECTED/u)
})

test('rejects direct push, wrong base, ambiguous PR and source drift', async () => {
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
    fetchImpl: provider({ officialChange: { commit: { sha: 'c'.repeat(40) } } }).fetchImpl }),
  /OFFICIAL_REF_MISMATCH/u)
  await assert.rejects(verifyOfficialMergedSource({ ...input,
    fetchImpl: provider({ commitChange: { tree: { sha: 'c'.repeat(40) } } }).fetchImpl }),
  /OFFICIAL_REF_MISMATCH/u)
})

test('provider denial fails closed and malformed input makes no request', async () => {
  await assert.rejects(verifyOfficialMergedSource({ ...input,
    fetchImpl: provider({ status: 403 }).fetchImpl }), /PROVIDER_READ_FAILED/u)
  const fake = provider()
  await assert.rejects(verifyOfficialMergedSource({ ...input, token: '',
    fetchImpl: fake.fetchImpl }), /INPUT_INVALID/u)
  assert.equal(fake.requests(), 0)
})
