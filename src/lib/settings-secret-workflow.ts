import type { SettingsSecretActivationIntent, SettingsSecretReference, SettingsSecretProbeJob, WorkerCapabilityHeartbeat } from "@/lib/repositories/settings-secret-async-repository";
export type SettingsSecretWorkflow = {
  state: "waiting_worker" | "testing" | "activating" | "awaiting_worker_ack" | "ready" | "blocked" | "superseded";
  referenceId: string; referenceLifecycleStatus: string; consentRequired: boolean; canResume: boolean; version: number; intentId: string | null; intentState: string | null;
  safeCode: string | null; jobId: string | null; jobStatus: string | null; attempt: number;
  leaseFresh: boolean; nativeWorkerOnline: boolean; lastSeenAt: string | null; workerId: string | null; exactAck: boolean;
};
export function deriveSettingsSecretWorkflow(input: {
  reference: SettingsSecretReference; active: SettingsSecretReference | null;
  intent: SettingsSecretActivationIntent | null; job: SettingsSecretProbeJob | null;
  heartbeat: WorkerCapabilityHeartbeat | null; now?: number;
}): SettingsSecretWorkflow {
  const { reference, active, intent, job, heartbeat } = input;
  const now = input.now ?? Date.now();
  const age = heartbeat ? now - new Date(heartbeat.lastSeenAt).getTime() : NaN;
  const online = Boolean(heartbeat && heartbeat.capabilityCode === "solidworks_document_manager" && age >= 0 && age <= 30_000);
  const leaseAge = job ? now - new Date(job.updatedAt).getTime() : NaN;
  const leaseFresh = Boolean(job?.status === "running" && leaseAge >= 0 && leaseAge <= 60_000);
  const exactAck = Boolean(online && heartbeat?.status === "ready" && active?.id === reference.id &&
    active.lifecycleStatus === "active" && heartbeat.appliedSecretKind === active.kind &&
    heartbeat.appliedSecretVersion === active.version && heartbeat.appliedSecretFingerprint === active.fingerprint);
  let state: SettingsSecretWorkflow["state"] = "waiting_worker";
  if (intent?.state === "superseded" || reference.lifecycleStatus === "retired") state = "superseded";
  else if (intent?.state === "blocked" || reference.lifecycleStatus === "revoked" || ["failed","blocked","expired"].includes(job?.status ?? "")) state = "blocked";
  else if (active?.id === reference.id) state = exactAck ? "ready" : "awaiting_worker_ack";
  else if (job?.status === "passed" && intent?.state === "pending") state = "activating";
  else if (leaseFresh) state = "testing";
  return { state, referenceId: reference.id, referenceLifecycleStatus: reference.lifecycleStatus,
    consentRequired: !intent || intent.state === "blocked" || (intent.state === "pending" && ["failed","blocked","expired"].includes(job?.status ?? "")),
    canResume: ["draft","tested"].includes(reference.lifecycleStatus) && (!intent || intent.state === "blocked" || (intent.state === "pending" && ["failed","blocked","expired"].includes(job?.status ?? ""))), version: reference.version, intentId: intent?.id ?? null,
    intentState: intent?.state ?? null, safeCode: intent?.safeResultCode ?? job?.resultCode ?? null,
    jobId: job?.id ?? null, jobStatus: job?.status ?? null, attempt: job?.attemptCount ?? 0,
    leaseFresh, nativeWorkerOnline: online, lastSeenAt: heartbeat?.lastSeenAt ?? null,
    workerId: heartbeat?.workerId ?? null, exactAck };
}
