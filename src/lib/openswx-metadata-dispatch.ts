import { Compute } from "google-auth-library";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { OpenSwxMetadataAsyncRepository, type OpenSwxJob } from "@/lib/repositories/openswx-metadata-async-repository";
import { OpenSwxMetadataService } from "@/lib/openswx-metadata";
import { OpenSwxMetadataError } from "@/lib/openswx-metadata-contract";

export const OPENSWX_JOB_REQUEST = "projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata";
export const OPENSWX_JOB_CANONICAL = "projects/9536592944/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata";
export function canonicalOpenSwxExecution(value: unknown) {
  if (typeof value !== "string") throw new OpenSwxMetadataError("OPENSWX_EXECUTION_INVALID", 400);
  const suffix = value.startsWith(OPENSWX_JOB_REQUEST + "/executions/") ? value.slice(OPENSWX_JOB_REQUEST.length) : value.startsWith(OPENSWX_JOB_CANONICAL + "/executions/") ? value.slice(OPENSWX_JOB_CANONICAL.length) : "";
  if (!/^\/executions\/[a-z][a-z0-9-]{0,62}$/u.test(suffix)) throw new OpenSwxMetadataError("OPENSWX_EXECUTION_INVALID", 400);
  return OPENSWX_JOB_CANONICAL + suffix;
}
export function isOpenSwxDispatchConfigured() { return process.env.PDM_OPENSWX_DISPATCH_ENABLED === "1"; }
export type OpenSwxDispatchTransport = { request: typeof fetch; accessToken: () => Promise<string> };
const credentials = new Compute({ scopes: ["https://www.googleapis.com/auth/cloud-platform"], transporterOptions: { timeout: 3000, retry: false } });
const metadataTransport: OpenSwxDispatchTransport = { request: (...args) => fetch(...args), accessToken: async () => {
  if (!process.env.K_SERVICE || process.env.GOOGLE_APPLICATION_CREDENTIALS) throw Error("OPENSWX_WORKLOAD_IDENTITY_REQUIRED");
  const token = (await credentials.getAccessToken()).token;
  if (!token) throw Error("OPENSWX_WORKLOAD_TOKEN_UNAVAILABLE"); return token;
} };
type Execution = { name: string; createTime: string; completionTime?: string; reconciling?: boolean; conditions?: { type: string; state: string }[] };
/** Fixed Job only. No operations endpoint, overrides, requestId, redirects or ADC. */
export class OpenSwxJobProvider {
  constructor(private readonly transport: OpenSwxDispatchTransport = metadataTransport) {}
  private async request(resource: string, method = "GET", deadline = Date.now() + 20_000, parentSignal?: AbortSignal) {
    const check = () => { if (parentSignal?.aborted || Date.now() >= deadline) throw Error("OPENSWX_DISPATCH_DEADLINE"); };
    check();
    const token = await this.transport.accessToken();
    check(); // Includes the final check immediately before the sole provider POST.
    const timeout = AbortSignal.timeout(Math.max(1, Math.min(10_000, deadline - Date.now())));
    const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
    const response = await this.transport.request(`https://run.googleapis.com/v2/${resource}`, { method, redirect: "error", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(method === "POST" ? { body: "{}" } : {}), signal });
    check();
    if (!response.ok || !response.body) throw Error("OPENSWX_PROVIDER_UNAVAILABLE");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) { const r = await reader.read(); check(); if (r.done) break; bytes += r.value.length; if (bytes > 128 * 1024) throw Error("OPENSWX_PROVIDER_OUTPUT_LIMIT"); chunks.push(r.value); }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  async run(deadline?: number, signal?: AbortSignal): Promise<string> {
    const op = await this.request(`${OPENSWX_JOB_REQUEST}:run`, "POST", deadline, signal);
    if (typeof op.name !== "string" || !/^projects\/(jenfu-platform-prod|9536592944)\/locations\/asia-east1\/operations\/[A-Za-z0-9_-]{1,120}$/u.test(op.name)) throw Error("OPENSWX_PROVIDER_OPERATION_INVALID");
    return op.name.replace("projects/jenfu-platform-prod/", "projects/9536592944/");
  }
  private validateExecution(value: Execution) {
    const name = canonicalOpenSwxExecution(value?.name);
    if (!Number.isFinite(Date.parse(value.createTime))) throw Error("OPENSWX_PROVIDER_EXECUTION_INVALID");
    return { ...value, name };
  }
  async readback(job: OpenSwxJob, deadline = Date.now() + 20_000, signal?: AbortSignal): Promise<Execution | null> {
    const fixedJob = await this.request(OPENSWX_JOB_REQUEST, "GET", deadline, signal);
    if (fixedJob.name !== OPENSWX_JOB_REQUEST && fixedJob.name !== OPENSWX_JOB_CANONICAL) throw Error("OPENSWX_PROVIDER_JOB_INVALID");
    if (job.executionName) {
      const name = canonicalOpenSwxExecution(job.executionName);
      const execution = this.validateExecution(await this.request(name.replace(OPENSWX_JOB_CANONICAL, OPENSWX_JOB_REQUEST), "GET", deadline, signal));
      if (execution.name !== name) throw Error("OPENSWX_PROVIDER_EXECUTION_INVALID");
      return execution;
    }
    const list = await this.request(`${OPENSWX_JOB_REQUEST}/executions?pageSize=100`, "GET", deadline, signal);
    if (list.nextPageToken || !Array.isArray(list.executions ?? []) || (list.executions?.length ?? 0) > 100) return null;
    const candidates = (list.executions ?? []).map((e: Execution) => this.validateExecution(e)).filter((e: Execution) => Date.parse(e.createTime) >= Date.parse(job.dispatchRequestedAt ?? "") && Date.parse(e.createTime) <= Date.parse(job.dispatchRequestWindowEnd ?? ""));
    return candidates.length === 1 ? candidates[0] : null;
  }
}
function terminal(e: Execution) { return Boolean(e.completionTime && Number.isFinite(Date.parse(e.completionTime)) && e.reconciling === false && e.conditions?.some(c => c.type === "Completed" && ["CONDITION_SUCCEEDED", "CONDITION_FAILED"].includes(c.state))); }
export type OpenSwxDispatchDependencies = { enabled?: boolean; now?: () => number; signal?: AbortSignal; deadline?: number; provider?: Pick<OpenSwxJobProvider, "run" | "readback">; authorize?: (job: OpenSwxJob) => Promise<void> };
function dispatchBudget(now: () => number, signal?: AbortSignal, requestDeadline?: number) {
  const wallDeadline = Math.min(Date.now() + 20_000, requestDeadline ?? Infinity), deadline = now() + Math.max(0, wallDeadline - Date.now());
  const check = () => { if (signal?.aborted || now() >= deadline || Date.now() >= wallDeadline) throw Error("OPENSWX_DISPATCH_DEADLINE"); };
  const wait = async <T>(pending: Promise<T>) => {
    check(); let timer: ReturnType<typeof setTimeout> | undefined, onAbort: (() => void) | undefined;
    try {
      const result = await Promise.race([pending, new Promise<never>((_, reject) => { onAbort = () => reject(Error("OPENSWX_DISPATCH_DEADLINE")); signal?.addEventListener("abort", onAbort, { once: true }); timer = setTimeout(onAbort, Math.max(1, wallDeadline - Date.now())); if (signal?.aborted) onAbort(); })]);
      check(); return result;
    } finally { clearTimeout(timer); if (onAbort) signal?.removeEventListener("abort", onAbort); }
  };
  return { check, wait, wallDeadline };
}
export async function recoverOpenSwxDispatch(db: AsyncDatabaseClient, dependencies: OpenSwxDispatchDependencies = {}) {
  if (!(dependencies.enabled ?? isOpenSwxDispatchConfigured())) return { state: "disabled" };
  const now = dependencies.now ?? Date.now, provider = dependencies.provider ?? new OpenSwxJobProvider(), budget = dispatchBudget(now, dependencies.signal, dependencies.deadline);
  try {
    budget.check();
    const admission = await budget.wait(db.transaction(c => new OpenSwxMetadataAsyncRepository(c).dispatchAdmission(new Date(now()).toISOString(), new Date(now() + 30_000).toISOString(), budget.check), { serializable: true }));
    if (!admission) return { state: "idle" };
    let job = admission.job;
    const receipt = async (state: OpenSwxJob["dispatchState"], operation = job.providerOperation, executionName = job.executionName) => {
      budget.check();
      job = (await budget.wait(db.transaction(c => new OpenSwxMetadataAsyncRepository(c).dispatchReceipt(job, state, operation, executionName, new Date(now()).toISOString()), { serializable: true })))!;
    };
    if (!admission.existing) {
      try { await budget.wait((dependencies.authorize ?? (j => new OpenSwxMetadataService(db).authorizeDispatch(j)))(job)); }
      catch { budget.check(); await budget.wait(db.transaction(c => new OpenSwxMetadataAsyncRepository(c).dispatchBlocked(job, new Date(now()).toISOString()), { serializable: true })); return { state: "blocked" }; }
      try {
        budget.check(); // Recheck after authority, immediately before the sole :run.
        const operation = await budget.wait(provider.run(budget.wallDeadline, dependencies.signal));
        await receipt("requested", operation);
      } catch { budget.check(); await receipt("dispatch_unknown"); }
    } else if (job.dispatchState === "requested" && Date.parse(job.dispatchLeaseExpiresAt ?? "") > now()) return { state: "scheduled" };
    try {
      const execution = await budget.wait(provider.readback(job, budget.wallDeadline, dependencies.signal));
      if (!execution) { await receipt("dispatch_unknown"); return { state: "dispatch_unknown" }; }
      // Injected transport is still subject to exact execution binding.
      const exactName = canonicalOpenSwxExecution(execution.name);
      if (job.executionName && exactName !== job.executionName) throw Error("OPENSWX_PROVIDER_EXECUTION_INVALID");
      if (!job.executionName) await receipt("dispatched", job.providerOperation, exactName);
      if (terminal(execution)) {
        budget.check();
        await budget.wait(db.transaction(c => new OpenSwxMetadataAsyncRepository(c).providerTerminal(job, new Date(now()).toISOString()), { serializable: true }));
        return { state: "provider_terminal" };
      }
      return { state: "executing" };
    } catch { budget.check(); if (!job.executionName) await receipt("dispatch_unknown"); return { state: "dispatch_unknown" }; }
  } catch { return { state: "dispatch_unknown" }; } // Saved requested/unknown admission forbids blind retry.
}
/** Empty claim only reconciles an existing saved exact execution. Never acquires due work or calls :run. */
export async function reconcileOpenSwxEmptyClaim(db: AsyncDatabaseClient, dependencies: Pick<OpenSwxDispatchDependencies, "now" | "provider" | "signal"> = {}) {
  const now = dependencies.now ?? Date.now, provider = dependencies.provider ?? new OpenSwxJobProvider(), budget = dispatchBudget(now, dependencies.signal);
  try {
    const job = await budget.wait(db.transaction(c => new OpenSwxMetadataAsyncRepository(c).activeDispatch(), { serializable: true }));
    if (!job) return { state: "empty" };
    if (job.dispatchState !== "dispatched" || !job.executionName) return { state: "pending" };
    const execution = await budget.wait(provider.readback(job, budget.wallDeadline, dependencies.signal));
    if (!execution || canonicalOpenSwxExecution(execution.name) !== job.executionName || !terminal(execution)) return { state: "pending" };
    budget.check();
    await budget.wait(db.transaction(c => new OpenSwxMetadataAsyncRepository(c).providerTerminal(job, new Date(now()).toISOString()), { serializable: true }));
    const active = await budget.wait(db.transaction(c => new OpenSwxMetadataAsyncRepository(c).activeDispatch(), { serializable: true }));
    return { state: active ? "pending" : "empty" };
  } catch { return { state: "pending" }; }
}
