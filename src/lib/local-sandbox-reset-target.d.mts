import type { ApplicationId } from '../../contracts/local-principal-sandbox/v1/protocol.mjs'

export type LocalSandboxResetTargetInput = {
  environment: Record<string, string | undefined>
  sandboxRoot: string
  dataDirectory: string
  repositoryDirectory: string
  sandboxId: string
  databaseName: string
  expectedTargetFingerprint: string
  observedTargetFingerprint: string
  expectedGeneration: string
  generation: string
}

export type VerifiedLocalSandboxResetTarget = Readonly<{
  contractVersion: string
  applicationId: ApplicationId
  sandboxId: string
  databaseName: string
  origin: string
  generation: string
  targetFingerprint: string
  sandboxRoot: string
  dataDirectory: string
  repositoryDirectory: string
}>

export function validateLocalSandboxResetTarget(
  input: LocalSandboxResetTargetInput,
): Promise<VerifiedLocalSandboxResetTarget>
