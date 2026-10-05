import {beforeEach,describe,it,expect,vi} from "vitest";
import type {SettingsSecretActivationIntent} from "@/lib/repositories/settings-secret-async-repository";
import type {AsyncDatabaseClient} from "@/lib/db-async-provider";
const mocks=vi.hoisted(()=>({typed:vi.fn(),account:vi.fn(),epoch:vi.fn(),published:vi.fn(),permission:vi.fn()}));
vi.mock("@/lib/jenfu-principal-admission-repository",async original=>({...await original<typeof import("@/lib/jenfu-principal-admission-repository")>(),JenfuPrincipalAdmissionRepository:class {requireActiveTypedPrincipal=mocks.typed;}}));
vi.mock("@/lib/jenfu-principal-account-repository",async original=>({...await original<typeof import("@/lib/jenfu-principal-account-repository")>(),JenfuPrincipalAccountRepository:class {requireActive=mocks.account;}}));
vi.mock("@/lib/jenfu-auth-epoch-repository",()=>({JenfuAuthEpochRepository:class {readCanonicalPrincipalState=mocks.epoch;}}));
vi.mock("@/lib/jenfu-principal-published-grant-validation",()=>({validatePrincipalPublishedGrantSnapshot:mocks.published}));
vi.mock("@/lib/jenfu-principal-permission-service",()=>({evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot:mocks.permission}));
import {requireCurrentSettingsSecretActivationAuthority} from "@/lib/settings-secret-activation-authority";
const intent={identityIssuer:"issuer",identitySubject:"subject",consentPrincipalId:"principal",consentEmployeeId:"employee",consentPdmUserId:"profile",companyId:"company",profileVersion:2,accountLifecycleVersion:3,authEpoch:4,authenticatedAt:"2026-10-05T00:00:00Z",sessionIssuedAt:"2026-10-05T00:00:01Z"} as SettingsSecretActivationIntent;
const snapshot={kind:"postgres"} as AsyncDatabaseClient;
const account={principalId:"principal",employeeId:"employee",pdmUserId:"profile",companyId:"company",profileVersion:2,lifecycleVersion:3,accountType:"human_personal",sessionInvalidBefore:null};
describe("fresh durable consent authority without sessions",()=>{
  beforeEach(()=>{vi.resetAllMocks();mocks.typed.mockResolvedValue({principalId:"principal",employeeId:"employee",accountType:"human_personal",identityIssuer:"issuer",identitySubject:"subject"});mocks.account.mockResolvedValue(account);mocks.epoch.mockResolvedValue({authEpoch:4,revokedBefore:null});mocks.permission.mockResolvedValue([{allowed:true}]);});
  it("uses current published permission in the same supplied snapshot",async()=>{
    await expect(requireCurrentSettingsSecretActivationAuthority(snapshot,intent)).resolves.toMatchObject({principalId:"principal",companyId:"company"});
    expect(mocks.permission).toHaveBeenCalledWith(snapshot,expect.objectContaining({companyId:"company",principalId:"principal"}),[{permissionKind:"action",permissionCode:"settings.secret.manage"}]);
    expect(mocks.permission.mock.calls[0][1]).not.toHaveProperty("sessionId");
  });
  it.each([{companyId:"foreign"},{pdmUserId:"other"},{profileVersion:3},{lifecycleVersion:4},{employeeId:"other"}])("blocks current owner drift %o",async extra=>{mocks.account.mockResolvedValue({...account,...extra});await expect(requireCurrentSettingsSecretActivationAuthority(snapshot,intent)).rejects.toMatchObject({code:"consent_identity_changed"});expect(mocks.permission).not.toHaveBeenCalled();});
  it("blocks auth epoch drift",async()=>{mocks.epoch.mockResolvedValue({authEpoch:5,revokedBefore:null});await expect(requireCurrentSettingsSecretActivationAuthority(snapshot,intent)).rejects.toMatchObject({code:"consent_identity_changed"});});
  it("blocks global auth barrier at exact authentication time",async()=>{mocks.epoch.mockResolvedValue({authEpoch:4,revokedBefore:intent.authenticatedAt});await expect(requireCurrentSettingsSecretActivationAuthority(snapshot,intent)).rejects.toMatchObject({code:"consent_auth_barrier"});});
  it("blocks current account invalid-before at exact issue time",async()=>{mocks.account.mockResolvedValue({...account,sessionInvalidBefore:intent.sessionIssuedAt});await expect(requireCurrentSettingsSecretActivationAuthority(snapshot,intent)).rejects.toMatchObject({code:"consent_auth_barrier"});});
  it("blocks validated current permission denial",async()=>{mocks.permission.mockResolvedValue([{allowed:false}]);await expect(requireCurrentSettingsSecretActivationAuthority(snapshot,intent)).rejects.toMatchObject({code:"consent_authority_revoked"});});
  it.each(["typed","account","epoch","published","permission"] as const)("propagates dependency %s failure for transaction rollback",async source=>{const fault=new Error("synthetic dependency canary");mocks[source].mockRejectedValue(fault);await expect(requireCurrentSettingsSecretActivationAuthority(snapshot,intent)).rejects.toBe(fault);});
});
