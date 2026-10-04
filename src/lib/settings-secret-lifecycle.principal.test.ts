import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PdmCommandMetadata } from "@/lib/platform-command";

const mocks = vi.hoisted(() => ({ command: vi.fn(), audit: vi.fn(),
  transaction: vi.fn(), provider: vi.fn(), readProvider: vi.fn(), preflight: vi.fn(), replay: vi.fn(), permissions: vi.fn(),
  repository: { getReferenceById: vi.fn(), getLatestProbeJob: vi.fn(), enqueueProbeJob: vi.fn(),
    getActiveTypedProbeJob: vi.fn(),
    getProbeJobById: vi.fn(), completeProbeJob: vi.fn(), insertTestRun: vi.fn(),
    markReferenceTested: vi.fn(), insertActivationEvent: vi.fn(), retireActiveReferences: vi.fn(),
    activateReference: vi.fn(), revokeReference: vi.fn(), insertReference: vi.fn(), getNextVersion: vi.fn() } }));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: () => ({ kind: "postgres", transaction: mocks.transaction }) }));
vi.mock("@/lib/platform-command-service", () => ({ executePdmCommandWithOutbox: mocks.command }));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({ withVerifiedJenfuPrincipalRequest: mocks.preflight }));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({ evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.permissions }));
vi.mock("@/lib/repositories/platform-outbox-async-repository", () => ({ PlatformOutboxAsyncRepository: class { findCompletedCommand = mocks.replay; } }));
vi.mock("@/lib/audit-async", () => ({ createAuditLogAsync: mocks.audit }));
vi.mock("@/lib/repositories/settings-secret-async-repository", () => ({ AsyncSettingsSecretRepository: class { constructor() { return mocks.repository; } } }));
vi.mock("@/lib/google-secret-manager", () => ({ GoogleSecretManagerProvider: class { addVersion = mocks.provider; accessVersion = mocks.readProvider; },
  GoogleSecretManagerError: class extends Error {}, getGoogleSecretManagerConfig: () => ({ projectId: "synthetic-project", secretId: "synthetic-secret" }),
  isGoogleSecretManagerReadEnabled: () => false, isGoogleSecretManagerWriteEnabled: () => false }));

import { activateSettingsSecretReference, completeSettingsSecretProbe, createSettingsSecretDraft,
  enqueueSettingsSecretProbe, resolveSettingsSecretProbeCredential, revokeSettingsSecretReference } from "@/lib/settings-secret-lifecycle";
const snapshot = { kind: "postgres" };
const verified = { profile: { pdmUserId: "profile-tester", companyId: "company-one" },
  session: { principalId: "principal-tester", profileVersion: 7 } };
const worker = { kind: "workload" as const, id: "worker-one", purposes: ["settings_secret_probe" as const],
  capabilities: ["solidworks_document_manager" as const] };
const reference = { id: "reference-one", kind: "solidworks_document_manager", provider: "solidworks_document_manager",
  lifecycleStatus: "draft", vaultProvider: "google_secret_manager", createdBy: "profile-draft-creator", version: 1 };
function job(extra = {}) { return { id: "probe-one", secretReferenceId: reference.id, kind: reference.kind,
  status: "running", lockedBy: worker.id, updatedAt: new Date().toISOString(), createdBy: "profile-tester",
  companyId: "company-one", initiatorPrincipalId: "principal-tester", initiatorProfileVersion: 7,
  purpose: "settings_secret_probe", ...extra }; }
