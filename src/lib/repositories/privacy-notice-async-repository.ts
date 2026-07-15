import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";

export type PrivacyAcknowledgementSource =
  | "firebase_bff_session"
  | "firebase_email_invitation"
  | "employee_alias_login"
  | "privacy_acknowledgement_page";

export type PrivacyNoticeContract = {
  version: string;
  title: string;
  contentSha256: string;
  contentJson: string;
  effectiveAt: string | null;
  publishedBy: string;
  publishedAt: string;
};

export type PrivacyAcknowledgementEvidence = {
  requiredVersion: string;
  requiredContentSha256: string;
  effectiveAt: string | null;
  acknowledgedVersion: string | null;
  acknowledgedContentSha256: string | null;
  acknowledgedAt: string | null;
  source: PrivacyAcknowledgementSource | null;
  status: "acknowledged" | "reacknowledgement_required" | "not_acknowledged";
};

type NoticeRow = {
  id: string;
  company_id: string;
  version: string;
  status: "draft" | "published" | "superseded";
  title: string;
  content_sha256: string;
  content_json: string | Record<string, unknown>;
  effective_at: string | Date | null;
  published_by: string;
  published_at: string | Date;
};

type AcknowledgementRow = {
  id: string;
  notice_version: string;
  content_sha256: string;
  acknowledged_at: string | Date;
  source: PrivacyAcknowledgementSource;
  request_id: string;
};

const SELECT_CONTRACT_NOTICE_SQL = `
  SELECT id, company_id, version, status, title, content_sha256, content_json,
         effective_at, published_by, published_at
  FROM privacy_notice_versions
  WHERE company_id = :companyId AND version = :version
  LIMIT 1
`;

const SELECT_CURRENT_PUBLISHED_NOTICE_SQL = `
  SELECT id, company_id, version, status, title, content_sha256, content_json,
         effective_at, published_by, published_at
  FROM privacy_notice_versions
  WHERE company_id = :companyId AND status = 'published'
  ORDER BY published_at DESC, version DESC
  LIMIT 1
`;

const INSERT_CONTRACT_NOTICE_SQL = `
  INSERT INTO privacy_notice_versions (
    id, company_id, version, status, title, content_sha256, content_json,
    effective_at, published_by, published_at, created_at
  ) VALUES (
    :id, :companyId, :version, 'published', :title, :contentSha256, :contentJson,
    :effectiveAt, :publishedBy, :publishedAt, :createdAt
  )
  ON CONFLICT(company_id, version) DO NOTHING
`;

const SET_FIRST_EFFECTIVE_AT_SQL = `
  UPDATE privacy_notice_versions
  SET effective_at = :effectiveAt
  WHERE id = :id AND effective_at IS NULL
`;

const SUPERSEDE_NOTICE_SQL = `
  UPDATE privacy_notice_versions
  SET status = 'superseded'
  WHERE id = :id AND status = 'published'
`;

const SELECT_ACKNOWLEDGEMENT_SQL = `
  SELECT id, notice_version, content_sha256, acknowledged_at, source, request_id
  FROM privacy_notice_acknowledgements
  WHERE user_id = :userId AND notice_version_id = :noticeVersionId
  LIMIT 1
`;

const SELECT_LATEST_ACKNOWLEDGEMENT_SQL = `
  SELECT id, notice_version, content_sha256, acknowledged_at, source, request_id
  FROM privacy_notice_acknowledgements
  WHERE user_id = :userId
  ORDER BY acknowledged_at DESC
  LIMIT 1
`;

const INSERT_ACKNOWLEDGEMENT_SQL = `
  INSERT INTO privacy_notice_acknowledgements (
    id, company_id, user_id, notice_version_id, notice_version, content_sha256,
    acknowledged_at, source, request_id, created_at
  ) VALUES (
    :id, :companyId, :userId, :noticeVersionId, :noticeVersion, :contentSha256,
    :acknowledgedAt, :source, :requestId, :acknowledgedAt
  )
  ON CONFLICT DO NOTHING
`;

const SELECT_PENDING_FIREBASE_INVITATION_SQL = `
  SELECT invitation_id
  FROM firebase_identity_invitations
  WHERE firebase_uid = :firebaseUid
    AND pdm_user_id = :userId
    AND setup_state = 'password_setup_link_sent'
  LIMIT 1
`;

