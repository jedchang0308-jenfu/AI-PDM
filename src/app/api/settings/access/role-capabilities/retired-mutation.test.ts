import { describe, expect, it } from "vitest";
import { POST as publish } from "@/app/api/settings/access/role-capabilities/publish/route";
import { POST as preview } from "@/app/api/settings/access/role-capabilities/preview/route";
import { POST as resolveUnknown } from "@/app/api/settings/access/role-capabilities/commands/[commandId]/resolve-unknown/route";

describe("retired AI-PDM cross-owner governance mutations", () => {
  it.each([
    ["preview", preview], ["publish", publish], ["resolve", resolveUnknown]
  ])("rejects %s without executing a legacy OrgMaster proxy", async (_name, route) => {
    const response = await route();
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      code: "ROLE_CAPABILITY_MUTATION_RETIRED", owner: "orgmaster"
    });
  });
});
