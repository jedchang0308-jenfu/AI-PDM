import type { LocalAssertion, LocalAssertionExpectation, LocalSandboxConfig } from './protocol.mjs'
export { LocalSandboxError } from './protocol.mjs'
export type LocalTokenInput = Readonly<{ code: string; redirectUri: string; codeVerifier: string; expected: LocalAssertionExpectation }>
export type LocalSignedResponse = Readonly<{ rawBody: string; nonce: string; audience: string; clientId: string; signature: string | null }>
export type LocalRegisterInput = Readonly<{ registrationId: string; nativeSessionIdHash: string; joinDigest: string; idempotencyKey: string }>
export type LocalIntrospectInput = Readonly<{ nativeSessionIdHash: string; expectedJoinDigest: string }>
export type LocalRevokeInput = Readonly<{ nativeSessionIdHash: string; reason: string }>
export type LocalSandboxClient = Readonly<{
  token(input: LocalTokenInput): Promise<LocalAssertion>
  tokenProof(input: LocalTokenInput): Promise<LocalSignedResponse & { assertion: LocalAssertion }>
  register(input: LocalRegisterInput): Promise<Record<string, unknown>>
  introspect(input: LocalIntrospectInput): Promise<Record<string, unknown>>
  revoke(input: LocalRevokeInput): Promise<Record<string, unknown>>
}>
export function createLocalSandboxClient(options: Readonly<{
  config: LocalSandboxConfig; clientId: 'orgmaster' | 'ai-pdm' | 'fms'; key: string; fetch?: typeof fetch;
  now?: () => number; nonce?: () => string; timeoutMs?: number
}>): LocalSandboxClient
