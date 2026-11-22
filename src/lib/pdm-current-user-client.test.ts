import { afterEach, expect, it, vi } from "vitest";
import { fetchCurrentPdmUser, fetchPendingPdmApprovalCount, clearPendingPdmApprovalCount } from "./pdm-current-user-client";
import { invalidatePdmPermissions } from "./pdm-permission-client";

afterEach(() => { invalidatePdmPermissions("logout"); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("shares one identity response across consumers and discards it at account change", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL) => Response.json({ user: { id: "one" } }));
  vi.stubGlobal("fetch", fetcher);
  const [first, second] = await Promise.all([fetchCurrentPdmUser(), fetchCurrentPdmUser()]);
  expect(await first.json()).toEqual(await second.json());
  expect(fetcher).toHaveBeenCalledTimes(1);
  invalidatePdmPermissions("account-changed");
  await fetchCurrentPdmUser();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("rejects identity readback from a previous login", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const old = fetchCurrentPdmUser();
  invalidatePdmPermissions("account-changed");
  finish(Response.json({ user: { id: "previous" } }));
  await expect(old).rejects.toThrow("PDM_IDENTITY_CHANGED");
});

it("reuses a count for 30 seconds and refreshes after approval changes", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async (_input: RequestInfo | URL) => Response.json({ summary: { pending: 2 } }));
  vi.stubGlobal("fetch", fetcher);
  await Promise.all([fetchPendingPdmApprovalCount(), fetchPendingPdmApprovalCount()]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain("view=count");
  await vi.advanceTimersByTimeAsync(30_001);
  await fetchPendingPdmApprovalCount();
  clearPendingPdmApprovalCount();
  await fetchPendingPdmApprovalCount();
  expect(fetcher).toHaveBeenCalledTimes(3);
});
