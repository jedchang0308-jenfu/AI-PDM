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

describe("principal producer timestamp contract", () => {
  it.each([
    "2026-09-25T01:23:45.891Z", "2026-09-25T01:23:45.891123Z",
    "2024-02-29T23:59:59.000001Z", "2000-02-29T00:00:00.000Z",
    "0001-01-01T00:00:00.000000Z", "9999-12-31T23:59:59.999999Z"
  ])("preserves canonical UTC timestamp %s in the owner command", (publishedAt) => {
    const parsed = parseJenfuPrincipalProvisionRequest({
      ...request, principalRef: { ...candidate, publishedAt }
    });
    expect(parsed.principalRef.publishedAt).toBe(publishedAt);
  });

  it.each([
    "2026-02-29T01:23:45.891123Z", "1900-02-29T01:23:45.891123Z",
    "2026-02-30T01:23:45.891123Z", "2026-09-31T01:23:45.891123Z",
    "2026-00-25T01:23:45.891123Z", "2026-13-25T01:23:45.891123Z",
    "2026-09-00T01:23:45.891123Z", "2026-09-25T24:00:00.000000Z",
    "2026-09-25T01:60:45.891123Z", "2026-09-25T01:23:60.891123Z",
    "0000-09-25T01:23:45.891123Z", "+010000-09-25T01:23:45.891123Z",
    "2026-09-25T01:23:45.891123+00:00", "2026-09-25T01:23:45.891123-01:00",
    "2026-09-25T01:23:45.891123", "2026-09-25T01:23:45.891123z",
    "2026-09-25 01:23:45.891123Z", "2026-9-25T01:23:45.891123Z",
    "2026-09-25T01:23:45Z", "2026-09-25T01:23:45.89Z",
    "2026-09-25T01:23:45.8911Z", "2026-09-25T01:23:45.8911234Z",
    "2026-09-25T01:23:45.891123Z ", "2026-09-25T01:23:45.891123Z\n", "2026-09-25T01:23:45.891123Z\r\n",
    "2026-09-25T01:23:45.891123Z\u2028", new Date("2026-09-25T01:23:45.891Z")
  ])("rejects invalid calendars and noncanonical UTC timestamps", (publishedAt) => {
    expect(() => parseJenfuPrincipalProvisionRequest({
      ...request, principalRef: { ...candidate, publishedAt }
    })).toThrow("principal_provision_invalid_request");
  });

  it("matches equal microseconds and rejects a one-microsecond change or lossy milliseconds", () => {
    const precise = { ...candidate, publishedAt: "2026-09-25T01:23:45.891123Z" };
    expect(principalProvisionSourceMatches(precise, [precise])).toBe(true);
    expect(principalProvisionSourceMatches(precise, [
      { ...precise, publishedAt: "2026-09-25T01:23:45.891124Z" }
    ])).toBe(false);
    expect(principalProvisionSourceMatches({
      ...precise, publishedAt: "2026-09-25T01:23:45.891Z"
    }, [precise])).toBe(false);
    expect(principalProvisionSourceMatches(precise, [
      { ...precise, publishedAt: "2026-09-25T01:23:45.891Z" }
    ])).toBe(false);
  });

  it("keeps valid three-digit timestamps equivalent only to a zero microsecond tail", () => {
    const milliseconds = { ...candidate, publishedAt: "2026-09-25T01:23:45.891Z" };
    const microseconds = { ...candidate, publishedAt: "2026-09-25T01:23:45.891000Z" };
    expect(principalProvisionSourceMatches(milliseconds, [microseconds])).toBe(true);
    expect(principalProvisionSourceMatches(microseconds, [milliseconds])).toBe(true);
    expect(principalProvisionSourceMatches(milliseconds, [milliseconds, microseconds])).toBe(false);
  });

  it("fails closed on invalid requested or current timestamp calendars", () => {
    const invalid = { ...candidate, publishedAt: "2026-02-30T01:23:45.000Z" };
    expect(principalProvisionSourceMatches(invalid, [invalid])).toBe(false);
    expect(principalProvisionSourceMatches(candidate, [candidate, {
      ...invalid, identitySubject: "subject-two"
    }])).toBe(false);
  });
});
