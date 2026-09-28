import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), add: vi.fn(), remove: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/number-state-flow-api", async (importOriginal) => ({
  ...(await importOriginal<object>()), requireNumberStateCommandAccessAsync: mocks.access
}));
vi.mock("@/lib/transfer-packages", async (importOriginal) => ({
  ...(await importOriginal<object>()), addTransferPackageScopeItem: mocks.add,
  removeTransferPackageScopeItem: mocks.remove, cancelTransferPackage: mocks.cancel
}));

import { POST as add } from "@/app/api/transfer-packages/[id]/items/route";
import { DELETE as remove } from "@/app/api/transfer-packages/[id]/items/[itemId]/route";
import { POST as cancel } from "@/app/api/transfer-packages/[id]/cancel/route";

function request(path: string, method: string, body: Record<string, unknown>, key = "operation-one") {
  return new Request(`https://ai-pdm.test${path}`, { method,
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body) });
}

describe("Principal transfer package scope and cancel routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ response: null,
      actor: { pdmUserId: "profile-one", organizationId: "company-one", principalId: "principal-one" },
      company: { companyId: "company-one" }, metadata: { idempotencyKey: "operation-one" } });
    for (const mutate of [mocks.add, mocks.remove, mocks.cancel]) mutate.mockResolvedValue({ id: "package-one" });
  });

  it("passes the verified Principal command context for all three writes", async () => {
    const contexts = [
      { run: add, path: "/api/transfer-packages/package-one/items", method: "POST",
        params: { id: "package-one", itemId: "unused" }, body: { expectedRowVersion: 1, entityType: "drawing", entityId: "DR-1" },
        action: mocks.add },
      { run: remove, path: "/api/transfer-packages/package-one/items/item-one", method: "DELETE",
        params: { id: "package-one", itemId: "item-one" }, body: { expectedRowVersion: 1 }, action: mocks.remove },
      { run: cancel, path: "/api/transfer-packages/package-one/cancel", method: "POST",
        params: { id: "package-one", itemId: "unused" }, body: { expectedRowVersion: 1, reason: "No longer needed" }, action: mocks.cancel }
    ];
    for (const item of contexts) {
      const response = await item.run(request(item.path, item.method, item.body),
        { params: Promise.resolve(item.params) });
      expect(response.status).toBe(200);
      expect(item.action).toHaveBeenCalledWith(expect.objectContaining({
        metadata: { idempotencyKey: "operation-one" },
        actor: { userId: "profile-one", companyId: "company-one", role: "Principal",
          principalId: "principal-one" }
      }));
    }
    expect(mocks.access).toHaveBeenCalledTimes(3);
    expect(mocks.access).toHaveBeenCalledWith(expect.any(Request), "transfer.package.update", expect.any(Object));
  });

  it("does not invoke commands without an idempotency key or after denial", async () => {
    const missing = await add(request("/api/transfer-packages/package-one/items", "POST",
      { expectedRowVersion: 1, entityType: "drawing", entityId: "DR-1" }, ""),
      { params: Promise.resolve({ id: "package-one" }) });
    expect(missing.status).toBe(400);
    mocks.access.mockResolvedValueOnce({ response: Response.json({ error: "permission_not_granted" }, { status: 403 }) });
    const denied = await cancel(request("/api/transfer-packages/package-one/cancel", "POST",
      { expectedRowVersion: 1, reason: "No longer needed" }),
      { params: Promise.resolve({ id: "package-one" }) });
    expect(denied.status).toBe(403);
    for (const mutate of [mocks.add, mocks.remove, mocks.cancel]) expect(mutate).not.toHaveBeenCalled();
  });
});
