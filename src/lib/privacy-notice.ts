import crypto from "node:crypto";
import { getAuthMode } from "@/lib/auth-config";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  PRIVACY_NOTICE_ACKNOWLEDGEMENT_LABEL,
  PRIVACY_NOTICE_APPROVED_AT,
  PRIVACY_NOTICE_COMPANY,
  PRIVACY_NOTICE_SECTIONS,
  PRIVACY_NOTICE_SUMMARY,
  PRIVACY_NOTICE_TITLE,
  PRIVACY_NOTICE_VERSION,
  privacyNoticeCanonicalJson
} from "@/lib/privacy-notice-content";
import {
  PrivacyNoticeAsyncRepository,
  type PrivacyAcknowledgementSource,
  type PrivacyNoticeContract
} from "@/lib/repositories/privacy-notice-async-repository";

const PUBLISHED_BY = "company-owner:jedchang0308@jenfu.com.tw";
const PUBLISHED_AT = `${PRIVACY_NOTICE_APPROVED_AT}T00:00:00.000Z`;

function effectiveAt() {
  const configured = String(process.env.PDM_PRIVACY_NOTICE_EFFECTIVE_AT ?? "").trim();
  if (!configured) return null;
  const parsed = new Date(configured);
  if (Number.isNaN(parsed.getTime())) throw new Error("PDM_PRIVACY_NOTICE_EFFECTIVE_AT_INVALID");
  return parsed.toISOString();
}

export function getPrivacyNoticeContract(): PrivacyNoticeContract {
  const contentJson = privacyNoticeCanonicalJson();
  return {
    version: PRIVACY_NOTICE_VERSION,
    title: PRIVACY_NOTICE_TITLE,
    contentSha256: crypto.createHash("sha256").update(contentJson).digest("hex"),
    contentJson,
    effectiveAt: effectiveAt(),
    publishedBy: PUBLISHED_BY,
    publishedAt: PUBLISHED_AT
  };
}

function repository() {
  return new PrivacyNoticeAsyncRepository(getAsyncDatabaseClient(), getPrivacyNoticeContract());
}

export function isPrivacyNoticeEnforced() {
  return getAuthMode() === "firebase_bff";
}

export function getPublicPrivacyNotice() {
  const contract = getPrivacyNoticeContract();
  return {
    company: PRIVACY_NOTICE_COMPANY,
    version: contract.version,
    title: contract.title,
    contentSha256: contract.contentSha256,
    approvedAt: PRIVACY_NOTICE_APPROVED_AT,
    effectiveAt: contract.effectiveAt,
    summary: PRIVACY_NOTICE_SUMMARY,
    sections: PRIVACY_NOTICE_SECTIONS,
    acknowledgementLabel: PRIVACY_NOTICE_ACKNOWLEDGEMENT_LABEL,
    primaryContact: "jedchang0308@jenfu.com.tw",
    backupContact: "dani@jenfu.com.tw"
  };
}

export async function getPrivacyAcknowledgementStatusAsync(input: { userId: string; companyId: string }) {
  return repository().getStatus(input);
}

export async function getPrivacyAdminEvidenceAsync(input: { userId: string; companyId: string }) {
  return repository().getAdminEvidence(input);
}

export async function finalizePrivacyAccessAsync(input: {
  userId: string;
  companyId: string;
  firebaseUid?: string | null;
  acknowledged: boolean;
  source: PrivacyAcknowledgementSource;
  requestId?: string;
}) {
  return repository().finalizeAccess(input);
}
