import type { JenfuPrincipalCandidate } from "@/lib/jenfu-principal-candidate-repository";

export const JENFU_PRINCIPAL_PROVISION_VERSION = "ai-pdm.principal-provision.v1" as const;

export type JenfuPrincipalProvisionRequest = {
  contractVersion: typeof JENFU_PRINCIPAL_PROVISION_VERSION;
  operationId: string;
  principalRef: JenfuPrincipalCandidate;
  displayName: string;
  contactEmail: string | null;
  accountEnabled: boolean;
};

export class JenfuPrincipalProvisionInputError extends Error {
  constructor() { super("principal_provision_invalid_request"); }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 255 &&
    value.trim() === value && /\S/u.test(value) && !/[\u0000-\u001f\u007f]/u.test(value);
}

/** Parse browser input without accepting identity, authorization or company hints. */
export function parseJenfuPrincipalProvisionRequest(value: unknown): JenfuPrincipalProvisionRequest {
  if (!record(value) || !exactKeys(value,
    ["contractVersion", "operationId", "principalRef", "displayName", "contactEmail", "accountEnabled"]) ||
    value.contractVersion !== JENFU_PRINCIPAL_PROVISION_VERSION ||
    !identifier(value.operationId) || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value.operationId) ||
    !record(value.principalRef) || !exactKeys(value.principalRef,
      ["principalId", "identityIssuer", "identitySubject", "employeeId", "accountType", "mappingVersion", "publishedAt"]) ||
    !identifier(value.principalRef.principalId) || !identifier(value.principalRef.identityIssuer) ||
    !identifier(value.principalRef.identitySubject) || !identifier(value.principalRef.employeeId) ||
    (value.principalRef.accountType !== "human_personal" && value.principalRef.accountType !== "human_privileged") ||
    !Number.isSafeInteger(value.principalRef.mappingVersion) ||
    (value.principalRef.mappingVersion as number) < 1 ||
    typeof value.principalRef.publishedAt !== "string" ||
    !Number.isFinite(Date.parse(value.principalRef.publishedAt)) ||
    new Date(value.principalRef.publishedAt).toISOString() !== value.principalRef.publishedAt ||
    typeof value.displayName !== "string" || !value.displayName.trim() ||
    value.displayName.length > 255 || /[\u0000-\u001f\u007f]/u.test(value.displayName) ||
    (value.accountEnabled !== undefined && typeof value.accountEnabled !== "boolean") ||
    (value.contactEmail !== undefined && value.contactEmail !== null &&
      (typeof value.contactEmail !== "string" || value.contactEmail.length > 254 ||
        value.contactEmail !== value.contactEmail.trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.contactEmail)))) {
    throw new JenfuPrincipalProvisionInputError();
  }
  const ref = value.principalRef as JenfuPrincipalCandidate;
  return {
    contractVersion: JENFU_PRINCIPAL_PROVISION_VERSION,
    operationId: value.operationId,
    principalRef: {
      principalId: ref.principalId,
      identityIssuer: ref.identityIssuer,
      identitySubject: ref.identitySubject,
      employeeId: ref.employeeId,
      accountType: ref.accountType,
      mappingVersion: ref.mappingVersion,
      publishedAt: ref.publishedAt
    },
    displayName: value.displayName.trim(),
    contactEmail: typeof value.contactEmail === "string" ? value.contactEmail.toLowerCase() : null,
    accountEnabled: value.accountEnabled === true
  };
}

export function principalProvisionSourceMatches(
  requested: JenfuPrincipalCandidate,
  current: readonly JenfuPrincipalCandidate[]
): boolean {
  if (current.length < 1 || current.length > 32) return false;
  const exact = current.filter((candidate) =>
    candidate.principalId === requested.principalId &&
    candidate.identityIssuer === requested.identityIssuer &&
    candidate.identitySubject === requested.identitySubject &&
    candidate.employeeId === requested.employeeId &&
    candidate.accountType === requested.accountType &&
    candidate.mappingVersion === requested.mappingVersion &&
    candidate.publishedAt === requested.publishedAt);
  return exact.length === 1 && current.every((candidate) =>
    candidate.principalId === requested.principalId &&
    candidate.employeeId === requested.employeeId &&
    candidate.accountType === requested.accountType);
}
