import { describe, expect, it, vi } from "vitest";
import { createDrawingWorkFileUploader } from "./drawing-work-file-upload-client";
const snapshot = (version: number) => Response.json({ data: { workId: "work", rowVersion: version, interaction: { canMutateContent: true } }, meta: { contractToken: "contract" } });
describe("single-file tasks inside a unified batch", () => {
  it("reuses the exact command/version after a lost reply even when readback advanced", async () => {
    let accepted = false; const requests: Headers[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      if (init?.method !== "POST") return snapshot(accepted ? 5 : 4);
      requests.push(new Headers(init.headers));
      if (!accepted) { accepted = true; throw new TypeError("lost reply"); }
      return Response.json({ data: { rowVersion: 5 } });
    };
    const upload = createDrawingWorkFileUploader("work", fetcher), file = new File(["cad"], "main.SLDDRW");
    await expect(upload(file, "task")).rejects.toThrow("lost reply"); await upload(file, "task");
    expect(requests.map(headers => headers.get("if-match"))).toEqual(['"4"', '"4"']);
    expect(requests[0].get("idempotency-key")).toBe(requests[1].get("idempotency-key"));
  });
  it("refreshes a definite row-version conflict using a new command", async () => {
    let version = 4; const keys: string[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      if (init?.method !== "POST") return snapshot(version);
      keys.push(new Headers(init.headers).get("idempotency-key")!);
      if (version === 4) { version = 5; return Response.json({ error: { code: "WORKBENCH_ROW_VERSION_CONFLICT" } }, { status: 409 }); }
      expect(new Headers(init.headers).get("if-match")).toBe('"5"'); return Response.json({ data: { rowVersion: 6 } });
    };
    await createDrawingWorkFileUploader("work", fetcher)(new File(["cad"], "drawing.SLDDRW"), "task"); expect(keys).toHaveLength(2); expect(keys[0]).not.toBe(keys[1]);
  });
  it("never writes after a denied read", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "denied" }, { status: 403 }));
    await expect(createDrawingWorkFileUploader("work", fetcher)(new File(["cad"], "drawing.SLDDRW"), "task")).rejects.toThrow("denied"); expect(fetcher).toHaveBeenCalledOnce();
  });
});
