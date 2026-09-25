import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { InvitationSetupState } from "@/lib/platform-identity-contract";

export type FirebaseIdentityInvitation = {
  invitationId: string;
  firebaseUid: string;
  pdmUserId: string;
  setupState: InvitationSetupState;
  lastError: string | null;
};

type FirebaseInvitationRow = {
  invitation_id: string;
  firebase_uid: string;
  pdm_user_id: string;
  setup_state: InvitationSetupState;
  last_error: string | null;
};

function mapRow(row: FirebaseInvitationRow): FirebaseIdentityInvitation {
  return {
    invitationId: row.invitation_id,
    firebaseUid: row.firebase_uid,
    pdmUserId: row.pdm_user_id,
    setupState: row.setup_state,
    lastError: row.last_error
  };
}

export class FirebaseIdentityInvitationAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async getByInvitationId(invitationId: string) {
    const row = await this.client.queryOne<FirebaseInvitationRow>(
      `SELECT invitation_id, firebase_uid, pdm_user_id, setup_state, last_error
       FROM firebase_identity_invitations
       WHERE invitation_id = :invitationId`,
      { invitationId }
    );
    return row ? mapRow(row) : null;
  }

  async compensate(input: { invitationId: string; pdmUserId: string; actorId: string; detail: string }) {
    const now = new Date().toISOString();
    await this.client.transaction(async (transaction) => {
      await transaction.execute(
        `UPDATE platform_principal_mappings
         SET mapping_status = 'suspended', updated_at = :now
         WHERE pdm_user_id = :pdmUserId`,
        { pdmUserId: input.pdmUserId, now }
      );
      await transaction.execute(
        `UPDATE users
         SET account_status = 'suspended',
             system_role_enabled = 0,
             session_invalid_before = :now,
             account_lifecycle_version = account_lifecycle_version + 1,
             account_status_changed_at = :now,
             account_status_changed_by = :actorId,
             account_status_reason = 'firebase_invitation_compensated',
             updated_at = :now
         WHERE id = :pdmUserId`,
        { pdmUserId: input.pdmUserId, actorId: input.actorId, now }
      );
      await transaction.execute(
        `UPDATE firebase_identity_invitations
         SET setup_state = 'compensated', last_error = :detail, updated_at = :now
         WHERE invitation_id = :invitationId`,
        { invitationId: input.invitationId, detail: input.detail, now }
      );
    });
  }

}
