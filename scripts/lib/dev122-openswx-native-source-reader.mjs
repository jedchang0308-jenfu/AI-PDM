import { createGitSourceIdentity } from './dev012-owner-stage-executor.mjs'
import { createWorkerGitReader } from './dev122-openswx-worker-artifact-reuse.mjs'

export function createFrozenWorkerSourceReader(root) {
  let frozenSource = null
  let reader = null
  const ensureReader = sourceRevision => {
    if (frozenSource === null) {
      createGitSourceIdentity(root, sourceRevision)
      reader = createWorkerGitReader(root, sourceRevision)
      frozenSource = sourceRevision
      Object.assign(readSource, reader)
    }
    return reader
  }
  const readSource = (repositoryPath, sourceRevision) => {
    return ensureReader(sourceRevision)(repositoryPath, sourceRevision)
  }
  // A lineage check is the first operation for applied-continuation refreshes.
  // Freeze the reader at the descendant (the exact checked-out main source)
  // instead of requiring every caller to perform a dummy profile read first.
  readSource.isAncestor = (ancestor, descendant) => ensureReader(descendant).isAncestor(ancestor, descendant)
  readSource.authorizeOrigin = sourceRevision => {
    if (!reader) throw Object.assign(new Error('OPENSWX_FROZEN_SOURCE_READER_REQUIRED'), { code: 'OPENSWX_FROZEN_SOURCE_READER_REQUIRED' })
    return reader.authorizeOrigin(sourceRevision)
  }
  return readSource
}
