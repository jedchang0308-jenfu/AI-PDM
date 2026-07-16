import crypto from "node:crypto";
import {
  AccountInvitationError,
  createAccountInvitationAsync,
  reissueCompensatedFirebaseInvitationAsync,
  revokeAccountInvitationAsync
} from "@/lib/account-invitations";
import type { UserRole } from "@/lib/auth-config";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { FirebaseAdminIdentityProvider } from "@/lib/firebase-admin-identity-provider";
import { FirebaseManagedActionEmail } from "@/lib/firebase-managed-action-email";
import type { FirebaseIdentityProvider } from "@/lib/platform-identity-contract";
import { PlatformMappingAsyncRepository } from "@/lib/repositories/platform-mapping-async-repository";
import { AsyncUserRepository } from "@/lib/repositories/user-async-repository";
import { FirebaseIdentityInvitationAsyncRepository } from "@/lib/repositories/firebase-identity-invitation-async-repository";

type FirebaseInvitationDependencies = {
  client: AsyncDatabaseClient;
  firebase: FirebaseIdentityProvider;
  actionEmail: Pick<FirebaseManagedActionEmail, "sendEmailSignInLink">;
  idFactory: () => string;
  createCanonical: typeof createAccountInvitationAsync;
  reissueCanonical: typeof reissueCompensatedFirebaseInvitationAsync;
  revokeCanonical: typeof revokeAccountInvitationAsync;
};

function dependencies(overrides: Partial<FirebaseInvitationDependencies> = {}): FirebaseInvitationDependencies {
  return {
    client: overrides.client ?? getAsyncDatabaseClient(),
    firebase: overrides.firebase ?? new FirebaseAdminIdentityProvider(),
    actionEmail: overrides.actionEmail ?? new FirebaseManagedActionEmail(),
    idFactory: overrides.idFactory ?? (() => crypto.randomUUID()),
    createCanonical: overrides.createCanonical ?? createAccountInvitationAsync,
    reissueCanonical: overrides.reissueCanonical ?? reissueCompensatedFirebaseInvitationAsync,
    revokeCanonical: overrides.revokeCanonical ?? revokeAccountInvitationAsync
  };
}

function invitationContinueUrl(invitationId: string) {
  const configured = String(process.env.PDM_PUBLIC_BASE_URL ?? "").trim();
  if (!configured) throw new AccountInvitationError("invitation_public_url_not_configured", "尚未設定 PDM 公開網址。", 503);
  const url = new URL("/account-invitation/firebase", configured);
  url.searchParams.set("invitation", invitationId);
  return url.toString();
}

export async function createFirebaseManagedInvitation(
  input: {
    email: string;
    displayName: string;
    role: UserRole;
    invitedBy: string;
    expiresInDays?: number;
  },
  overrides: Partial<FirebaseInvitationDependencies> = {}
) {
  const deps = dependencies(overrides);
  const reissued = await deps.reissueCanonical(input);
  const canonical = reissued ?? await deps.createCanonical(input);
  const suffix = deps.idFactory();
  const pdmUserId = reissued?.pdmUserId ?? `prod-pdm-${suffix}`;
  const firebaseUid = reissued?.firebaseUid ?? `pdm-firebase-${suffix}`;
  const invitationRepository = new FirebaseIdentityInvitationAsyncRepository(deps.client);
  let identityCreated = false;

  try {
    await deps.client.transaction(async (transaction) => {
      const transactionInvitationRepository = new FirebaseIdentityInvitationAsyncRepository(transaction);
      if (reissued) {
        await transactionInvitationRepository.prepareCompensatedReissue({
          invitationId: canonical.invitation.id,
          firebaseUid,
          pdmUserId,
          displayName: input.displayName.trim(),
          role: input.role,
          actorId: input.invitedBy
        });
      } else {
        await new AsyncUserRepository(transaction).createUser({
          id: pdmUserId,
          displayName: input.displayName.trim(),
          email: input.email.trim().toLowerCase(),
          passwordHash: null,
          role: input.role,
          companyCodes: ["JENFU"]
        });
      }
      const mappings = new PlatformMappingAsyncRepository(transaction);
      await mappings.ensureCurrentPrincipal(pdmUserId);
      await mappings.linkSharedPrincipal({ platformPrincipalId: `firebase:${firebaseUid}`, pdmUserId, externalSubject: firebaseUid });
      if (!reissued) {
        await transactionInvitationRepository.createRequested({
          invitationId: canonical.invitation.id,
          firebaseUid,
          pdmUserId
        });
      }
    });

    if (reissued) {
      await deps.firebase.disableIdentity(firebaseUid).catch(() => undefined);
      await deps.firebase.revokeRefreshTokens(firebaseUid).catch(() => undefined);
      await deps.firebase.deleteIdentity(firebaseUid).catch(() => undefined);
    }
    await deps.firebase.createEmailPasswordIdentity({
      uid: firebaseUid,
      email: input.email,
      displayName: input.displayName,
      disabled: false
    });
    identityCreated = true;
    await invitationRepository.setState(canonical.invitation.id, "identity_created");
    await deps.actionEmail.sendEmailSignInLink({
      email: input.email,
      continueUrl: invitationContinueUrl(canonical.invitation.id)
    });
    await invitationRepository.setState(canonical.invitation.id, "password_setup_link_sent");
    return {
      invitation: canonical.invitation,
      pdmUserId,
      firebaseUid,
      reissued: Boolean(reissued),
      delivery: "firebase_managed_email" as const
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (identityCreated) {
      await deps.firebase.disableIdentity(firebaseUid).catch(() => undefined);
      await deps.firebase.revokeRefreshTokens(firebaseUid).catch(() => undefined);
      await deps.firebase.deleteIdentity(firebaseUid).catch(() => undefined);
    }
    await invitationRepository.compensate({ invitationId: canonical.invitation.id, pdmUserId, actorId: input.invitedBy, detail }).catch(() => undefined);
    await deps.revokeCanonical({ invitationId: canonical.invitation.id, revokedBy: input.invitedBy }).catch(() => undefined);
    throw error;
  }
}

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
  await deps.firebase.disableIdentity(state.firebaseUid).catch(() => undefined);
  await deps.firebase.revokeRefreshTokens(state.firebaseUid).catch(() => undefined);
  await deps.firebase.deleteIdentity(state.firebaseUid).catch(() => undefined);
  await repository.compensate({
    invitationId: state.invitationId,
    pdmUserId: state.pdmUserId,
    actorId: input.revokedBy,
    detail: "firebase_invitation_revoked"
  });
  return deps.revokeCanonical(input);
}
