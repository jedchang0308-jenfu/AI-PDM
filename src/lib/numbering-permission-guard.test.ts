import { describe, expect, it } from "vitest";
import { resolveNumberingPermissionResourceScope } from "@/lib/numbering-permission-guard";

describe("DEV-005 numbering resource scope", () => {
  it("defaults workspace scope to the authenticated company", () => {
    const scope = resolveNumberingPermissionResourceScope(
      new Request("http://localhost/api/numbering/search"),
      {},
      "JENFU"
    );
    expect(scope).toEqual({ workspaceCode: "JENFU", projectCode: null });
  });

  it.each(["projectCode", "project", "projectId"])("reads project scope from %s", (key) => {
    const scope = resolveNumberingPermissionResourceScope(
      new Request(`http://localhost/api/numbering/search?${key}=PROJECT-001`),
      {},
      "JENFU"
    );
    expect(scope).toEqual({ workspaceCode: "JENFU", projectCode: "PROJECT-001" });
  });

  it("keeps explicit null and explicit project scope", () => {
    const scope = resolveNumberingPermissionResourceScope(
      new Request("http://localhost/api/numbering/search?projectCode=IGNORED"),
      { workspaceCode: null, projectCode: "PROJECT-002" },
      "JENFU"
    );
    expect(scope).toEqual({ workspaceCode: null, projectCode: "PROJECT-002" });
  });
});
