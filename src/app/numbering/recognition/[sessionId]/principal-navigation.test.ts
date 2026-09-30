import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), navigate: vi.fn(), redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "pdm_session=principal-token" }) }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => {
  mocks.redirect(href);
  throw new Error(`REDIRECT:${href}`);
} }));
vi.mock("@/lib/principal-numbering-read", () => ({ withPrincipalNumberingCompanyRead: mocks.read }));
vi.mock("@/lib/drawing-recognition-legacy-redirect", () => ({ resolveDrawingRecognitionNavigation: mocks.navigate }));

import DrawingRecognitionReviewPage from "./page";

const props = { params: Promise.resolve({ sessionId: "session-one" }),
  searchParams: Promise.resolve({ returnTo: "/numbering/drawings" }) };

describe("recognition redirect in the Principal session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.navigate.mockResolvedValue({ href: "/numbering/drawings/drawing-one/workspace?workId=work-one" });
    mocks.read.mockImplementation(async (_request, _permission, read) => read({},
      { companyId: "company-jenfu" },
      { session: { principalId: "principal-one" }, profile: { pdmUserId: "profile-one" } }));
  });

  it("carries the verified profile, company and recognition grant into the scoped lookup", async () => {
    await expect(DrawingRecognitionReviewPage(props)).rejects.toThrow("REDIRECT:/numbering/drawings/drawing-one/workspace?workId=work-one");
    expect(mocks.read.mock.calls[0][1]).toEqual([
      { permissionKind: "action", permissionCode: "numbering.recognition.review" }
    ]);
    expect(mocks.navigate).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-one", companyId: "company-jenfu", actorId: "profile-one",
      canReviewNonOwned: true, returnTo: "/numbering/drawings"
    }));
  });

  it("does not disclose the session target when the Principal reader rejects the request", async () => {
    mocks.read.mockResolvedValueOnce(Response.json({ code: "auth_session_invalid" }, { status: 401 }));
    await expect(DrawingRecognitionReviewPage(props)).rejects.toThrow("REDIRECT:/login?returnTo=");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("does not run a resource lookup after a denied recognition grant", async () => {
    mocks.read.mockResolvedValueOnce(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    await expect(DrawingRecognitionReviewPage(props)).rejects.toThrow("REDIRECT:/numbering/drawings");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
