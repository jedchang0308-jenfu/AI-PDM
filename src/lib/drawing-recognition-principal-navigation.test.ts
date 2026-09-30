import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { resolveDrawingRecognitionNavigation } from "@/lib/drawing-recognition-legacy-redirect";

function snapshot(options: { owner?: string; company?: string; fail?: boolean } = {}) {
  const queryOne = vi.fn(async (sql: string, params: Record<string, string>) => {
    if (options.fail) throw new Error("database unavailable");
    if (sql.includes("FROM drawing_recognition_sessions")) {
      return params.companyId === (options.company ?? "company-jenfu")
        ? { id: "session-one", company_id: options.company ?? "company-jenfu",
            created_by: options.owner ?? "profile-owner", drawing_owner_id: options.owner ?? "profile-owner",
            drawing_id: "drawing-one", drawing_revision_id: "revision-one" }
        : null;
    }
    return { drawing_id: "drawing-one", drawing_number: "DW-001", work_id: "work-one" };
  });
  return { client: { queryOne } as unknown as AsyncDatabaseClient, queryOne };
}

describe("retired recognition URL Principal navigation", () => {
  it("uses the verified profile and company for an owned drawing", async () => {
    const db = snapshot();
    const result = await resolveDrawingRecognitionNavigation({ snapshot: db.client,
      sessionId: "session-one", companyId: "company-jenfu", actorId: "profile-owner",
      canReviewNonOwned: false, returnTo: "/numbering/drawings" });
    expect(result?.href).toBe("/numbering/drawings/drawing-one/workspace?workId=work-one&returnTo=%2Fnumbering%2Fdrawings");
    expect(db.queryOne).toHaveBeenCalledTimes(2);
  });

  it("does not reveal a foreign owner's or company's target without a published review grant", async () => {
    const db = snapshot();
    expect(await resolveDrawingRecognitionNavigation({ snapshot: db.client,
      sessionId: "session-one", companyId: "company-jenfu", actorId: "profile-other",
      canReviewNonOwned: false })).toBeNull();
    expect(db.queryOne).toHaveBeenCalledTimes(1);
    expect(await resolveDrawingRecognitionNavigation({ snapshot: db.client,
      sessionId: "session-one", companyId: "company-other", actorId: "profile-owner",
      canReviewNonOwned: true })).toBeNull();
  });

  it("allows a separately authorized reviewer without using a persisted profile role", async () => {
    const db = snapshot();
    const result = await resolveDrawingRecognitionNavigation({ snapshot: db.client,
      sessionId: "session-one", companyId: "company-jenfu", actorId: "profile-reviewer",
      canReviewNonOwned: true });
    expect(result?.href).toBe("/numbering/drawings/drawing-one/workspace?workId=work-one");
  });

  it("does not disguise a database failure as a missing recognition session", async () => {
    const db = snapshot({ fail: true });
    await expect(resolveDrawingRecognitionNavigation({ snapshot: db.client,
      sessionId: "session-one", companyId: "company-jenfu", actorId: "profile-owner",
      canReviewNonOwned: false })).rejects.toThrow("database unavailable");
  });
});
