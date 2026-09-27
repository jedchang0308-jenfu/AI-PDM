const REVISION = /^[a-f0-9]{40}$/u
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u
const BRANCH = /^[A-Za-z0-9._/-]+$/u

function fail(code) { throw new Error(`DEV012_OFFICIAL_SOURCE_REVIEW_${code}`) }

/** Provider readback for the owner workflow's exact official merge commit. */
export async function verifyOfficialMergedSource({ repository, branch, revision,
  sourceTree, token, fetchImpl = fetch }) {
  if (!REPOSITORY.test(repository ?? '') || !BRANCH.test(branch ?? '') ||
      !REVISION.test(revision ?? '') || !REVISION.test(sourceTree ?? '') ||
      typeof token !== 'string' || token.length < 20) fail('INPUT_INVALID')
  const read = async (path) => {
    let response
    try {
      response = await fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
      })
    } catch { fail('PROVIDER_READ_FAILED') }
    if (!response?.ok) fail('PROVIDER_READ_FAILED')
    try { return await response.json() } catch { fail('PROVIDER_JSON_INVALID') }
  }
  const encodedBranch = branch.split('/').map(encodeURIComponent).join('/')
  const [official, commit, pulls] = await Promise.all([
    read(`branches/${encodedBranch}`),
    read(`git/commits/${revision}`),
    read(`commits/${revision}/pulls?per_page=100`),
  ])
  if (official?.name !== branch || official?.commit?.sha !== revision ||
      commit?.sha !== revision || commit?.tree?.sha !== sourceTree) {
    fail('OFFICIAL_REF_MISMATCH')
  }
  if (official.protected !== true) fail('BRANCH_UNPROTECTED')
  if (!Array.isArray(pulls)) fail('PULLS_INVALID')
  const matches = pulls.filter((pull) => pull?.state === 'closed' &&
    pull?.base?.repo?.full_name === repository && pull?.base?.ref === branch &&
    pull?.merge_commit_sha === revision &&
    Number.isInteger(pull?.number) && pull.number > 0 &&
    Number.isFinite(Date.parse(pull?.merged_at)))
  if (matches.length !== 1) fail('MERGED_PR_NOT_UNIQUE')
  return { schemaVersion: 'jenfu.dev012.official-merged-source.v1',
    repository, branch, sourceRevision: revision, sourceTree,
    branchProtected: true,
    pullRequestNumber: matches[0].number,
    pullRequestUrl: matches[0].html_url,
    mergedAt: matches[0].merged_at,
    status: 'OFFICIAL_MERGED_PR_VERIFIED' }
}
