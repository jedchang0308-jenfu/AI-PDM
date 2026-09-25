import { describe, expect, it } from "vitest";
import {
  parseJenfuPrincipalProvisionRequest,
  principalProvisionSourceMatches
} from "@/lib/jenfu-principal-provision-contract";

const candidate = {
  principalId: "principal-one", identityIssuer: "workspace", identitySubject: "subject-one",
  employeeId: "employee-one", accountType: "human_personal" as const,
  mappingVersion: 7, publishedAt: "2026-09-25T01:23:45.000Z"
};
const request = {
  contractVersion: "ai-pdm.principal-provision.v1", operationId: "operation-123",
  principalRef: candidate, displayName: "New profile", contactEmail: "New@Jenfu.com.tw"
};

describe("principal-only account provision contract", () => {
  it("normalizes contact data and defaults to a disabled account without granting a role", () => {
    expect(parseJenfuPrincipalProvisionRequest(request)).toEqual({
      ...request, contactEmail: "new@jenfu.com.tw", accountEnabled: false
    });
  });

  it.each([
    { ...request, role: "Admin" },
    { ...request, companyId: "company-other" },
    { ...request, existingPdmUserId: "user-old" },
    { ...request, principalRef: { ...candidate, firebaseUid: "uid-old" } },
    { ...request, principalRef: { ...candidate, mappingVersion: 0 } },
    { ...request, principalRef: { ...candidate, publishedAt: "yesterday" } },
    { ...request, contactEmail: "bad address" },
    { ...request, accountEnabled: "true" }
  ])("rejects extra authority hints or malformed identity input", (input) => {
    expect(() => parseJenfuPrincipalProvisionRequest(input)).toThrow("principal_provision_invalid_request");
  });

  it("requires an exact current producer tuple and consistent aliases", () => {
    expect(principalProvisionSourceMatches(candidate, [candidate])).toBe(true);
    expect(principalProvisionSourceMatches(candidate, [{ ...candidate, mappingVersion: 8 }])).toBe(false);
    expect(principalProvisionSourceMatches(candidate, [candidate, { ...candidate, employeeId: "employee-other" }]))
      .toBe(false);
    expect(principalProvisionSourceMatches(candidate, [candidate, candidate])).toBe(false);
  });
});
