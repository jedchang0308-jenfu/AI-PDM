import { describe, expect, it, vi } from "vitest";
import { JenfuAuthEpochRepository } from "@/lib/jenfu-auth-epoch-repository";

describe("canonical principal auth state", () => {
  it("accepts initialized epoch zero and queries only the principal-keyed contract", async () => {
    const queryOne = vi.fn(async () => ({ principal_id: "principal-one", auth_epoch: "0", revoked_before: null }));
    const repository = new JenfuAuthEpochRepository({ kind: "postgres", queryOne } as never);
    await expect(repository.readCanonicalPrincipalState("principal-one")).resolves.toEqual({ authEpoch: 0, revokedBefore: null });
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("read_principal_auth_state_v3(:principalId)"), { principalId: "principal-one" });
  });

  it("rejects a missing, rebound, or invalid principal state without pair fallback", async () => {
    const queryOne = vi.fn();
    const repository = new JenfuAuthEpochRepository({ kind: "postgres", queryOne } as never);
    for (const row of [null, { principal_id: "other", auth_epoch: 0, revoked_before: null }, { principal_id: "principal-one", auth_epoch: -1, revoked_before: null }]) {
      queryOne.mockResolvedValueOnce(row);
      await expect(repository.readCanonicalPrincipalState("principal-one")).rejects.toMatchObject({ code: "auth_epoch_unavailable" });
    }
    expect(queryOne).toHaveBeenCalledTimes(3);
  });

  it("does not treat the local SQLite provider as a canonical principal-state source", async () => {
    const queryOne = vi.fn();
    const repository = new JenfuAuthEpochRepository({ kind: "sqlite", queryOne } as never);
    await expect(repository.readCanonicalPrincipalState("principal-one")).rejects.toMatchObject({ code: "auth_epoch_unavailable" });
    expect(queryOne).not.toHaveBeenCalled();
  });
});
