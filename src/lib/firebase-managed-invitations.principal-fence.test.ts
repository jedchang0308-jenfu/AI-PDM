import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getByInvitationId: vi.fn(),
  compensate: vi.fn()
}));

vi.mock("@/lib/repositories/firebase-identity-invitation-async-repository", () => ({
  FirebaseIdentityInvitationAsyncRepository: class {
    getByInvitationId = mocks.getByInvitationId;
    compensate = mocks.compensate;
  }
}));

import { revokeFirebaseManagedInvitation } from "@/lib/firebase-managed-invitations";

describe("historical Firebase invitation revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getByInvitationId.mockResolvedValue({
      invitationId: "invite-one", pdmUserId: "profile-one", firebaseUid: "uid-one",
      setupState: "password_setup_link_sent"
    });
  });

  function dependencies(events: string[]) {
    return {
      client: {} as never,
      revokeCanonical: vi.fn(async () => { events.push("canonical"); return { status: "revoked" }; }) as never
    };
  }

  it("does not revoke anything when the database rejects an already-cutover profile", async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    mocks.compensate.mockRejectedValue(new Error("PRINCIPAL_LEGACY_WRITER_FENCED"));
    await expect(revokeFirebaseManagedInvitation({ invitationId: "invite-one", revokedBy: "actor" }, deps))
      .rejects.toThrow("PRINCIPAL_LEGACY_WRITER_FENCED");
    expect(events).toEqual([]);
  });

  it("commits the old-account fence before revoking the local invitation", async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    mocks.compensate.mockImplementation(async () => { events.push("fence"); });
    await revokeFirebaseManagedInvitation({ invitationId: "invite-one", revokedBy: "actor" }, deps);
    expect(events).toEqual(["fence", "canonical"]);
  });

  it("does not compensate a second time after an unknown canonical outcome", async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    mocks.getByInvitationId.mockResolvedValue({
      invitationId: "invite-one", pdmUserId: "profile-one", firebaseUid: "uid-one",
      setupState: "compensated"
    });
    await revokeFirebaseManagedInvitation({ invitationId: "invite-one", revokedBy: "actor" }, deps);
    expect(mocks.compensate).not.toHaveBeenCalled();
    expect(events).toEqual(["canonical"]);
  });
});
