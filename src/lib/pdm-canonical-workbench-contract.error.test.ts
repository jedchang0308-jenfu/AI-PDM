import { describe, expect, it } from "vitest";
import { CanonicalWorkbenchError, canonicalErrorEnvelope } from "@/lib/pdm-canonical-workbench-contract";
import { dev087RouteError } from "@/lib/pdm-dev087-route";

describe("canonical server fault classification", () => {
  it.each([new Error("SELECT secret FROM injected_fault"), "injected-secret", null, { sql: "private" }])(
    "returns safe exact 500 for unknown throws", async (error) => {
      const envelope = canonicalErrorEnvelope(error);
      expect(envelope.status).toBe(500);
      expect(envelope.body.error).toMatchObject({ code: "WORKBENCH_INTERNAL_ERROR", message: "操作失敗，請稍後再試" });
      expect(envelope.body.error.correlationId).toMatch(/^[0-9a-f-]{36}$/u);
      const response = dev087RouteError(error);
      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.text()).not.toMatch(/secret|SELECT|private|injected|stack/u);
    }
  );
  it.each([400, 403, 404, 409, 410, 413, 422, 503] as const)("preserves known domain %i", (status) => {
    const error = new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "known safe reason", status, "known-correlation");
    expect(canonicalErrorEnvelope(error)).toEqual({ status, body: { error: { code: error.code, message: error.message, correlationId: "known-correlation" } } });
  });
  it("preserves the explicit If-Match client error", async () => {
    const response = dev087RouteError(new Error("DEV087_IF_MATCH_REQUIRED"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "WORKBENCH_BAD_REQUEST", message: "缺少有效的 If-Match" } });
  });
});
