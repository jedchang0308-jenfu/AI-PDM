const H40 = /^[a-f0-9]{40}$/u

/**
 * Reader mode is metadata about the reader instance.  It is deliberately
 * separate from the capability to read an admitted predecessor revision.
 */
export function isHistoricalReaderMode(reader) {
  return reader?.isHistorical === true || reader?.readerRevisionMode === 'historical'
}

/**
 * Return true only when the reader has an explicit admission for the
 * requested immutable revision.  A current reader may expose this capability
 * while keeping isHistorical=false; callers must bind it before validating
 * historical bytes.
 */
export function hasAdmittedHistoricalRevision(reader, revision) {
  if (typeof reader !== 'function' || !H40.test(revision ?? '')) return false
  if (isHistoricalReaderMode(reader) && reader.sourceRevision === revision) return true
  if (reader.historicalReadRevisions instanceof Set && reader.historicalReadRevisions.has(revision)) return true
  return reader.supportsAdmittedHistoricalRevisions === true && reader.sourceRevision !== revision
}

/**
 * Derive validation mode from the source/revision binding, not only from a
 * legacy isHistorical flag.  This is used after admission and by consumers
 * that need to classify a capability-admitted reader before it is wrapped.
 */
export function isHistoricalReaderFor(reader, revision, currentReader = null) {
  if (isHistoricalReaderMode(reader)) return true
  if (reader?.historicalReadRevisions instanceof Set && reader.historicalReadRevisions.has(revision)) return true
  if (hasAdmittedHistoricalRevision(reader, revision)) return true
  if (H40.test(revision ?? '') && H40.test(reader?.sourceRevision ?? '') && reader.sourceRevision !== revision) return true
  return currentReader?.sourceRevision !== revision && reader === currentReader
}

/**
 * Bind a capability-admitted reader to one historical revision.  The wrapper
 * prevents a nested read from silently switching back to the current source
 * and makes the historical validation mode explicit for all downstream
 * consumers.
 */
export function bindHistoricalReader(reader, revision, code = 'HISTORY_SOURCE_REQUIRED') {
  if (!hasAdmittedHistoricalRevision(reader, revision)) throw Object.assign(Error(code), { code })
  if (isHistoricalReaderMode(reader) && reader.sourceRevision === revision) return reader
  const fail = () => { throw Object.assign(Error(code), { code }) }
  const view = (name, sourceRevision) => {
    if (sourceRevision !== revision) fail()
    return reader(name, sourceRevision)
  }
  Object.assign(view, reader)
  view.sourceRevision = revision
  view.isHistorical = true
  view.readerRevisionMode = 'historical'
  view.historicalReadRevisions = new Set([...(reader.historicalReadRevisions ?? []), revision])
  if (typeof reader.readImmutableArchive === 'function') {
    view.readImmutableArchive = sourceRevision => {
      if (sourceRevision !== revision) fail()
      return reader.readImmutableArchive(sourceRevision)
    }
    view.readArchive = view.readImmutableArchive
  } else if (typeof reader.readArchive === 'function') {
    view.readArchive = sourceRevision => {
      if (sourceRevision !== revision) fail()
      return reader.readArchive(sourceRevision)
    }
  }
  if (typeof reader.authorizeOrigin === 'function') view.authorizeOrigin = sourceRevision => reader.authorizeOrigin(sourceRevision)
  if (typeof reader.assertCurrentFrozen === 'function') view.assertCurrentFrozen = () => reader.assertCurrentFrozen()
  return view
}
