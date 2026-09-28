import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireAuthAsync: vi.fn() }));
vi.mock("@/lib/auth-async", () => auth);

import { POST } from "./route";

describe("retired generic submission POST", () => {
  it("returns 410 without entering legacy authentication or upload logic", async () => {
    const response = await POST();
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: "GENERIC_SUBMISSION_RETIRED" });
    expect(auth.requireAuthAsync).not.toHaveBeenCalled();
  });
});