function isoTimestamp(value: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function validateRequestId(value: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u.test(normalized)) {
    throw new PrivacyNoticeError("privacy_request_id_invalid", "確認要求無效，請重新整理後再試。", 400);
  }
  return normalized;
}

function evidence(
  contract: PrivacyNoticeContract,
  acknowledgement: AcknowledgementRow | null,
  effectiveAt: string | null
): PrivacyAcknowledgementEvidence {
  const current = acknowledgement?.notice_version === contract.version && acknowledgement.content_sha256 === contract.contentSha256;
  return {
    requiredVersion: contract.version,
    requiredContentSha256: contract.contentSha256,
    effectiveAt,
    acknowledgedVersion: acknowledgement?.notice_version ?? null,
    acknowledgedContentSha256: acknowledgement?.content_sha256 ?? null,
    acknowledgedAt: isoTimestamp(acknowledgement?.acknowledged_at ?? null),
    source: acknowledgement?.source ?? null,
    status: current ? "acknowledged" : acknowledgement ? "reacknowledgement_required" : "not_acknowledged"
  };
}

export class PrivacyNoticeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 400
  ) {
    super(message);
    this.name = "PrivacyNoticeError";
  }
}

export class PrivacyNoticeAsyncRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly contract: PrivacyNoticeContract,
    private readonly options: { clock?: () => string; idFactory?: () => string } = {}
  ) {}

  private now() {
    return this.options.clock?.() ?? new Date().toISOString();
  }

  private id() {
    return this.options.idFactory?.() ?? crypto.randomUUID();
  }

  private async ensureContractNotice(client: AsyncDatabaseClient, companyId: string): Promise<NoticeRow> {
    const now = this.now();
    const previousCurrent = await client.queryOne<NoticeRow>(SELECT_CURRENT_PUBLISHED_NOTICE_SQL, { companyId });
    if (previousCurrent && previousCurrent.version !== this.contract.version) {
      const previousPublishedAt = Date.parse(String(previousCurrent.published_at));
      const contractPublishedAt = Date.parse(this.contract.publishedAt);
      if (!Number.isFinite(previousPublishedAt) || !Number.isFinite(contractPublishedAt) || contractPublishedAt <= previousPublishedAt) {
        throw new PrivacyNoticeError("privacy_notice_runtime_version_stale", "系統尚未載入最新隱私告知版本，請聯絡系統管理員。", 503);
      }
      await client.execute(SUPERSEDE_NOTICE_SQL, { id: previousCurrent.id });
    }
    await client.execute(INSERT_CONTRACT_NOTICE_SQL, {
      id: `privacy-notice-${this.id()}`,
      companyId,
      version: this.contract.version,
      title: this.contract.title,
      contentSha256: this.contract.contentSha256,
      contentJson: this.contract.contentJson,
      effectiveAt: this.contract.effectiveAt,
      publishedBy: this.contract.publishedBy,
      publishedAt: this.contract.publishedAt,
      createdAt: now
    });

    let notice = await client.queryOne<NoticeRow>(SELECT_CONTRACT_NOTICE_SQL, {
      companyId,
      version: this.contract.version
    });
    if (!notice) throw new Error("PRIVACY_NOTICE_CONTRACT_INSERT_FAILED");
    if (
      notice.status !== "published" ||
      notice.title !== this.contract.title ||
      notice.content_sha256 !== this.contract.contentSha256
    ) {
      throw new PrivacyNoticeError("privacy_notice_content_drift", "隱私告知版本與系統內容不一致，帳號暫時無法啟用。", 503);
    }

    if (this.contract.effectiveAt && !notice.effective_at) {
      await client.execute(SET_FIRST_EFFECTIVE_AT_SQL, { id: notice.id, effectiveAt: this.contract.effectiveAt });
      notice = { ...notice, effective_at: this.contract.effectiveAt };
    }

    const current = await client.queryOne<NoticeRow>(SELECT_CURRENT_PUBLISHED_NOTICE_SQL, { companyId });
    if (!current || current.version !== this.contract.version || current.content_sha256 !== this.contract.contentSha256) {
      throw new PrivacyNoticeError("privacy_notice_runtime_version_stale", "系統尚未載入最新隱私告知版本，請聯絡系統管理員。", 503);
    }
    return notice;
  }

  async getStatus(input: { userId: string; companyId: string }): Promise<PrivacyAcknowledgementEvidence> {
    return this.client.transaction(async (client) => {
      const notice = await this.ensureContractNotice(client, input.companyId);
      const acknowledgement = await client.queryOne<AcknowledgementRow>(SELECT_ACKNOWLEDGEMENT_SQL, {
        userId: input.userId,
        noticeVersionId: notice.id
      });
      return evidence(this.contract, acknowledgement, isoTimestamp(notice.effective_at));
    });
  }

  async getAdminEvidence(input: { userId: string; companyId: string }): Promise<PrivacyAcknowledgementEvidence> {
    const notice = await this.client.queryOne<NoticeRow>(SELECT_CONTRACT_NOTICE_SQL, {
      companyId: input.companyId,
      version: this.contract.version
    });
    const acknowledgement = notice
      ? await this.client.queryOne<AcknowledgementRow>(SELECT_ACKNOWLEDGEMENT_SQL, {
          userId: input.userId,
          noticeVersionId: notice.id
        })
      : await this.client.queryOne<AcknowledgementRow>(SELECT_LATEST_ACKNOWLEDGEMENT_SQL, { userId: input.userId });
    return evidence(this.contract, acknowledgement, isoTimestamp(notice?.effective_at ?? this.contract.effectiveAt));
  }

  async finalizeAccess(input: {
    userId: string;
    companyId: string;
    firebaseUid?: string | null;
    acknowledged: boolean;
    source: PrivacyAcknowledgementSource;
    requestId?: string;
  }): Promise<PrivacyAcknowledgementEvidence> {
    return this.client.transaction(async (client) => {
      const notice = await this.ensureContractNotice(client, input.companyId);
      let acknowledgement = await client.queryOne<AcknowledgementRow>(SELECT_ACKNOWLEDGEMENT_SQL, {
        userId: input.userId,
        noticeVersionId: notice.id
      });

      if (!acknowledgement && !input.acknowledged) {
        return evidence(this.contract, null, isoTimestamp(notice.effective_at));
      }

      if (!acknowledgement) {
        const requestId = validateRequestId(input.requestId ?? "");
        const acknowledgedAt = this.now();
        let source = input.source;
        const invitation = input.firebaseUid
          ? await client.queryOne<{ invitation_id: string }>(SELECT_PENDING_FIREBASE_INVITATION_SQL, {
              firebaseUid: input.firebaseUid,
              userId: input.userId
            })
          : null;
        if (invitation) source = "firebase_email_invitation";

        await client.execute(INSERT_ACKNOWLEDGEMENT_SQL, {
          id: `privacy-ack-${this.id()}`,
          companyId: input.companyId,
          userId: input.userId,
          noticeVersionId: notice.id,
          noticeVersion: notice.version,
          contentSha256: notice.content_sha256,
          acknowledgedAt,
          source,
          requestId
        });
        acknowledgement = await client.queryOne<AcknowledgementRow>(SELECT_ACKNOWLEDGEMENT_SQL, {
          userId: input.userId,
          noticeVersionId: notice.id
        });
        if (!acknowledgement) {
          throw new PrivacyNoticeError("privacy_acknowledgement_conflict", "確認紀錄未完成，請重新整理後再試。", 409);
        }
        if (acknowledgement.request_id === requestId) {
          await new AsyncAuditRepository(client, () => acknowledgedAt).createAuditLog({
            actorId: input.userId,
            action: "PrivacyNoticeAcknowledged",
            detail: {
              companyId: input.companyId,
              noticeVersion: notice.version,
              contentSha256: notice.content_sha256,
              source,
              requestId
            }
          });
        }
      }

      if (input.firebaseUid) {
        const invitation = await client.queryOne<{ invitation_id: string }>(SELECT_PENDING_FIREBASE_INVITATION_SQL, {
          firebaseUid: input.firebaseUid,
          userId: input.userId
        });
        if (invitation) {
          const now = this.now();
          await client.execute(
            `UPDATE firebase_identity_invitations
             SET setup_state = 'active', last_error = NULL, updated_at = :now
             WHERE invitation_id = :invitationId AND setup_state = 'password_setup_link_sent'`,
            { invitationId: invitation.invitation_id, now }
          );
          await client.execute(
            `UPDATE account_invitations
             SET status = 'accepted', accepted_by = :userId, accepted_at = :now
             WHERE id = :invitationId AND status = 'pending'`,
            { invitationId: invitation.invitation_id, userId: input.userId, now }
          );
        }
      }

      return evidence(this.contract, acknowledgement, isoTimestamp(notice.effective_at));
    });
  }
}
