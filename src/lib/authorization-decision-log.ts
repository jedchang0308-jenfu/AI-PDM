import { createHash } from "node:crypto";
import type { JenfuEntitlementAuthority } from "@/lib/jenfu-entitlement-contract";

export type JenfuAuthorizationDecisionLog = {
  correlationId: string;
  contractVersion: string;
  applicationId: string;
  authoritySource: string;
  authorityVersion: number | null;
  permissionCode: string;
  scopeKind: string | null;
  matchedStableRoleId: string | null;
  decisionCode: string;
  evaluatedAt: string;
  principalFingerprint: string;
  employeeFingerprint: string;
  assignmentFingerprint: string | null;
};

function fingerprint(value: string | null | undefined) {
  return value ? createHash("sha256").update(value, "utf8").digest("hex") : null;
}

export function createAuthorizationDecisionLog(input: {
  correlationId: string;
  authority: JenfuEntitlementAuthority | null;
  permissionCode: string;
  scopeKind?: string | null;
  matchedStableRoleId?: string | null;
  decisionCode: string;
  principalId: string;
  employeeId: string;
  assignmentId?: string | null;
  evaluatedAt?: string;
}): JenfuAuthorizationDecisionLog {
  return {
    correlationId: input.correlationId,
    contractVersion: input.authority?.contractVersion ?? "jenfu.platform-entitlement.v1",
    applicationId: input.authority?.applicationId ?? "ai-pdm",
    authoritySource: input.authority?.authoritySource ?? "unknown",
    authorityVersion: input.authority?.authorityVersion ?? null,
    permissionCode: input.permissionCode,
    scopeKind: input.scopeKind ?? null,
    matchedStableRoleId: input.matchedStableRoleId ?? null,
    decisionCode: input.decisionCode,
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    principalFingerprint: fingerprint(input.principalId)!,
    employeeFingerprint: fingerprint(input.employeeId)!,
    assignmentFingerprint: fingerprint(input.assignmentId)
  };
}
