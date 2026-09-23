import { describe, expect, it } from "vitest";
import { numberingUserScopeWithVerifiedActor, resolveNumberingPermissionResourceScope } from "@/lib/numbering-permission-guard";

describe("DEV-005 numbering resource scope", () => {
  it("defaults workspace scope to the authenticated company", () => {
    const scope = resolveNumberingPermissionResourceScope(
      new Request("http://localhost/api/numbering/search"),
      {},
      "JENFU"
    );
    expect(scope).toEqual({ workspaceCode: "JENFU", projectCode: null });
  });

  it.each(["projectCode", "project", "projectId"])("does not trust caller-supplied project scope from %s", (key) => {
    const scope = resolveNumberingPermissionResourceScope(
      new Request(`http://localhost/api/numbering/search?${key}=PROJECT-001`),
      {},
      "JENFU"
    );
    expect(scope).toEqual({ workspaceCode: "JENFU", projectCode: null });
  });

  it("keeps explicit null and explicit project scope", () => {
    const scope = resolveNumberingPermissionResourceScope(
      new Request("http://localhost/api/numbering/search?projectCode=IGNORED"),
      { workspaceCode: null, projectCode: "PROJECT-002" },
      "JENFU"
    );
    expect(scope).toEqual({ workspaceCode: null, projectCode: "PROJECT-002" });
  });

  it("keeps verified authorization context available to later checks without serializing identity claims", () => {
    const actor = {
      identityIssuer: "https://securetoken.google.com/jenfu-test",
      identitySubject: "uid-001",
      principalId: "principal-001",
      employeeId: "employee-001",
      localPrincipalId: "local-user-001",
      companyId: "company-jenfu"
    };
    const user = numberingUserScopeWithVerifiedActor({ id: "local-user-001", role: "Engineer", company_id: "company-jenfu" }, actor);
    expect(user.authorizationActor).toEqual(actor);
    expect(Object.keys(user)).not.toContain("authorizationActor");
    expect(JSON.stringify(user)).not.toContain("principal-001");
  });
});
