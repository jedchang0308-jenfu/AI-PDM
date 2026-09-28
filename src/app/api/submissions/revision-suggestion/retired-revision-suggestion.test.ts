import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/submissions/revision-suggestion/route";

describe("retired generic upload revision suggestion", () => {
  it.each([
    ["GET", GET],
    ["POST", POST]
  ])("returns 410 without an old identity fallback for %s", async (_method, handler) => {
    const response = await handler();
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      code: "GENERIC_SUBMISSION_RETIRED",
      message: "通用上傳送審已退役。請從圖號工作台建立送審。",
      canonicalHref: "/numbering/drawings"
    });
  });
});
