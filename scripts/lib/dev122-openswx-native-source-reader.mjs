import { createGitSourceIdentity } from './dev012-owner-stage-executor.mjs'
import { createWorkerGitReader } from './dev122-openswx-worker-artifact-reuse.mjs'

export function createFrozenWorkerSourceReader(root) {
  let frozenSource = null
  let reader = null
  const readSource = (repositoryPath, sourceRevision) => {
    if (frozenSource === null) {
      createGitSourceIdentity(root, sourceRevision)
      reader = createWorkerGitReader(root, sourceRevision)
      frozenSource = sourceRevision
      Object.assign(readSource, reader)
    }
    return reader(repositoryPath, sourceRevision)
  }
  readSource.authorizeOrigin = sourceRevision => reader.authorizeOrigin(sourceRevision)
  return readSource
}
