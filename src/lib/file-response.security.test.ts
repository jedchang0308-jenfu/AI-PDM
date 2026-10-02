import { describe, expect, it } from "vitest";
import { protectedFileResponseHeaders } from "@/lib/file-response";
describe("protected file response boundary", () => {
  it.each(["text/html", "image/svg+xml", "application/xhtml+xml", "text/javascript"])("does not inline active %s uploaded with a misleading PDF filename", mime => {
    const headers = protectedFileResponseHeaders("inline", "drawing.pdf", mime);
    expect(headers["content-disposition"]).toMatch(/^attachment;/);
    expect(headers["content-security-policy"]).toContain("sandbox;");
    expect(headers["content-security-policy"]).not.toContain("allow-scripts");
    expect(headers["content-security-policy"]).not.toContain("allow-same-origin");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });
  it.each(["application/pdf", "image/png", "image/jpeg"])("preserves required %s preview and private delivery", mime => {
    const headers=protectedFileResponseHeaders("inline", "核定圖面.pdf", mime);
    expect(headers["content-disposition"]).toMatch(/^inline;/);
    expect(headers["cache-control"]).toBe("private, no-store");
    expect(protectedFileResponseHeaders("attachment", "核定圖面.pdf", mime)["content-disposition"]).toMatch(/^attachment;/);
  });
});
