import {
  NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES,
  type PdmPermissionProjectionV1
} from "./numbering-permission-codes";

export type PdmPermissionInvalidationReason = "logout" | "account-changed" | "unauthenticated" | "forbidden" | "permissions-changed";
const listeners = new Set<(reason: PdmPermissionInvalidationReason) => void>();
export function invalidatePdmPermissions(reason: PdmPermissionInvalidationReason) {
  listeners.forEach(listener => listener(reason));
}
export function subscribePdmPermissionInvalidation(listener: (reason: PdmPermissionInvalidationReason) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Notify the shell without replaying the original request or consuming its body. */
export async function pdmPermissionFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (response.status === 401) invalidatePdmPermissions("unauthenticated");
  else if (response.status === 403) invalidatePdmPermissions("forbidden");
  return response;
}

export type PdmPermissionState =
  | { kind: "loading" }
  | { kind: "ready"; projection: PdmPermissionProjectionV1 }
  | { kind: "unauthenticated" }
  | { kind: "unavailable"; code: string; retryable: boolean };

export function isPdmPermissionProjection(value: unknown): value is PdmPermissionProjectionV1 {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<PdmPermissionProjectionV1>;
  return body.contractVersion === "ai-pdm.frontend-permission-projection.v1"
    && body.applicationId === "ai-pdm" && typeof body.generatedAt === "string"
    && Number.isFinite(Date.parse(body.generatedAt))
    && Boolean(body.pages && NUMBERING_PAGE_PERMISSION_CODES.every(code => typeof body.pages?.[code] === "boolean"))
    && Boolean(body.actions && NUMBERING_ACTION_PERMISSION_CODES.every(code => typeof body.actions?.[code] === "boolean"));
}

/** Instance-owned memory. No browser storage and no cache shared between users/Apps. */
export function createPdmPermissionStore(fetcher: typeof fetch = (...args) => fetch(...args), timeoutMs = 10000) {
  let state: PdmPermissionState = { kind: "loading" };
  let generation = 0;
  let controller: AbortController | null = null;
  let flight: Promise<void> | null = null;
  let flightReason: PdmPermissionInvalidationReason | undefined;
  const subscribers = new Set<() => void>();
  function publish(next: PdmPermissionState) { state = next; subscribers.forEach(listener => listener()); }
  function clear() { generation++; controller?.abort(); controller = null; flight = null; flightReason = undefined; }
  function load(reason?: PdmPermissionInvalidationReason): Promise<void> {
    if (flight) return flight;
    flightReason = reason;
    const version = generation;
    const request = new AbortController();
    controller = request;
    publish({ kind: "loading" });
    const timeout = setTimeout(() => {
      if (version !== generation) return;
      clear();
      publish({ kind: "unavailable", code: "permission_timeout", retryable: true });
    }, timeoutMs);
    flight = (async () => {
      try {
        const response = await fetcher("/api/numbering/permissions", {
          credentials: "same-origin", cache: "no-store", signal: request.signal
        });
        if (version !== generation) return;
        if (response.status === 401) { publish({ kind: "unauthenticated" }); return; }
        if (!response.ok) { publish({ kind: "unavailable", code: "permission_dependency_unavailable", retryable: true }); return; }
        const body: unknown = await response.json();
        if (version !== generation) return;
        publish(isPdmPermissionProjection(body)
          ? { kind: "ready", projection: body }
          : { kind: "unavailable", code: "permission_contract_mismatch", retryable: true });
      } catch {
        if (version === generation) publish({ kind: "unavailable", code: "permission_dependency_unavailable", retryable: true });
      } finally {
        clearTimeout(timeout);
        if (version === generation) { flight = null; controller = null; flightReason = undefined; }
      }
    })();
    return flight;
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
    ensure() { return state.kind === "loading" ? load() : Promise.resolve(); },
    retry() { clear(); return load(); },
    invalidate(reason: PdmPermissionInvalidationReason) {
      if (reason === "logout" || reason === "unauthenticated") { clear(); publish({ kind: "unauthenticated" }); return; }
      // Replace any request started before denial; only coalesce the denial refresh itself.
      if (reason === "forbidden" && flight && flightReason === "forbidden") return;
      clear(); void load(reason);
    },
    dispose() { clear(); publish({ kind: "unauthenticated" }); }
  };
}
