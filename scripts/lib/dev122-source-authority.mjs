import { spawnSync } from 'node:child_process'

const H40 = /^[a-f0-9]{40}$/u

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

export function sourceStatusIsClean(status) {
  if (status === '') return true
  return status.split('\n').every((row) => {
    // The protected production-slice gate deliberately leaves its immutable
    // task evidence in the checkout before the subsequent readback stage.
    // Permit only that untracked evidence root; tracked edits and every other
    // untracked path remain a source-authority failure.
    return row.startsWith('?? output/qa/release-efficiency/')
  })
}

/**
 * Validate the protected-main source binding used by DEV-122 owner readbacks.
 * GitHub's workflow SHA identifies the workflow-file revision and may be an
 * ancestor of the exact checked-out source commit; the checkout SHA/tree and
 * clean status remain exact and authoritative.
 */
export function assertDev122GitSourceAuthority({ environment, sourceRevision, sourceTree = null, workflowRef, root, code, gitRunner = null, ancestorRunner = null }) {
  const mismatch = () => fail(code)
  if (!environment || environment.GITHUB_ACTIONS !== 'true' || environment.GITHUB_REPOSITORY !== 'jedchang0308-jenfu/AI-PDM' ||
      environment.GITHUB_SHA !== sourceRevision || environment.GITHUB_WORKFLOW_REF !== workflowRef ||
      environment.GITHUB_REF !== 'refs/heads/main' || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      !H40.test(sourceRevision ?? '') || !H40.test(environment.GITHUB_WORKFLOW_SHA ?? '')) mismatch()

  const git = gitRunner ?? ((args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
    if (result.error || result.status !== 0) mismatch()
    return result.stdout.trim()
  })
  if (git(['rev-parse', 'HEAD']) !== sourceRevision ||
      (sourceTree !== null && git(['rev-parse', 'HEAD^{tree}']) !== sourceTree) ||
      !sourceStatusIsClean(git(['status', '--porcelain=v1', '--untracked-files=all']))) mismatch()

  if (ancestorRunner) {
    if (!ancestorRunner(environment.GITHUB_WORKFLOW_SHA, sourceRevision)) mismatch()
  } else {
    const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', environment.GITHUB_WORKFLOW_SHA, sourceRevision], { cwd: root, encoding: 'utf8', windowsHide: true })
    if (ancestor.error || ancestor.status !== 0) mismatch()
  }
  return true
}

/**
 * Bind an immutable operation produced by an admitted ancestor to the exact
 * protected-main workflow source executing it now. The current checkout stays
 * authoritative for executable code; the operation hash stays authoritative
 * for the closed input. A new main commit alone does not require republishing
 * identical input, while a divergent or unknown lineage fails before provider
 * access.
 */
export function assertDev122OperationSourceAuthority({ environment, workflowSourceRevision, operationSourceRevision,
  workflowRef, root, code, gitRunner = null, workflowAncestorRunner = null, operationAncestorRunner = null }) {
  const mismatch = () => fail(code)
  if (workflowSourceRevision !== environment?.GITHUB_SHA) mismatch()
  assertDev122GitSourceAuthority({ environment, sourceRevision: workflowSourceRevision, workflowRef, root, code,
    gitRunner, ancestorRunner: workflowAncestorRunner })
  const isAncestor = operationAncestorRunner ?? ((ancestor, descendant) => {
    const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: root, encoding: 'utf8', windowsHide: true })
    return !result.error && result.status === 0
  })
  if (!H40.test(operationSourceRevision ?? '') || !isAncestor(operationSourceRevision, workflowSourceRevision)) mismatch()
  return { workflowSourceRevision, operationSourceRevision }
}
