import { describe, expect, it } from "vitest";
import { GET as getContext } from "@/app/api/numbering/drawings/[drawingNumber]/submission-context/route";
import { GET as getReadiness } from "@/app/api/numbering/drawings/[drawingNumber]/submission-readiness/route";
import { GET as getWorkbench } from "@/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route";
import { POST as postSubmission } from "@/app/api/numbering/drawings/[drawingNumber]/submissions/route";

const routes = [
  ["context", getContext],
  ["readiness", getReadiness],
  ["workbench", getWorkbench],
  ["create", postSubmission]
] as const;

describe("retired drawing-source submission routes", () => {
  for (const [name, handle] of routes) {
    it(name + " returns fixed 410 and the canonical drawing entry", async () => {
      const response = await handle();
      expect(response.status).toBe(410);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        code: "DRAWING_SOURCE_SUBMISSION_RETIRED",
        recoveryHref: "/numbering/drawings"
      });
    });
  }
});
