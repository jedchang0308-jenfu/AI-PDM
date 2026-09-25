import { describe, expect, it, vi } from "vitest";
import { JenfuLegacyCutoverRepository } from "@/lib/jenfu-legacy-cutover-repository";

describe("temporary v1 session cutover fence", () => {
  it("admits only an explicitly inventoried legacy-compatible profile and exact principal", async () => {
    const queryOne = vi.fn(async () => ({ status: "legacy_compatible", principal_id: "principal-one" }));
    await new JenfuLegacyCutoverRepository({ kind: "postgres", queryOne } as never)
      .requireLegacyCompatible("pdm-one", "principal-one");
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("principal_identity_cutovers"), { pdmUserId: "pdm-one" });
  });

  it("rejects active, unknown, unbound, or mismatched subjects without UID fallback", async () => {
    const queryOne = vi.fn();
    const reader = new JenfuLegacyCutoverRepository({ kind: "postgres", queryOne } as never);
    for (const row of [null, { status: "principal_active", principal_id: "principal-one" },
      { status: "legacy_compatible", principal_id: null },
      { status: "legacy_compatible", principal_id: "principal-two" }]) {
      queryOne.mockResolvedValueOnce(row);
      await expect(reader.requireLegacyCompatible("pdm-one", "principal-one"))
        .rejects.toMatchObject({ code: "legacy_session_retired" });
    }
  });

  it("fails closed on database failure or non-PostgreSQL provider", async () => {
    const queryOne = vi.fn(async () => { throw new Error("database down"); });
    await expect(new JenfuLegacyCutoverRepository({ kind: "postgres", queryOne } as never)
      .requireLegacyCompatible("pdm-one", "principal-one"))
      .rejects.toMatchObject({ code: "legacy_cutover_unavailable" });
    await expect(new JenfuLegacyCutoverRepository({ kind: "sqlite", queryOne } as never)
      .requireLegacyCompatible("pdm-one", "principal-one"))
      .rejects.toMatchObject({ code: "legacy_cutover_unavailable" });
  });
});
