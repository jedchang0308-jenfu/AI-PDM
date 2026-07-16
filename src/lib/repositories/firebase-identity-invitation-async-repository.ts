import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { UserRole } from "@/lib/auth-config";
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

  async createRequested(input: { invitationId: string; firebaseUid: string; pdmUserId: string; now?: string }) {
    const now = input.now ?? new Date().toISOString();
    await this.client.execute(
      `INSERT INTO firebase_identity_invitations (
         invitation_id, firebase_uid, pdm_user_id, setup_state, created_at, updated_at
       ) VALUES (:invitationId, :firebaseUid, :pdmUserId, 'requested', :now, :now)`,
      { ...input, now }
    );
  }

  async prepareCompensatedReissue(input: {
    invitationId: string;
    firebaseUid: string;
    pdmUserId: string;
    displayName: string;
    role: UserRole;
    actorId: string;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    await this.client.execute(
      `UPDATE users
       SET display_name = :displayName,
           role = :role,
           account_status = 'active',
           system_role_enabled = 1,
           account_status_changed_at = :now,
           account_status_changed_by = :actorId,
           account_status_reason = 'firebase_invitation_reissued',
           updated_at = :now
       WHERE id = :pdmUserId
         AND account_status = 'suspended'
         AND system_role_enabled = 0
         AND account_status_reason = 'firebase_invitation_compensated'
         AND password_hash IS NULL`,
      { ...input, now }
    );
    await this.client.execute(
      `UPDATE firebase_identity_invitations
       SET setup_state = 'requested', last_error = NULL, updated_at = :now
       WHERE invitation_id = :invitationId
         AND firebase_uid = :firebaseUid
         AND pdm_user_id = :pdmUserId
         AND setup_state = 'compensated'`,
      { ...input, now }
    );

    const user = await this.client.queryOne<{ account_status: string; system_role_enabled: number | boolean; account_status_reason: string | null }>(
      `SELECT account_status, system_role_enabled, account_status_reason
       FROM users
       WHERE id = :pdmUserId`,
      { pdmUserId: input.pdmUserId }
    );
    const invitation = await this.getByInvitationId(input.invitationId);
    if (
      user?.account_status !== "active" ||
      !Boolean(Number(user.system_role_enabled)) ||
      user.account_status_reason !== "firebase_invitation_reissued" ||
      invitation?.setupState !== "requested" ||
      invitation.firebaseUid !== input.firebaseUid ||
      invitation.pdmUserId !== input.pdmUserId
    ) {
      throw new Error("FIREBASE_INVITATION_REISSUE_PREPARE_FAILED");
    }
  }

  async setState(invitationId: string, state: InvitationSetupState, detail?: string) {
    await this.client.execute(
      `UPDATE firebase_identity_invitations
       SET setup_state = :state,
           last_error = :detail,
           updated_at = :now
       WHERE invitation_id = :invitationId`,
      { invitationId, state, detail: detail ?? null, now: new Date().toISOString() }
    );
  }

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

  async markActiveAfterLogin(firebaseUid: string, pdmUserId: string) {
    const now = new Date().toISOString();
    await this.client.transaction(async (transaction) => {
      const invitation = await transaction.queryOne<{ invitation_id: string }>(
        `SELECT invitation_id
         FROM firebase_identity_invitations
         WHERE firebase_uid = :firebaseUid
           AND pdm_user_id = :pdmUserId
           AND setup_state = 'password_setup_link_sent'`,
        { firebaseUid, pdmUserId }
      );
      if (!invitation) return;
      await transaction.execute(
        `UPDATE firebase_identity_invitations
         SET setup_state = 'active', last_error = NULL, updated_at = :now
         WHERE invitation_id = :invitationId`,
        { invitationId: invitation.invitation_id, now }
      );
      await transaction.execute(
        `UPDATE account_invitations
         SET status = 'accepted', accepted_by = :pdmUserId, accepted_at = :now
         WHERE id = :invitationId AND status = 'pending'`,
        { invitationId: invitation.invitation_id, pdmUserId, now }
      );
    });
  }
}
