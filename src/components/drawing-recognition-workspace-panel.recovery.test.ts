import { describe, expect, it } from "vitest";
import { needsQueuedBrowserBaselineResume } from "./drawing-recognition-workspace-panel";

describe("DEV-122 queued browser baseline recovery", () => {
  it("resumes only a queued session with a pending client adapter", () => {
    expect(needsQueuedBrowserBaselineResume({
      status: "queued",
      pendingClientAdapters: [{ sourceId: "pdf-one" }]
    })).toBe(true);
    expect(needsQueuedBrowserBaselineResume({ status: "queued", pendingClientAdapters: [] })).toBe(false);
    expect(needsQueuedBrowserBaselineResume({
      status: "extracting",
      pendingClientAdapters: [{ sourceId: "pdf-one" }]
    })).toBe(false);
    expect(needsQueuedBrowserBaselineResume({
      status: "review_ready",
      pendingClientAdapters: [{ sourceId: "pdf-one" }]
    })).toBe(false);
  });
});
