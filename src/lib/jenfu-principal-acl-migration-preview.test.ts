import { describe, expect, it } from "vitest";
import { assertPrincipalAclPreviewCatalogShape } from
  "@/lib/jenfu-principal-acl-migration-preview";

describe("DEV-121 Production ACL preview source classification", () => {
  it("distinguishes priority cardinality from role count and flag drift", () => {
    expect(() => assertPrincipalAclPreviewCatalogShape([{ enabled: 1 }], [{ id: "active" }]))
      .not.toThrow();
    expect(() => assertPrincipalAclPreviewCatalogShape([{ enabled: 1 }], []))
      .toThrow("principal_acl_plan_priority_cardinality_invalid");
    expect(() => assertPrincipalAclPreviewCatalogShape([{ enabled: 1 }], [{}, {}]))
      .toThrow("principal_acl_plan_priority_cardinality_invalid");
    expect(() => assertPrincipalAclPreviewCatalogShape([{ enabled: 2 }], [{}]))
      .toThrow("principal_acl_plan_role_flag_invalid");
    expect(() => assertPrincipalAclPreviewCatalogShape(
      Array.from({ length: 129 }, () => ({ enabled: 1 })), [{}]
    )).toThrow("principal_acl_plan_role_count_invalid");
  });
});