function metadata(): PdmCommandMetadata { return { actor: { principalId: "principal-tester", pdmUserId: "profile-tester",
  organizationId: "company-one", platformOrganizationId: null, roles: ["pdm_admin"], scopes: ["settings.secret.manage"],
  authProvider: "current_pdm_session", correlationId: "correlation-one", requestId: "request-one",
  authorizationActor: { principalId: "principal-tester", localPrincipalId: "profile-tester", companyId: "company-one",
    identityIssuer: "issuer", identitySubject: "subject", employeeId: "employee", sessionSchemaVersion: 2 } },
  idempotencyKey: "operation-one", principalRequest: {} as PdmCommandMetadata["principalRequest"],
  principalAuthorization: { request: new Request("https://pdm.test/api/settings/secrets/reference-one/test", { method: "POST" }),
    routePath: "src/app/api/settings/secrets/[kind]/test/route.ts", method: "POST", permissionCode: "settings.secret.manage" } }; }

describe("DEV121 settings commands and worker Principal provenance", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("PDM_SETTINGS_SECRET_PROVIDER", "google_secret_manager");
    mocks.repository.getReferenceById.mockResolvedValue(reference);
    mocks.repository.getLatestProbeJob.mockResolvedValue(null);
    mocks.repository.getActiveTypedProbeJob.mockResolvedValue(null);
    mocks.repository.enqueueProbeJob.mockImplementation(async value => ({ ...job(), ...value }));
    mocks.repository.getProbeJobById.mockResolvedValue(job());
    mocks.repository.completeProbeJob.mockResolvedValue(true);
    mocks.repository.getNextVersion.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async callback => callback(snapshot));
    mocks.command.mockImplementation(async input => ({ result: await input.execute(snapshot, null, verified), reusedFromCommandReceipt: false }));
    mocks.preflight.mockImplementation(async (_input, callback) => callback(snapshot, verified));
    mocks.permissions.mockResolvedValue([{ allowed: true }]);
    mocks.replay.mockResolvedValue({ completed: false });
    mocks.provider.mockResolvedValue("projects/synthetic-project/secrets/synthetic-secret/versions/1");
    mocks.readProvider.mockResolvedValue("synthetic-provider-key-never-production");
  });

  it("queues the verified tester independently of the historical draft creator", async () => {
    const result = await enqueueSettingsSecretProbe({ secretReferenceId: reference.id }, metadata());
    expect(result.createdBy).toBe("profile-tester");
    expect(mocks.repository.enqueueProbeJob).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-one",
      initiatorPrincipalId: "principal-tester", initiatorProfileVersion: 7, purpose: "settings_secret_probe" }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: "profile-tester", companyId: "company-one",
      detail: expect.objectContaining({ securityActor: { kind: "human", principalId: "principal-tester", profileVersion: 7 } }) }), snapshot);
    const input = mocks.command.mock.calls[0][0];
    expect(input.principalAuthorization.permissionCode).toBe("settings.secret.manage");
    expect(input.event(result).payload.initiatorPrincipalId).toBe("principal-tester");
  });

  it("does not transfer an already queued job to a later requester", async () => {
    mocks.repository.getActiveTypedProbeJob.mockResolvedValue(job({ status: "pending" }));
    await expect(enqueueSettingsSecretProbe({ secretReferenceId: reference.id }, metadata())).rejects.toMatchObject({ code: "SECRET_PROBE_JOB_BUSY" });
    expect(mocks.repository.enqueueProbeJob).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("held legacy job does not reserve the fresh typed queue slot", async () => {
    mocks.repository.getLatestProbeJob.mockResolvedValue(job({ status: "pending", initiatorPrincipalId: null }));
    await enqueueSettingsSecretProbe({ secretReferenceId: reference.id }, metadata());
    expect(mocks.repository.getActiveTypedProbeJob).toHaveBeenCalledWith(reference.id);
    expect(mocks.repository.enqueueProbeJob).toHaveBeenCalledOnce();
    expect(mocks.repository.completeProbeJob).not.toHaveBeenCalled();
  });

  it("completes with verified technical executor and original queue initiator in the same transaction", async () => {
    const result = await completeSettingsSecretProbe({ probeJobId: "probe-one", worker, status: "failed", resultCode: "synthetic_failure", readerVersion: "synthetic" });
    expect(result.testedBy).toBe("profile-tester");
    expect(JSON.parse(result.metadataJson)).toMatchObject({ companyId: "company-one",
      initiator: { kind: "human", principalId: "principal-tester", profileVersion: 7 },
      securityActor: { kind: "workload", id: "worker-one", purpose: "settings_secret_probe" } });
    expect(mocks.repository.getProbeJobById).toHaveBeenCalledWith("probe-one", true);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "SettingsSecretProbeCompleted", actorId: "profile-tester" }), snapshot);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "repeatable_read", readOnly: false });
  });

  it.each([
    ["missing principal", { initiatorPrincipalId: null }], ["missing company", { companyId: null }],
    ["wrong purpose", { purpose: "preview_jobs" }], ["malformed version", { initiatorProfileVersion: 0 }],
    ["other holder", { lockedBy: "worker-other" }], ["expired lease", { updatedAt: new Date(Date.now() - 61_000).toISOString() }]
  ])("holds %s without provider access or database completion", async (_label, extra) => {
    mocks.repository.getProbeJobById.mockResolvedValue(job(extra));
    await expect(completeSettingsSecretProbe({ probeJobId: "probe-one", worker, status: "failed", resultCode: null, readerVersion: null })).rejects.toBeInstanceOf(Error);
    await expect(resolveSettingsSecretProbeCredential("probe-one", worker)).rejects.toBeInstanceOf(Error);
    expect(mocks.repository.completeProbeJob).not.toHaveBeenCalled();
    expect(mocks.repository.insertTestRun).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects a technical credential for a different purpose before loading the job", async () => {
    await expect(completeSettingsSecretProbe({ probeJobId: "probe-one", worker: { ...worker, purposes: ["preview_jobs"] },
      status: "failed", resultCode: null, readerVersion: null })).rejects.toMatchObject({ code: "WORKLOAD_FORBIDDEN", status: 403 });
    expect(mocks.repository.getProbeJobById).not.toHaveBeenCalled();
  });

  it("does not resurrect a revoked reference from a late successful probe", async () => {
    mocks.repository.getReferenceById.mockResolvedValue({ ...reference, lifecycleStatus: "revoked" });
    await expect(completeSettingsSecretProbe({ probeJobId: "probe-one", worker, status: "passed", resultCode: null, readerVersion: null })).rejects.toMatchObject({ code: "SECRET_REFERENCE_NOT_TESTABLE" });
    expect(mocks.repository.completeProbeJob).not.toHaveBeenCalled();
    expect(mocks.repository.markReferenceTested).not.toHaveBeenCalled();
  });

  it("provider read never returns bytes after its lease was handed to another worker", async () => {
    mocks.repository.getProbeJobById.mockResolvedValueOnce(job()).mockResolvedValueOnce(job({ lockedBy: "worker-other" }));
    await expect(resolveSettingsSecretProbeCredential("probe-one", worker)).rejects.toMatchObject({ code: "SECRET_PROBE_JOB_LOCKED" });
    expect(mocks.readProvider).toHaveBeenCalledOnce();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("activation refuses a historical passed probe that has no canonical initiator", async () => {
    mocks.repository.getReferenceById.mockResolvedValue({ ...reference, lifecycleStatus: "tested" });
    mocks.repository.getLatestProbeJob.mockResolvedValue(job({ status: "passed", initiatorPrincipalId: null }));
    await expect(activateSettingsSecretReference({ secretReferenceId: reference.id }, metadata())).rejects.toMatchObject({ code: "SECRET_PROBE_PRINCIPAL_PROVENANCE_REQUIRED" });
    expect(mocks.repository.activateReference).not.toHaveBeenCalled();
  });

  it("revoke preserves Principal audit inside the command transaction", async () => {
    await revokeSettingsSecretReference({ secretReferenceId: reference.id, reason: "synthetic revoke" }, metadata());
    expect(mocks.repository.revokeReference).toHaveBeenCalledWith(reference.id, "profile-tester", expect.any(String), "synthetic revoke");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "SettingsSecretRevoked",
      detail: expect.objectContaining({ securityActor: { kind: "human", principalId: "principal-tester", profileVersion: 7 } }) }), snapshot);
  });

  it("draft replay skips provider mutation and never puts the secret value into the command", async () => {
    mocks.replay.mockResolvedValue({ completed: true, result: reference });
    expect(await createSettingsSecretDraft({ kind: reference.kind, secretValue: "synthetic-not-a-real-key" }, metadata())).toBe(reference);
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.command).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.replay.mock.calls)).not.toContain("synthetic-not-a-real-key");
  });

  it("draft does no provider mutation if current grant is denied", async () => {
    mocks.permissions.mockResolvedValue([{ allowed: false }]);
    await expect(createSettingsSecretDraft({ kind: reference.kind, secretValue: "synthetic-not-a-real-key" }, metadata())).rejects.toMatchObject({ code: "SETTINGS_SECRET_PERMISSION_DENIED" });
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.repository.insertReference).not.toHaveBeenCalled();
  });

  it("draft provider failure publishes no command or reference", async () => {
    mocks.provider.mockRejectedValue(new Error("synthetic private provider failure"));
    await expect(createSettingsSecretDraft({ kind: reference.kind, secretValue: "synthetic-not-a-real-key" }, metadata())).rejects.toMatchObject({ code: "GCP_SECRET_MANAGER_WRITE_FAILED" });
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.repository.insertReference).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("withdrawal after provider success leaves the new provider version unreferenced", async () => {
    mocks.command.mockRejectedValue(new Error("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED"));
    await expect(createSettingsSecretDraft({ kind: reference.kind, secretValue: "synthetic-not-a-real-key" }, metadata())).rejects.toMatchObject({ code: "SETTINGS_SECRET_PERMISSION_DENIED", status: 403 });
    expect(mocks.provider).toHaveBeenCalledOnce();
    expect(mocks.repository.insertReference).not.toHaveBeenCalled();
    expect(mocks.repository.activateReference).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("draft publishes only a fingerprint and provider reference after provider I/O", async () => {
    await createSettingsSecretDraft({ kind: reference.kind, secretValue: "synthetic-not-a-real-key" }, metadata());
    expect(mocks.provider).toHaveBeenCalledOnce();
    const input = mocks.command.mock.calls[0][0];
    expect(input.command.payload).toMatchObject({ kind: reference.kind, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u) });
    expect(JSON.stringify(input.command)).not.toContain("synthetic-not-a-real-key");
    expect(JSON.stringify(mocks.repository.insertReference.mock.calls)).not.toContain("synthetic-not-a-real-key");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "SettingsSecretDraftCreated" }), snapshot);
    expect(mocks.provider.mock.invocationCallOrder[0]).toBeLessThan(mocks.command.mock.invocationCallOrder[0]);
  });

  it("rejects caller supplied profile-only context before any effect", async () => {
    const raw = { ...metadata(), principalRequest: undefined };
    await expect(enqueueSettingsSecretProbe({ secretReferenceId: reference.id }, raw)).rejects.toMatchObject({ code: "SETTINGS_SECRET_PRINCIPAL_CONTEXT_REQUIRED" });
    expect(mocks.command).not.toHaveBeenCalled();
  });

  it("preserves command-time permission denial without converting a query fault to denial", async () => {
    mocks.command.mockRejectedValueOnce(new Error("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED"));
    await expect(enqueueSettingsSecretProbe({ secretReferenceId: reference.id }, metadata())).rejects.toMatchObject({ code: "SETTINGS_SECRET_PERMISSION_DENIED", status: 403 });
    const fault = new Error("synthetic query fault");
    mocks.command.mockRejectedValueOnce(fault);
    await expect(enqueueSettingsSecretProbe({ secretReferenceId: reference.id }, metadata())).rejects.toBe(fault);
    expect(mocks.repository.enqueueProbeJob).not.toHaveBeenCalled();
  });
});
