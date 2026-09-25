import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUserCompanyAccessAsync: vi.fn() }));
vi.mock("@/lib/company-context", () => ({ getUserCompanyAccessAsync: mocks.getUserCompanyAccessAsync }));

import { canAccessSubmissionCompanyAsync, canReadSubmission, scopedSubmittedBy } from "@/lib/permissions";

const principalUser = {
  id: "profile-1", role: "Principal", company_id: "company-jenfu",
  authorizationActor: {
    identityIssuer: "issuer-1", identitySubject: "subject-1",
    principalId: "principal-1", employeeId: "employee-1",
    localPrincipalId: "profile-1", companyId: "company-jenfu", sessionSchemaVersion: 2 as const
  }
};

describe("DEV-121 submission profile boundary", () => {
  it("does not turn the principal domain role into cross-person read access", async () => {
    const own = { company_id: "company-jenfu", submitted_by: "profile-1", status: "Draft" } as never;
    const other = { company_id: "company-jenfu", submitted_by: "profile-2", status: "Released" } as never;
    const noCompany = { submitted_by: "profile-1", status: "Released" } as never;
    expect(scopedSubmittedBy(principalUser)).toBe("profile-1");
    expect(canReadSubmission(principalUser, own)).toBe(true);
    expect(canReadSubmission(principalUser, other)).toBe(false);
    expect(canReadSubmission(principalUser, noCompany)).toBe(false);
    expect(await canAccessSubmissionCompanyAsync(principalUser, noCompany)).toBe(false);
    expect(await canAccessSubmissionCompanyAsync(principalUser, own)).toBe(true);
    expect(mocks.getUserCompanyAccessAsync).not.toHaveBeenCalled();
  });

  it("requires a verified profile link and exact resource company", () => {
    const mismatchedProfile = { ...principalUser, authorizationActor: {
      ...principalUser.authorizationActor, localPrincipalId: "profile-elsewhere"
    } };
    const otherCompany = { company_id: "company-other", submitted_by: "profile-1", status: "Released" } as never;
    expect(canReadSubmission(mismatchedProfile, { company_id: "company-jenfu", submitted_by: "profile-1" } as never)).toBe(false);
    expect(canReadSubmission(principalUser, otherCompany)).toBe(false);
  });
});
