import { describe, expect, it, vi } from "vitest";
import { createPdmProtectedPdfCache } from "./pdm-protected-pdf-cache";

const hash = "a".repeat(64);
const headers = { "content-type": "application/pdf", "content-hash": hash };
const pdf = () => new Response("%PDF-body", { headers });
describe("protected PDF shared bytes", () => {
  it("downloads once across preview/OCR but reauthorizes both endpoints", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(pdf()).mockResolvedValueOnce(new Response(null, { status: 304, headers }));
    const cache = createPdmProtectedPdfCache(fetcher);
    expect(await (await cache.read("/preview", hash)).text()).toBe("%PDF-body");
    expect(await (await cache.read("/ocr", hash)).text()).toBe("%PDF-body");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe("/ocr");
    expect(fetcher.mock.calls[1][1]?.headers).toEqual({ "if-none-match": `"${hash}"` });
  });
  it("coalesces concurrent bytes while requiring the second context to authorize", async () => {
    let release!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
      .mockResolvedValueOnce(new Response(null, { status: 304, headers }));
    const cache = createPdmProtectedPdfCache(fetcher);
    const first = cache.read("/preview", hash), second = cache.read("/ocr", hash);
    release(pdf());
    expect(await (await first).text()).toBe(await (await second).text());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not return cached bytes on denial or a changed source", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(pdf()).mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response("changed", { headers: { ...headers, "content-hash": "b".repeat(64) } }));
    const cache = createPdmProtectedPdfCache(fetcher);
    await cache.read("/preview", hash);
    await expect(cache.read("/ocr", hash)).rejects.toMatchObject({ name: "AbortError" });
    expect(await (await cache.read("/preview", "b".repeat(64))).text()).toBe("changed");
    expect(fetcher.mock.calls[2][1]?.headers).toBeUndefined();
  });
  it("drops bytes and in-flight results on permission/account invalidation", async () => {
    let release!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockImplementation(async () => pdf());
    const cache = createPdmProtectedPdfCache(fetcher);
    const old = cache.read("/preview", hash); cache.clear(); release(pdf());
    await expect(old).rejects.toMatchObject({ name: "AbortError" });
    await cache.read("/ocr", hash);
    expect(fetcher.mock.calls[1][1]?.headers).toBeUndefined();
  });
  it("does not retain oversized or unverified responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => pdf());
    const cache = createPdmProtectedPdfCache(fetcher, 2);
    await cache.read("/preview", hash); await cache.read("/ocr", hash);
    expect(fetcher.mock.calls.every(([, init]) => !init?.headers)).toBe(true);
  });
});
