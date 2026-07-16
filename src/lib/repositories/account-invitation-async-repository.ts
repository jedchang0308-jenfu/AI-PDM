import crypto from "node:crypto";
import type { UserRole } from "@/lib/auth-config";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";
import { AsyncAuthIdentityRepository } from "@/lib/repositories/auth-identity-async-repository";
import { AsyncUserRepository } from "@/lib/repositories/user-async-repository";

export type AccountInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

type TimestampValue = string | Date;

type AccountInvitationRow = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  company_id: string;
  status: AccountInvitationStatus;
  invited_by: string;
  invited_by_name: string | null;
  invited_at: TimestampValue;
  expires_at: TimestampValue;
  accepted_by: string | null;
  accepted_at: TimestampValue | null;
  revoked_by: string | null;
  revoked_at: TimestampValue | null;
};

export type AccountInvitationSummary = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  companyId: string;
  status: AccountInvitationStatus;
  invitedBy: string;
  invitedByName: string | null;
  invitedAt: string;
  expiresAt: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
};

export type ReissuedFirebaseInvitation = {
  invitation: AccountInvitationSummary;
  pdmUserId: string;
  firebaseUid: string;
};

export type AccountInvitationErrorCode =
  | "invitation_already_pending"
  | "invitation_public_url_not_configured"
  | "user_already_exists"
  | "invalid_invitation"
  | "invitation_expired"
  | "invitation_already_used"
  | "invitation_revoked"
  | "invitation_email_mismatch"
  | "invitation_not_pending";

export class AccountInvitationError extends Error {
  constructor(
    readonly code: AccountInvitationErrorCode,
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "AccountInvitationError";
  }
}

const ACCOUNT_INVITATION_SELECT = `
  SELECT
    invitation.id,
    invitation.email,
    invitation.display_name,
    invitation.role,
    invitation.company_id,
    invitation.status,
    invitation.invited_by,
    inviter.display_name AS invited_by_name,
    invitation.invited_at,
    invitation.expires_at,
    invitation.accepted_by,
    invitation.accepted_at,
    invitation.revoked_by,
    invitation.revoked_at
  FROM account_invitations invitation
  LEFT JOIN users inviter ON inviter.id = invitation.invited_by
`;

const EXPIRE_PENDING_INVITATIONS_SQL = `
  UPDATE account_invitations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at <= :now
`;

const SELECT_PENDING_INVITATION_BY_EMAIL_SQL = `
  ${ACCOUNT_INVITATION_SELECT}
  WHERE invitation.email = :email
    AND invitation.status = 'pending'
  ORDER BY invitation.invited_at DESC
  LIMIT 1
`;

const SELECT_INVITATION_BY_ID_SQL = `
  ${ACCOUNT_INVITATION_SELECT}
  WHERE invitation.id = :id
`;

const SELECT_INVITATION_BY_TOKEN_HASH_SQL = `
  ${ACCOUNT_INVITATION_SELECT}
  WHERE invitation.token_hash = :tokenHash
`;

const LIST_INVITATIONS_SQL = `
  ${ACCOUNT_INVITATION_SELECT}
  ORDER BY invitation.invited_at DESC, invitation.id DESC
  LIMIT :limit
`;

const INSERT_INVITATION_SQL = `
  INSERT INTO account_invitations (
    id, email, display_name, role, company_id, token_hash, status,
    invited_by, invited_at, expires_at
  )
  VALUES (
    :id, :email, :displayName, :role, :companyId, :tokenHash, 'pending',
    :invitedBy, :invitedAt, :expiresAt
  )
`;

const CLAIM_INVITATION_SQL = `
  UPDATE account_invitations
  SET status = 'accepted',
      accepted_at = :acceptedAt
  WHERE id = :id
    AND status = 'pending'
    AND expires_at > :acceptedAt
  RETURNING id
`;

const FINALIZE_INVITATION_ACCEPTANCE_SQL = `
  UPDATE account_invitations
  SET accepted_by = :acceptedBy
  WHERE id = :id
    AND status = 'accepted'
`;

