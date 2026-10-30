export const LOCAL_SANDBOX_VERSION: 'jenfu.local-principal-sandbox.v1'
export const LOCAL_FIXTURE_VERSION: 'jenfu.local-principal-fixtures.v1'
export const LOCAL_PORTAL_COOKIE: 'jenfu_local_portal_session'
export const MAX_BODY_BYTES: number
export type ApplicationId = 'orgmaster' | 'ai-pdm' | 'financial-management-system'
export const APPLICATION_IDS: readonly ApplicationId[]
export const CLIENT_APPLICATIONS: Readonly<Record<'orgmaster' | 'ai-pdm' | 'fms', ApplicationId>>
export const LOCAL_IDENTITY_ISSUER: 'urn:jenfu:local-principal-sandbox'
export class LocalSandboxError extends Error { code: string; status: number; constructor(code: string, status?: number) }
export type LocalSandboxConfig = Readonly<{ contractVersion: typeof LOCAL_SANDBOX_VERSION; applicationId: ApplicationId | 'portal'; sandboxId: string; origin: string; platformOrigin: string; bindHost: string; databaseName: string; runtimeRole: string; databaseUrl: string }>
export type LocalGrant = { applicationId: ApplicationId; companyId: string; stableRoleId: string; catalogVersion: string; catalogSha256: string; roleDefinitionHash: string; scopeKind: string; scopeRef: string | null; grantVersion: number; status: 'active' | 'revoked'; validFrom: string; validUntil: string | null }
export type LocalScenario = { scenarioId: string; label: string; principalId: string; employeeId: string; identityIssuer: typeof LOCAL_IDENTITY_ISSUER; identitySubject: string; accountType: 'human_personal' | 'human_privileged'; principalStatus: 'active' | 'disabled' | 'revoked'; employeeStatus: 'active' | 'inactive'; accountLifecycleVersion: number; profileVersion: number; grants: LocalGrant[] }
export type LocalFixture = { contractVersion: typeof LOCAL_FIXTURE_VERSION; fixtureVersion: string; fixtureHash: string; scenarios: LocalScenario[] }
export function canonicalJson(value: unknown): string
export function sha256(value: string): string
export function contractDigest(value: unknown): string
export function constantEquals(left: unknown, right: unknown): boolean
export function isLoopbackHost(host: unknown): boolean
export function requireLoopbackOrigin(input: string): string
export function readLocalSandboxConfig(environment: Record<string, string | undefined>, applicationId?: ApplicationId | 'portal'): LocalSandboxConfig
export function assertLocalSandboxRequest(request: Request, config: LocalSandboxConfig, options?: { browserMutation?: boolean; listenAddress?: string }): void
export function readLocalJsonBody(request: Request): Promise<{ rawBody: string; value: Record<string, unknown> }>
export function signLocalRequest(input: { method: string; path: string; audience: string; clientId: string; timestamp: number; nonce: string; rawBody: string }, key: string): string
export function verifyLocalRequest(request: Request, rawBody: string, options: { audience: string; resolveKey: (clientId: string) => string | undefined | null | Promise<string | undefined | null>; consumeNonce: (input: { clientId: string; nonce: string; expiresAt: string }) => Promise<boolean>; nowMs?: number }): Promise<string>
export function assertExactKeys(value: unknown, keys: string[], code?: string): void
export function assertFixtureEnvelope(value: unknown): LocalFixture
export function activeScenarioGrants(fixture: LocalFixture, scenarioId: string, applicationId: ApplicationId, nowMs?: number): { scenario: LocalScenario; grants: LocalGrant[] }

export type LocalAssertion = {
  contractVersion: typeof LOCAL_SANDBOX_VERSION; registrationId: string; portalSessionId: string;
  sandboxId: string; generation: string; fixtureVersion: string; fixtureHash: string;
  applicationId: ApplicationId; nativeSessionContractVersion: string; scenarioId: string;
  principalId: string; employeeId: string; identityIssuer: typeof LOCAL_IDENTITY_ISSUER; identitySubject: string;
  accountType: 'human_personal' | 'human_privileged'; accountLifecycleVersion: number; profileVersion: number;
  grants: LocalGrant[]; authEpoch: number; sourceSessionExpiresAt: string; authenticatedAt: string;
  assuranceLevel: 'aal1' | 'aal2'; secondFactor: 'totp' | null; assurancePolicyHash: string; assuranceSource: 'synthetic';
  issuedAt: string; expiresAt: string; joinDigest: string
}
export type LocalAssertionExpectation = Pick<LocalAssertion, 'applicationId' | 'sandboxId' | 'generation' | 'fixtureVersion' | 'fixtureHash' | 'nativeSessionContractVersion'> & { allowSyntheticAal2?: boolean; assurancePolicyHash?: string }
export function localJoinDigest(assertion: LocalAssertion): string
export function validateLocalAssertion(value: unknown, expected: LocalAssertionExpectation, nowMs?: number): LocalAssertion
export function signLocalResponse(input: { rawBody: string; nonce: string; audience: string; clientId: string }, key: string): string
export function verifyLocalResponse(input: { rawBody: string; nonce: string; audience: string; clientId: string }, key: string, signature: string | null): void
