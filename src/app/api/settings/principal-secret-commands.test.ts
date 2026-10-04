import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), draft: vi.fn(), test: vi.fn(), activate: vi.fn(), revoke: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/platform-command-context", () => ({ requireNumberingPlatformCommandAsync: mocks.access }));
vi.mock("@/lib/settings-secret-lifecycle", () => ({ createSettingsSecretDraft: mocks.draft,
  enqueueSettingsSecretProbe: mocks.test, activateSettingsSecretReference: mocks.activate,
  revokeSettingsSecretReference: mocks.revoke, listSettingsSecretStatuses: mocks.list,
  redactSettingsSecretReference: (value: unknown) => value, SettingsSecretLifecycleError: class extends Error {} }));
import { POST as draft } from "@/app/api/settings/secrets/[kind]/draft/route";
import { POST as test } from "@/app/api/settings/secrets/[kind]/test/route";
import { POST as activate } from "@/app/api/settings/secrets/[kind]/activate/route";
import { POST as revoke } from "@/app/api/settings/secrets/[kind]/revoke/route";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
const metadata = { actor: { principalId: "verified-principal" }, idempotencyKey: "fixture-operation" };
const cases = [ ["draft", draft, mocks.draft, 201], ["test", test, mocks.test, 202],
  ["activate", activate, mocks.activate, 200], ["revoke", revoke, mocks.revoke, 200] ] as const;
function request(action: string) { return new Request(`https://pdm.test/api/settings/secrets/reference-one/${action}`, {
  method: "POST", headers: { "content-type": "application/json", "idempotency-key": "fixture-operation" },
  body: JSON.stringify({ secretValue: "synthetic-value", reason: "synthetic reason" }) }); }
describe("mounted settings Secret mutation Principal ingress", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.access.mockResolvedValue({ metadata, response: null }); mocks.list.mockResolvedValue([]);
    for (const [, , effect] of cases) effect.mockResolvedValue({ id: "reference-one" });
  });
  it.each(cases)("%s passes exact settings permission and verified command metadata", async (action, handler, effect, status) => {
    const response = await handler(request(action), { params: Promise.resolve({ kind: "reference-one" }) });
    expect(response.status).toBe(status);
    expect(mocks.access).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: "settings.secret.manage" }));
    expect(effect).toHaveBeenCalledWith(expect.not.objectContaining({ actorId: expect.anything() }), metadata);
  });
  it.each(cases)("%s denial performs no lifecycle mutation", async (action, handler, effect) => {
    mocks.access.mockResolvedValue({ response: Response.json({ code: "permission_not_granted" }, { status: 403 }) });
    expect((await handler(request(action), { params: Promise.resolve({ kind: "reference-one" }) })).status).toBe(403);
    expect(effect).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each(cases)("%s preserves typed command-time session withdrawal as 401", async (action, handler, effect) => {
    effect.mockRejectedValue(new JenfuPrincipalRequestError("auth_session_invalid"));
    const response = await handler(request(action), { params: Promise.resolve({ kind: "reference-one" }) });
    expect(response.status).toBe(401); expect(await response.json()).toEqual({ code: "auth_session_invalid" });
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