const REVOKE_INVITATION_SQL = `
  UPDATE account_invitations
  SET status = 'revoked',
      revoked_by = :revokedBy,
      revoked_at = :revokedAt
  WHERE id = :id
    AND status = 'pending'
  RETURNING id
`;

const SELECT_REISSUABLE_FIREBASE_INVITATION_SQL = `
  SELECT
    invitation.id,
    invitation.role,
    firebase_invitation.firebase_uid,
    firebase_invitation.pdm_user_id
  FROM account_invitations invitation
  JOIN firebase_identity_invitations firebase_invitation
    ON firebase_invitation.invitation_id = invitation.id
  JOIN users invited_user
    ON invited_user.id = firebase_invitation.pdm_user_id
  JOIN platform_principal_mappings principal_mapping
    ON principal_mapping.pdm_user_id = invited_user.id
  WHERE lower(invitation.email) = lower(:email)
    AND invitation.status = 'revoked'
    AND firebase_invitation.setup_state = 'compensated'
    AND invited_user.account_status = 'suspended'
    AND invited_user.system_role_enabled = 0
    AND invited_user.account_status_reason = 'firebase_invitation_compensated'
    AND invited_user.password_hash IS NULL
    AND principal_mapping.mapping_source = 'shared_iam'
    AND principal_mapping.mapping_status = 'suspended'
    AND principal_mapping.external_subject = firebase_invitation.firebase_uid
    AND NOT EXISTS (
      SELECT 1
      FROM auth_identities identity
      WHERE identity.user_id = invited_user.id
        AND identity.status = 'active'
    )
  ORDER BY invitation.revoked_at DESC, invitation.invited_at DESC
  LIMIT 1
`;

const REISSUE_FIREBASE_INVITATION_SQL = `
  UPDATE account_invitations
  SET display_name = :displayName,
      role = :role,
      token_hash = :tokenHash,
      status = 'pending',
      invited_by = :invitedBy,
      invited_at = :invitedAt,
      expires_at = :expiresAt,
      accepted_by = NULL,
      accepted_at = NULL,
      revoked_by = NULL,
      revoked_at = NULL
  WHERE id = :id
    AND status = 'revoked'
  RETURNING id
`;

function toIso(value: TimestampValue | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function mapInvitation(row: AccountInvitationRow): AccountInvitationSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    companyId: row.company_id,
    status: row.status,
    invitedBy: row.invited_by,
    invitedByName: row.invited_by_name,
    invitedAt: toIso(row.invited_at) ?? "",
    expiresAt: toIso(row.expires_at) ?? "",
    acceptedBy: row.accepted_by,
    acceptedAt: toIso(row.accepted_at),
    revokedBy: row.revoked_by,
    revokedAt: toIso(row.revoked_at)
  };
}

function statusError(status: AccountInvitationStatus): AccountInvitationError {
  if (status === "expired") {
    return new AccountInvitationError("invitation_expired", "這份邀請已到期，請聯絡系統管理員重新邀請。", 410);
  }
  if (status === "accepted") {
    return new AccountInvitationError("invitation_already_used", "這份邀請已完成設定，請直接前往登入。", 410);
  }
  if (status === "revoked") {
    return new AccountInvitationError("invitation_revoked", "這份邀請已撤銷，請聯絡系統管理員重新邀請。", 410);
  }
  return new AccountInvitationError("invitation_not_pending", "這份邀請目前無法使用，請聯絡系統管理員。", 409);
}

function isUniqueConstraintError(error: unknown) {
  if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "23505") return true;
  return error instanceof Error && /unique constraint|UNIQUE constraint failed/iu.test(error.message);
}

