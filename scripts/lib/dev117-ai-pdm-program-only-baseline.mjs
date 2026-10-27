// DEV-125 retired the legacy program-only worker release path.  These exports
// remain temporarily so historical release readers fail closed with one stable
// error instead of loading an executable compatibility implementation.
export const PROGRAM_ONLY_PGOPTIONS = '-c default_transaction_read_only=on'
export const PROGRAM_ONLY_DISPOSITION = 'READ_ONLY_BASELINE_VERIFIED'
export const PROGRAM_ONLY_PREFIX_COUNT = 33

function retired() {
  const error = new Error('PROGRAM_ONLY_BASELINE_RETIRED')
  error.code = 'PROGRAM_ONLY_BASELINE_RETIRED'
  throw error
}

export function programOnlyHash() { return retired() }
export function sealProgramOnlyEvidence() { return retired() }
export function deriveProgramOnlyBundles() { return retired() }
export function assertProgramOnlyPolicy() { return retired() }
export function buildProgramOnlyPolicy() { return retired() }
export function programOnlyNativeUri() { return retired() }
export function programOnlyMigrationArguments() { return retired() }
export function programOnlyStaticEnvironment() { return retired() }
export function programOnlyExecutionEnvironment() { return retired() }
export async function readProgramOnlyReleaseWindow() { return retired() }
export function assertProgramOnlyNative() { return retired() }
export function assertProgramOnlyStaticJob() { return retired() }
export function assertProgramOnlyExecutionTemplate() { return retired() }
export function assertProgramOnlyExecution() { return retired() }
export function assertProgramOnlyAssociation() { return retired() }
export function programOnlySubmissionFields(_profile, deployment) {
  if (deployment?.programOnlyBaseline) return retired()
  return {}
}
export function assertProgramOnlySubmission() { return retired() }
export async function readProgramOnlyBundles() { return retired() }
export async function readProgramOnlyAssociation() { return retired() }
export async function readProgramOnlyReleasedBaseline() { return retired() }
