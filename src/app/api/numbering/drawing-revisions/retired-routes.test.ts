import { describe, expect, it } from "vitest";
import { POST as submitLegacyRevision } from "@/app/api/numbering/drawing-revisions/submissions/route";
import { POST as assessLegacyFff } from "@/app/api/numbering/drawing-revisions/fff-assessments/route";

describe("retired drawing revision APIs", () => {
  it("returns an explicit non-cacheable retirement response without legacy authorization", async () => {
    for (const post of [submitLegacyRevision, assessLegacyFff]) {
      const response = await post();
      expect(response.status).toBe(410);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        error: "DRAWING_REVISION_LEGACY_WORKFLOW_RETIRED"
      });
    }
  });
});
