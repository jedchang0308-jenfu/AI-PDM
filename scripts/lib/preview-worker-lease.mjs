export const leaseProtocolVersion = 2;

function configurationError() {
  return Object.assign(new Error("PREVIEW_WORKER_LEASE_PROTOCOL_MISMATCH"), { code: "PREVIEW_WORKER_CONFIGURATION_ERROR" });
}

export function previewLeaseEnvelope(claim) {
  const basis = claim?.leaseBasis;
  const ids = [basis?.companyId, basis?.sourceFileAssetId];
  if (!basis || Object.keys(basis).length !== 5 || ids.some(id => typeof id !== "string" || !id || id.trim() !== id
    || Buffer.byteLength(id, "utf8") > 256 || /[\u0000-\u001f\u007f]/u.test(id))
    || !/^[a-f0-9]{64}$/u.test(basis.sourceContentHash ?? "") || !Number.isInteger(basis.attemptCount)
    || basis.attemptCount < 1 || basis.attemptCount > 3 || typeof basis.lockedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(basis.lockedAt)
    || !Number.isFinite(Date.parse(basis.lockedAt)) || new Date(basis.lockedAt).toISOString() !== basis.lockedAt
    || claim.sourceFileAssetId !== basis.sourceFileAssetId || claim.sourceContentHash !== basis.sourceContentHash) throw configurationError();
  const envelope = { leaseProtocolVersion, leaseBasis: basis };
  if (Buffer.byteLength(JSON.stringify(envelope), "utf8") > 1536) throw configurationError();
  return envelope;
}

export async function claimPreviewJob(input) {
  let response;
  try { response = await (input.request ?? fetch)(`${input.baseUrl}/api/preview-jobs/claim`, {
    method: "POST", signal: AbortSignal.timeout(20000), redirect: "error",
    headers: headers(input), body: JSON.stringify({ workerId: input.workerId, leaseProtocolVersion,
      supportedKinds: ["native_thumbnail_png"], supportedExtensions: input.supportedExtensions })
  }); } catch { throw Object.assign(configurationError(), { message: "PREVIEW_CLAIM_OUTCOME_UNCONFIRMED" }); }
  if (!response.ok) {
    if ([400, 401, 403, 503].includes(response.status)) throw configurationError();
    throw Object.assign(configurationError(), { message: `PREVIEW_CLAIM_OUTCOME_UNCONFIRMED:${response.status}` });
  }
  try {
    const body = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || body.leaseProtocolVersion !== leaseProtocolVersion || !Object.hasOwn(body, "job")) throw configurationError();
    if (body.job !== null) previewLeaseEnvelope(body.job);
    return body.job;
  } catch { throw Object.assign(configurationError(), { message: "PREVIEW_CLAIM_OUTCOME_UNCONFIRMED" }); }
}

function headers(input) {
  return { "content-type": "application/json", authorization: `Bearer ${input.token}`, "x-pdm-worker-id": input.workerId };
}

export function createPreviewWorkerShutdown(events = process) {
  let requested = false;
  const subscribers = new Set();
  const stop = () => { requested = true; for (const notify of subscribers) notify(); };
  events.on("SIGINT", stop); events.on("SIGTERM", stop);
  return { get requested() { return requested; }, requestStop: stop,
    subscribe(notify) { subscribers.add(notify); return () => subscribers.delete(notify); },
    dispose() { events.removeListener("SIGINT", stop); events.removeListener("SIGTERM", stop); subscribers.clear(); } };
}

/** One claimed generation has exactly one terminal POST attempt. A lost ACK is
 * unconfirmed, never a reason to send a second status or replay storage effects. */
export async function runClaimedPreviewJob(input) {
  const envelope = previewLeaseEnvelope(input.claim);
  const request = input.request ?? fetch;
  const url = `${input.baseUrl}/api/preview-jobs/${encodeURIComponent(input.claim.jobId)}`;
  let stopped = false;
  let leaseFailure = null;
  const renderAbort = new AbortController();
  let timer;
  const loseLease = reason => {
    leaseFailure ??= reason;
    stopped = true;
    clearInterval(timer);
    renderAbort.abort(new Error(reason));
  };
  let inFlight = Promise.resolve();
  const beat = () => {
    if (stopped) return;
    inFlight = inFlight.then(async () => {
      if (stopped) return;
      try {
        const response = await request(`${url}/heartbeat`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
          headers: headers(input), body: JSON.stringify({ workerId: input.workerId, ...envelope }) });
        if (!response.ok) loseLease(response.status === 409 ? "lease_lost" : "heartbeat_unconfirmed");
        else {
          const heartbeat = await response.json();
          if (heartbeat?.ok !== true || heartbeat.leaseProtocolVersion !== leaseProtocolVersion) loseLease("heartbeat_unconfirmed");
        }
      } catch { loseLease("heartbeat_unconfirmed"); }
    });
  };
  beat();
  timer = setInterval(beat, 5000);
  const stopHeartbeat = async () => { stopped = true; clearInterval(timer); await inFlight; };
  let terminal;
  const finish = payloadOrFactory => {
    // Set synchronously before the first await so signal/success/error races
    // cannot start competing requests, even while heartbeat is draining.
    if (terminal) return terminal;
    terminal = (async () => {
      await stopHeartbeat();
      if (leaseFailure) return { status: "unconfirmed", reason: leaseFailure };
      try {
        const payload = typeof payloadOrFactory === "function" ? await payloadOrFactory() : payloadOrFactory;
        const response = await request(`${url}/complete`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
          headers: headers(input), body: JSON.stringify({ workerId: input.workerId, ...envelope, ...payload }) });
        const completion = await response.json();
        if (!response.ok || completion?.accepted !== true || completion.leaseProtocolVersion !== leaseProtocolVersion) return { status: "unconfirmed", httpStatus: response.status };
        return { status: payload.status, completion };
      } catch { return { status: "unconfirmed" }; }
    })();
    return terminal;
  };
  const cancel = () => {
    const result = finish({ status: "cancelled", cancelReason: "operator_shutdown" });
    renderAbort.abort(new Error("operator_shutdown"));
    return result;
  };
  const unsubscribe = input.shutdown.subscribe(cancel);
  try {
    if (input.shutdown.requested) cancel();
    if (terminal) return await terminal;
    try {
      const derivatives = await input.render(renderAbort.signal);
      return await finish({ status: "succeeded", sourceContentHash: input.claim.sourceContentHash, derivatives });
    } catch (error) {
      if (terminal) return await terminal;
      if (leaseFailure) return { status: "unconfirmed", reason: leaseFailure };
      if (error?.code === "PREVIEW_WORKER_CONFIGURATION_ERROR") {
        loseLease("protocol_mismatch");
        return { status: "unconfirmed", reason: leaseFailure };
      }
      return await finish(async () => ({ status: "failed", ...await input.rendererFailure(error) }));
    }
  } finally { unsubscribe(); await stopHeartbeat(); }
}
