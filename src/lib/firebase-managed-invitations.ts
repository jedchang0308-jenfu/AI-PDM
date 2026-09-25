import {
  AccountInvitationError,
  revokeAccountInvitationAsync
} from "@/lib/account-invitations";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { FirebaseIdentityInvitationAsyncRepository } from "@/lib/repositories/firebase-identity-invitation-async-repository";

type FirebaseInvitationDependencies = {
  client: AsyncDatabaseClient;
  revokeCanonical: typeof revokeAccountInvitationAsync;
};

function dependencies(overrides: Partial<FirebaseInvitationDependencies> = {}): FirebaseInvitationDependencies {
  return {
    client: overrides.client ?? getAsyncDatabaseClient(),
    revokeCanonical: overrides.revokeCanonical ?? revokeAccountInvitationAsync
  };
}

// Historical invitations may still be revoked. Creating a new Firebase UID
// and translating it into a PDM security principal has been retired.
export async function revokeFirebaseManagedInvitation(
  input: { invitationId: string; revokedBy: string },
  overrides: Partial<FirebaseInvitationDependencies> = {}
) {
  const deps = dependencies(overrides);
  const repository = new FirebaseIdentityInvitationAsyncRepository(deps.client);
  const state = await repository.getByInvitationId(input.invitationId);
  if (!state) return deps.revokeCanonical(input);
  if (state.setupState === "active") {
    throw new AccountInvitationError("invitation_already_used", "已完成啟用的帳號不能透過邀請撤銷，請改用停權。", 409);
  }
  if (state.setupState === "compensated") {
    // The local denial committed on a previous attempt. Retry only the
    // canonical invitation revocation; do not advance lifecycle again.
    return deps.revokeCanonical(input);
  }
  // This application revokes only its local historical invitation and access.
  // Shared provider identities belong to Platform and must never be disabled
  // or deleted by an AI-PDM invitation command.
  await repository.compensate({
    invitationId: state.invitationId,
    pdmUserId: state.pdmUserId,
    actorId: input.revokedBy,
    detail: "firebase_invitation_revoked"
  });
  return deps.revokeCanonical(input);
}