export class AsyncAccountInvitationRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => `invite-${crypto.randomUUID()}`
  ) {}

  async list(limit = 100): Promise<AccountInvitationSummary[]> {
    const now = this.clock();
    return this.client.transaction(async (client) => {
      await client.execute(EXPIRE_PENDING_INVITATIONS_SQL, { now });
      const rows = await client.query<AccountInvitationRow>(LIST_INVITATIONS_SQL, {
        limit: Math.max(1, Math.min(200, Math.trunc(limit)))
      });
      return rows.map(mapInvitation);
    });
  }

  async create(input: {
    email: string;
    displayName: string;
    role: UserRole;
    companyId: string;
    tokenHash: string;
    invitedBy: string;
    expiresAt: string;
  }): Promise<AccountInvitationSummary> {
    const invitedAt = this.clock();
    const id = this.idFactory();

    return this.client.transaction(async (client) => {
      await client.execute(EXPIRE_PENDING_INVITATIONS_SQL, { now: invitedAt });

      const userRepository = new AsyncUserRepository(client);
      const existingUser = await userRepository.getUserByEmail(input.email);
      if (existingUser) {
        throw new AccountInvitationError("user_already_exists", "這個電子郵件已經有帳號，請直接請使用者登入。", 409);
      }

      const pending = await client.queryOne<AccountInvitationRow>(SELECT_PENDING_INVITATION_BY_EMAIL_SQL, { email: input.email });
      if (pending) {
        throw new AccountInvitationError("invitation_already_pending", "這個電子郵件已有有效邀請。若連結遺失，請先撤銷後重新邀請。", 409);
      }

      try {
        await client.execute(INSERT_INVITATION_SQL, { id, invitedAt, ...input });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new AccountInvitationError("invitation_already_pending", "這個電子郵件已有有效邀請。若連結遺失，請先撤銷後重新邀請。", 409);
        }
        throw error;
      }

      await new AsyncAuditRepository(client).createAuditLog({
        actorId: input.invitedBy,
        action: "AccountInvitationCreated",
        detail: { invitationId: id, email: input.email, role: input.role, companyId: input.companyId, expiresAt: input.expiresAt }
      });

      const created = await client.queryOne<AccountInvitationRow>(SELECT_INVITATION_BY_ID_SQL, { id });
      if (!created) throw new Error("ACCOUNT_INVITATION_CREATE_READBACK_FAILED");
      return mapInvitation(created);
    });
  }

  async reissueCompensatedFirebase(input: {
    email: string;
    displayName: string;
    role: UserRole;
    tokenHash: string;
    invitedBy: string;
    expiresAt: string;
  }): Promise<ReissuedFirebaseInvitation | null> {
    const invitedAt = this.clock();
    return this.client.transaction(async (client) => {
      await client.execute(EXPIRE_PENDING_INVITATIONS_SQL, { now: invitedAt });

      const pending = await client.queryOne<AccountInvitationRow>(SELECT_PENDING_INVITATION_BY_EMAIL_SQL, { email: input.email });
      if (pending) {
        throw new AccountInvitationError("invitation_already_pending", "這個電子郵件已有有效邀請。請使用者檢查收件匣與垃圾郵件。", 409);
      }

      const candidate = await client.queryOne<{
        id: string;
        role: UserRole;
        firebase_uid: string;
        pdm_user_id: string;
      }>(SELECT_REISSUABLE_FIREBASE_INVITATION_SQL, { email: input.email });
      if (!candidate) return null;

      const updated = await client.queryOne<{ id: string }>(REISSUE_FIREBASE_INVITATION_SQL, {
        id: candidate.id,
        invitedAt,
        ...input
      });
      if (!updated) throw new Error("ACCOUNT_INVITATION_REISSUE_CONFLICT");

      await new AsyncAuditRepository(client).createAuditLog({
        actorId: input.invitedBy,
        action: "AccountInvitationReissued",
        detail: {
          invitationId: candidate.id,
          email: input.email,
          previousRole: candidate.role,
          role: input.role,
          expiresAt: input.expiresAt,
          reusedPdmUserId: candidate.pdm_user_id
        }
      });

      const invitation = await client.queryOne<AccountInvitationRow>(SELECT_INVITATION_BY_ID_SQL, { id: candidate.id });
      if (!invitation) throw new Error("ACCOUNT_INVITATION_REISSUE_READBACK_FAILED");
      return {
        invitation: mapInvitation(invitation),
        pdmUserId: candidate.pdm_user_id,
        firebaseUid: candidate.firebase_uid
      };
    });
  }

  async lookupByTokenHash(tokenHash: string): Promise<AccountInvitationSummary> {
    const now = this.clock();
    return this.client.transaction(async (client) => {
      await client.execute(EXPIRE_PENDING_INVITATIONS_SQL, { now });
      const invitation = await client.queryOne<AccountInvitationRow>(SELECT_INVITATION_BY_TOKEN_HASH_SQL, { tokenHash });
      if (!invitation) {
        throw new AccountInvitationError("invalid_invitation", "找不到這份邀請，請確認連結完整或聯絡系統管理員。", 404);
      }
      if (invitation.status !== "pending") throw statusError(invitation.status);
      return mapInvitation(invitation);
    });
  }

  async accept(input: { tokenHash: string; passwordHash: string }): Promise<{ invitation: AccountInvitationSummary; userId: string }> {
    const acceptedAt = this.clock();
    return this.client.transaction(async (client) => {
      await client.execute(EXPIRE_PENDING_INVITATIONS_SQL, { now: acceptedAt });
      const current = await client.queryOne<AccountInvitationRow>(SELECT_INVITATION_BY_TOKEN_HASH_SQL, { tokenHash: input.tokenHash });
      if (!current) {
        throw new AccountInvitationError("invalid_invitation", "找不到這份邀請，請確認連結完整或聯絡系統管理員。", 404);
      }
      if (current.status !== "pending") throw statusError(current.status);

      const userRepository = new AsyncUserRepository(client);
      const existingUser = await userRepository.getUserByEmail(current.email);
      if (existingUser) {
        throw new AccountInvitationError("user_already_exists", "這個電子郵件已經有帳號，請直接前往登入。", 409);
      }

      const claimed = await client.queryOne<{ id: string }>(CLAIM_INVITATION_SQL, { id: current.id, acceptedAt });
      if (!claimed) {
        const latest = await client.queryOne<AccountInvitationRow>(SELECT_INVITATION_BY_ID_SQL, { id: current.id });
        if (latest) throw statusError(latest.status);
        throw new AccountInvitationError("invalid_invitation", "找不到這份邀請，請聯絡系統管理員。", 404);
      }

      const userId = await userRepository.createUser({
        displayName: current.display_name,
        email: current.email,
        passwordHash: input.passwordHash,
        role: current.role,
        companyCodes: ["JENFU"],
        now: acceptedAt
      });
      await new AsyncAuthIdentityRepository(client).linkInvite({
        userId,
        invitationId: current.id,
        email: current.email,
        verifiedAt: acceptedAt
      });
      await client.execute(FINALIZE_INVITATION_ACCEPTANCE_SQL, { id: current.id, acceptedBy: userId });

      await new AsyncAuditRepository(client).createAuditLog({
        actorId: userId,
        action: "AccountInvitationAccepted",
        detail: { invitationId: current.id, email: current.email, role: current.role, companyId: current.company_id, provider: "local_password" }
      });

      const accepted = await client.queryOne<AccountInvitationRow>(SELECT_INVITATION_BY_ID_SQL, { id: current.id });
      if (!accepted) throw new Error("ACCOUNT_INVITATION_ACCEPT_READBACK_FAILED");
      return { invitation: mapInvitation(accepted), userId };
    });
  }

  async acceptWithGoogle(input: {
    invitationId: string;
    expectedEmail: string;
    googleSubject: string;
    googleEmail: string;
  }): Promise<{ invitation: AccountInvitationSummary; userId: string; identityId: string }> {
    const acceptedAt = this.clock();
    return this.client.transaction(async (client) => {
      await client.execute(EXPIRE_PENDING_INVITATIONS_SQL, { now: acceptedAt });
      const current = await client.queryOne<AccountInvitationRow>(SELECT_INVITATION_BY_ID_SQL, { id: input.invitationId });
      if (!current) {
        throw new AccountInvitationError("invalid_invitation", "找不到這份邀請，請聯絡系統管理員。", 404);
      }
      if (current.status !== "pending") throw statusError(current.status);

      const invitedEmail = current.email.trim().toLowerCase();
      if (invitedEmail !== input.expectedEmail.trim().toLowerCase() || invitedEmail !== input.googleEmail.trim().toLowerCase()) {
        throw new AccountInvitationError(
          "invitation_email_mismatch",
          "請使用受邀電子郵件所屬的 Google 帳號完成啟用。",
          409
        );
      }

      const userRepository = new AsyncUserRepository(client);
      const existingUser = await userRepository.getUserByEmail(current.email);
      if (existingUser) {
        throw new AccountInvitationError("user_already_exists", "這個電子郵件已經有帳號，請直接前往登入。", 409);
      }

      const claimed = await client.queryOne<{ id: string }>(CLAIM_INVITATION_SQL, { id: current.id, acceptedAt });
      if (!claimed) {
        const latest = await client.queryOne<AccountInvitationRow>(SELECT_INVITATION_BY_ID_SQL, { id: current.id });
        if (latest) throw statusError(latest.status);
        throw new AccountInvitationError("invalid_invitation", "找不到這份邀請，請聯絡系統管理員。", 404);
      }

      const userId = await userRepository.createUser({
        displayName: current.display_name,
        email: current.email,
        passwordHash: null,
        role: current.role,
        companyCodes: ["JENFU"],
        now: acceptedAt
      });
      const identityRepository = new AsyncAuthIdentityRepository(client);
      const identityId = await identityRepository.linkGoogle({
        userId,
        providerSubject: input.googleSubject,
        email: input.googleEmail,
        verifiedAt: acceptedAt
      });
      await identityRepository.linkInvite({
        userId,
        invitationId: current.id,
        email: current.email,
        verifiedAt: acceptedAt
      });
      await client.execute(FINALIZE_INVITATION_ACCEPTANCE_SQL, { id: current.id, acceptedBy: userId });

      await new AsyncAuditRepository(client).createAuditLog({
        actorId: userId,
        action: "AccountInvitationAccepted",
        detail: { invitationId: current.id, email: current.email, role: current.role, companyId: current.company_id, provider: "google_oauth" }
      });

      const accepted = await client.queryOne<AccountInvitationRow>(SELECT_INVITATION_BY_ID_SQL, { id: current.id });
      if (!accepted) throw new Error("ACCOUNT_INVITATION_GOOGLE_ACCEPT_READBACK_FAILED");
      return { invitation: mapInvitation(accepted), userId, identityId };
    });
  }

  async revoke(input: { invitationId: string; revokedBy: string }): Promise<AccountInvitationSummary> {
    const revokedAt = this.clock();
    return this.client.transaction(async (client) => {
      await client.execute(EXPIRE_PENDING_INVITATIONS_SQL, { now: revokedAt });
      const current = await client.queryOne<AccountInvitationRow>(SELECT_INVITATION_BY_ID_SQL, { id: input.invitationId });
      if (!current) {
        throw new AccountInvitationError("invalid_invitation", "找不到這份邀請。", 404);
      }
      if (current.status !== "pending") throw statusError(current.status);

      const revoked = await client.queryOne<{ id: string }>(REVOKE_INVITATION_SQL, {
        id: input.invitationId,
        revokedBy: input.revokedBy,
        revokedAt
      });
      if (!revoked) throw new AccountInvitationError("invitation_not_pending", "這份邀請已無法撤銷，請重新整理後確認狀態。", 409);

      await new AsyncAuditRepository(client).createAuditLog({
        actorId: input.revokedBy,
        action: "AccountInvitationRevoked",
        detail: { invitationId: current.id, email: current.email, role: current.role, companyId: current.company_id }
      });

      const updated = await client.queryOne<AccountInvitationRow>(SELECT_INVITATION_BY_ID_SQL, { id: input.invitationId });
      if (!updated) throw new Error("ACCOUNT_INVITATION_REVOKE_READBACK_FAILED");
      return mapInvitation(updated);
    });
  }
}
