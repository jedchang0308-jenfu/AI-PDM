"use client";

import { subscribePdmPermissionInvalidation, subscribePdmMutationInvalidation } from "./pdm-permission-client";

// One browser app session owns this response. Never persist identity to storage.
let current: Promise<Response> | null = null;
let identityGeneration = 0;
subscribePdmPermissionInvalidation(() => { identityGeneration++; current = null; });

export async function fetchCurrentPdmUser(): Promise<Response> {
  if (!current) {
    const request = fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
    current = request;
    void request.then(response => {
      if (!response.ok && current === request) current = null;
    }, () => { if (current === request) current = null; });
  }
  const generation = identityGeneration;
  const response = await current;
  if (generation !== identityGeneration) throw new Error("PDM_IDENTITY_CHANGED");
  return response.clone();
}


let countGeneration = 0;
let pendingCount: { response: Promise<Response>; expiresAt: number } | null = null;
export function clearPendingPdmApprovalCount() { countGeneration++; pendingCount = null; }
subscribePdmPermissionInvalidation(clearPendingPdmApprovalCount);
subscribePdmMutationInvalidation(clearPendingPdmApprovalCount);

export async function fetchPendingPdmApprovalCount(): Promise<Response> {
  if (!pendingCount || pendingCount.expiresAt <= Date.now()) {
    const request = fetch("/api/approvals/inbox?view=count&status=pending&limit=1", { cache: "no-store" });
    pendingCount = { response: request, expiresAt: Date.now() + 30_000 };
    void request.then(response => {
      if (!response.ok && pendingCount?.response === request) pendingCount = null;
    }, () => { if (pendingCount?.response === request) pendingCount = null; });
  }
  const generation = countGeneration;
  const response = await pendingCount.response;
  if (generation !== countGeneration) throw new Error("PDM_COUNT_CHANGED");
  return response.clone();
}
